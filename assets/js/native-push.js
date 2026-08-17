/**
 * Teklifbul Rule v1.0 — Native push bildirimleri (Capacitor)
 * google-services.json yoksa sessizce no-op.
 */

import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';
import { isAllowedDeepLink } from './utils/native-deep-link.js';
import { NATIVE_PUSH_REGISTRATION_TIMEOUT_MS } from '../../src/shared/constants/timing.js';

function isNativePlatform() {
  try {
    return typeof window !== 'undefined'
      && window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function getNativePushPlatform() {
  try {
    const p = window.Capacitor?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  } catch {
    // ignore
  }
  return 'native';
}

async function persistPushToken(token) {
  if (!token) return false;
  try {
    window.__TB_PUSH_TOKEN__ = token;
    const { saveTokenToFirestore } = await import('./fcm.js');
    return await saveTokenToFirestore(token, { platform: getNativePushPlatform() });
  } catch (err) {
    logger.warn('Native push token kaydedilemedi', err);
    return false;
  }
}

function bindAuthTokenPersist() {
  if (window.__TB_PUSH_AUTH_BOUND__) return;
  window.__TB_PUSH_AUTH_BOUND__ = true;

  window.addEventListener('tb:pushToken', (evt) => {
    const token = evt?.detail?.token || window.__TB_PUSH_TOKEN__;
    if (token) persistPushToken(token);
  });

  import('../../firebase.js').then(({ auth }) => {
    if (!auth || typeof auth.onAuthStateChanged !== 'function') return;
    auth.onAuthStateChanged((user) => {
      const token = window.__TB_PUSH_TOKEN__;
      if (user && token) persistPushToken(token);
    });
  }).catch((err) => {
    logger.warn('Push auth bağlanamadı', err);
  });
}

/**
 * @returns {Promise<string|null>} FCM/APNs token
 */
export async function initNativePush() {
  if (!isNativePlatform()) return null;

  bindAuthTokenPersist();

  logger.group('Native Push');
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      logger.warn('Push izni verilmedi', { receive: perm.receive });
      logger.end();
      return null;
    }

    await PushNotifications.removeAllListeners();

    return await new Promise((resolve) => {
      let settled = false;
      const done = (token) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };

      PushNotifications.addListener('registration', (token) => {
        const value = token?.value || null;
        logger.info('Push token alındı', { tokenPreview: String(value || '').slice(0, 12) + '…' });
        try {
          window.__TB_PUSH_TOKEN__ = value;
          window.dispatchEvent(new CustomEvent('tb:pushToken', { detail: { token: value } }));
        } catch {
          // ignore
        }
        persistPushToken(value).finally(() => done(value));
      });

      PushNotifications.addListener('registrationError', (err) => {
        logger.warn('Push registration error', err);
        done(null);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        logger.info('Push alındı (foreground)', {
          title: notification?.title,
          id: notification?.id,
        });
        const title = notification?.title || notification?.data?.title;
        const body = notification?.body || notification?.data?.body;
        const text = [title, body].filter(Boolean).join(' — ');
        if (text) {
          toast.info(text);
        }
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        logger.info('Push aksiyonu', { actionId: action?.actionId });
        const data = action?.notification?.data || {};
        const deepLink = data.url || data.link || data.path;
        if (deepLink && typeof deepLink === 'string') {
          try {
            if (isAllowedDeepLink(deepLink)) {
              window.location.href = deepLink;
            } else {
              logger.warn('Güvenilmeyen push deep link reddedildi', { deepLink });
            }
          } catch (e) {
            logger.warn('Push deep link açılamadı', e);
          }
        }
      });

      PushNotifications.register().catch((err) => {
        logger.warn('Push register başarısız (google-services.json eksik olabilir)', err);
        done(null);
      });

      setTimeout(() => done(null), NATIVE_PUSH_REGISTRATION_TIMEOUT_MS);
    });
  } catch (err) {
    logger.warn('Native push başlatılamadı', err);
    return null;
  } finally {
    logger.end();
  }
}
