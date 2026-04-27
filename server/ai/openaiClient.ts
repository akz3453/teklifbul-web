/**
 * OpenAI Client Wrapper
 * Teklifbul Rule v1.0 - OpenAI Integration
 * 
 * OpenAI API entegrasyonu için wrapper fonksiyon
 */

import OpenAI from 'openai';
import { logger } from '../../src/shared/log/logger.js';

// OpenAI client - lazy initialization (sadece gerektiğinde oluştur)
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

export interface OpenAIChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenAIChatOptions {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface OpenAIChatResult {
  text: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * OpenAI ile sohbet mesajı gönder
 * Teklifbul Rule v1.0 - Async/await yapısı, hata yönetimi
 */
export async function sendOpenAIChat(
  messages: OpenAIChatMessage[],
  options: OpenAIChatOptions = {}
): Promise<OpenAIChatResult> {
  logger.group('OpenAI Chat Request');
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    const openai = getOpenAIClient();

    // System prompt varsa mesajların başına ekle
    const finalMessages: OpenAIChatMessage[] = [];
    if (options.systemPrompt && options.systemPrompt.trim().length > 0) {
      finalMessages.push({
        role: 'system',
        content: options.systemPrompt.trim()
      });
    }

    // Diğer mesajları ekle
    finalMessages.push(...messages);

    const model = options.model || 'gpt-4o-mini';
    const temperature = options.temperature ?? 0.2;
    const maxTokens = options.maxTokens ?? 2048;

    logger.info('Sending request to OpenAI API', {
      model,
      messageCount: finalMessages.length,
      messageLength: finalMessages.map(m => m.content).join('').length
    });

    const completion = await openai.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: finalMessages.map(m => ({
        role: m.role,
        content: m.content
      }))
    });

    const text = completion.choices[0]?.message?.content ?? 'Asistan yanıt üretemedi.';
    const usage = (completion as any).usage ?? null;

    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? 0;

    logger.info('OpenAI response received', {
      promptTokens,
      completionTokens,
      totalTokens,
      textLength: text.length
    });
    logger.end();

    return {
      text,
      totalTokens,
      promptTokens,
      completionTokens,
    };
  } catch (error: any) {
    logger.error('OpenAI chat error', error);
    logger.end();
    throw new Error(error?.message || 'OpenAI isteği sırasında bir hata oluştu.');
  }
}

