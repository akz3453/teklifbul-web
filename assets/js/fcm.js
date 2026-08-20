/**
 * Firebase Cloud Messaging (FCM) Setup
 * Teklifbul Rule v1.0 - Push notification support
 */

import { app, db, auth } from '../../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging.js';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// VAPID Public Key - Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
// Teklifbul Rule v1.0 - FCM Push Notifications
// VAPID key format: Base64 URL-safe encoded, usually 87-88 characters
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair → Public key
const VAPID_PUBLIC_KEY = window.FCM_VAPID_KEY || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FCM_VAPID_KEY) || '';

let messagingInstance = null;
let currentToken = null;

/**
 * FCM messaging'i başlatır ve token alır
 * @param {ServiceWorkerRegistration} swReg - Service worker kaydı
 * @returns {Promise<string|null>} FCM token veya null
 */
export async function setupMessaging(swReg) {
  try {
    // Messaging desteği kontrolü
    const supported = await isSupported();
    if (!supported) {
      logger.warn('FCM bu tarayıcıda desteklenmiyor');
      return null;
    }

    // Messaging instance oluştur - Teklifbul Rule v1.0
    // FCM için messagingSenderId gerekli - doğru app'i bul
    let messagingApp = app;
    
    // App config kontrolü - messagingSenderId olmalı
    if (!app.options || !app.options.messagingSenderId) {
      logger.warn('Import edilen app\'de messagingSenderId yok, tüm app\'ler kontrol ediliyor...');
      
      // Tüm app'leri kontrol et
      const allApps = getApps();
      const appWithMessaging = allApps.find(a => 
        a.options && a.options.messagingSenderId === '636669818119'
      );
      
      if (appWithMessaging) {
        messagingApp = appWithMessaging;
        logger.info('messagingSenderId\'li app bulundu', { appName: messagingApp.name });
      } else {
        // Default app'i dene
        try {
          const defaultApp = getApp();
          if (defaultApp.options && defaultApp.options.messagingSenderId) {
            messagingApp = defaultApp;
            logger.info('Default app kullanılıyor (messagingSenderId var)');
          } else {
            throw new Error('Default app\'de de messagingSenderId yok');
          }
        } catch (_e) {
          logger.error('Firebase app\'de messagingSenderId yok!');
          logger.error('Import edilen app options', app.options);
          logger.error('Tüm app\'ler', allApps.map(a => ({ name: a.name, hasMessaging: !!a.options?.messagingSenderId })));
          throw new Error('Firebase app must have messagingSenderId configured. Check firebase.js config.');
        }
      }
    }
    
    messagingInstance = getMessaging(messagingApp);
    logger.info('Messaging instance oluşturuldu', { messagingSenderId: messagingApp.options.messagingSenderId });

    // Bildirim izni iste
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      logger.warn('Bildirim izni verilmedi', { permission });
      return null;
    }

    // VAPID key kontrolü ve format validasyonu
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'BURAYA_FCM_WEB_PUSH_PUBLIC_KEY' || VAPID_PUBLIC_KEY.trim() === '') {
      logger.error('VAPID_PUBLIC_KEY ayarlanmamış!');
      logger.error('VAPID key\'i almak için:');
      logger.error('   1. Firebase Console\'a git: https://console.firebase.google.com/');
      logger.error('   2. Project Settings → Cloud Messaging → Web Push certificates');
      logger.error('   3. "Generate key pair" veya mevcut key pair\'i kopyala');
      logger.error('   4. Public key\'i window.FCM_VAPID_KEY veya .env dosyasına ekle');
      return null;
    }
    
    // VAPID key format kontrolü (Base64 URL-safe, genellikle 87-88 karakter)
    const keyLength = VAPID_PUBLIC_KEY.length;
    if (keyLength < 80 || keyLength > 90) {
      logger.warn('VAPID key uzunluğu beklenenden farklı', { keyLength, expected: '87-88 karakter' });
    }
    
    // Base64 URL-safe karakter kontrolü (opsiyonel - sadece uyarı)
    const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
    if (!base64UrlRegex.test(VAPID_PUBLIC_KEY)) {
      logger.warn('VAPID key formatı beklenmeyen karakterler içeriyor (Base64 URL-safe olmalı)');
    }

    // Token al
    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      logger.warn('FCM token alınamadı');
      return null;
    }

    currentToken = token;
    logger.info('FCM token alındı', { tokenPrefix: token.substring(0, 20) + '...' });

    // Token'ı Firestore'a kaydet
    await saveTokenToFirestore(token);

    // Foreground mesajlarını dinle
    onMessage(messagingInstance, (payload) => {
      logger.info('Foreground FCM mesajı', payload);
      handleForegroundMessage(payload);
    });

    return token;
  } catch (error) {
    logger.error('FCM setup hatası', error);
    return null;
  }
}

