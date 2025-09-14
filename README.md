WhatsApp multi-bot (5) project
- Run locally: npm install && export OPENAI_API_KEY="sk-..." && node index.js
- Each bot QR available at: /session-botX/last-qr.png and also served at /qr-botX (e.g. /qr-bot1)
- Commit session-botX folders after scanning QR so Render uses existing session
- Ensure OPENAI_API_KEY is set in environment (for !ai and !img features)
- Note: running 5 bots requires more memory/CPU on server