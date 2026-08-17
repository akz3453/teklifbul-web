/**
 * AI Cost Comparison Service
 * Teklifbul Rule v1.0 - Maliyet bazlı provider seçimi
 *
 * OpenAI ve Gemini arasında maliyet karşılaştırması yapar
 * ve en ucuz provider'ı önerir
 */
import { logger } from '../../src/shared/log/logger.js';
/**
 * Provider maliyet bilgileri (USD / 1M token)
 * Güncel fiyatlandırma bilgileri
 */
export const PROVIDER_COSTS = {
    openai: {
        name: 'OpenAI GPT-4o-mini',
        inputPricePerMillion: 0.15, // $0.15 / 1M input token
        outputPricePerMillion: 0.60, // $0.60 / 1M output token
        // Ortalama maliyet (input/output karışık): ~$0.375 / 1M token
        averagePricePerMillion: 0.375
    },
    gemini: {
        name: 'Google Gemini 3.0 Pro',
        // Gemini genellikle daha ucuz, ancak tam fiyatlandırma modeline bağlı
        // Gemini 1.5 Pro: $1.25 / 1M input, $5.00 / 1M output
        // Gemini 3.0 Pro: Tahmini daha ucuz (preview aşamasında)
        // Şimdilik OpenAI'den biraz daha ucuz varsayıyoruz
        inputPricePerMillion: 0.10, // Tahmini: $0.10 / 1M input token
        outputPricePerMillion: 0.40, // Tahmini: $0.40 / 1M output token
        averagePricePerMillion: 0.25 // Ortalama: ~$0.25 / 1M token
    }
};
/**
 * Belirli bir token miktarı için maliyet hesapla
 */
export function calculateCost(provider, promptTokens, completionTokens) {
    const costs = PROVIDER_COSTS[provider];
    const inputCost = (promptTokens / 1000000) * costs.inputPricePerMillion;
    const outputCost = (completionTokens / 1000000) * costs.outputPricePerMillion;
    return inputCost + outputCost;
}
/**
 * İki provider arasında maliyet karşılaştırması yap
 * @returns En ucuz provider'ı döndürür
 */
export function getCheaperProvider(promptTokens, completionTokens) {
    const openaiCost = calculateCost('openai', promptTokens, completionTokens);
    const geminiCost = calculateCost('gemini', promptTokens, completionTokens);
    logger.info('Cost comparison', {
        openaiCost,
        geminiCost,
        cheaper: geminiCost < openaiCost ? 'gemini' : 'openai'
    });
    // Gemini genellikle daha ucuz (ortalama fiyat daha düşük)
    return geminiCost < openaiCost ? 'gemini' : 'openai';
}
/**
 * Ortalama token kullanımı için en ucuz provider'ı döndürür
 * (Tahmini: 100 prompt + 200 completion = 300 token)
 */
export function getDefaultCheaperProvider() {
    // Ortalama kullanım için karşılaştırma
    const averagePromptTokens = 100;
    const averageCompletionTokens = 200;
    return getCheaperProvider(averagePromptTokens, averageCompletionTokens);
}
