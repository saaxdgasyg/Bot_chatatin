# 🤖 Finance Bot — Telegram AI Finance Tracker

Record your personal finances (income & expenses) simply by sending **text**, **voice notes**, or **receipt photos** to a Telegram Bot. Powered by **Google Gemini 1.5 Flash AI**, **Prisma ORM**, and **PostgreSQL**.

---

## ✨ Features

| Input Type | Description |
|---|---|
| 📝 **Text** | Send messages like _"Makan siang 35rb"_ or _"Gaji bulan ini 5jt"_ |
| 🎙️ **Voice Note** | Record a voice message describing your transaction |
| 📸 **Receipt Photo** | Snap a photo of any receipt/nota and the bot extracts the total |

- **AI-Powered Parsing** — Gemini 1.5 Flash extracts transaction type, amount, category, and description
- **Auto-categorisation** — Transactions are classified into: Makanan, Transportasi, Hiburan, Kebutuhan, Gaji, Investasi, Lainnya
- **Slang support** — Understands `50rb` → 50,000 and `1jt` → 1,000,000
- **Financial Summary** — `/ringkasan` for total income/expense/balance
- **Transaction History** — `/riwayat` for the last 10 transactions
- **Production-ready** — Webhook mode for Railway/cloud deployment

---

## 📁 Project Structure

```
finance-bot/
├── prisma/
│   └── schema.prisma          # Database models (User, Transaction)
├── src/
│   ├── config/
│   │   └── gemini.js          # Gemini AI configuration & helpers
│   ├── services/
│   │   └── dbService.js       # Prisma database service layer
│   └── index.js               # Main entrypoint & Telegram handlers
├── .env                       # Environment variables (secrets)
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** database (local or hosted, e.g. Railway, Supabase, Neon)
- **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)
- **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Edit the `.env` file and fill in your real values:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://postgres:password@localhost:5432/finance_bot
```

### 3. Push the database schema

```bash
npx prisma db push
```

### 4. Run in development mode

```bash
npm run dev
```

The bot will start in **long-polling mode**. Open Telegram, find your bot, and send it a message!

---

## 🌐 Deploy to Railway

1. Push your code to a GitHub repo.
2. Create a new project on [Railway](https://railway.app) and connect the repo.
3. Add a **PostgreSQL** plugin to the project.
4. Set these environment variables in Railway:

   | Variable | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Your bot token |
   | `GEMINI_API_KEY` | Your Gemini key |
   | `DATABASE_URL` | Auto-set by Railway's PG plugin |
   | `NODE_ENV` | `production` |
   | `RAILWAY_PUBLIC_DOMAIN` | Your Railway public domain (e.g. `my-bot.up.railway.app`) |

5. Railway will run `npm start`, which auto-pushes the schema and starts the bot in webhook mode.

---

## 🤖 Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome message with usage instructions |
| `/ringkasan` | View financial summary (income, expense, balance) |
| `/riwayat` | View last 10 transactions |

---

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Telegram SDK:** [Telegraf](https://telegraf.js.org/)
- **AI:** [Google Gemini 1.5 Flash](https://ai.google.dev/) via `@google/genai`
- **ORM:** [Prisma](https://www.prisma.io/)
- **Database:** PostgreSQL

---

## 📄 License

MIT
