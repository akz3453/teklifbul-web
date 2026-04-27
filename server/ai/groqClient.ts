/**
 * Groq Client Wrapper
 * Teklifbul Rule v1.0 - Groq Integration
 * 
 * Groq Cloud API entegrasyonu (Llama-3 modelleri iÃ§in)
 */

import { logger } from '../../src/shared/log/logger.js';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export interface GroqChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface GroqChatOptions {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface GroqChatResult {
    text: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
}

/**
 * Groq API ile sohbet mesaji gÃ¶nder
 */
export async function sendGroqChat(
    messages: GroqChatMessage[],
    options: GroqChatOptions = {}
): Promise<GroqChatResult> {
    logger.group('Groq Chat Request');

    if (!GROQ_API_KEY) {
        logger.error('GROQ_API_KEY not configured');
        throw new Error('Groq API anahtarÄ± tanÄ±mlanmamÄ±ÅŸ.');
    }

    try {
        const model = options.model || GROQ_DEFAULT_MODEL;
        const temperature = options.temperature ?? 0.2;
        const maxTokens = options.maxTokens ?? 2048;

        const finalMessages: GroqChatMessage[] = [];
        if (options.systemPrompt) {
            finalMessages.push({ role: 'system', content: options.systemPrompt });
        }
        finalMessages.push(...messages);

        logger.info('Sending request to Groq API', { model, messageCount: finalMessages.length });

        const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: finalMessages,
                temperature,
                max_tokens: maxTokens,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            logger.error('Groq API error', { status: response.status, error: errorData });
            throw new Error(`Groq API hatasÄ±: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.choices[0]?.message?.content || '';
        const usage = data.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

        logger.info('Groq response received', {
            totalTokens: usage.total_tokens,
            textLength: text.length
        });

        logger.end();
        return {
            text,
            totalTokens: usage.total_tokens,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
        };
    } catch (error: any) {
        logger.error('Groq chat error', error);
        logger.end();
        throw error;
    }
}
