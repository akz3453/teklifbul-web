/**
 * Gemini 3.0 Pro Client
 * Teklifbul Rule v1.0 - Gemini Integration
 * 
 * Google Gemini 3.0 Pro (gemini-3-pro-preview) entegrasyonu
 */

// @ts-ignore - @google/genai paketi type definitions içermeyebilir
import { GoogleGenAI } from "@google/genai";
import { logger } from '../../src/shared/log/logger.js';

if (!process.env.GEMINI_API_KEY) {
  logger.warn("[AI] GEMINI_API_KEY tanımlı değil, Gemini istemcisi pasif kalacak.");
}

// Google GenAI SDK client - lazy initialization
function getGeminiClient(): any {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  // @ts-ignore
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Gemini 3.0 Pro (preview) model kodu
// https://ai.google.dev/gemini-api/docs/models → gemini-3-pro-preview
const MODEL_ID = process.env.GEMINI_MODEL_ID || "gemini-3-pro-preview";

export interface GeminiChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GeminiChatOptions {
  systemPrompt?: string;
}

export interface GeminiChatResult {
  text: string;
  totalTokens: number;
}

/**
 * Gemini 3.0 Pro ile sohbet mesajı gönder
 * Teklifbul Rule v1.0 - Async/await yapısı, hata yönetimi
 */
export async function sendGeminiChat(
  messages: GeminiChatMessage[],
  options: GeminiChatOptions = {}
): Promise<GeminiChatResult> {
  logger.group('Gemini Chat Request');
  try {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error("Gemini client not configured (GEMINI_API_KEY missing).");
    }

    const systemPrompt =
      (options.systemPrompt && options.systemPrompt.trim().length > 0
        ? options.systemPrompt.trim() + "\n\n"
        : "");

    // Basit role flatten – istersen burada daha gelişmiş mapping yapabilirsin
    const historyText = messages
      .map((m) => {
        if (m.role === "system") return ""; // system'i ayrı veriyoruz
        const prefix = m.role === "assistant" ? "Asistan:" : "Kullanıcı:";
        return `${prefix} ${m.content}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const contents = systemPrompt + historyText;

    logger.info('Sending request to Gemini API', {
      model: MODEL_ID,
      messageLength: contents.length
    });

    // @ts-ignore
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents,
    });

    const text = response.text();
    const usage = response.usageMetadata;
    const totalTokens = usage?.totalTokenCount ?? 0;

    logger.info('Gemini response received', {
      totalTokens,
      textLength: text.length
    });
    logger.end();

    return {
      text,
      totalTokens,
    };
  } catch (error: any) {
    logger.error('Gemini chat error', error);
    logger.end();
    throw new Error(error?.message || 'Gemini isteği sırasında bir hata oluştu.');
  }
}