/**
 * Token'ı Firestore'a kaydeder (web / native)
 * @param {string} token - FCM token
 * @param {{ platform?: string }} [opts]
 */
export async function saveTokenToFirestore(token, opts = {}) {
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.warn('Kullanıcı oturum açmamış, token kaydedilemedi');
      return false;
    }
    if (!token || typeof token !== 'string') return false;

    const userId = user.uid;
    const platform = opts.platform || 'web';
    const tokenRef = doc(db, 'userTokens', userId, 'tokens', token);

    await setDoc(tokenRef, {
      token: token,
      userId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      platform,
      userAgent: navigator.userAgent,
    }, { merge: true });

    logger.info('FCM token Firestore\'a kaydedildi', { platform });
    return true;
  } catch (error) {
    logger.error('Token kaydetme hatası', error);
    return false;
  }
}

function readStoredPushToken() {
  if (currentToken && typeof currentToken === 'string') return currentToken;
  try {
    const fromWindow = typeof window !== 'undefined' ? window.__TB_PUSH_TOKEN__ : null;
    if (fromWindow && typeof fromWindow === 'string') return fromWindow;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Logout öncesi mevcut cihaz token'ını Firestore'dan siler.
 * signOut'tan ÖNCE çağrılmalı (rules: request.auth.uid == userId).
 * Teklifbul Rule v1.0
 * @returns {Promise<boolean>}
 */
export async function removeCurrentPushTokenFromFirestore() {
  logger.group('FCM token logout cleanup');
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.info('Oturum yok, token silinmedi');
      return false;
    }

    const token = readStoredPushToken();
    if (!token) {
      logger.info('Kayıtlı push token yok');
      return false;
    }

    const tokenRef = doc(db, 'userTokens', user.uid, 'tokens', token);
    await deleteDoc(tokenRef);

    if (messagingInstance) {
      try {
        await deleteToken(messagingInstance);
      } catch (err) {
        logger.warn('FCM deleteToken atlandı', err);
      }
    }

    currentToken = null;
    try {
      if (typeof window !== 'undefined') window.__TB_PUSH_TOKEN__ = null;
    } catch {
      // ignore
    }

    logger.info('FCM token Firestore\'dan silindi');
    return true;
  } catch (error) {
    logger.error('FCM token silme hatası', error);
    return false;
  } finally {
    logger.end();
  }
}

/**
 * Foreground mesajlarını handle eder
 * @param {Object} payload - FCM payload
 */
function handleForegroundMessage(payload) {
  // Teklifbul Rule v1.0 - Toast notification göster
  const title = payload.notification?.title || payload.data?.title || 'Teklifbul';
  const body = payload.notification?.body || payload.data?.body || 'Yeni bildirim';

  // Toast göster (eğer toast sistemi varsa)
  if (window.showToast) {
    window.showToast(title, body, 'info');
  } else {
    // Fallback: Browser notification (foreground)
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: payload.data?.requestId || payload.data?.rfqId || 'fcm',
        data: payload.data || {},
      });
    }
  }

  // Custom event dispatch (sayfalar dinleyebilir)
  window.dispatchEvent(new CustomEvent('fcm-message', { detail: payload }));
}

/**
 * Service worker'ları temizler ve FCM'i devre dışı bırakır
 * Teklifbul Rule v1.0 - Eski service worker kayıtlarını kaldırarak cache kaynaklı eski UI riskini engeller
 */
export async function initFCM() {
  try {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Service Worker desteklenmiyor');
      return null;
    }

    // Mevcut tüm service worker kayıtlarını kaldır
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations && registrations.length > 0) {
      logger.info('Mevcut Service Worker kayıtları temizleniyor', { count: registrations.length });
      await Promise.all(
        registrations.map(async (reg) => {
          try {
            const result = await reg.unregister();
            logger.info('Service Worker unregister sonucu', { scope: reg.scope, result });
          } catch (unregError) {
            logger.warn('Service Worker unregister hatası', { scope: reg.scope, error: unregError });
          }
        })
      );
    }

    logger.info('FCM ve Service Worker devre dışı bırakıldı (push bildirimleri kapalı)');
    return null;
  } catch (error) {
    logger.error('FCM devre dışı bırakma hatası', error);
    return null;
  }
}

/**
 * Mevcut token'ı döndürür
 * @returns {string|null}
 */
export function getCurrentToken() {
  return currentToken;
}

/**
 * Token'ı yeniler (kullanıcı değiştiğinde vs.)
 */
export async function refreshToken() {
  logger.warn('FCM token yenileme devre dışı (Service Worker kapalı)');
  return null;
}

