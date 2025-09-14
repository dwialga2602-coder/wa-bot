const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const http = require("http");
const OpenAI = require("openai");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Bot configuration: 5 bots
const botsConfig = [
  { name: "Bot1", session: "session-bot1", route: "/qr-bot1" },
  { name: "Bot2", session: "session-bot2", route: "/qr-bot2" },
  { name: "Bot3", session: "session-bot3", route: "/qr-bot3" },
  { name: "Bot4", session: "session-bot4", route: "/qr-bot4" },
  { name: "Bot5", session: "session-bot5", route: "/qr-bot5" }
];

const clients = [];

// Shared simple quiz bank
const quizQuestions = [
  { question: "Ibukota Indonesia adalah?", options: ["Jakarta","Surabaya","Bandung"], answer: 1 },
  { question: "2 + 2 = ?", options: ["3","4","5"], answer: 2 },
  { question: "Hewan tercepat di darat?", options: ["Kuda","Cheetah","Harimau"], answer: 2 }
];

// cooldown per bot per chat to reduce spam (3s)
const cooldowns = {}; // { botName: Set(chatId) }
// activeQuiz per bot: { botName: { chatId: quizObj } }
const activeQuiz = {};

function createClient(cfg) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: `./${cfg.session}` }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-zygote",
        "--disable-gpu"
      ]
    }
  });

  cooldowns[cfg.name] = new Set();
  activeQuiz[cfg.name] = {};

  client.on("loading_screen", (percent, message) => {
    console.log(`[${cfg.name}] ⏳ Loading ${percent}%: ${message}`);
  });

  client.on("qr", async qr => {
    console.log(`📷 [${cfg.name}] QR code tersedia — scan untuk login.`);
    qrcode.generate(qr, { small: true });
    try {
      await QRCode.toFile(`./${cfg.session}/last-qr.png`, qr);
      console.log(`✅ [${cfg.name}] QR tersimpan di ./${cfg.session}/last-qr.png (akses ${cfg.route})`);
    } catch (err) {
      console.error(`[${cfg.name}] ❌ Gagal menyimpan QR:`, err);
    }
  });

  client.on("auth_failure", async msg => {
    console.error(`[${cfg.name}] ❌ Auth gagal:`, msg);
    console.log(`[${cfg.name}] 🔄 Menghapus session lama...`);
    try {
      fs.rmSync(`./${cfg.session}`, { recursive: true, force: true });
    } catch(e){/*ignore*/}
    // initialize again to regenerate QR
    setTimeout(()=>client.initialize(), 2000);
  });

  client.on("ready", () => {
    console.log(`✅ [${cfg.name}] Bot aktif!`);
  });

  client.on("disconnected", async reason => {
    console.log(`⚠️ [${cfg.name}] Terputus:`, reason);
    console.log(`🔄 [${cfg.name}] Mencoba restart otomatis...`);
    try {
      await client.initialize();
      console.log(`✅ [${cfg.name}] Berhasil reconnect!`);
    } catch (e) {
      console.error(`[${cfg.name}] ❌ Gagal reconnect:`, e);
    }
  });

  // helper: is on cooldown
  function isOnCooldown(botName, chatId) {
    const s = cooldowns[botName];
    if (s.has(chatId)) return true;
    s.add(chatId);
    setTimeout(()=> s.delete(chatId), 3000);
    return false;
  }

  client.on("message", async message => {
    try {
      const from = message.from;
      const senderId = message.author || message.from;
      console.log(`[${cfg.name}] 📩 Pesan masuk dari ${senderId}:`, message.body);

      if (isOnCooldown(cfg.name, from)) {
        console.log(`[${cfg.name}] ⏳ Pada cooldown untuk chat ${from}, mengabaikan pesan.`);
        return;
      }

      const chat = await message.getChat();

      // cek jika user sedang menjawab kuis
      if (activeQuiz[cfg.name][from]) {
        const q = activeQuiz[cfg.name][from];
        const userAnswer = parseInt(message.body.trim());
        if (!isNaN(userAnswer) && userAnswer >=1 && userAnswer <= q.options.length) {
          if (userAnswer === q.answer) {
            await message.reply("✅ Benar! 🎉");
          } else {
            await message.reply(`❌ Salah. Jawaban benar: ${q.options[q.answer - 1]}`);
          }
          delete activeQuiz[cfg.name][from];
          return;
        }
      }

      // Anti-link (hapus pesan berisi link dari non-admin)
      if (chat.isGroup && message.body && /(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(message.body)) {
        const participants = chat.participants;
        const sender = participants.find(p => p.id._serialized === message.author);
        if (sender && !sender.isAdmin) {
          try {
            await message.delete(true);
            await chat.sendMessage(`🚫 Pesan berisi link dari @${message.author.split("@")[0]} telah dihapus.`, { mentions: [message.author] });
            return;
          } catch(err){
            console.error(`[${cfg.name}] ❌ Gagal hapus pesan link:`, err);
          }
        }
      }

      // Commands
      const body = (message.body || "").trim();
      if (!body) return;

      // pagi auto-reply
      if (body.toLowerCase() === "pagi") {
        await message.reply("☀️ Selamat pagi semuanya!");
        return;
      }

      if (body.toLowerCase() === "!menu") {
        await message.reply(`📌 *Menu ${cfg.name}*:\n- !ai <teks>\n- !img <deskripsi>\n- !menu\n- !quiz\n- Kirim gambar → Bot balas sticker\n- Ketik 'pagi' → Balasan otomatis\n- !kick @user (admin)\n- Welcome message otomatis\n- Anti-link`);
        return;
      }

      if (body.toLowerCase().startsWith("!ai ")) {
        const prompt = body.slice(4);
        await message.reply("🤖 Menghubungi AI, tunggu sebentar...");
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
          });
          const text = response.choices?.[0]?.message?.content || "Maaf, AI tidak merespon.";
          await message.reply(text);
        } catch (err) {
          console.error(`[${cfg.name}] ❌ Error AI:`, err);
          await message.reply("❌ Terjadi kesalahan saat menghubungi AI.");
        }
        return;
      }

      if (body.toLowerCase().startsWith("!img ")) {
        const prompt = body.slice(5);
        await message.reply("🎨 Sedang membuat gambar, tunggu sebentar...");
        try {
          const result = await openai.images.generate({
            model: "gpt-image-1",
            prompt,
            size: "512x512"
          });
          const imageUrl = result.data[0].url;
          const resp = await fetch(imageUrl);
          const arrayBuffer = await resp.arrayBuffer();
          const media = new MessageMedia("image/png", Buffer.from(arrayBuffer).toString("base64"), "image.png");
          await client.sendMessage(message.from, media);
        } catch (err) {
          console.error(`[${cfg.name}] ❌ Gagal membuat gambar:`, err);
          await message.reply("❌ Gagal membuat gambar, coba lagi nanti.");
        }
        return;
      }

      if (body.toLowerCase() === "!quiz") {
        const idx = Math.floor(Math.random() * quizQuestions.length);
        const q = quizQuestions[idx];
        activeQuiz[cfg.name][from] = q;
        const optionsText = q.options.map((opt,i)=>`${i+1}. ${opt}`).join("\\n");
        await message.reply(`❓ Pertanyaan:\n${q.question}\n\n${optionsText}\n\nBalas dengan angka (1/${q.options.length})`);
        return;
      }

      // kick (admin only)
      if (body.startsWith("!kick") && chat.isGroup) {
        const participants = chat.participants;
        const sender = participants.find(p => p.id._serialized === message.author);
        if (sender && sender.isAdmin) {
          const mentioned = await message.getMentions();
          for (let u of mentioned) {
            try {
              await chat.removeParticipants([u.id._serialized]);
              await message.reply(`🚨 ${u.pushname} dikeluarkan dari grup`);
            } catch(e){
              console.error(`[${cfg.name}] ❌ Gagal kick:`, e);
            }
          }
        } else {
          await message.reply("❌ Kamu bukan admin grup!");
        }
        return;
      }

      // sticker auto-reply for media
      if (message.hasMedia) {
        try {
          const mediaData = await message.downloadMedia();
          const sticker = new MessageMedia(mediaData.mimetype, mediaData.data, "sticker.webp");
          await message.reply(sticker, undefined, { sendMediaAsSticker: true });
        } catch(err){
          console.error(`[${cfg.name}] ❌ Gagal buat sticker:`, err);
        }
        return;
      }

    } catch (e) {
      console.error(`[${cfg.name}] 💥 Error di message handler:`, e);
    }
  });

  // welcome when someone joins (groupJoin event)
  client.on("group_join", async notification => {
    try {
      const chat = await notification.getChat();
      const userId = notification.recipientIds && notification.recipientIds[0];
      if (userId) {
        await chat.sendMessage(`👋 Selamat datang @${userId.split("@")[0]} di grup *${chat.name}*!`, { mentions: [userId] });
      }
    } catch(e){
      console.error(`[${cfg.name}] ❌ Error welcome:`, e);
    }
  });

  // initialize client
  client.initialize();
  return client;
}

// create clients
for (const cfg of botsConfig) {
  // ensure session dir exists and has .gitkeep
  try { fs.mkdirSync(`./${cfg.session}`, { recursive: true }); } catch(e){}
  const c = createClient(cfg);
  clients.push({ name: cfg.name, client: c, cfg });
}

// Dummy HTTP server to serve QR images per bot and health endpoint
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/qr-bot")) {
    const path = "." + req.url;
    if (fs.existsSync(path)) {
      res.writeHead(200, { "Content-Type": "image/png" });
      fs.createReadStream(path).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("QR not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("✅ WhatsApp multi-bot aktif!\n");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Server dummy jalan di port ${PORT}`);
});

// global handlers
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection:", reason);
});