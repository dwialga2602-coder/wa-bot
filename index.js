const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const http = require("http");
const OpenAI = require("openai");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
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

client.on("loading_screen", (percent, message) => {
    console.log(`⏳ Loading ${percent}%: ${message}`);
});

client.on("qr", async qr => {
    console.log("📷 QR code berhasil dibuat! Scan QR berikut:");
    qrcode.generate(qr, { small: true });
    try {
        await QRCode.toFile("./session/last-qr.png", qr);
        console.log("✅ QR tersimpan di /session/last-qr.png, bisa diakses via /qr");
    } catch (err) {
        console.error("❌ Gagal menyimpan QR:", err);
    }
});

client.on("auth_failure", async msg => {
    console.error("❌ Auth gagal:", msg);
    console.log("🔄 Menghapus session lama dan menunggu QR baru...");
    fs.rmSync("./session", { recursive: true, force: true });
    client.initialize();
});

client.on("ready", () => {
    console.log("✅ Bot WhatsApp aktif!");
});

client.on("disconnected", async reason => {
    console.log("⚠️ Bot terputus:", reason);
    console.log("🔄 Mencoba restart otomatis...");
    try {
        await client.initialize();
        console.log("✅ Bot berhasil reconnect!");
    } catch (e) {
        console.error("❌ Gagal reconnect:", e);
    }
});

client.on("message", async message => {
    console.log("📩 Pesan masuk:", message.body);
    const chat = await message.getChat();
    fs.appendFileSync("chat-log.txt", `[${new Date().toISOString()}] ${message.from}: ${message.body}\n`);

    if (chat.isGroup && /(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(message.body)) {
        const sender = chat.participants.find(p => p.id._serialized === message.author);
        if (!sender?.isAdmin) {
            await message.delete(true);
            chat.sendMessage(`🚫 Pesan berisi link dari @${message.author.split("@")[0]} telah dihapus.`, {
                mentions: [message.author]
            });
        }
    }

    if (message.body.toLowerCase() === "pagi") {
        message.reply("☀️ Selamat pagi semuanya!");
    }

    if (message.body.toLowerCase().startsWith("!ai ")) {
        const prompt = message.body.slice(4);
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }]
            });
            message.reply(response.choices[0].message.content);
        } catch (error) {
            message.reply("❌ Terjadi kesalahan saat menghubungi AI.");
            console.error(error);
        }
    }

    if (message.hasMedia) {
        const media = await message.downloadMedia();
        const sticker = new MessageMedia(media.mimetype, media.data, "sticker.webp");
        message.reply(sticker, undefined, { sendMediaAsSticker: true });
    }

    if (message.body === "!menu") {
        message.reply(
`📌 *Menu Bot*:
- !ai <teks> → Tanya AI
- !menu → Lihat menu
- Kirim gambar → Bot balas sticker
- Ketik 'pagi' → Balasan otomatis
- !kick @user → Kick member (admin saja)
- Welcome message otomatis
- Anti-link (hapus link dari non-admin)`
        );
    }

    if (message.body.startsWith("!kick") && chat.isGroup) {
        const sender = chat.participants.find(p => p.id._serialized === message.author);
        if (sender?.isAdmin) {
            const mentioned = await message.getMentions();
            for (let user of mentioned) {
                await chat.removeParticipants([user.id._serialized]);
                message.reply(`🚨 ${user.pushname} dikeluarkan dari grup`);
            }
        } else {
            message.reply("❌ Kamu bukan admin grup!");
        }
    }
});

// Dummy HTTP server untuk Render
const server = http.createServer((req, res) => {
    if (req.url === "/qr" && fs.existsSync("./session/last-qr.png")) {
        res.writeHead(200, { "Content-Type": "image/png" });
        fs.createReadStream("./session/last-qr.png").pipe(res);
    } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("✅ WhatsApp Bot aktif! Akses QR di /qr\n");
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Server dummy jalan di port ${PORT}`);
});

process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("💥 Unhandled Rejection:", reason);
});

client.initialize();
