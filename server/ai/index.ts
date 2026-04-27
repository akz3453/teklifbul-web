/**
 * Ortak AI Seçici
 * Teklifbul Rule v1.0 - Multi-Provider AI Support
 * 
 * OpenAI ve Gemini 3.0 Pro desteği
 */

import { sendGeminiChat, GeminiChatMessage, GeminiChatResult } from "./geminiClient.js";
import { sendOpenAIChat, OpenAIChatMessage, OpenAIChatResult } from "./openaiClient.js";
import { sendGroqChat, GroqChatMessage, GroqChatResult } from "./groqClient.js";

export type AIProvider = "openai" | "gemini" | "groq";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  systemPrompt?: string;
  provider: AIProvider;
  // OpenAI özel seçenekler
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Provider'a göre AI çağrısı yap
 * Teklifbul Rule v1.0 - Async/await yapısı, hata yönetimi
 */
export async function sendChat(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResult> {
  if (options.provider === "groq") {
    const result: GroqChatResult = await sendGroqChat(
      messages as GroqChatMessage[],
      {
        systemPrompt: options.systemPrompt,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      }
    );
    return {
      text: result.text,
      totalTokens: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  if (options.provider === "gemini") {
    // Gemini 3.0 Pro
    const result: GeminiChatResult = await sendGeminiChat(
      messages as GeminiChatMessage[],
      {
        systemPrompt: options.systemPrompt,
      }
    );
    return {
      text: result.text,
      totalTokens: result.totalTokens,
    };
  }

  // Varsayılan: OpenAI
  const result: OpenAIChatResult = await sendOpenAIChat(
    messages as OpenAIChatMessage[],
    {
      systemPrompt: options.systemPrompt,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    }
  );
  return {
    text: result.text,
    totalTokens: result.totalTokens,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
}

