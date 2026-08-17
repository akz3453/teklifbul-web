/**
 * API Helper Functions
 * Teklifbul Rule v1.0 - Ortak API çağrı fonksiyonları
 * 
 * Tüm API isteklerinde x-company-id header'ı otomatik eklenir
 */

import { auth, db, requireAuth } from '../../../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import { toast } from '../../../src/shared/ui/toast.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
import { AUTH_FETCH_TIMEOUT_MS, COMPANY_ID_CACHE_TTL_MS } from '../../../src/shared/constants/timing.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const LOGIN_PATH = '/login.html';

let companyIdHeaderCache = {
  uid: null,
  companyId: null,
  at: 0,
};

export function clearCompanyIdHeaderCache() {
  companyIdHeaderCache = { uid: null, companyId: null, at: 0 };
}

function createTimeoutController(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timerId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

function isLoginPage() {
  try {
    const path = String(window.location?.pathname || '').toLowerCase();
    return path === LOGIN_PATH || path.endsWith('/login.html') || path === '/login';
  } catch {
    return false;
  }
}

// MFA veya başka patch'lerden önce gerçek fetch'i sakla (tüm authFetch çağrıları)
if (typeof window !== 'undefined' && !window.__TEKLIFBUL_NATIVE_FETCH__) {
  window.__TEKLIFBUL_NATIVE_FETCH__ = window.fetch.bind(window);
}

/**
 * Teklifbul Rule v1.0 - Production'da same-origin, local'de API portu.
 * Build'e yanlışlıkla localhost gömüldüyse canlı host'ta yok sayılır.
 * @returns {string}
 */
export function resolveApiBaseUrl() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const fromEnv =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
    (typeof window !== 'undefined' && window.VITE_API_URL) ||
    '';
  const cleaned = String(fromEnv || '').trim().replace(/\/$/, '');

  if (isLocal) {
    if (cleaned && !cleaned.includes('localhost') && !cleaned.includes('127.0.0.1')) {
      return cleaned;
    }
    return cleaned || 'http://localhost:5174';
  }

  if (cleaned && !cleaned.includes('localhost') && !cleaned.includes('127.0.0.1')) {
    return cleaned;
  }
  return '';
}

function pickCompanyIdValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' ? trimmed : null;
  }
  if (value && typeof value === 'object' && typeof value.id === 'string') {
    const trimmed = value.id.trim();
    return trimmed !== '' ? trimmed : null;
  }
  return null;
}

/**
 * Şirket bazlı companyId çözümleme helper'ı
 * Teklifbul Rule v1.0 - Shared company ID resolution
 * @param {any} userData - Kullanıcı verisi
 * @returns {string|null} Resolved company ID
 */
