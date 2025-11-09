/**
 * Exponential Backoff + Retry Utility
 * Teklifbul Rule v1.0 - Firestore quota/limit hataları için retry mekanizması
 * 
 * RESOURCE_EXHAUSTED, DEADLINE_EXCEEDED gibi hatalar için exponential backoff ile retry
 */

import { logger } from '../log/logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 250,
  maxDelayMs: 16000, // 16 saniye
  backoffMultiplier: 2,
  retryableErrors: ['RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'UNAVAILABLE', 'ABORTED'],
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hatanın retry edilebilir olup olmadığını kontrol et
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  if (!error) return false;
  
  const errorCode = error.code || error.message || '';
  const errorString = String(errorCode).toUpperCase();
  
  return retryableErrors.some((retryable) => 
    errorString.includes(retryable.toUpperCase())
  );
}

/**
 * Exponential backoff ile retry
 * 
 * @param fn - Çalıştırılacak async fonksiyon
 * @param options - Retry seçenekleri
 * @returns Fonksiyonun sonucu
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Son deneme ise hatayı fırlat
      if (attempt >= opts.maxRetries) {
        logger.error(`Retry basarisiz (${attempt + 1}/${opts.maxRetries + 1})`, error);
        throw error;
      }

      // Retry edilebilir hata mı kontrol et
      if (!isRetryableError(error, opts.retryableErrors)) {
        logger.warn('Retry edilemeyen hata, direkt firlatiliyor', { error: error.message });
        throw error;
      }

      // Exponential backoff
      const actualDelay = Math.min(delay, opts.maxDelayMs);
      logger.warn(
        `Retry denemesi ${attempt + 1}/${opts.maxRetries + 1}`,
        { 
          error: error.code || error.message,
          delay: `${actualDelay}ms`,
          nextAttempt: attempt + 2,
        }
      );

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
export async function commitBatchWithRetry(
  batch: FirebaseFirestore.WriteBatch,
  options: RetryOptions = {}
): Promise<void> {
  return withRetry(
    async () => {
      await batch.commit();
    },
    {
      ...options,
      retryableErrors: [
        'RESOURCE_EXHAUSTED',
        'DEADLINE_EXCEEDED',
        'UNAVAILABLE',
        'ABORTED',
        'INTERNAL',
      ],
    }
  );
}

