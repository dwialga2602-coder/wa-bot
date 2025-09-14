const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const http = require("http");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const OpenAI = require("openai");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sessionPath = "session-bot1";
try { fs.mkdirSync(sessionPath, { recursive: true }); } catch (e) {}

const activeQuizzes = {};
const quizData = [
  { question: "Ibukota Indonesia?", answer: "Jakarta" },
  { question: "Hasil 5+7?", answer: "12" },
  { question: "Planet merah?", answer: "Mars" },
];

function getRandomQuiz() {
  return quizData[Math.floor(Math.random() * quizData.length)];
}

// anti-spam cooldown
const cooldown = new Set();
function isOnCooldown(chatId) {
  if (cooldown.has(chatId)) return true;
  cooldown.add(chatId);
  setTimeout(() => cooldown.delete(chatId), 3000);
  return false;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: `./${sessionPath}` }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
});

let qrTimer;

client.on("qr", async qr => {
  console.log(`\n📷 [BOT] QR CODE BARU! Scan dengan WhatsApp Web:`);
  qrcode.generate(qr, { small: false });
  try {
    await QRCode.toFile(`./${sessionPath}/last-qr.png`, qr);
    console.log(`✅ [BOT] QR tersimpan di /${sessionPath}/last-qr.png`);
  } catch (err) {
    console.error(`[BOT] ❌ Gagal simpan QR:`, err);
  }
  if (qrTimer) clearTimeout(qrTimer);
  qrTimer = setTimeout(() => {
    console.log(`⏳ [BOT] QR kadaluarsa, memicu refresh...`);
    client.initialize();
  }, 60000);
});

client.on("ready", () => {
  console.log(`✅ [BOT] Bot aktif! Semua fitur siap.`);
  if (qrTimer) clearTimeout(qrTimer);
});

client.on("group_join", notification => {
  client.sendMessage(notification.id.remote, `👋 Selamat datang @${notification.recipientIds[0].split('@')[0]}!`, {
    mentions: [notification.recipientIds[0]]
  });
});

client.on("message", async message => {
  console.log(`[BOT] 📩 ${message.from}: ${message.body}`);
  if (isOnCooldown(message.from)) return;

  // auto sticker
  if (message.hasMedia && message.caption === "!sticker") {
    const media = await message.downloadMedia();
    await client.sendMessage(message.from, media, { sendMediaAsSticker: true });
    return;
  }

  // anti link
  if (/chat\.whatsapp\.com/i.test(message.body)) {
    message.delete(true);
    client.sendMessage(message.from, "🚫 Link grup tidak diperbolehkan!");
    return;
  }

  // AI chat
  if (message.body.startsWith("!ai")) {
    const prompt = message.body.slice(3).trim();
    if (!prompt) return message.reply("❌ Contoh: !ai jelaskan apa itu AI");
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      });
      await message.reply(completion.choices[0].message.content);
    } catch (e) {
      message.reply("⚠️ Gagal memproses AI: " + e.message);
    }
    return;
  }

  // AI gambar
  if (message.body.startsWith("!img")) {
    const prompt = message.body.slice(4).trim();
    if (!prompt) return message.reply("❌ Contoh: !img kucing lucu pakai topi");
    try {
      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "512x512"
      });
      const imgURL = result.data[0].url;
      const response = await fetch(imgURL);
      const buffer = Buffer.from(await response.arrayBuffer());
      const media = new MessageMedia("image/png", buffer.toString("base64"));
      await client.sendMessage(message.from, media, { caption: "🎨 Gambar selesai!" });
    } catch (e) {
      message.reply("⚠️ Gagal generate gambar: " + e.message);
    }
    return;
  }

  // quiz
  if (message.body === "!quiz") {
    const q = getRandomQuiz();
    activeQuizzes[message.from] = q.answer.toLowerCase();
    await message.reply(`❓ Quiz: ${q.question}`);
    return;
  }

  if (activeQuizzes[message.from] && message.body.toLowerCase() === activeQuizzes[message.from]) {
    await message.reply("✅ Benar!");
    delete activeQuizzes[message.from];
    return;
  }

  if (message.body === "!menu") {
    await message.reply(`📜 Menu Bot:\n!ai <prompt>\n!img <prompt>\n!quiz\n!sticker (kirim dengan gambar)\n!menu`);
    return;
  }
});

client.initialize();

const server = http.createServer((req, res) => {
  if (req.url === "/qr") {
    const path = `./${sessionPath}/last-qr.png`;
    if (fs.existsSync(path)) {
      res.writeHead(200, { "Content-Type": "image/png" });
      fs.createReadStream(path).pipe(res);
    } else {
      res.writeHead(404);
      res.end("QR belum tersedia, cek log.");
    }
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("✅ WhatsApp bot aktif! Fitur lengkap tersedia.\n");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Server jalan di port ${PORT}`));