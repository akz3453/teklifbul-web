# Firebase Cloud Messaging (FCM) Kurulum Rehberi

## 0) Firebase Console'da Yapılacaklar

1. **Firebase Console → Project Settings → Cloud Messaging**
2. **"Generate Key Pair"** ile Web Push certificates (VAPID key) üret
3. **VAPID public key'i** kopyala (az sonra kullanacağız)

**Not:** Site HTTPS (veya http://localhost) olmalı; aksi halde tarayıcı izin vermez.

## 1) VAPID Key'i Ayarla

`assets/js/fcm.js` dosyasında VAPID key'i güncelle:

```javascript
const VAPID_PUBLIC_KEY = 'BURAYA_FCM_WEB_PUSH_PUBLIC_KEY'; // Firebase Console'dan al
```

Veya HTML sayfalarında script tag'inden önce:

```html
<script>
  window.FCM_VAPID_KEY = 'BURAYA_FCM_WEB_PUSH_PUBLIC_KEY';
</script>
```

## 2) Dosya Yapısı

```
public/
  └── firebase-messaging-sw.js  ✅ Service worker (arka plan bildirimleri)

assets/js/
  └── fcm.js                    ✅ FCM client-side setup

dashboard.html                  ✅ Örnek kullanım (initFCM çağrısı)
```

## 3) Kullanım

### Temel Kullanım

```javascript
import { initFCM, getCurrentToken } from './assets/js/fcm.js';

// FCM'i başlat
const token = await initFCM();
if (token) {
  console.log('FCM token:', token);
}
```

### Kullanıcı değiştiğinde token yenile

```javascript
import { refreshToken } from './assets/js/fcm.js';

// Kullanıcı giriş yaptığında
await refreshToken();
```

### Foreground mesajları dinle

```javascript
// Global event listener
window.addEventListener('fcm-message', (event) => {
  const payload = event.detail;
  console.log('FCM mesajı:', payload);
  
  // Toast göster veya sayfa güncelle
});
```

## 4) Sunucu Tarafı (Cloud Functions)

### Örnek: Onay bekleyen teklif bildirimi

```javascript
// functions/index.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();

export const notifyApprovalNeeded = functions.firestore
  .document("approval_tasks/{id}")
  .onCreate(async (snap) => {
    const data = snap.data();
    const approverUserId = data.approver_user_id;

    // Token'ları al
    const tokensSnapshot = await admin.firestore()
      .collection("userTokens")
      .doc(approverUserId)
      .collection("tokens")
      .get();

    const tokens = tokensSnapshot.docs.map(d => d.id);
    if (!tokens.length) return;

    // Bildirim gönder
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "Onay Bekleyen Teklif",
        body: `${data.request_title} için onay gerekiyor`,
      },
      data: {
        requestId: data.request_id || "",
        rfqId: data.rfq_id || "",
      },
    });
  });
```

## 5) Firestore Yapısı

Token'lar şu şekilde kaydedilir:

```
userTokens/{userId}/tokens/{token}
  ├── token: string
  ├── userId: string
  ├── createdAt: timestamp
  ├── updatedAt: timestamp
  ├── platform: "web"
  └── userAgent: string
```

## 6) Test Kontrol Listesi

- [ ] VAPID public key üretildi ve `fcm.js`'e yazıldı
- [ ] `firebase-messaging-sw.js` `/public` kökünde ve `/firebase-messaging-sw.js` URL'inden erişilebilir
- [ ] `Notification.requestPermission()` → "granted" döndü
- [ ] `getToken()` token döndürüyor
- [ ] Token Firestore'da `userTokens/{userId}/tokens/{token}` altında saklanıyor
- [ ] Service worker kayıt oluyor (console'da "✅ Service Worker kaydedildi")
- [ ] Foreground'da `onMessage` log basıyor
- [ ] Background'da SW notification çıkıyor
- [ ] Site HTTPS (veya localhost)
- [ ] Tarayıcı site izinleri: Notifications: Allow

## 7) Sorun Giderme

### Bildirim gelmiyor?

1. **VAPID key boş/yanlış** → `getToken` null/hata döner
2. **Service worker yolu yanlış** → SW kayıt olmaz
3. **messagingSenderId yanlış** → SW'da init hatası
4. **Token kaydedilmedi** → Sunucuda gönderilecek hedef yok
5. **HTTP v1 yerine legacy key** → 401/403 hatası (Admin SDK kullan)
6. **Payload'da sadece data var** → SW `showNotification` çağırmalı
7. **Tarayıcı izni "Blocked"** → Site ayarlarından aç

### Console Hataları

- **"Failed to register a ServiceWorker"** → SW dosyası `/public` klasöründe ve doğru yolda olmalı
- **"getToken failed: Messaging: We are unable to register the default service worker"** → SW kayıt olmamış
- **"FCM token alınamadı"** → VAPID key kontrol et
- **"Bildirim izni verilmedi"** → Tarayıcı ayarlarından izin ver

## 8) Güvenlik

- VAPID public key client-side'da güvenli (public key olduğu için)
- Token'lar kullanıcı bazında Firestore'da saklanıyor
- Service worker HTTPS (veya localhost) gerektirir
- Bildirim izni kullanıcıdan istenir

## 9) Örnek Kullanım Senaryoları

### Senaryo 1: Onay bekleyen teklif bildirimi

```javascript
// Cloud Function
await admin.messaging().send({
  token: userToken,
  notification: {
    title: "Onay Bekleyen Teklif",
    body: "Yeni bir teklif onayınızı bekliyor"
  },
  data: {
    requestId: "abc123",
    type: "approval_needed"
  }
});
```

### Senaryo 2: Teklif geldi bildirimi

```javascript
await admin.messaging().send({
  token: buyerToken,
  notification: {
    title: "Yeni Teklif",
    body: "Talebiniz için yeni bir teklif geldi"
  },
  data: {
    requestId: "abc123",
    bidId: "xyz789",
    type: "new_bid"
  }
});
```

### Senaryo 3: Toplu bildirim (multicast)

```javascript
const tokens = ['token1', 'token2', 'token3'];
await admin.messaging().sendEachForMulticast({
  tokens,
  notification: {
    title: "Sistem Güncellemesi",
    body: "Yeni özellikler eklendi!"
  }
});
```

## 10) Sonraki Adımlar

1. Firebase Console'dan VAPID key üret
2. `fcm.js` dosyasında VAPID key'i güncelle
3. Test et (dashboard.html'de initFCM çağrısı var)
4. Cloud Functions ile bildirim gönderme sistemi kur
5. İhtiyaca göre özelleştir (bildirim şablonları, aksiyonlar, vb.)

