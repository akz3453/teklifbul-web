# DEPLOYMENT GUIDE

## App Check (reCAPTCHA v3) - Konsol + 1 satır kod

### Konsol adımları:
1. Firebase Console → **Build > App Check**
2. Web uygulamanı seç → **reCAPTCHA v3** → **Enable** de
3. Sana bir **Site key** verir (kaydet)

### Koda ekle (firebase.js):
```javascript
// firebase.js dosyasının başına ekle
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js";

// app export'undan sonra ekle
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("BURAYA_RECAPTCHA_V3_SITE_KEY"),
  isTokenAutoRefreshEnabled: true
});
```

Site key'i konsoldan kopyalayıp yerine yaz.

---

## Firebase Hosting - 5 adımda canlıya çıkarma

### 1. Firebase CLI kur (bir kez):
```bash
npm i -g firebase-tools
firebase login
```

### 2. Proje klasöründe:
```bash
firebase init hosting
```

### 3. Ayarlar:
- Mevcut projenizi seçin (teklifbul)
- Public directory: `.` (nokta)
- Tek sayfa uygulaması mı? **No**

### 4. Deploy:
```bash
firebase deploy
```

### 5. Çıkan hosting URL'si siteniz!
Dilediğinde özel domain bağlayabilirsin.

---

## Firestore Rules Deployment

Firestore güvenlik kurallarını deploy etmek için:

```bash
firebase deploy --only firestore:rules
```

firestore.rules dosyası projenizde hazır durumda.

---

## Google Sign-in Yapılandırması

Firebase Console'da aktif etmek için:
1. **Authentication > Sign-in method**
2. **Google** seçeneğini bul
3. **Enable** et
4. Proje support email'ini seç
5. **Save**

---

## Test Akışı

1. Yeni kullanıcı:
   - index.html → Google ile giriş
   - role-select.html → Rol seç (buyer/supplier)
   - demands.html → Talepler sayfası

2. Mevcut kullanıcı:
   - index.html → Google ile giriş
   - role-select.html → Otomatik demands.html'e yönlendirilir
   - (Çünkü rol zaten kayıtlı)

3. Email/Şifre ile giriş:
   - Aynı akış çalışır
   - Rol seçimi yapılır
   - demands.html'e yönlenir
