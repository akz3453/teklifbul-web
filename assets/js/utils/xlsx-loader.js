// Teklifbul Rule v1.0
// XLSX (SheetJS) loader - CSP uyumlu şekilde local vendor üzerinden yükler

import { logger } from '../../../src/shared/log/logger.js';

let loadPromise = null;

/**
 * Ensure XLSX global is loaded.
 * @returns {Promise<any>} XLSX
 */
export async function ensureXlsxLoaded() {
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    try {
      logger.group('XLSX Loader');

      const existing = document.querySelector('script[data-xlsx-loader="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.XLSX));
        existing.addEventListener('error', () => reject(new Error('XLSX yüklenemedi.')));
        logger.end();
        return;
      }

      const script = document.createElement('script');
      script.src = '/vendor/xlsx.full.min.js';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-xlsx-loader', '1');
      script.onload = () => {
        if (window.XLSX) resolve(window.XLSX);
        else reject(new Error('XLSX global bulunamadı.'));
      };
      script.onerror = () => reject(new Error('XLSX yüklenemedi.'));
      document.head.appendChild(script);

      logger.info('XLSX script injected');
      logger.end();
    } catch (e) {
      logger.error('XLSX loader error', e);
      logger.end();
      reject(e);
    }
  });

  return loadPromise;
}


