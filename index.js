const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const http = require("http");
const OpenAI = require("openai");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const botsConfig = [
  { name: "Bot1", session: "session-bot1", route: "/qr-bot1" },
  { name: "Bot2", session: "session-bot2", route: "/qr-bot2" },
  { name: "Bot3", session: "session-bot3", route: "/qr-bot3" },
  { name: "Bot4", session: "session-bot4", route: "/qr-bot4" },
  { name: "Bot5", session: "session-bot5", route: "/qr-bot5" }
];

const clients = [];

// Regenerate QR if not scanned within 60s
const qrTimers = {};

function createClient(cfg) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: `./${cfg.session}` }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox"]
    }
  });

  client.on("qr", async qr => {
    console.log(`\n📷 [${cfg.name}] QR CODE BARU! Scan dengan WhatsApp Web:`);
    qrcode.generate(qr, { small: false }); // besar supaya mudah terbaca
    try {
      await QRCode.toFile(`./${cfg.session}/last-qr.png`, qr);
      console.log(`✅ [${cfg.name}] QR tersimpan di /${cfg.session}/last-qr.png`);
    } catch (err) {
      console.error(`[${cfg.name}] ❌ Gagal simpan QR:`, err);
    }
    if (qrTimers[cfg.name]) clearTimeout(qrTimers[cfg.name]);
    qrTimers[cfg.name] = setTimeout(() => {
      console.log(`⏳ [${cfg.name}] QR kadaluarsa, memicu refresh...`);
      client.initialize();
    }, 60000);
  });

  client.on("ready", () => {
    console.log(`✅ [${cfg.name}] Bot aktif!`);
    if (qrTimers[cfg.name]) clearTimeout(qrTimers[cfg.name]);
  });

  client.on("auth_failure", msg => {
    console.error(`[${cfg.name}] ❌ Auth gagal:`, msg);
    console.log(`[${cfg.name}] 🔄 Menghapus session untuk regen QR...`);
    fs.rmSync(`./${cfg.session}`, { recursive: true, force: true });
    client.initialize();
  });

  client.on("disconnected", reason => {
    console.log(`[${cfg.name}] ⚠️ Bot terputus: ${reason}`);
    console.log(`[${cfg.name}] 🔄 Mencoba reconnect...`);
    client.initialize();
  });

  client.on("loading_screen", (percent, message) => {
    console.log(`[${cfg.name}] ⏳ Loading ${percent}%: ${message}`);
  });

  client.on("message", message => {
    console.log(`[${cfg.name}] 📩 Pesan dari ${message.from}: ${message.body}`);
    if (message.body === "!ping") message.reply(`[${cfg.name}] Pong ✅`);
  });

  client.initialize();
  return client;
}

for (const cfg of botsConfig) {
  try { fs.mkdirSync(`./${cfg.session}`, { recursive: true }); } catch(e){}
  const c = createClient(cfg);
  clients.push({ name: cfg.name, client: c });
}

const server = http.createServer((req, res) => {
  const found = botsConfig.find(b => req.url === b.route);
  if (found) {
    const path = `./${found.session}/last-qr.png`;
    if (fs.existsSync(path)) {
      res.writeHead(200, { "Content-Type": "image/png" });
      fs.createReadStream(path).pipe(res);
    } else {
      res.writeHead(404);
      res.end("QR belum tersedia, cek log untuk scan QR.");
    }
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("✅ WhatsApp multi-bot debug aktif! QR otomatis refresh setiap 60 detik.\n");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Server dummy jalan di port ${PORT}`);
});