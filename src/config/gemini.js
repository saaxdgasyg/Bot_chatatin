// ─────────────────────────────────────────────────────────────
// Gemini AI Configuration
// Uses @google/genai SDK with gemini-1.5-flash model.
// Configured for deterministic JSON-only output (temperature 0.1).
// ─────────────────────────────────────────────────────────────

import { GoogleGenAI } from "@google/genai";

// ── Initialise the Gemini client ─────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Master System Instruction ────────────────────────────────
// Tells the model exactly how to behave: extract financial data
// from text / audio transcripts / receipt images and return
// strict JSON without any markdown wrapping.
const SYSTEM_INSTRUCTION = `Anda adalah AI Asisten Keuangan Pribadi yang cerdas, teliti, dan andal. Tugas utama Anda adalah mengekstrak data transaksi keuangan dari tiga jenis input: teks mentah, transkrip/rekaman suara (audio), atau foto struk/nota belanja (image).

Anda WAJIB menganalisis input secara mendalam dan mengembalikan output HANYA dalam format JSON murni, tanpa pembungkus markdown seperti \`\`\`json, tanpa teks basa-basi.

Format JSON wajib:
{
  "type": "INCOME" atau "EXPENSE",
  "amount": <angka_integer_tanpa_titik_atau_koma>,
  "category": "Makanan" | "Transportasi" | "Hiburan" | "Kebutuhan" | "Gaji" | "Investasi" | "Lainnya",
  "description": "<catatan_singkat_transaksi>"
}

Rules:
1. INCOME untuk uang yang masuk. EXPENSE untuk uang yang keluar (termasuk struk belanja).
2. Konversi slang seperti '50rb', '1jt', '2,5jt' ke angka penuh (50000, 1000000, 2500000).
3. Untuk struk/nota, ekstrak Grand Total / total akhir.
4. Jika input tidak valid atau tidak bisa dibaca, kembalikan: {"error": true, "message": "Gagal mengekstrak data. Silakan kirim ulang dengan format yang lebih jelas."}`;

// ── Model name ───────────────────────────────────────────────
const MODEL_NAME = "gemini-1.5-flash";

// ── Helper: parse text input ─────────────────────────────────
/**
 * Sends a plain-text message to Gemini and returns the parsed
 * transaction JSON (or an error object).
 *
 * @param {string} text – The raw user message.
 * @returns {Promise<object>} Parsed JSON from Gemini.
 */
export async function parseTextWithGemini(text) {
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: text,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  // The SDK returns the text content; parse it into a JS object.
  return JSON.parse(response.text);
}

// ── Helper: parse image input (receipt photo) ────────────────
/**
 * Sends an image (receipt / nota) to Gemini along with an
 * instruction prompt and returns the parsed transaction JSON.
 *
 * @param {Buffer} imageBuffer – Raw image bytes.
 * @param {string} mimeType   – e.g. "image/jpeg".
 * @returns {Promise<object>} Parsed JSON from Gemini.
 */
export async function parseImageWithGemini(imageBuffer, mimeType) {
  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType,
    },
  };

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      "Ekstrak data transaksi keuangan dari foto struk/nota berikut.",
      imagePart,
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  return JSON.parse(response.text);
}

// ── Helper: parse voice / audio input ────────────────────────
/**
 * Sends an audio file to Gemini for transcription + extraction
 * and returns the parsed transaction JSON.
 *
 * @param {Buffer} audioBuffer – Raw audio bytes.
 * @param {string} mimeType   – e.g. "audio/ogg".
 * @returns {Promise<object>} Parsed JSON from Gemini.
 */
export async function parseAudioWithGemini(audioBuffer, mimeType) {
  const audioPart = {
    inlineData: {
      data: audioBuffer.toString("base64"),
      mimeType,
    },
  };

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      "Dengarkan rekaman suara berikut, transkrip isinya, lalu ekstrak data transaksi keuangan.",
      audioPart,
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  return JSON.parse(response.text);
}
