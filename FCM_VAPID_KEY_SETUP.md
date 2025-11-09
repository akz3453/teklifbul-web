# 🔧 FCM VAPID Key Kurulumu

## ❌ Hata
```
InvalidAccessError: Failed to execute 'subscribe' on 'PushManager': 
The provided applicationServerKey is not valid.
```

## ✅ Çözüm: VAPID Key'i Firebase Console'dan Alın

### Adım 1: Firebase Console'a Git
1. [Firebase Console](https://console.firebase.google.com/) açın
2. Projenizi seçin: **teklifbul**

### Adım 2: Cloud Messaging Ayarlarına Git
1. Sol menüden **⚙️ Project Settings** (Proje Ayarları) tıklayın
2. Üst menüden **Cloud Messaging** sekmesine geçin
3. **Web Push certificates** bölümünü bulun

### Adım 3: VAPID Key Pair Oluştur veya Mevcut Key'i Kopyala
1. Eğer key pair yoksa:
   - **"Generate key pair"** butonuna tıklayın
   - Key pair oluşturulacak
2. Eğer key pair varsa:
   - **Public key**'i kopyalayın (tam key'i kopyalayın, 87-88 karakter olmalı)

### Adım 4: VAPID Key'i Projeye Ekle

#### Seçenek 1: Environment Variable (Önerilen)
`.env.local` dosyasına ekleyin:
```env
VITE_FCM_VAPID_KEY=YOUR_VAPID_PUBLIC_KEY_BURAYA
```

#### Seçenek 2: HTML'de Global Variable
`index.html` veya `dashboard.html` içinde:
```html
<script>
  window.FCM_VAPID_KEY = 'YOUR_VAPID_PUBLIC_KEY_BURAYA';
</script>
```

#### Seçenek 3: Direkt Kod (Geçici - Production'da kullanmayın)
`assets/js/fcm.js` dosyasında:
```javascript
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_BURAYA';
```

## 📋 VAPID Key Formatı
- **Format**: Base64 URL-safe encoded
- **Uzunluk**: Genellikle 87-88 karakter
- **Karakterler**: A-Z, a-z, 0-9, `-`, `_`
- **Örnek**: `BK8x...` (87 karakter)

## ✅ Test Etme
1. VAPID key'i ekleyin
2. Sayfayı yenileyin (hard refresh: `Ctrl + Shift + R`)
3. Console'da şu mesajı görmelisiniz:
   ```
   ✅ FCM token alındı: ...
   ✅ FCM token Firestore'a kaydedildi
   ```

## 🔍 Sorun Giderme

### Key geçersiz hatası
- ✅ Key'in tamamını kopyaladığınızdan emin olun
- ✅ Key'de boşluk veya yeni satır olmamalı
- ✅ Key Base64 URL-safe formatında olmalı

### Key bulunamıyor
- ✅ `.env.local` dosyası proje root'unda olmalı
- ✅ Vite dev server'ı yeniden başlatın (`npm run dev`)
- ✅ `window.FCM_VAPID_KEY` global variable kontrol edin

### Key format hatası
- ✅ Key uzunluğu 80-90 karakter arası olmalı
- ✅ Sadece A-Z, a-z, 0-9, `-`, `_` karakterleri içermeli
- ✅ Firebase Console'dan direkt kopyalayın (elle yazmayın)

## 📝 Notlar
- VAPID key public key'dir, güvenlik riski yoktur
- Private key Firebase'de saklanır, siz sadece public key'i kullanırsınız
- Her Firebase projesi için farklı VAPID key pair vardır

