import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { ShieldAlert, QrCode, Phone, Upload, CheckCircle2, AlertCircle, RefreshCw, LogOut, History, Globe, Trash2 } from 'lucide-react';
import { cn } from './lib/utils';

type WaStatus = 'DISCONNECTED' | 'PAIRING_CODE_READY' | 'CONNECTING' | 'CONNECTED';

interface ParsedNumber {
  raw: string;
  cleaned: string;
  name: string;
  selected: boolean;
}

interface WaTask {
  status: 'idle' | 'running' | 'completed' | 'error' | 'canceled';
  logs: { time: string; msg: string; type: 'info' | 'success' | 'error' }[];
  total: number;
  processed: number;
  needsInvite?: string[];
  inviteLink?: string;
}

const translations = {
  ru: {
    dashboard: "Dashboard",
    history: "История групп",
    warning: "Warning",
    warningText: "Вы используете неофициальный WhatsApp API. Частое массовое создание групп может привести к бану аккаунта.",
    historyTitle: "История созданных групп",
    historyEmpty: "История пуста. Создайте первую группу.",
    confirmDeleteHistory: "Вы уверены, что хотите удалить эту группу из истории?",
    delete: "Удалить",
    groupName: "Название группы",
    dateCreated: "Дата создания",
    participantCount: "Кол-во участников",
    sourceFiles: "Исходные файлы",
    notConnected: "WhatsApp не подключен",
    notConnectedDesc: "Введите номер телефона для начала автоматизации.",
    loginByPhone: "Вход по номеру",
    phonePlaceholder: "7999... (без +)",
    getCode: "Получить код привязки",
    connecting: "Запуск инфраструктуры...",
    enterCode: "Введите код в WhatsApp",
    instructionSubtitle: "Инструкция:",
    instr1: "1. Откройте WhatsApp на телефоне",
    instr2: "2. Меню -> Связанные устройства -> Привязка устройства",
    instr3: "3. Нажмите «Связка по номеру телефона» внизу экрана",
    instr4: "4. Введите этот 8-значный код",
    step1: "1. Загрузите контакты (CSV)",
    dragDrop: "Нажмите или перетащите CSV",
    multipleFiles: "Можно загружать несколько файлов",
    loadedFiles: "Загруженные файлы",
    addMore: "Добавить",
    replace: "Поменять",
    cancel: "Отменить",
    mapping: "Сопоставление",
    logOutput: "Лог выполнения",
    recognizedNumbers: "Распознанные номера",
    total: "Всего",
    name: "Имя",
    format: "Формат",
    action: "Действие",
    noData: "Нет данных. Загрузите CSV.",
    step2: "2. Настройки группы",
    groupNameLabel: "Название группы",
    groupNamePlaceholder: "Например: Участники 12.05",
    engine: "Automation Engine",
    participantsToAdd: "К добавлению",
    interval: "Интервал",
    intervalValue: "10 Сек",
    execute: "ЗАПУСТИТЬ ЗАДАЧУ",
    running: "ВЫПОЛНЯЕТСЯ...",
    stop: "ОСТАНОВИТЬ",
    logout: "Выйти",
    alreadyAdded: "УЖЕ БЫЛ",
    ready: "ГОТОВ",
    skipped: "ПРОПУЩЕН",
    poweredBy: "Powered by",
    confirmLogout: "Вы уверены, что хотите выйти из WhatsApp аккаунта?",
    needPhoneNum: "Пожалуйста, введите номер телефона",
    needGroupName: "Пожалуйста, введите название группы",
    noSelectedNumbers: "Нет выбранных номеров",
    taskCanceled: "Отмена задачи запрошена"
  },
  en: {
    dashboard: "Dashboard",
    history: "Group History",
    warning: "Warning",
    warningText: "You are using an unofficial WhatsApp API. Frequent mass group creation can lead to account bans.",
    historyTitle: "Group Creation History",
    historyEmpty: "History is empty. Create your first group.",
    confirmDeleteHistory: "Are you sure you want to delete this group from history?",
    delete: "Delete",
    groupName: "Group Name",
    dateCreated: "Date Created",
    participantCount: "Participants",
    sourceFiles: "Source Files",
    notConnected: "WhatsApp Not Connected",
    notConnectedDesc: "Enter your phone number to start automation.",
    loginByPhone: "Login with Phone",
    phonePlaceholder: "1234... (without +)",
    getCode: "Get Pairing Code",
    connecting: "Starting infrastructure...",
    enterCode: "Enter Code in WhatsApp",
    instructionSubtitle: "Instructions:",
    instr1: "1. Open WhatsApp on your phone",
    instr2: "2. Menu -> Linked Devices -> Link a Device",
    instr3: "3. Tap 'Link with phone number' at the bottom",
    instr4: "4. Enter this 8-digit code",
    step1: "1. Upload Contacts (CSV)",
    dragDrop: "Click or drag CSV files here",
    multipleFiles: "You can upload multiple files",
    loadedFiles: "Loaded Files",
    addMore: "Add More",
    replace: "Replace",
    cancel: "Cancel",
    mapping: "Mapping",
    logOutput: "Execution Log",
    recognizedNumbers: "Recognized Numbers",
    total: "Total",
    name: "Name",
    format: "Format",
    action: "Action",
    noData: "No data. Upload a CSV file.",
    step2: "2. Group Settings",
    groupNameLabel: "Group Name",
    groupNamePlaceholder: "e.g., Webinar Participants 12.05",
    engine: "Automation Engine",
    participantsToAdd: "To Add",
    interval: "Interval",
    intervalValue: "10 Sec",
    execute: "EXECUTE TASK",
    running: "RUNNING...",
    stop: "STOP",
    logout: "Logout",
    alreadyAdded: "ADDED BEFORE",
    ready: "READY",
    skipped: "SKIPPED",
    poweredBy: "Powered by",
    confirmLogout: "Are you sure you want to log out from WhatsApp?",
    needPhoneNum: "Please enter a valid phone number",
    needGroupName: "Please enter a group name",
    noSelectedNumbers: "No numbers selected",
    taskCanceled: "Task cancellation requested"
  }
};

