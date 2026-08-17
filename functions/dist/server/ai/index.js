/**
 * Ortak AI Seçici
 * Teklifbul Rule v1.0 - Multi-Provider AI Support
 *
 * OpenAI ve Gemini 3.0 Pro desteği
 */
import { sendGeminiChat } from "./geminiClient.js";
import { sendOpenAIChat } from "./openaiClient.js";
import { sendGroqChat } from "./groqClient.js";
/**
 * Provider'a göre AI çağrısı yap
 * Teklifbul Rule v1.0 - Async/await yapısı, hata yönetimi
 */
export async function sendChat(messages, options) {
    if (options.provider === "groq") {
        const result = await sendGroqChat(messages, {
            systemPrompt: options.systemPrompt,
            model: options.model,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
        });
        return {
            text: result.text,
            totalTokens: result.totalTokens,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
        };
    }
    if (options.provider === "gemini") {
        // Gemini 3.0 Pro
        const result = await sendGeminiChat(messages, {
            systemPrompt: options.systemPrompt,
        });
        return {
            text: result.text,
            totalTokens: result.totalTokens,
        };
    }
    // Varsayılan: OpenAI
    const result = await sendOpenAIChat(messages, {
        systemPrompt: options.systemPrompt,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
    });
    return {
        text: result.text,
        totalTokens: result.totalTokens,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
    };
}
