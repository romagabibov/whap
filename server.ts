import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';

// SSE Clients List
const clients = new Set<express.Response>();

let waStatus: 'DISCONNECTED' | 'QR_READY' | 'PAIRING_CODE_READY' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
let waQrUrl = '';
let waPairingCode = '';
let waUser: any = null;
let sock: ReturnType<typeof makeWASocket> | null = null;
let saveCredsFn: (() => Promise<void>) | null = null;

let currentTask = {
  status: 'idle', // idle, running, completed, error, canceled
  logs: [] as { time: string; msg: string; type: 'info' | 'success' | 'error' }[],
  total: 0,
  processed: 0,
  shouldCancel: false,
  needsInvite: [] as string[],
  inviteLink: ''
};

function addLog(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  currentTask.logs.push({
    time: new Date().toLocaleTimeString(),
    msg,
    type,
  });
}

async function connectToWhatsApp(phoneNumber?: string) {
  waStatus = 'CONNECTING';

  // Create auth dir if it doesn't exist
  if (!fs.existsSync('baileys_auth_info')) {
    fs.mkdirSync('baileys_auth_info');
  }

  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
  saveCredsFn = saveCreds;

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'), // Рекомендуется для Pairing Code
    syncFullHistory: false,
  });

  if (phoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock!.requestPairingCode(phoneNumber);
        waPairingCode = code;
        waStatus = 'PAIRING_CODE_READY';
      } catch (err: any) {
        console.error('Ошибка получения кода:', err);
        waStatus = 'DISCONNECTED';
      }
    }, 4000); // 4 сек задержки по рекомендации Baileys
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== 401;
      waStatus = 'DISCONNECTED';
      waQrUrl = '';
      waPairingCode = '';
      waUser = null;
      sock = null;

      if (shouldReconnect) {
        connectToWhatsApp(phoneNumber);
      } else {
        // If 401 (logged out), delete auth folder to start fresh next time
        if (fs.existsSync('baileys_auth_info')) {
          fs.rmSync('baileys_auth_info', { recursive: true, force: true });
        }
      }
    } else if (connection === 'open') {
      waStatus = 'CONNECTED';
      waQrUrl = '';
      waPairingCode = '';
      waUser = sock?.user || null;
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Cancel task endpoint
  app.post('/api/wa/cancel', (req, res) => {
    if (currentTask.status === 'running') {
      currentTask.shouldCancel = true;
      res.json({ success: true, message: 'Отмена задачи запрошена' });
    } else {
      res.status(400).json({ error: 'Задача не выполняется' });
    }
  });

  // Polling endpoint for real-time status updates
  app.get('/api/wa/status', (req, res) => {
    res.json({ 
      status: waStatus, 
      qr: waQrUrl,
      pairingCode: waPairingCode,
      user: waUser,
      task: currentTask
    });
  });

  app.post('/api/wa/connect', async (req, res) => {
    if (waStatus === 'CONNECTED' && sock) {
      return res.json({ status: waStatus });
    }
    
    // Properly terminate old socket if exists
    if (sock) {
      try { sock.end(new Error('Closed')); } catch(e) {}
      sock = null;
    }

    // Clear old auth info before fresh connection
    if (fs.existsSync('baileys_auth_info')) {
      fs.rmSync('baileys_auth_info', { recursive: true, force: true });
    }

    const { phoneNumber } = req.body || {};

    // Reset any ghost connection
    waStatus = 'DISCONNECTED';
    waQrUrl = '';
    waPairingCode = '';
    await connectToWhatsApp(phoneNumber);
    res.json({ success: true, status: waStatus });
  });

  app.post('/api/wa/logout', async (req, res) => {
    if (sock) {
      try { await sock.logout(); } catch(e) {}
      try { sock.end(new Error('Logout')); } catch(e) {}
      sock = null;
    }
    
    if (fs.existsSync('baileys_auth_info')) {
      fs.rmSync('baileys_auth_info', { recursive: true, force: true });
    }
    waStatus = 'DISCONNECTED';
    waQrUrl = '';
    res.json({ success: true });
  });

  app.post('/api/wa/create-group', async (req, res) => {
    try {
      if (!sock || waStatus !== 'CONNECTED') {
        return res.status(400).json({ error: 'WhatsApp is not connected' });
      }

      if (currentTask.status === 'running') {
        return res.status(400).json({ error: 'Другая задача уже выполняется' });
      }

      const { groupName, numbers } = req.body;

      if (!groupName || typeof groupName !== 'string') {
        return res.status(400).json({ error: 'Valid groupName is required' });
      }

      if (!Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'An array of phone numbers is required' });
      }

      // Format numbers to WhatsApp JID format
      const participants = numbers
        .map(num => String(num).replace(/\D/g, '')) // ensure only digits
        .filter(num => num.length > 5) // naive filter
        .map(num => {
          // If the user typed 994050... replace with 99450...
          if (num.startsWith('9940') && num.length === 13) {
            return `994${num.substring(4)}@s.whatsapp.net`;
          }
          if (num.startsWith('0') && num.length === 10) {
            return `994${num.substring(1)}@s.whatsapp.net`;
          }
          if (num.length === 9) {
            return `994${num}@s.whatsapp.net`;
          }
          return `${num}@s.whatsapp.net`;
        });

      if (participants.length === 0) {
        return res.status(400).json({ error: 'No valid phone numbers provided after cleaning' });
      }

      // Start the task asynchronously
      currentTask = {
        status: 'running',
        logs: [],
        total: participants.length,
        processed: 0,
        shouldCancel: false,
        needsInvite: [],
        inviteLink: ''
      };

      res.json({ success: true, message: 'Задача по созданию группы запущена в фоне' });

      // Background task runner
      (async () => {
        try {
          addLog(`Создаем группу "${groupName}"...`);
          
          // Try to create the group by testing participants until one works
          let groupInfo = null;
          let firstParticipantSuccess = null;
          
          for (let i = 0; i < participants.length; i++) {
            if (currentTask.shouldCancel) break;
            const candidate = participants[i];
            addLog(`Попытка создать группу с участником ${candidate}...`);
            try {
              groupInfo = await sock.groupCreate(groupName, [candidate]);
              addLog(`Группа "${groupName}" успешно создана!`, 'success');
              addLog(`Участник ${candidate} добавлен при создание.`, 'success');
              firstParticipantSuccess = candidate;
              currentTask.processed++;
              break;
            } catch (err: any) {
              addLog(`Не удалось создать с ${candidate}: ${err.message || 'ошибка'}. Пробуем следующего...`, 'error');
              for (let j = 0; j < 3; j++) {
                if (currentTask.shouldCancel) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
          
          if (currentTask.shouldCancel) {
            addLog(`Задача прервана пользователем.`, 'error');
            currentTask.status = 'canceled';
            return;
          }

          if (!groupInfo) {
            throw new Error(`Не удалось создать группу ни с одним из номеров. Возможно, все номера невалидны.`);
          }

          const remainingParticipants = participants.filter(p => p !== firstParticipantSuccess);

          // Process the rest with 10-second intervals
          for (const participant of remainingParticipants) {
            if (currentTask.shouldCancel) break;

            addLog(`Ожидание 5с перед добавлением ${participant}...`);
            
            // Wait 5s securely handling shouldCancel
            for (let i = 0; i < 5; i++) {
              if (currentTask.shouldCancel) break;
              await new Promise(resolve => setTimeout(resolve, 1000)); // 1s intervals
            }
            if (currentTask.shouldCancel) break;

            addLog(`Добавляем ${participant}...`);
            try {
              const res = await sock.groupParticipantsUpdate(groupInfo.id, [participant], "add");
              const partRes = res && res[0];
              if (partRes && (partRes.status === '403' || partRes.status === '408' || partRes.status === '401')) {
                addLog(`Пользователь ${participant} запретил прямое добавление.`, 'error');
                if (!currentTask.needsInvite.includes(participant)) {
                  currentTask.needsInvite.push(participant);
                }
                if (!currentTask.inviteLink) {
                  try {
                    const code = await sock.groupInviteCode(groupInfo.id);
                    currentTask.inviteLink = `https://chat.whatsapp.com/${code}`;
                  } catch (e: any) {
                    addLog(`Не удалось получить ссылку-приглашение: ${e.message}`, 'error');
                  }
                }
              } else if (partRes && partRes.status !== '200') {
                addLog(`Не удалось добавить ${participant} (Статус: ${partRes.status})`, 'error');
              } else {
                addLog(`Участник ${participant} успешно добавлен!`, 'success');
              }
            } catch (err: any) {
              addLog(`Ошибка добавления ${participant}: ${err.message}`, 'error');
            }
            currentTask.processed++;
          }

          if (currentTask.shouldCancel) {
            addLog(`Задача прервана пользователем.`, 'error');
            currentTask.status = 'canceled';
          } else {
            addLog(`Все номера обработаны. Задача завершена.`, 'success');
            currentTask.status = 'completed';
          }
        } catch (error: any) {
          console.error('Task error:', error);
          addLog(`Фатальная ошибка задачи: ${error.message}`, 'error');
          currentTask.status = 'error';
        }
      })();

    } catch (error: any) {
      console.error('Error creating group:', error);
      res.status(500).json({ error: error.message || 'Failed to create group' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (fs.existsSync('baileys_auth_info')) {
      console.log('Restoring previous WhatsApp session...');
      connectToWhatsApp();
    }
  });
}

startServer();
