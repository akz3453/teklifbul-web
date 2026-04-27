/**
 * API Helper Functions
 * Teklifbul Rule v1.0 - Ortak API çağrı fonksiyonları
 * 
 * Tüm API isteklerinde x-company-id header'ı otomatik eklenir
 */

import { auth, db, requireAuth } from '../../../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Şirket bazlı companyId çözümleme helper'ı
 * Teklifbul Rule v1.0 - Shared company ID resolution
 * @param {any} userData - Kullanıcı verisi
 * @returns {string|null} Resolved company ID
 */
export function resolveSharedCompanyId(userData) {
  if (!userData) return null;
  // Teklifbul Rule v1.x - Tüm geçerli companyId yapılarını (tax-, solo-, vb.) kabul eder.
  // Öncelik sırası: activeCompanyId > companyId > ilk şirket
  const companyId = userData.activeCompanyId || userData.companyId || (Array.isArray(userData.companies) && userData.companies.length ? userData.companies[0] : null);
  
  if (companyId && typeof companyId === 'string' && companyId.trim() !== '') {
    return companyId;
  }
  return null;
}

/**
 * Authenticated fetch helper with automatic x-company-id header
 * Teklifbul Rule v1.0 - Tüm API isteklerinde x-company-id header'ı otomatik eklenir
 * 
 * @param {string} url - API endpoint URL
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authFetch(url, options = {}) {
  try {
    // Kullanıcı kontrolü
    const user = auth.currentUser || await requireAuth();
    if (!user) {
      logger.error('authFetch: Kullanıcı bulunamadı', { url });
      throw new Error('Kullanıcı giriş yapmamış');
    }

    // Token al
    let token;
    try {
      token = await user.getIdToken();
      if (!token) {
        logger.error('authFetch: Token alınamadı (null/undefined)', {
          url,
          userId: user.uid,
          email: user.email
        });
        throw new Error('Token alınamadı');
      }
    } catch (tokenError) {
      logger.error('authFetch: Token alma hatası', {
        error: tokenError,
        url,
        userId: user.uid,
        email: user.email
      });
      throw new Error(`Token alınamadı: ${tokenError.message}`);
    }

    // Headers hazırla
    const { headers, ...rest } = options;
    const finalHeaders = new Headers(headers || {});

    // Authorization header - Teklifbul Rule v1.0 - Token her zaman eklenmeli
    finalHeaders.set('Authorization', `Bearer ${token}`);

    // Debug: Development'ta token varlığını doğrula
    if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
      const authHeader = finalHeaders.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.error('authFetch: Authorization header eklenemedi', {
          url,
          hasToken: !!token,
          tokenLength: token?.length
        });
      }
    }

    // Teklifbul Rule v1.0 - x-company-id header'ı ekle
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() || {};
        const companyId = resolveSharedCompanyId(userData);

        if (companyId) {
          finalHeaders.set('x-company-id', companyId);
          // Sadece development'ta logla (production'da görünmez)
          if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
            logger.debug('x-company-id header eklendi', { companyId: companyId.substring(0, 8) + '...', url });
          }
        } else {
          // Dev-only warning (production'da log basma)
          if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
            logger.debug('x-company-id header eklenemedi', {
              url,
              hasCompanyId: !!companyId,
              companyIdType: companyId ? (companyId.startsWith('solo-') ? 'solo' : companyId.startsWith('tax-') ? 'tax' : 'regular') : 'none'
            });
          }
        }
      }
    } catch (companyIdError) {
      // CompanyId çözümleme hatası - dev-only warning
      if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
        logger.debug('x-company-id header eklenirken hata', { error: companyIdError.message, url });
      }
      // Hata olsa bile isteği devam ettir (companyId opsiyonel)
    }

    // Content-Type header (FormData için browser otomatik ekler)
    if (rest.body && !finalHeaders.has('Content-Type')) {
      if (rest.body instanceof FormData) {
        // FormData için Content-Type header'ı ekleme, browser otomatik ekler
      } else {
        finalHeaders.set('Content-Type', 'application/json');
      }
    }

    // Teklifbul Rule v1.0 - API URL normalization: /api istekleri dev ortamında backend portuna (5174) yönlendirilir
    let finalUrl = url;

    // Eğer URL absolute değilse ve /api/ ile başlıyorsa
    if (!url.match(/^https?:\/\//) && url.startsWith('/api/')) {
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const baseUrl = isDev ? 'http://localhost:5174' : window.location.origin;

      // finalUrl = baseUrl + url (url zaten /api/... ile başlıyor)
      finalUrl = baseUrl + url;

      // Dev modda log
      if (isDev) {
        logger.info('authFetch', { url: finalUrl, method: rest.method || 'GET', originalUrl: url });
      }
    }

    // Debug: Development'ta header'ları logla
    if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
      const authHeaderValue = finalHeaders.get('Authorization');
      logger.debug('authFetch: İstek gönderiliyor', {
        url: finalUrl,
        method: rest.method || 'GET',
        hasAuthHeader: !!authHeaderValue,
        authHeaderPrefix: authHeaderValue ? authHeaderValue.substring(0, 20) + '...' : 'YOK',
        hasCompanyId: finalHeaders.has('x-company-id')
      });
    }

    let response;
    try {
      response = await fetch(finalUrl, { ...rest, headers: finalHeaders });

      // Teklifbul Rule v2.2 - 402 INSUFFICIENT_TOKENS handler
      // Teklifbul Rule v2.7.2 - 402 DAILY_CAP_REACHED handler
      // Teklifbul Rule v3.0 - 402 DAILY_CAP_CHECK_FAILED handler
      if (response.status === 402) {
        try {
          const responseClone = response.clone();
          const errorData = await responseClone.json().catch(() => ({}));
          // Teklifbul Rule v3.10 - Use constants
          const { AI_ERROR_CODES } = await import('../constants/aiMeta.js');
          if (errorData?.code === AI_ERROR_CODES.INSUFFICIENT_TOKENS || errorData?.code === AI_ERROR_CODES.DAILY_CAP_REACHED || errorData?.code === AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED) {
            // Global event dispatch for insufficient tokens modal (reused for daily cap)
            window.dispatchEvent(new CustomEvent('tb:insufficientTokens', {
              detail: {
                code: errorData.code,
                endpoint: finalUrl,
                message: errorData.message,
                retryAfter: errorData.retryAfter,
                cap: errorData.cap, // Teklifbul Rule v2.7.2
                used: errorData.used, // Teklifbul Rule v2.7.2
              }
            }));
            logger.info(`${errorData.code} event dispatched`, { endpoint: finalUrl, code: errorData.code });
          }
        } catch (parseError) {
          logger.warn('authFetch: 402 response parse error', { error: parseError });
        }
      }

      // Teklifbul Rule v3.19 - Store AI response meta for admin debug
      if (typeof window !== 'undefined' && window.__TB_IS_ADMIN === true) {
        try {
          // Check if this is an AI endpoint response
          if (finalUrl.includes('/api/chat') || finalUrl.includes('/api/ai/')) {
            const responseClone = response.clone();
            responseClone.json().then(async (data) => {
              if (data?.meta) {
                const { storeLastAiResponseMeta } = await import('./aiResponseMetaStorage.js');
                storeLastAiResponseMeta(data.meta);
              }
            }).catch(() => {
              // Non-blocking: ignore parse errors
            });
          }
        } catch (e) {
          // Non-blocking: ignore storage errors
        }
      }

      // Debug: Development'ta response'u logla
      // Teklifbul Rule v1.0 - Usage report endpoint için 403 hatası sessizce handle et
      if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
        if (!response.ok) {
          // Usage report endpoint için 403 hatası normal (yetki yoksa boş data döndürülüyor)
          if (response.status === 403 && finalUrl.includes('/api/ai/usage-report')) {
            // Sessizce devam et, loglama
          } else if (response.status === 402) {
            // Teklifbul Rule v1.0 - 402 hataları Premium kontrolü için normaldir, sadece info log bas
            logger.info('authFetch: Premium limit/özellik kısıtlaması (402)', { url: finalUrl });
          } else {
            const responseClone = response.clone();
            try {
              const errorData = await responseClone.json();
              logger.warn('authFetch: İstek başarısız', {
                url: finalUrl,
                status: response.status,
                statusText: response.statusText,
                error: errorData
              });
            } catch (jsonError) {
              logger.warn('authFetch: İstek başarısız (JSON parse hatası)', {
                url: finalUrl,
                status: response.status,
                statusText: response.statusText
              });
            }
          }
        }
      }
    } catch (fetchError) {
      logger.error('authFetch: Fetch hatası', {
        error: fetchError,
        url: finalUrl,
        message: fetchError.message
      });
      throw fetchError;
    }

    return response;
  } catch (error) {
    logger.error('authFetch hatası', {
      error: error,
      message: error.message,
      stack: error.stack,
      url: url
    });
    throw error;
  }
}


