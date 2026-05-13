import { fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
async function test() {
  const { state } = await useMultiFileAuthState("baileys_auth_info");
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on("connection.update", async (update) => {
    if (update.connection === "open") {
      try {
        const selfId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
        console.log("Self ID:", selfId);
        const group = await sock.groupCreate("Test Group Only Me", [selfId]);
        console.log("Success self:", group);
      } catch (e: any) {
        console.error("Self array error:", e.message);
      }
      process.exit(0);
    }
  });
}
test();
