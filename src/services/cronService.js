// ─────────────────────────────────────────────────────────────
// Cron Service
// Handles daily automatic export of user transactions to Excel,
// sends the file to the user via Telegram, and cleans up the db.
// ─────────────────────────────────────────────────────────────

import cron from "node-cron";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Helper: Exports a user's transactions to an Excel sheet buffer,
 * sends the file to the user, and deletes the transactions.
 *
 * @param {object} bot      – Telegraf bot instance.
 * @param {string} userId   – Telegram user ID.
 * @param {string} mode     – "harian" (daily cron) or "manual" (/export command).
 */
export async function exportAndCleanupTransactions(bot, userId, mode = "harian") {
  try {
    // ── 1. Fetch transactions for the user ─────────────────────
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (transactions.length === 0) {
      if (mode === "manual") {
        await bot.telegram.sendMessage(userId, "📭 Belum ada transaksi yang tercatat untuk diekspor.");
      }
      return;
    }

    // ── 2. Create Excel workbook & worksheet ───────────────────
    const wb = XLSX.utils.book_new();

    const data = transactions.map((t, idx) => ({
      "No.": idx + 1,
      "Tanggal (WIB)": t.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      "Tipe": t.type === "INCOME" ? "Pemasukan" : "Pengeluaran",
      "Jumlah (Rp)": t.amount,
      "Kategori": t.category,
      "Deskripsi": t.description || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-fit column widths for better styling/readability
    const maxLens = {};
    data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        const valStr = String(row[key]);
        maxLens[key] = Math.max(maxLens[key] || key.length, valStr.length);
      });
    });
    ws["!cols"] = Object.keys(maxLens).map((key) => ({ wch: maxLens[key] + 3 }));

    XLSX.utils.book_append_sheet(wb, ws, "Daftar Transaksi");

    // Write to a buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // ── 3. Send document via Telegram ──────────────────────────
    const dateStr = new Date().toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).replace(/\//g, "-");

    const filename = `Laporan-Keuangan-${dateStr}.xlsx`;
    const caption = mode === "harian"
      ? `📊 *Laporan Keuangan Harian (${dateStr})*\n\nSemua transaksi Anda hari ini telah diekspor ke Excel dan dibersihkan dari database untuk menghemat ruang penyimpanan.`
      : `📊 *Ekspor Laporan Keuangan (${dateStr})*\n\nTransaksi Anda berhasil diekspor ke Excel dan dibersihkan dari database sesuai permintaan.`;

    await bot.telegram.sendDocument(
      userId,
      { source: buf, filename },
      { caption, parse_mode: "Markdown" }
    );

    // ── 4. Delete the exported transactions ────────────────────
    await prisma.transaction.deleteMany({
      where: {
        id: { in: transactions.map((t) => t.id) },
      },
    });

    console.log(`✅ Success export & cleanup for user ${userId} (${transactions.length} rows)`);
  } catch (err) {
    console.error(`❌ Export & cleanup error for user ${userId}:`, err);
    await bot.telegram.sendMessage(
      userId,
      "⚠️ Terjadi kesalahan saat mengekspor laporan keuangan Anda. Transaksi tetap aman di database."
    );
  }
}

/**
 * Initializes the daily cron job scheduler.
 * Runs every day at 23:59:00 (Asia/Jakarta timezone).
 *
 * @param {object} bot – Telegraf bot instance.
 */
export function initCronService(bot) {
  // Cron schedule: "59 23 * * *" -> 23:59:00 every day
  // Set timezone to Asia/Jakarta so it aligns with local daily cycle.
  cron.schedule("59 23 * * *", async () => {
    console.log("⏰ Starting daily automatic Excel export and cleanup job...");

    try {
      // Find all users who have active transactions
      const activeUsers = await prisma.user.findMany({
        where: {
          transactions: {
            some: {},
          },
        },
        select: {
          id: true,
        },
      });

      console.log(`Found ${activeUsers.length} users with active transactions to export.`);

      for (const user of activeUsers) {
        await exportAndCleanupTransactions(bot, user.id, "harian");
      }

      console.log("⏰ Daily automatic Excel export and cleanup job completed.");
    } catch (err) {
      console.error("❌ Daily automatic export job failed:", err);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta",
  });

  console.log("📅 Cron Service initialized (Scheduled daily at 23:59 Asia/Jakarta).");
}
