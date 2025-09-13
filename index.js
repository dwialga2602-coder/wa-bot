const express = require("express");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ WhatsApp Bot is running on Render!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
});

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth()
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("🚀 WhatsApp Bot is ready!");
});

client.initialize();