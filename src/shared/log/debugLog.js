/**
 * Debug Logging Helper
 * Teklifbul Rule v1.0 - Production güvenliği için debug log/fetch'ler sadece localhost'ta çalışır
 * Teklifbul Rule v1.1 - Logger modülü entegrasyonu
 * 
 * Kullanım:
 *   import { debugLog, debugFetch, maskSensitiveData } from './src/shared/log/debugLog.js';
 *   
 *   debugLog('location', 'message', { data: 'value' });
 *   await debugFetch('http://...', { method: 'POST', body: '...' });
 */

import { logger } from './logger.js';

/**
 * Localhost kontrolü
 * @returns {boolean} true if running on localhost
 */
export function isLocalhost() {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Hassas verileri maskele
 * @param {any} data - Maskeleme yapılacak veri
 * @returns {any} Maskelenmiş veri
 */
export function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveKeys = [
    'authorization', 'authorizationheader', 'bearer',
    'idtoken', 'accesstoken', 'refreshtoken', 'token',
    'password', 'passwd', 'pwd',
    'recaptchatoken', 'recaptcha', 'captcha',
    'apikey', 'apisecret', 'secret',
    'privatekey', 'private_key'
  ];
  
  const masked = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in masked) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk));
    
    if (isSensitive) {
      if (typeof masked[key] === 'string' && masked[key].length > 0) {
        masked[key] = '***';
      } else if (masked[key] !== null && masked[key] !== undefined) {
        masked[key] = '***';
      }
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  
  return masked;
}

/**
 * Debug log (sadece localhost'ta)
 * @param {...any} args - Log argümanları
 */
export function debugLog(...args) {
  if (!isLocalhost()) return;
  
  // Hassas verileri maskele
  const maskedArgs = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return maskSensitiveData(arg);
    }
    return arg;
  });
  
  // Logger kullanarak debug logla - production'da görünmez
  logger.debug('[DEBUG]', ...maskedArgs);
}

/**
 * Debug fetch (sadece localhost'ta)
 * @param {string} url - Fetch URL
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function debugFetch(url, options = {}) {
  if (!isLocalhost()) {
    // Production'da normal fetch yap ama loglama
    return fetch(url, options);
  }
  
  // Localhost'ta debug log ile fetch yap
  const maskedOptions = { ...options };
  
  // Headers'ı maskele
  if (maskedOptions.headers) {
    const headers = new Headers(maskedOptions.headers);
    const maskedHeaders = {};
    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('authorization') || lowerKey.includes('token')) {
        maskedHeaders[key] = '***';
      } else {
        maskedHeaders[key] = value;
      }
    });
    maskedOptions.headers = maskedHeaders;
  }
  
  // Body'yi maskele (eğer JSON ise)
  if (maskedOptions.body && typeof maskedOptions.body === 'string') {
    try {
      const parsed = JSON.parse(maskedOptions.body);
      const masked = maskSensitiveData(parsed);
      maskedOptions.body = JSON.stringify(masked);
    } catch {
      // JSON değilse olduğu gibi bırak
    }
  }
  
  logger.debug('[debugFetch]', { url, options: maskedOptions });
  
  try {
    const res = await fetch(url, options);
    const clone = res.clone();
    
    logger.debug('[debugFetch:status]', { status: res.status, statusText: res.statusText });
    
    // Response body'yi logla (eğer JSON ise)
    try {
      const text = await clone.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          const masked = maskSensitiveData(json);
          logger.debug('[debugFetch:body]', masked);
        } catch {
          logger.debug('[debugFetch:body]', text.substring(0, 200));
        }
      }
    } catch (e) {
      // Body okunamazsa sessizce geç
    }
    
    return res;
  } catch (error) {
    // Debug endpoint yoksa sessizce geç (ERR_CONNECTION_REFUSED normal)
    // Sadece beklenmeyen hataları logla
    if (error.message && !error.message.includes('Failed to fetch') && !error.message.includes('ERR_CONNECTION_REFUSED')) {
      logger.debug('[debugFetch:error]', error.message);
    }
    // Güvenli fallback: Mock Response döndür (null yerine)
    // Bu sayede çağıran kodlar hata almayacak
    return new Response(null, {
      status: 0,
      statusText: 'Network Error (Debug)',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Debug agent log (eski debugLog formatı için uyumluluk)
 * Teklifbul Rule v1.0 - 7242 ingest endpoint'i kaldırıldı, sadece console log yapıyor
 * @param {string} location - Dosya konumu
 * @param {string} message - Mesaj
 * @param {object} data - Veri
 * @param {string} hypothesisId - Hipotez ID
 */
export function debugAgentLog(location, message, data = {}, hypothesisId = '') {
  if (!isLocalhost()) return;
  
  const maskedData = maskSensitiveData(data);
  
  // 7242 ingest endpoint'i kaldırıldı - sadece console log yap
  debugLog(`[AgentLog] ${location}: ${message}`, maskedData);
}

