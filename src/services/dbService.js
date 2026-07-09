// ─────────────────────────────────────────────────────────────
// Database Service
// Wraps all Prisma interactions behind a clean API so the
// Telegram handler never touches the ORM directly.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Saves a financial transaction to the database.
 *
 * 1. Upserts the User row (creates if first interaction,
 *    otherwise updates username / firstName in case they changed).
 * 2. Creates a Transaction row linked to that user.
 *
 * @param {string} telegramId       – Telegram user ID (stringified).
 * @param {object} userData          – { username, firstName }
 * @param {object} transactionData   – { type, amount, category, description }
 * @returns {Promise<object>}        – The created Transaction record.
 */
export async function saveTransaction(telegramId, userData, transactionData) {
  // ── Step 1: Ensure the user exists ────────────────────────
  await prisma.user.upsert({
    where: { id: telegramId },
    update: {
      username: userData.username,
      firstName: userData.firstName,
    },
    create: {
      id: telegramId,
      username: userData.username,
      firstName: userData.firstName,
    },
  });

  // ── Step 2: Create the transaction ────────────────────────
  const transaction = await prisma.transaction.create({
    data: {
      userId: telegramId,
      type: transactionData.type,          // "INCOME" | "EXPENSE"
      amount: transactionData.amount,
      category: transactionData.category || "Lainnya",
      description: transactionData.description || null,
    },
  });

  return transaction;
}

/**
 * Fetches a summary of all transactions for a given user,
 * grouped by type (INCOME / EXPENSE).
 *
 * @param {string} telegramId – Telegram user ID.
 * @returns {Promise<object>} – { totalIncome, totalExpense, balance, count }
 */
export async function getSummary(telegramId) {
  const user = await prisma.user.findUnique({
    where: { id: telegramId },
    select: { carryOverBalance: true },
  });

  const carryOver = user ? user.carryOverBalance : 0;

  const transactions = await prisma.transaction.findMany({
    where: { userId: telegramId },
  });

  const totalIncome = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    totalIncome,
    totalExpense,
    balance: carryOver + totalIncome - totalExpense,
    count: transactions.length,
  };
}

/**
 * Fetches the last N transactions for a user (newest first).
 *
 * @param {string} telegramId – Telegram user ID.
 * @param {number} limit      – How many records to return (default 10).
 * @returns {Promise<Array>}  – Array of Transaction records.
 */
export async function getRecentTransactions(telegramId, limit = 10) {
  return prisma.transaction.findMany({
    where: { userId: telegramId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Deletes all transactions and resets carryOverBalance to 0 for a user.
 *
 * @param {string} telegramId – Telegram user ID.
 */
export async function clearUserData(telegramId) {
  await prisma.$transaction([
    prisma.transaction.deleteMany({
      where: { userId: telegramId },
    }),
    prisma.user.update({
      where: { id: telegramId },
      data: { carryOverBalance: 0.0 },
    }),
  ]);
}

/**
 * Calculates total income and expenses in the last 7 days.
 *
 * @param {string} telegramId – Telegram user ID.
 * @returns {Promise<object>} – { totalIncome, totalExpense }
 */
export async function getWeeklyStats(telegramId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: telegramId,
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  const totalIncome = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return { totalIncome, totalExpense };
}
