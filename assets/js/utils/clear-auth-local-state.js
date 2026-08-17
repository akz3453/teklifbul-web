/**
 * Teklifbul Rule v1.0 — Logout sonrası yerel oturum artığı temizliği
 * firebase.js logout() ve diğer çıkış yolları bu helper'ı kullanır.
 */
import { logger } from '../../../src/shared/log/logger.js';

const LOCAL_STORAGE_KEYS = [
  'activeCompanyId',
  'tb_premium_nav_visible',
];

const SESSION_STORAGE_KEYS = [
  'manualLoginInProgress',
  'pendingLoginTs',
  'googleLoginPending',
  'googleLoginSuccess',
  'emailVerificationRequired',
];

function removeKeys(storage, keys) {
  if (!storage) return;
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // storage erişilemezse sessizce geç
    }
  }
}

export function clearAuthLocalState() {
  logger.group('clearAuthLocalState');
  try {
    if (typeof window === 'undefined') return;

    removeKeys(window.localStorage, LOCAL_STORAGE_KEYS);
    removeKeys(window.sessionStorage, SESSION_STORAGE_KEYS);

    try {
      window.__TB_PUSH_TOKEN__ = null;
    } catch {
      // ignore
    }

    import('./api-helpers.js').then((mod) => {
      mod.clearCompanyIdHeaderCache?.();
    }).catch(() => {});

    import('../state/company-context.js').then((mod) => {
      mod.clearCompanyContextCache?.();
    }).catch(() => {});

    import('../state/permissions.js').then((mod) => {
      mod.clearPermissionCache?.();
    }).catch(() => {});

    logger.info('Yerel oturum artıkları temizlendi');
  } catch (err) {
    logger.warn('Yerel oturum temizliği kısmi başarısız', err);
  } finally {
    logger.end();
  }
}
