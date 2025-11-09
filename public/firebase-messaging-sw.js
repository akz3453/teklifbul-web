/* global self, importScripts, firebase */
/**
 * Firebase Cloud Messaging Service Worker
 * Teklifbul Rule v1.0 - Background push notifications
 * 
 * Bu dosya public/ klasöründe olmalı ve /firebase-messaging-sw.js URL'inden erişilebilir olmalı
 */

importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

// Firebase config - firebase.js ile aynı olmalı
firebase.initializeApp({
  apiKey: 'AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE',
  authDomain: 'teklifbul.firebaseapp.com',
  projectId: 'teklifbul',
  storageBucket: 'teklifbul.firebasestorage.app',
  messagingSenderId: '636669818119', // Firebase Console → Project Settings → General
  appId: '1:636669818119:web:9085962e660831c36941a2'
});

const messaging = firebase.messaging();

// Arka planda (tab kapalı/arka planda) data geldiğinde
messaging.onBackgroundMessage((payload) => {
  console.log('📩 Background FCM mesajı:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Teklifbul';
  const body = payload.notification?.body || payload.data?.body || 'Yeni bildirim';
  const icon = payload.notification?.icon || '/favicon.ico';
  const badge = '/favicon.ico';

  // Bildirim göster
  const notificationOptions = {
    body: body,
    icon: icon,
    badge: badge,
    tag: payload.data?.requestId || payload.data?.rfqId || 'fcm',
    data: payload.data || {},
    requireInteraction: false,
    actions: payload.data?.actions || [], // Özel aksiyonlar (opsiyonel)
  };

  // Bildirim göster
  return self.registration.showNotification(title, notificationOptions);
});

// Bildirim tıklama event'i
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Bildirim tıklandı:', event.notification);

  event.notification.close();

  // Özel data ile sayfa aç
  const data = event.notification.data || {};
  let url = '/';

  // URL mapping
  if (data.requestId) {
    url = `/demand-detail.html?id=${data.requestId}`;
  } else if (data.rfqId) {
    url = `/bid-detail.html?id=${data.rfqId}`;
  } else if (data.url) {
    url = data.url;
  }

  // Client açık mı kontrol et
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Aynı origin'de açık pencere var mı?
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.origin) && 'focus' in client) {
          // Mevcut pencereyi odakla ve URL'i güncelle
          return client.focus().then(() => {
            if (client.navigate) {
              client.navigate(url);
            }
          });
        }
      }
      // Yeni pencere aç
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Service worker install event
self.addEventListener('install', () => {
  console.log('✅ Service Worker yüklendi');
  self.skipWaiting(); // Hemen aktif et
});

// Service worker activate event
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker aktif');
  event.waitUntil(clients.claim()); // Tüm client'ları kontrol altına al
});

