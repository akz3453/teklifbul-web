/**
 * E-posta doğrulama gönderimi
 * Teklifbul Rule v1.0 — Production'da markalı API (Resend) bağlı değil.
 * /api/auth/send-verification-email 502 + Admin generateEmailVerificationLink
 * Firebase oob kotasını yakıp mail göndermiyor. Varsayılan: yalnız Firebase Auth.
 * Markalı yol: VITE_BRANDED_EMAIL_VERIFICATION=1
 */

import { authFetch } from './api-helpers.js';
import { sendAuthEmailVerification } from '../../../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import { EMAIL_VERIFICATION_RATE_LIMIT_COOLDOWN_MS } from '../../../src/shared/constants/timing.js';

const WAIT_UNTIL_KEY = 'tb_verify_resend_until';
const RATE_BLOCK_KEY = 'tb_verify_rate_blocked_until';

function resolveContinueUrl(options = {}) {
  if (typeof options.continueUrl === 'string' && options.continueUrl.startsWith('https://')) {
    return options.continueUrl;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/login.html`;
  }
  return 'https://nefisoft.com/login.html';
}

function readUntil(key) {
  try {
    const local = window.localStorage;
    const session = window.sessionStorage;
    const localUntil = local ? Number(local.getItem(key) || 0) : 0;
    const sessionUntil = session ? Number(session.getItem(key) || 0) : 0;
    return Math.max(0, Math.max(localUntil, sessionUntil) - Date.now());
  } catch {
    return 0;
  }
}

function writeUntil(key, durationMs) {
  const next = Math.max(readUntil(key), Number(durationMs) || 0);
  if (next <= 0) return;
  const value = String(Date.now() + next);
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  try { window.sessionStorage.setItem(key, value); } catch { /* ignore */ }
}

export function getVerificationResendWaitMs() {
  return Math.max(readUntil(WAIT_UNTIL_KEY), readUntil(RATE_BLOCK_KEY));
}

export function markVerificationResendWait(durationMs) {
  try {
    writeUntil(WAIT_UNTIL_KEY, durationMs);
  } catch (err) {
    logger.warn('Doğrulama bekleme süresi yazılamadı', err);
  }
}

export function isVerificationSendRateBlocked() {
  return readUntil(RATE_BLOCK_KEY) > 0;
}

export function markVerificationSendRateBlocked() {
  try {
    writeUntil(RATE_BLOCK_KEY, EMAIL_VERIFICATION_RATE_LIMIT_COOLDOWN_MS);
    writeUntil(WAIT_UNTIL_KEY, EMAIL_VERIFICATION_RATE_LIMIT_COOLDOWN_MS);
  } catch (err) {
    logger.warn('Doğrulama rate-limit yazılamadı', err);
  }
}

export function isVerificationTooManyRequests(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.error || '');
  return code === 'auth/too-many-requests' || /too-many-requests|TOO_MANY_ATTEMPTS/i.test(msg);
}

function createTooManyRequestsError() {
  const err = new Error('auth/too-many-requests');
  err.code = 'auth/too-many-requests';
  return err;
}

function isBrandedVerificationEnabled() {
  try {
    return String(import.meta.env?.VITE_BRANDED_EMAIL_VERIFICATION || '') === '1';
  } catch {
    return false;
  }
}

/**
 * @param {import('firebase/auth').User} user
 * @param {{ continueUrl?: string }} [options]
 * @returns {Promise<{ ok: boolean, alreadyVerified?: boolean, fallback?: boolean }>}
 */
export async function sendVerificationEmailBranded(user, options = {}) {
  if (!user) throw new Error('Kullanıcı yok');
  const continueUrl = resolveContinueUrl(options);

  if (isVerificationSendRateBlocked()) {
    throw createTooManyRequestsError();
  }

  if (isBrandedVerificationEnabled()) {
    try {
      const res = await authFetch('/api/auth/send-verification-email', {
        method: 'POST',
        body: JSON.stringify({ continueUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.alreadyVerified) {
        return { ok: true, alreadyVerified: true };
      }
      if (res.ok && data.ok !== false && data.fallback !== true) {
        logger.info('Branded verification email requested', {
          alreadyVerified: !!data.alreadyVerified,
          provider: data.provider,
        });
        return { ok: true, alreadyVerified: !!data.alreadyVerified };
      }
      logger.warn('Branded verification rejected, using Firebase Auth', {
        status: res.status,
        error: data.error,
      });
    } catch (err) {
      logger.warn('Branded verification failed, using Firebase Auth', err);
    }
  }

  try {
    await sendAuthEmailVerification(user, continueUrl);
    return { ok: true, fallback: true };
  } catch (err) {
    if (isVerificationTooManyRequests(err)) {
      markVerificationSendRateBlocked();
    }
    throw err;
  }
}
