// ─────────────────────────────────────────────────────────────
// Database Service
// Wraps all Prisma interactions behind a clean API so the
// Telegram handler never touches the ORM directly.
// ─────────────────────────────────────────────────────────────

const { PrismaClient } = require("@prisma/client");

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
async function saveTransaction(telegramId, userData, transactionData) {
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
async function getSummary(telegramId) {
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
    balance: totalIncome - totalExpense,
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
async function getRecentTransactions(telegramId, limit = 10) {
  return prisma.transaction.findMany({
    where: { userId: telegramId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

module.exports = {
  saveTransaction,
  getSummary,
  getRecentTransactions,
};
