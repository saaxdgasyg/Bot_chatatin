// ─────────────────────────────────────────────────────────────
// Finance Bot – Main Entrypoint
// Handles Telegram messages (text, voice, photo) and routes
// them through Gemini AI → DB Service → user reply.
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import { Telegraf } from "telegraf";
import {
  parseTextWithGemini,
  parseImageWithGemini,
  parseAudioWithGemini,
} from "./config/gemini.js";
import {
  saveTransaction,
  getSummary,
  getRecentTransactions,
} from "./services/dbService.js";

// ── Initialise the bot ──────────────────────────────────────
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ── Helpers ─────────────────────────────────────────────────

/**
 * Formats a number as Indonesian Rupiah (Rp 50.000).
 * @param {number} amount
 * @returns {string}
 */
function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Maps transaction type to a user-friendly emoji label.
 */
function typeLabel(type) {
  return type === "INCOME" ? "💰 Pemasukan" : "💸 Pengeluaran";
}

/**
 * Builds a pretty Markdown reply after a transaction is saved.
 */
function buildSuccessReply(txData, savedTx, currentBalance) {
  return (
    `✅ *Transaksi Berhasil Dicatat\\!*\n\n` +
    `📌 *Tipe:* ${typeLabel(txData.type)}\n` +
    `💵 *Jumlah:* \`${formatRupiah(txData.amount)}\`\n` +
    `🏷️ *Kategori:* ${escapeMarkdown(txData.category)}\n` +
    `📝 *Deskripsi:* ${escapeMarkdown(txData.description || "-")}\n` +
    `🕐 *Waktu:* ${escapeMarkdown(savedTx.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }))}\n\n` +
    `💰 *Sisa Saldo:* \`${formatRupiah(currentBalance)}\``
  );
}

/**
 * Escapes special MarkdownV2 characters so Telegram doesn't
 * choke on them.
 */
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// ─────────────────────────────────────────────────────────────
// COMMAND HANDLERS
// ─────────────────────────────────────────────────────────────

// /start – Welcome message
bot.start((ctx) => {
  const name = ctx.from.first_name || "Teman";
  ctx.replyWithMarkdownV2(
    `🤖 *Halo, ${escapeMarkdown(name)}\\!*\n\n` +
      `Saya adalah *Finance Bot* Anda\\. ` +
      `Catat pemasukan & pengeluaran cukup dengan mengirim:\n\n` +
      `📝 *Teks* — _"Makan siang 35rb"_\n` +
      `🎙️ *Voice Note* — Rekam pengeluaran Anda\n` +
      `📸 *Foto Struk* — Kirim foto nota/struk\n\n` +
      `Saya akan otomatis mengekstrak data dan menyimpannya\\.\n\n` +
      `📊 Ketik /ringkasan untuk lihat ringkasan keuangan\n` +
      `📜 Ketik /riwayat untuk lihat 10 transaksi terakhir`
  );
});

// /ringkasan – Financial summary
bot.command("ringkasan", async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const summary = await getSummary(telegramId);

    if (summary.count === 0) {
      return ctx.replyWithMarkdownV2(
        `📊 *Ringkasan Keuangan*\n\nBelum ada transaksi yang tercatat\\.`
      );
    }

    ctx.replyWithMarkdownV2(
      `📊 *Ringkasan Keuangan*\n\n` +
        `💰 *Total Pemasukan:* \`${formatRupiah(summary.totalIncome)}\`\n` +
        `💸 *Total Pengeluaran:* \`${formatRupiah(summary.totalExpense)}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💎 *Saldo:* \`${formatRupiah(summary.balance)}\`\n` +
        `📈 *Jumlah Transaksi:* ${summary.count}`
    );
  } catch (err) {
    console.error("❌ /ringkasan error:", err);
    ctx.reply("⚠️ Gagal mengambil ringkasan. Silakan coba lagi nanti.");
  }
});

// /riwayat – Recent transaction history
bot.command("riwayat", async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const transactions = await getRecentTransactions(telegramId);

    if (transactions.length === 0) {
      return ctx.replyWithMarkdownV2(
        `📜 *Riwayat Transaksi*\n\nBelum ada transaksi yang tercatat\\.`
      );
    }

    const lines = transactions.map((t, i) => {
      const emoji = t.type === "INCOME" ? "💰" : "💸";
      const sign = t.type === "INCOME" ? "\\+" : "\\-";
      return (
        `${i + 1}\\. ${emoji} ${sign}${escapeMarkdown(formatRupiah(t.amount))} ` +
        `— ${escapeMarkdown(t.category)} ` +
        `_\\(${escapeMarkdown(t.description || "-")}\\)_`
      );
    });

    ctx.replyWithMarkdownV2(
      `📜 *Riwayat 10 Transaksi Terakhir*\n\n${lines.join("\n")}`
    );
  } catch (err) {
    console.error("❌ /riwayat error:", err);
    ctx.reply("⚠️ Gagal mengambil riwayat. Silakan coba lagi nanti.");
  }
});

