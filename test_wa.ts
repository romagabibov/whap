import { fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
async function test() {
  const { state } = await useMultiFileAuthState("baileys_auth_info");
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on("connection.update", async (update) => {
    if (update.connection === "open") {
      try {
        const group = await sock.groupCreate("Test Group", []);
        console.log("Success:", group);
      } catch (e) {
        console.error("Empty array error:", e.message);
      }
      try {
        const selfId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const group2 = await sock.groupCreate("Test Group Self", [selfId]);
        console.log("Success self:", group2);
      } catch (e) {
        console.error("Self array error:", e.message);
      }
      process.exit(0);
    }
  });
}
test();
