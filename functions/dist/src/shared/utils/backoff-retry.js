"use strict";
/**
 * Exponential Backoff + Retry Utility
 * Teklifbul Rule v1.0 - Firestore quota/limit hataları için retry mekanizması
 *
 * RESOURCE_EXHAUSTED, DEADLINE_EXCEEDED gibi hatalar için exponential backoff ile retry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
exports.commitBatchWithRetry = commitBatchWithRetry;
const logger_1 = require("../log/logger");
const DEFAULT_OPTIONS = {
    maxRetries: 5,
    initialDelayMs: 250,
    maxDelayMs: 16000, // 16 saniye
    backoffMultiplier: 2,
    retryableErrors: ['RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'UNAVAILABLE', 'ABORTED'],
};
/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Hatanın retry edilebilir olup olmadığını kontrol et
 */
function isRetryableError(error, retryableErrors) {
    if (!error)
        return false;
    const errorCode = error.code || error.message || '';
    const errorString = String(errorCode).toUpperCase();
    return retryableErrors.some((retryable) => errorString.includes(retryable.toUpperCase()));
}
/**
 * Exponential backoff ile retry
 *
 * @param fn - Çalıştırılacak async fonksiyon
 * @param options - Retry seçenekleri
 * @returns Fonksiyonun sonucu
 */
async function withRetry(fn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError;
    let delay = opts.initialDelayMs;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Son deneme ise hatayı fırlat
            if (attempt >= opts.maxRetries) {
                logger_1.logger.error(`Retry basarisiz (${attempt + 1}/${opts.maxRetries + 1})`, error);
                throw error;
            }
            // Retry edilebilir hata mı kontrol et
            if (!isRetryableError(error, opts.retryableErrors)) {
                logger_1.logger.warn('Retry edilemeyen hata, direkt firlatiliyor', { error: error.message });
                throw error;
            }
            // Exponential backoff
            const actualDelay = Math.min(delay, opts.maxDelayMs);
            logger_1.logger.warn(`Retry denemesi ${attempt + 1}/${opts.maxRetries + 1}`, {
                error: error.code || error.message,
                delay: `${actualDelay}ms`,
                nextAttempt: attempt + 2,
            });
            await sleep(actualDelay);
            delay *= opts.backoffMultiplier;
        }
    }
    // Buraya gelmemeli ama TypeScript için
    throw lastError;
}
/**
 * Firestore batch commit için özel retry wrapper
 */
async function commitBatchWithRetry(batch, options = {}) {
    return withRetry(async () => {
        await batch.commit();
    }, {
        ...options,
        retryableErrors: [
            'RESOURCE_EXHAUSTED',
            'DEADLINE_EXCEEDED',
            'UNAVAILABLE',
            'ABORTED',
            'INTERNAL',
        ],
    });
}
