/**
 * Firebase Cloud Messaging (FCM) Setup
 * Teklifbul Rule v1.0 - Push notification support
 */

import { app, db, auth } from '/firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getMessaging, getToken, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// VAPID Public Key - Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
// Teklifbul Rule v1.0 - FCM Push Notifications
// VAPID key format: Base64 URL-safe encoded, usually 87-88 characters
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair → Public key
const VAPID_PUBLIC_KEY = window.FCM_VAPID_KEY || process.env.VITE_FCM_VAPID_KEY || '';

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
        } catch (e) {
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
 * Token'ı Firestore'a kaydeder
 * @param {string} token - FCM token
 */
async function saveTokenToFirestore(token) {
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.warn('Kullanıcı oturum açmamış, token kaydedilemedi');
      return;
    }

    const userId = user.uid;
    const tokenRef = doc(db, 'userTokens', userId, 'tokens', token);

    await setDoc(tokenRef, {
      token: token,
      userId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      platform: 'web',
      userAgent: navigator.userAgent,
    }, { merge: true });

    logger.info('FCM token Firestore\'a kaydedildi');
  } catch (error) {
    logger.error('Token kaydetme hatası', error);
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
 * Service worker'ı kaydeder ve FCM'i başlatır
 */
export async function initFCM() {
  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Worker desteklenmiyor');
    return null;
  }

  try {
    // Service worker'ı kaydet
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    logger.info('Service Worker kaydedildi', { scope: registration.scope });

    // FCM'i başlat
    const token = await setupMessaging(registration);
    return token;
  } catch (error) {
    logger.error('FCM init hatası', error);
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
  if (!messagingInstance) {
    await initFCM();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await setupMessaging(registration);
    return token;
  } catch (error) {
    logger.error('Token yenileme hatası', error);
  }
}

