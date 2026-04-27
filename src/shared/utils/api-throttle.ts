/**
 * API Throttling Utility
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * Harici API çağrılarını throttle eder (TürkiyeAPI, OpenStreetMap vb.)
 */

import pLimit from 'p-limit';
import { logger } from '../log/logger.js';

/**
 * Aynı anda maksimum 5 harici API isteği
 * Environment variable ile yapılandırılabilir
 */
const limit = pLimit(Number(process.env.API_THROTTLE_LIMIT) || 5);

/**
 * Throttled fetch wrapper
 * Harici API çağrılarını otomatik throttle eder
 * 
 * @param url - Fetch edilecek URL
 * @param opts - Fetch options
 * @returns Promise<Response>
 */
export async function throttledFetch(
  url: string,
  opts?: RequestInit
): Promise<Response> {
  return limit(async () => {
    const startTime = Date.now();
    try {
      logger.info('Harici API çağrısı', { url: url.substring(0, 100) });
      const response = await fetch(url, opts);
      const duration = Date.now() - startTime;
      logger.info('Harici API yanıtı', {
        url: url.substring(0, 100),
        status: response.status,
        duration: `${duration}ms`
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Harici API hatası', {
        url: url.substring(0, 100),
        error,
        duration: `${duration}ms`
      });
      throw error;
    }
  });
}

/**
 * Throttled fetch with retry
 * Exponential backoff ile retry yapar
 * 
 * @param url - Fetch edilecek URL
 * @param opts - Fetch options
 * @param maxRetries - Maksimum retry sayısı (default: 3)
 * @returns Promise<Response>
 */
export async function throttledFetchWithRetry(
  url: string,
  opts?: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await throttledFetch(url, opts);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
        logger.warn(`Harici API retry denemesi ${attempt + 1}/${maxRetries}`, {
          url: url.substring(0, 100),
          delay: `${delay}ms`
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Fetch failed after retries');
}

