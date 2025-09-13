const express = require("express");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ WhatsApp Group Bot is running!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
});

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth()
});

// QR Login
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

// Ready
client.on("ready", async () => {
  console.log("🚀 WhatsApp Group Bot is ready!");
});

// Pesan masuk
client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) {
    console.log(`[GRUP] ${msg.from}: ${msg.body}`);

    if (msg.body === "!id") {
      msg.reply(`🆔 ID grup ini: ${msg.from}`);
    }

    if (msg.body === "!info") {
      const chat = await msg.getChat();
      msg.reply(
        `📢 Nama grup: ${chat.name}\n🆔 ID grup: ${chat.id._serialized}\n👥 Jumlah member: ${chat.participants.length}`
      );
    }

    if (msg.body === "!halo") {
      msg.reply("👋 Halo semua, salam hangat dari saya admin grup!");
    }

    if (msg.body === "!bot") {
      const me = await client.getMe();
      msg.reply(`🤖 Nomor bot ini adalah: ${me.id.user}`);
    }
  }
});

// Fitur Selamat Datang
client.on("group_join", async (notification) => {
  const chat = await notification.getChat();
  const newMember = notification.id.participant.split("@")[0];
  chat.sendMessage(
    `🎉 Selamat datang @${newMember} di *${chat.name}*! Semoga betah ya 🙌`,
    { mentions: [notification.id.participant] }
  );
});

// Fitur Goodbye
client.on("group_leave", async (notification) => {
  const chat = await notification.getChat();
  const member = notification.id.participant.split("@")[0];
  chat.sendMessage(
    `👋 Selamat tinggal @${member}, semoga sukses di luar sana!`,
    { mentions: [notification.id.participant] }
  );
});

client.initialize();