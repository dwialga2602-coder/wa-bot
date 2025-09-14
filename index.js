import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

client.on("qr", qr => {
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("✅ Bot WhatsApp aktif!");
});

// Welcome message jika ada member baru
client.on("group_join", async (notification) => {
    const chat = await notification.getChat();
    chat.sendMessage(`👋 Selamat datang @${notification.recipientIds[0].split("@")[0]} di grup *${chat.name}*!`, {
        mentions: [notification.recipientIds[0]]
    });
});

client.on("message", async message => {
    const chat = await message.getChat();
    fs.appendFileSync("chat-log.txt", `[${new Date().toISOString()}] ${message.from}: ${message.body}\n`);

    // Anti-link: hapus pesan berisi link
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

client.initialize();