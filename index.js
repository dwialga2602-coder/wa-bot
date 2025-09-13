import express from "express";
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const app = express();
const PORT = process.env.PORT || 3000;

// --- EXPRESS KEEP-ALIVE SERVER ---
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Bot is running on Render!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
});

// --- WHATSAPP BOT ---
const client = new Client({
  authStrategy: new LocalAuth(), // Simpan session di server Render
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Scan QR dengan WhatsApp (Perangkat Tertaut).");
});

client.on("ready", () => {
  console.log("🤖 Bot WhatsApp sudah online!");
});

client.on("message", async (msg) => {
  const chat = await msg.getChat();
  const text = msg.body.trim().toLowerCase();

  // Respon hanya di grup
  if (chat.isGroup) {
    if (text === "!menu") {
      msg.reply("📋 Menu Bot:\n!menu - lihat menu\n!ping - cek online\n!info - info grup");
    }

    if (text === "!ping") {
      msg.reply("🏓 Pong! Bot aktif ✅");
    }

    if (text === "!info") {
      msg.reply(`ℹ️ Nama grup: ${chat.name}\n👥 Member: ${chat.participants.length}`);
    }
  }
});
client.initialize();