export function resolveSharedCompanyId(userData) {
  if (!userData) return null;
  // Teklifbul Rule v1.x — tax- gerçek şirkettir; yalnız solo- kişisel bağlam atlanır.
  // Öncelik: activeCompanyId > companyId > defaultCompanyId > companies[]
  const fromCompanies = Array.isArray(userData.companies)
    ? userData.companies.map(pickCompanyIdValue).filter(Boolean)
    : [];
  const candidates = [
    pickCompanyIdValue(userData.activeCompanyId),
    pickCompanyIdValue(userData.companyId),
    pickCompanyIdValue(userData.defaultCompanyId),
    ...fromCompanies,
  ].filter(Boolean);

  const sharedId = candidates.find((id) => !id.startsWith('solo-'));
  return sharedId || candidates[0] || null;
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
    let tokenRefreshAttempted = false;

    async function obtainToken(forceRefresh = false) {
      try {
        const resultToken = await user.getIdToken(forceRefresh);
        if (!resultToken) {
          logger.error('authFetch: Token alınamadı (null/undefined)', {
            url,
            userId: user.uid,
            email: user.email,
            forceRefresh
          });
          throw new Error('Token alınamadı');
        }
        return resultToken;
      } catch (tokenError) {
        logger.error('authFetch: Token alma hatası', {
          error: tokenError,
          url,
          userId: user.uid,
          email: user.email,
          forceRefresh
        });
        throw new Error(`Token alınamadı: ${tokenError.message}`);
      }
    }

    token = await obtainToken();

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

    // Teklifbul Rule v1.0 - x-company-id header'ı ekle (kısa TTL cache)
    try {
      const now = Date.now();
      let companyId = null;
      if (
        companyIdHeaderCache.uid === user.uid &&
        companyIdHeaderCache.companyId &&
        (now - companyIdHeaderCache.at) < COMPANY_ID_CACHE_TTL_MS
      ) {
        companyId = companyIdHeaderCache.companyId;
      } else {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() || {};
          companyId = resolveSharedCompanyId(userData);
          companyIdHeaderCache = {
            uid: user.uid,
            companyId: companyId || null,
            at: now,
          };
        }
      }

      if (companyId) {
        finalHeaders.set('x-company-id', companyId);
        if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
          logger.debug('x-company-id header eklendi', { companyId: companyId.substring(0, 8) + '...', url });
        }
      } else if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
        logger.debug('x-company-id header eklenemedi', {
          url,
          hasCompanyId: !!companyId,
          companyIdType: 'none',
        });
      }
    } catch (companyIdError) {
      if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
        logger.debug('x-company-id header eklenirken hata', { error: companyIdError.message, url });
      }
    }

    // Content-Type header (FormData için browser otomatik ekler)
    if (rest.body && !finalHeaders.has('Content-Type')) {
      if (rest.body instanceof FormData) {
        // FormData için Content-Type header'ı ekleme, browser otomatik ekler
      } else {
        finalHeaders.set('Content-Type', 'application/json');
      }
    }

    // Teklifbul Rule v1.0 - API URL normalization: /api ve observability kökleri dev'de backend portuna (5174) gider.
    // Not: /health ve /metrics göreli bırakılırsa Vite (5173) SPA HTML döner; .json() "<!doctype" hatası verir.
    let finalUrl = url;

    if (!url.match(/^https?:\/\//)) {
      const pathOnly = url.startsWith('/') ? url.split('?')[0] : '';
      const isBackendPath =
        pathOnly.startsWith('/api/') ||
        pathOnly === '/health' ||
        pathOnly === '/metrics';

      if (isBackendPath) {
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isDev ? 'http://localhost:5174' : window.location.origin;
        finalUrl = baseUrl + (url.startsWith('/') ? url : `/${url}`);

        if (isDev) {
          let pathForLog = pathOnly;
          if (!pathForLog) {
            try {
              pathForLog = new URL(finalUrl).pathname;
            } catch {
              pathForLog = '';
            }
          }
          const quietObservability =
            pathForLog === '/health' || pathForLog === '/metrics';
          if (!quietObservability) {
            logger.info('authFetch', { url: finalUrl, method: rest.method || 'GET', originalUrl: url });
          }
        }
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

    const doFetch =
      typeof window !== 'undefined' && window.__TEKLIFBUL_NATIVE_FETCH__
        ? window.__TEKLIFBUL_NATIVE_FETCH__
        : fetch.bind(window);

    let response;
    const timeoutCtl = createTimeoutController(AUTH_FETCH_TIMEOUT_MS, rest.signal);
    const fetchOptions = { ...rest, headers: finalHeaders, signal: timeoutCtl.signal };
    try {
      response = await doFetch(finalUrl, fetchOptions);

      if (response.status === 401 && !tokenRefreshAttempted) {
        tokenRefreshAttempted = true;
        logger.warn('authFetch: 401 yanıtı alındı, token yenileniyor ve istek tekrar deneniyor', {
          url: finalUrl
        });
        token = await obtainToken(true);
        finalHeaders.set('Authorization', `Bearer ${token}`);
        response = await doFetch(finalUrl, { ...fetchOptions, headers: finalHeaders });
      }

      if (response.status === 401) {
        logger.warn('authFetch: kalıcı 401, oturum kapatılıyor', { url: finalUrl });
        if (!isLoginPage()) {
          toast.error(MESSAGES.ERROR_SESSION_EXPIRED);
          try {
            const { logout } = await import('../../../firebase.js');
            await logout();
          } catch (logoutErr) {
            logger.warn('authFetch: 401 sonrası logout başarısız', logoutErr);
          }
          window.location.replace(LOGIN_PATH);
        }
        throw Object.assign(new Error(MESSAGES.ERROR_SESSION_EXPIRED), { name: 'SessionExpiredError' });
      }

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
          } else if (response.status === 404) {
            // Teklifbul Rule v1.0 - GET /metrics kapalıyken (ENABLE_METRICS≠true) 404 normaldir; konsolu kirletme
            let path = '';
            try {
              path = new URL(finalUrl).pathname;
            } catch {
              path = '';
            }
            if (path !== '/metrics') {
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
      if (fetchError?.name === 'SessionExpiredError') {
        throw fetchError;
      }
      if (fetchError?.name === 'AbortError') {
        logger.error('authFetch: İstek zaman aşımı', { url: finalUrl });
        throw new Error(MESSAGES.ERROR_NETWORK);
      }
      logger.error('authFetch: Fetch hatası', {
        error: fetchError,
        url: finalUrl,
        message: fetchError.message
      });
      throw fetchError;
    } finally {
      timeoutCtl.cleanup();
    }

    return response;
  } catch (error) {
    if (error?.name === 'SessionExpiredError') {
      throw error;
    }
    logger.error('authFetch hatası', {
      error: error,
      message: error.message,
      stack: error.stack,
      url: url
    });
    throw error;
  }
}


