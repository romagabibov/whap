import { fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
async function test() {
  const { state } = await useMultiFileAuthState("baileys_auth_info");
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on("connection.update", async (update) => {
    if (update.connection === "open") {
      try {
        console.log("Attempting to create group with NO participants...");
        const group = await sock.groupCreate("Test Empty Group", []);
        console.log("Success:", group.id);
      } catch (e: any) {
        console.error("Empty array error:", e.message);
      }
      process.exit(0);
    }
  });
}
test();