// ─────────────────────────────────────────────────────────────
// MESSAGE HANDLERS
// ─────────────────────────────────────────────────────────────

/**
 * Core processing pipeline shared by text, voice, and photo
 * handlers. Validates Gemini output, saves to DB, replies.
 */
async function processTransaction(ctx, geminiResult) {
  // ── Check if Gemini reported an error ───────────────────
  if (geminiResult.error) {
    return ctx.reply(`⚠️ ${geminiResult.message}`);
  }

  // ── Validate required fields ────────────────────────────
  if (!geminiResult.type || !geminiResult.amount) {
    return ctx.reply(
      "⚠️ Gagal mengekstrak data transaksi. Pastikan pesan Anda berisi informasi keuangan yang jelas."
    );
  }

  // ── Prepare user data ───────────────────────────────────
  const telegramId = String(ctx.from.id);
  const userData = {
    username: ctx.from.username || null,
    firstName: ctx.from.first_name || null,
  };

  // ── Save to database ───────────────────────────────────
  const savedTx = await saveTransaction(telegramId, userData, geminiResult);

  // ── Get updated summary/balance ────────────────────────
  const summary = await getSummary(telegramId);

  // ── Reply with formatted success message ───────────────
  await ctx.replyWithMarkdownV2(buildSuccessReply(geminiResult, savedTx, summary.balance));
}

// ── TEXT handler ─────────────────────────────────────────────
bot.on("text", async (ctx) => {
  // Ignore commands (they start with /)
  if (ctx.message.text.startsWith("/")) return;

  try {
    await ctx.replyWithChatAction("typing");

    const geminiResult = await parseTextWithGemini(ctx.message.text);
    await processTransaction(ctx, geminiResult);
  } catch (err) {
    console.error("❌ Text handler error:", err);
    ctx.reply(
      "⚠️ Terjadi kesalahan saat memproses pesan teks Anda. Silakan coba lagi."
    );
  }
});

// ── PHOTO handler (receipt / nota) ──────────────────────────
bot.on("photo", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");

    // Telegram sends multiple sizes; grab the highest resolution.
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];

    // Get the download URL from Telegram's servers.
    const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);

    // Download the image into a buffer.
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const geminiResult = await parseImageWithGemini(imageBuffer, "image/jpeg");
    await processTransaction(ctx, geminiResult);
  } catch (err) {
    console.error("❌ Photo handler error:", err);
    ctx.reply(
      "⚠️ Terjadi kesalahan saat memproses foto. Pastikan gambar jelas dan coba lagi."
    );
  }
});

// ── VOICE handler ───────────────────────────────────────────
bot.on("voice", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");

    const voice = ctx.message.voice;
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);

    // Download the OGG audio file.
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const mimeType = voice.mime_type || "audio/ogg";
    const geminiResult = await parseAudioWithGemini(audioBuffer, mimeType);
    await processTransaction(ctx, geminiResult);
  } catch (err) {
    console.error("❌ Voice handler error:", err);
    ctx.reply(
      "⚠️ Terjadi kesalahan saat memproses voice note. Silakan coba lagi."
    );
  }
});

// ─────────────────────────────────────────────────────────────
// LAUNCH (Webhook for production, Long Polling for dev)
// ─────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  // ── Production: Webhook mode (Railway / cloud) ──────────
  const PORT = process.env.PORT || 3000;
  const DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;

  if (!DOMAIN) {
    console.warn("⚠️ RAILWAY_PUBLIC_DOMAIN is not set. Falling back to long polling in production.");
    bot.launch().then(() => {
      console.log("🤖 Finance Bot is running in polling mode (production fallback)...");
    });
  } else {
    const webhookPath = `/telegraf/${bot.secretPathComponent()}`;
    const webhookUrl = `https://${DOMAIN}${webhookPath}`;

    bot.telegram.setWebhook(webhookUrl).then(() => {
      console.log(`✅ Webhook set: ${webhookUrl}`);
    });

    // Use Node's built-in http server for the webhook handler.
    const { createServer } = await import("http");

    const server = createServer(async (req, res) => {
      if (req.url === webhookPath && req.method === "POST") {
        // Collect the request body
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const update = JSON.parse(body);
            await bot.handleUpdate(update);
            res.writeHead(200);
            res.end("OK");
          } catch (e) {
            console.error("Webhook processing error:", e);
            res.writeHead(500);
            res.end("Error");
          }
        });
      } else {
        // Health-check endpoint
        res.writeHead(200);
        res.end("🤖 Finance Bot is running!");
      }
    });

    server.listen(PORT, () => {
      console.log(`🚀 Bot server listening on port ${PORT}`);
    });
  }
} else {
  // ── Development: Long Polling mode ──────────────────────
  bot.launch().then(() => {
    console.log("🤖 Finance Bot is running in polling mode...");
  });
}

// ── Graceful shutdown ───────────────────────────────────────
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