export default function App() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const t = (key: keyof typeof translations.ru) => translations[lang][key];

  const [waStatus, setWaStatus] = useState<WaStatus>('DISCONNECTED');
  const [waUser, setWaUser] = useState<any>(null);
  const [waTask, setWaTask] = useState<WaTask>({ status: 'idle', logs: [], total: 0, processed: 0 });
  const [pairingCode, setPairingCode] = useState<string>('');
  const [connectPhone, setConnectPhone] = useState<string>('');
  
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [parsedNumbers, setParsedNumbers] = useState<ParsedNumber[]>([]);
  const [phoneColumnName, setPhoneColumnName] = useState<string>('');
  
  const [groupName, setGroupName] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const [currentView, setCurrentView] = useState<'dashboard' | 'history'>('dashboard');
  const [viewTab, setViewTab] = useState<'numbers' | 'log' | 'invites'>('numbers');
  const [groupHistory, setGroupHistory] = useState<{id: string, name: string, count: number, date: string, files: string[]}[]>(() => {
    try {
      const saved = localStorage.getItem('wa_group_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [addedNumbers, setAddedNumbers] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('wa_added_numbers');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const saveAddedNumbers = (numbers: string[]) => {
    setAddedNumbers(prev => {
      const added = numbers.map(n => `${groupName}::${n}`);
      const next = new Set([...prev, ...added]);
      localStorage.setItem('wa_added_numbers', JSON.stringify([...next]));
      return next;
    });
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGroupHistory(prev => {
      const next = prev.filter(item => item.id !== id);
      localStorage.setItem('wa_group_history', JSON.stringify(next));
      return next;
    });
  };

  // Poll WhatsApp connection status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/wa/status', {
          headers: {
            'Accept': 'application/json'
          }
        });
        if (response.ok) {
          const text = await response.text();
          if (text.startsWith('<!')) {
            console.warn('Received HTML instead of JSON for WA status. API might be down or restarting.');
            return;
          }
          const data = JSON.parse(text);
          setWaStatus(data.status);
          // remove qr url handling
          setPairingCode(data.pairingCode || '');
          setWaUser(data.user || null);
          if (data.task) setWaTask(data.task);
        }
      } catch (e: any) {
        // Suppress generic network errors during polling (e.g. server restart)
        if (e.message !== 'Failed to fetch') {
          console.error('Failed to fetch WA status', e);
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const handleConnectWithPhone = async () => {
    const cleanedPhone = connectPhone.replace(/\D/g, '');
    if (!cleanedPhone) {
      alert(t('needPhoneNum'));
      return;
    }
    setWaStatus('CONNECTING');
    try {
      const response = await fetch('/api/wa/connect', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ phoneNumber: cleanedPhone })
      });
      
      const text = await response.text();
      if (!text.startsWith('<!')) {
        // Valid JSON 
      }
    } catch (e) {
      console.error('Failed to init connection', e);
    }
  };

  const handleCancelTask = async () => {
    try {
      await fetch('/api/wa/cancel', { method: 'POST' });
    } catch (e) {
      console.error('Failed to cancel task', e);
    }
  };

  const handleLogout = async () => {
    try {
      setWaStatus('DISCONNECTED');
      setPairingCode('');
      setWaUser(null);
      await fetch('/api/wa/logout', { method: 'POST' });
    } catch (e) {
      console.error('Failed to logout', e);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setCsvFiles(prev => [...prev, ...files]);
    setCreateResult(null);

    files.forEach(file => {
      Papa.parse(file as any, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.data || results.data.length === 0) return;

          const headers = results.meta.fields || [];
          const phoneCol = headers.find(h => 
            h.toLowerCase().includes('phone') || 
            h.toLowerCase().includes('телефон') || 
            h.toLowerCase().includes('номер')
          );
          const nameCol = headers.find(h => 
            h.toLowerCase().includes('name') || 
            h.toLowerCase().includes('имя') || 
            h.toLowerCase().includes('фио')
          );

          if (phoneCol) {
            setPhoneColumnName(prev => prev ? Array.from(new Set([...prev.split(', '), phoneCol])).join(', ') : phoneCol);
            
            setParsedNumbers(prev => {
              const newNumbers: ParsedNumber[] = [];
              results.data.forEach((row: any) => {
                const val = row[phoneCol];
                if (val) {
                  const cleaned = String(val).replace(/\D/g, '');
                  if (cleaned.length > 5) {
                    if (!newNumbers.some(n => n.cleaned === cleaned) && !prev.some(p => p.cleaned === cleaned)) {
                      const rawName = nameCol ? String(row[nameCol] || '') : '...';
                      newNumbers.push({ raw: String(val), cleaned, name: rawName, selected: true });
                    }
                  }
                }
              });
              return [...prev, ...newNumbers];
            });
          }
        },
      });
    });
  };

  const handleReplaceFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvFiles([]);
    setParsedNumbers([]);
    setPhoneColumnName('');
    handleFileUpload(e);
  };

  const handleClearFiles = () => {
    setCsvFiles([]);
    setParsedNumbers([]);
    setPhoneColumnName('');
  };

  const handleCreateGroup = async () => {
    if (!groupName) {
      alert(t('needGroupName'));
      return;
    }
    const numbersToAdd = parsedNumbers.filter(n => {
      const alreadyAdded = addedNumbers.has(n.cleaned) || addedNumbers.has(`${groupName}::${n.cleaned}`);
      return n.selected && !alreadyAdded;
    }).map(n => n.cleaned);
    if (numbersToAdd.length === 0) {
      alert(t('noSelectedNumbers'));
      return;
    }

    setIsCreating(true);
    setCreateResult(null);

    try {
      const response = await fetch('/api/wa/create-group', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          groupName,
          numbers: numbersToAdd,
        })
      });

      const text = await response.text();
      if (text.startsWith('<!')) {
        throw new Error('API Error: Received HTML instead of JSON.');
      }
      
      const data = JSON.parse(text);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create group');
      }

      setCreateResult({ success: true, message: data.message });
      setViewTab('log');
      
      const newHistoryItem = {
        id: Date.now().toString(),
        name: groupName,
        count: numbersToAdd.length,
        date: new Date().toLocaleString(),
        files: csvFiles.map(f => f.name)
      };
      setGroupHistory(prev => {
        const next = [newHistoryItem, ...prev];
        localStorage.setItem('wa_group_history', JSON.stringify(next));
        return next;
      });

      // Save added numbers to prevent re-adding under the same group name
      saveAddedNumbers(numbersToAdd);
      
    } catch (error: any) {
      setCreateResult({ success: false, message: error.message });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Top Navigation Bar */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tight text-slate-800 truncate hidden sm:block">AutoGroup Pro</span>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <button 
            onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} 
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wide transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            {lang}
          </button>
          
          {waUser && (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden shrink-0">
                {waUser.imgUrl ? <img src={waUser.imgUrl} alt="User" className="w-full h-full object-cover" /> : <Phone className="w-4 h-4"/>}
              </div>
              <div className="flex flex-col hidden sm:flex">
                <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{waUser.name || 'Устройство'}</span>
                <span className="text-[10px] text-slate-500 truncate">{waUser.id?.split(':')[0]}</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className={cn("w-2 h-2 rounded-full", waStatus === 'CONNECTED' ? "bg-green-500" : (waStatus === 'DISCONNECTED' ? "bg-red-500" : "bg-yellow-500"))}></span>
            <span className="text-xs md:text-sm font-medium text-slate-600 truncate max-w-[80px] md:max-w-none">{waStatus}</span>
          </div>
          {waStatus === 'CONNECTED' && (
            <>
              <div className="h-8 w-[1px] bg-slate-200"></div>
              <button onClick={handleLogout} className="p-2 md:px-4 md:py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-200 transition-colors flex items-center">
                <span className="hidden md:inline">{t('logout')}</span>
                <LogOut className="w-4 h-4 md:hidden" />
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-slate-900 flex flex-row md:flex-col p-4 shrink-0 overflow-x-auto border-b md:border-b-0 border-slate-800 custom-scrollbar">
          <div className="flex flex-row md:flex-col space-x-2 md:space-x-0 md:space-y-1 min-w-max">
            <div onClick={() => setCurrentView('dashboard')} className={cn("px-3 py-2 rounded-md flex items-center gap-3 cursor-pointer transition-colors", currentView === 'dashboard' ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white")}>
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
              <span className="text-sm">{t('dashboard')}</span>
            </div>
            <div onClick={() => setCurrentView('history')} className={cn("px-3 py-2 rounded-md flex items-center gap-3 cursor-pointer transition-colors", currentView === 'history' ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white")}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <span className="text-sm">{t('history')}</span>
            </div>
          </div>
          <div className="hidden md:block mt-auto p-4 bg-slate-800 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-2"><ShieldAlert className="w-3 h-3"/> {t('warning')}</div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              {t('warningText')}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden overflow-y-auto">
          {currentView === 'history' ? (
            <div className="lg:col-span-3 flex flex-col gap-6">
              <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-bold mb-6">{t('historyTitle')}</h2>
                
                {groupHistory.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t('historyEmpty')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">{t('groupName')}</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">{t('dateCreated')}</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">{t('participantCount')}</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">{t('sourceFiles')}</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {groupHistory.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 group">
                            <td className="py-4 px-4 font-medium text-slate-800">{item.name}</td>
                            <td className="py-4 px-4 text-slate-500 text-sm">{item.date}</td>
                            <td className="py-4 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {item.count} чел.
                              </span>
                            </td>
                            <td className="py-4 px-4 text-sm text-slate-500">
                              <div className="flex flex-col gap-1">
                                {(item.files || []).map((f, i) => (
                                  <span key={i} className="flex items-center gap-1">
                                    <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm1 9h-6v2h6v-2zm0 4h-6v2h6v-2zm-2-9l5 5h-5V5z"></path></svg>
                                    <span className="truncate max-w-[150px]">{f}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <button 
                                onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 mr-2"
                                title={t('delete')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </header>
            </div>
          ) : (
            <>
          {/* Active Configuration Section */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {waStatus !== 'CONNECTED' ? (
              <header className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
                {waStatus === 'DISCONNECTED' && (
                  <div className="flex flex-col items-center space-y-6 w-full max-w-sm">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                      <Phone className="w-10 h-10 text-slate-400" />
                    </div>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-slate-800 mb-2">{t('notConnected')}</h2>
                      <p className="text-slate-500 text-sm mb-6">{t('notConnectedDesc')}</p>
                    </div>

                    <div className="w-full space-y-4">
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">{t('loginByPhone')}</p>
                        <input 
                          type="text" 
                          placeholder={t('phonePlaceholder')}
                          value={connectPhone}
                          onChange={(e) => setConnectPhone(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm mb-3 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                        />
                        <button onClick={handleConnectWithPhone} className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-md">
                          {t('getCode')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {waStatus === 'CONNECTING' && (
                  <div className="flex flex-col items-center space-y-6">
                    <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin" />
                    <p className="text-slate-600 font-medium">{t('connecting')}...</p>
                    <button 
                      onClick={async () => {
                        await fetch('/api/wa/logout', { method: 'POST' });
                        setWaStatus('DISCONNECTED');
                      }}
                      className="text-xs text-red-500 hover:text-red-700 underline font-medium mt-4"
                    >
                      Отменить и сбросить сессию
                    </button>
                  </div>
                )}
                {waStatus === 'PAIRING_CODE_READY' && (
                  <div className="flex flex-col items-center space-y-6">
                    <h2 className="text-xl font-bold text-slate-800">{t('enterCode')}</h2>
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl shadow-sm w-full max-w-sm text-center">
                      <div className="text-3xl font-mono font-bold text-indigo-600 tracking-widest min-h-[40px]">
                        {pairingCode ? pairingCode.match(/.{1,4}/g)?.join(' - ') : (
                           <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500 max-w-sm text-left space-y-2 bg-slate-50 p-4 rounded-lg">
                      <p className="font-semibold text-slate-700">{t('instructionSubtitle')}</p>
                      <p>{t('instr1')}</p>
                      <p>{t('instr2')}</p>
                      <p>{t('instr3')}</p>
                      <p>{t('instr4')}</p>
                    </div>
                  </div>
                )}
              </header>
            ) : (
              <header id="contacts-section" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">{t('step1')}</h2>
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">CONNECTED</span>
                </div>
                
                {csvFiles.length === 0 ? (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-100 transition relative">
                    <input 
                      type="file" 
                      accept=".csv" 
                      multiple
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm font-medium text-slate-700">{t('dragDrop')}</p>
                    <p className="text-xs text-slate-500 mt-1">{t('multipleFiles')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                      <div className="text-xs text-slate-500 uppercase font-bold mb-2 pb-2 border-b border-slate-200 w-full flex flex-col sm:flex-row justify-between sm:items-center">
                        <span className="mb-2 sm:mb-0">{t('loadedFiles')}</span>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="text-indigo-500 hover:text-indigo-600 hover:underline cursor-pointer flex items-center shrink-0">
                            {t('addMore')}
                            <input 
                              type="file" 
                              accept=".csv" 
                              multiple
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                          <label className="text-amber-500 hover:text-amber-600 hover:underline cursor-pointer flex items-center shrink-0">
                            {t('replace')}
                            <input 
                              type="file" 
                              accept=".csv" 
                              multiple
                              onChange={handleReplaceFiles}
                              className="hidden"
                            />
                          </label>
                          <button onClick={handleClearFiles} className="text-red-400 hover:text-red-500 hover:underline cursor-pointer uppercase font-bold shrink-0">
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 mt-2 max-h-24 overflow-y-auto">
                        {csvFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm1 9h-6v2h6v-2zm0 4h-6v2h6v-2zm-2-9l5 5h-5V5z"></path></svg>
                            <span className="text-xs font-medium truncate">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                      <div className="text-xs text-slate-500 uppercase font-bold mb-1">{t('mapping')}</div>
                      <div className="text-sm font-medium truncate mt-2 text-slate-700">[{phoneColumnName}] &rarr; [JID]</div>
                    </div>
                  </div>
                )}
              </header>
            )}

            {/* Execution Monitor or Extracted Numbers Area */}
            <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[300px]">
              
              {waTask.status !== 'idle' && (
                <div className="bg-slate-50 border-b border-slate-200 px-6 pt-3 flex items-center gap-6 shrink-0">
                  <button 
                    onClick={() => setViewTab('numbers')}
                    className={cn(
                      "text-sm font-bold pb-3 border-b-2 transition-colors",
                      viewTab === 'numbers' ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"
                    )}
                  >
                    {t('recognizedNumbers')}
                  </button>
                  <button 
                    onClick={() => setViewTab('log')}
                    className={cn(
                      "text-sm font-bold pb-3 border-b-2 transition-colors flex items-center gap-2",
                      viewTab === 'log' ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"
                    )}
                  >
                    {t('logOutput')}
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase border border-slate-200 bg-white px-2 py-0.5 rounded">
                      {waTask.status}
                    </span>
                  </button>
                  {(waTask.needsInvite && waTask.needsInvite.length > 0) && (
                    <button 
                      onClick={() => setViewTab('invites')}
                      className={cn(
                        "text-sm font-bold pb-3 border-b-2 transition-colors flex items-center gap-2",
                        viewTab === 'invites' ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"
                      )}
                    >
                      Приглашения
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase border border-slate-200 bg-white px-2 py-0.5 rounded">
                        {waTask.needsInvite.length}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {viewTab === 'numbers' ? (
                // EXTRACTED NUMBERS
                <>
                  {waTask.status === 'idle' && (
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                      <span className="text-sm font-bold text-slate-800">{t('recognizedNumbers')}</span>
                      {parsedNumbers.length > 0 && <span className="text-[10px] font-mono font-bold text-slate-500 uppercase border border-slate-200 bg-white px-2 py-1 rounded">{t('total')}: {parsedNumbers.length}</span>}
                    </div>
                  )}
                  <div className="flex-1 p-0 overflow-y-auto font-mono text-xs">
                    {parsedNumbers.length > 0 ? (
                      <table className="w-full text-left">
                        <thead className="bg-white text-slate-500 sticky top-0 border-b border-slate-100 shadow-sm z-10">
                          <tr>
                            <th className="py-3 px-4 font-semibold w-12">
                              <input 
                                type="checkbox" 
                                checked={parsedNumbers.every(p => {
                                  const alreadyAdded = addedNumbers.has(p.cleaned) || addedNumbers.has(`${groupName}::${p.cleaned}`);
                                  return p.selected || alreadyAdded;
                                })}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setParsedNumbers(prev => prev.map(p => {
                                    const alreadyAdded = addedNumbers.has(p.cleaned) || addedNumbers.has(`${groupName}::${p.cleaned}`);
                                    return (!alreadyAdded ? { ...p, selected: checked } : p)
                                  }));
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                            <th className="py-3 px-6 font-semibold w-12">Row</th>
                            <th className="py-3 px-6 font-semibold">{t('name')}</th>
                            <th className="py-3 px-6 font-semibold">{t('format')}</th>
                            <th className="py-3 px-6 font-semibold">{t('action')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {parsedNumbers.map((p, i) => {
                            const alreadyAdded = addedNumbers.has(p.cleaned) || addedNumbers.has(`${groupName}::${p.cleaned}`);
                            return (
                            <tr key={i} className={cn("hover:bg-slate-50", (!p.selected || alreadyAdded) && "opacity-60")}>
                              <td className="py-3 px-4">
                                <input 
                                  type="checkbox" 
                                  checked={p.selected && !alreadyAdded}
                                  disabled={alreadyAdded}
                                  onChange={() => {
                                    setParsedNumbers(prev => {
                                      const next = [...prev];
                                      next[i] = { ...next[i], selected: !next[i].selected };
                                      return next;
                                    });
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="py-3 px-6 text-slate-400">{i + 1}</td>
                              <td className="py-3 px-6 text-slate-700 font-medium truncate max-w-[120px]">{p.name}</td>
                              <td className="py-3 px-6 flex items-center text-slate-700"><Phone className="w-3 h-3 mr-2 text-slate-400"/>{p.raw}</td>
                              <td className={cn("py-3 px-6 font-bold text-xs truncate max-w-[120px]", alreadyAdded ? "text-amber-500" : (p.selected ? "text-green-600" : "text-slate-400"))}>
                                {alreadyAdded ? t('alreadyAdded') : (p.selected ? t('ready') : t('skipped'))}
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 p-6 flex-col gap-2">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                          <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        </div>
                        <p>{t('noData')}</p>
                      </div>
                    )}
                  </div>
                </>
              ) : viewTab === 'invites' && waTask.needsInvite && waTask.needsInvite.length > 0 ? (
                <>
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col justify-center shrink-0">
                    <span className="text-sm font-bold text-red-600 mb-1">Пользователи, запретившие авто-добавление ({waTask.needsInvite.length})</span>
                    <p className="text-xs text-slate-500 mb-3">Этим пользователям нужно отправить ссылку на группу вручную:</p>
                    <div className="flex bg-white border border-slate-200 outline-none rounded-lg p-2 text-sm font-mono items-center space-x-2">
                      <input 
                        className="flex-1 bg-transparent text-indigo-600 outline-none w-full"
                        readOnly 
                        value={waTask.inviteLink || "Ссылка генерируется..."}
                      />
                      <button 
                        onClick={() => {
                          if (waTask.inviteLink) {
                            navigator.clipboard.writeText(waTask.inviteLink);
                            alert("Ссылка скопирована!");
                          }
                        }}
                        className="px-3 py-1 bg-indigo-50 text-indigo-600 font-bold rounded shadow-sm text-xs"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 p-0 overflow-y-auto font-mono text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-white text-slate-500 sticky top-0 border-b border-slate-100 shadow-sm z-10">
                        <tr>
                          <th className="py-2 px-6 font-semibold w-12">№</th>
                          <th className="py-2 px-6 font-semibold">JID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {waTask.needsInvite.map((jid, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-6 text-slate-400">{i + 1}</td>
                            <td className="py-2 px-6 font-medium text-slate-700">{jid}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                // TASK MONITORING LOGS
                <>
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-mono font-bold text-indigo-500 uppercase border border-indigo-100 bg-indigo-50 px-2 py-1 rounded tracking-wide">
                      {waTask.processed}/{waTask.total}
                    </span>
                  </div>
                  <div className="flex-1 p-0 overflow-y-auto font-mono text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-white text-slate-500 sticky top-0 border-b border-slate-100 shadow-sm z-10">
                        <tr>
                          <th className="py-2 px-6 font-semibold w-24">Время</th>
                          <th className="py-2 px-6 font-semibold">Событие</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {waTask.logs.map((log, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-6 text-slate-400 whitespace-nowrap">{log.time}</td>
                            <td className={cn(
                              "py-2 px-6 font-medium",
                              log.type === 'error' ? "text-red-500" : (log.type === 'success' ? "text-green-600" : "text-slate-700")
                            )}>{log.msg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Analytics/Control Sidebar */}
          <div className={cn("flex flex-col gap-6", (waStatus !== 'CONNECTED' || parsedNumbers.length === 0) && "opacity-60 pointer-events-none")}>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-5">{t('step2')}</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-slate-500 mb-2">{t('groupNameLabel')}</label>
                  <input 
                    type="text" 
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={t('groupNamePlaceholder')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                    disabled={waStatus !== 'CONNECTED' || parsedNumbers.length === 0}
                  />
                </div>
              </div>
            </div>

            <div className="bg-indigo-900 rounded-xl p-6 shadow-md text-white flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  {t('engine')}
                </h3>
                <div className="space-y-4">
                  <div className="bg-white/10 p-4 rounded-lg border border-white/5">
                    <div className="text-[10px] text-white/50 uppercase font-bold tracking-wider mb-1">{t('participantsToAdd')}</div>
                    <div className="text-xl font-bold">{parsedNumbers.filter(n => {
                      const alreadyAdded = addedNumbers.has(n.cleaned) || addedNumbers.has(`${groupName}::${n.cleaned}`);
                      return n.selected && !alreadyAdded;
                    }).length}</div>
                  </div>
                  
                  <div className="bg-white/10 p-4 rounded-lg border border-white/5">
                    <div className="text-[10px] text-white/50 uppercase font-bold tracking-wider mb-1">{t('interval')}</div>
                    <div className="text-sm font-medium">{t('intervalValue')}</div>
                  </div>

                  {createResult && (
                    <div className={cn("p-4 rounded-lg border", createResult.success ? "bg-green-500/20 border-green-500/50" : "bg-red-500/20 border-red-500/50")}>
                      <div className={cn("text-[10px] uppercase font-bold mb-1 tracking-wider", createResult.success ? "text-green-400" : "text-red-400")}>Log Output</div>
                      <div className="text-sm font-medium">{createResult.message}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6">
                <button 
                  onClick={handleCreateGroup}
                  disabled={isCreating || waStatus !== 'CONNECTED' || waTask.status === 'running' || parsedNumbers.filter(n => {
                    const alreadyAdded = addedNumbers.has(n.cleaned) || addedNumbers.has(`${groupName}::${n.cleaned}`);
                    return n.selected && !alreadyAdded;
                  }).length === 0 || !groupName}
                  className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 focus:bg-indigo-600 active:transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold tracking-wide transition-all shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2"
                >
                  {isCreating || waTask.status === 'running' ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" /> {t('running')}
                    </>
                  ) : t('execute')}
                </button>
                {waTask.status === 'running' && (
                  <button 
                    onClick={handleCancelTask}
                    className="mt-3 w-full py-3 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-bold tracking-wide transition-all shadow-sm border border-red-500/30 flex items-center justify-center gap-2"
                  >
                    {t('stop')}
                  </button>
                )}
              </div>
            </div>
            
            {/* Coyora Studio Footer */}
            <div className="text-center pt-2 pb-4">
              <span className="text-xs text-slate-400">{t('poweredBy')} </span>
              <a href="https://coyora.studio/" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-500 hover:text-indigo-500 transition-colors">
                Coyora Studio
              </a>
            </div>
          </div>
          </>
          )}
        </main>
      </div>
    </div>
  );
}

