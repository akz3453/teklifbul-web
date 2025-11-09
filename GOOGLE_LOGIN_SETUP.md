# 🔧 Google Login Yapılandırma Kılavuzu

## ❌ **Sorun**
`auth/internal-error` hatası alıyorsunuz. Bu, Firebase Console'da Google Sign-In'in düzgün yapılandırılmadığını gösterir.

## ✅ **Çözüm Adımları**

### 1. **Firebase Console - Google Sign-In Etkinleştirme**

1. [Firebase Console](https://console.firebase.google.com/)'a gidin
2. Projenizi seçin: `teklifbul`
3. Sol menüden **Authentication** → **Sign-in method** seçin
4. **Google** provider'ını bulun ve tıklayın
5. **Enable** toggle'ını **AÇIK** yapın
6. **Support email** alanını doldurun (proje sahibi e-postası)
7. **Web SDK configuration** bölümünde:
   - Eğer **Web client ID** boşsa veya hatalıysa:
     - **Web client ID** alanını kontrol edin
     - Eğer yoksa, **"Create credentials"** veya **"Auto-create"** butonuna tıklayın
   - Firebase otomatik olarak OAuth Client ID oluşturacaktır
8. **Save** butonuna tıklayın

### 2. **Authorized Domains Kontrolü**

1. Firebase Console → **Authentication** → **Settings**
2. **Authorized domains** sekmesine gidin
3. Şu domainlerin listede olduğundan emin olun:
   - `localhost` (geliştirme için)
   - `teklifbul.firebaseapp.com` (Firebase Hosting için)
   - `teklifbul.web.app` (Firebase Hosting için)
   - Canlı domain'iniz varsa onu da ekleyin

**⚠️ ÖNEMLİ:** `localhost` mutlaka ekli olmalı! Yoksa ekleyin:
- **Add domain** butonuna tıklayın
- `localhost` yazın
- **Add** butonuna tıklayın

### 3. **Google Cloud Console Kontrolü**

Bazı durumlarda Google Cloud Console'da da yapılandırma gerekebilir:

1. [Google Cloud Console](https://console.cloud.google.com/)'a gidin
2. Projenizi seçin: `teklifbul` (veya Firebase projenizin ID'si)
3. Sol menüden **APIs & Services** → **Credentials** seçin
4. **OAuth 2.0 Client IDs** listesini kontrol edin
5. **Web application** tipinde bir client ID olmalı
6. Eğer yoksa:
   - **+ CREATE CREDENTIALS** → **OAuth client ID** seçin
   - **Application type:** Web application
   - **Name:** Firebase Web App (veya istediğiniz bir isim)
   - **Authorized JavaScript origins:**
     - `http://localhost:5173` (dev server)
     - `http://localhost:3000` (alternatif dev port)
     - `http://localhost` (genel)
     - `https://teklifbul.firebaseapp.com` (production)
     - `https://teklifbul.web.app` (production)
   - **Authorized redirect URIs:**
     - `http://localhost:5173/__/auth/handler`
     - `http://localhost:3000/__/auth/handler`
     - `https://teklifbul.firebaseapp.com/__/auth/handler`
     - `https://teklifbul.web.app/__/auth/handler`

### 4. **Kod Tarafında Yapılan İyileştirmeler**

Kod tarafında şu iyileştirmeler yapıldı:

1. **Fallback mekanizması:** Popup başarısız olursa otomatik olarak redirect yöntemi deneniyor
2. **Detaylı hata mesajları:** Konsolda tam hata detayları gösteriliyor
3. **Redirect sonuç kontrolü:** Sayfa yüklendiğinde redirect sonucu kontrol ediliyor

### 5. **Test Etme**

1. Tarayıcıyı **tamamen kapatıp** yeniden açın (cache temizliği için)
2. `index.html` sayfasını açın
3. **F12** ile Developer Tools'u açın → **Console** sekmesi
4. **"Google ile Giriş"** butonuna tıklayın
5. Konsolda şu mesajları göreceksiniz:
   - Başarılıysa: `✅ Google login successful (popup): [email]`
   - Hata varsa: `❌ Google login error:` ile başlayan detaylı hata

### 6. **Hala Çalışmıyorsa - Alternatif Yöntem**

Eğer hala çalışmıyorsa, Firebase Console'da manuel OAuth Client ID ekleyebilirsiniz:

1. Firebase Console → Authentication → Sign-in method → Google
2. **Web SDK configuration** bölümünde **Web client ID** alanına:
   - Google Cloud Console'dan oluşturduğunuz Client ID'yi kopyalayıp yapıştırın
3. **Save** butonuna tıklayın

### 7. **Yaygın Hatalar ve Çözümleri**

| Hata | Çözüm |
|------|-------|
| `auth/internal-error` | Firebase Console'da Google Sign-In etkin değil veya OAuth Client ID eksik |
| `auth/popup-blocked` | Tarayıcı popup'ları engelliyor - redirect yöntemi otomatik devreye girer |
| `auth/unauthorized-domain` | Domain authorized domains listesinde yok |
| `auth/operation-not-allowed` | Firebase Console'da provider etkin değil |

## 🔍 **Debug İpuçları**

Konsolda şu komutları çalıştırarak yapılandırmayı kontrol edebilirsiniz:

```javascript
// Firebase yapılandırmasını kontrol et
console.log('Auth domain:', window.__auth._config.authDomain);
console.log('Project ID:', window.__auth._config.projectId);

// Google provider'ı kontrol et
import { GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
const provider = new GoogleAuthProvider();
console.log('Provider:', provider);
```

## 📞 **Destek**

Sorun devam ederse:
1. Browser console'daki tam hata mesajını kaydedin
2. Firebase Console'da Authentication ayarlarının ekran görüntüsünü alın
3. Hata detaylarını paylaşın

