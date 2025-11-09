# 🔐 Auth Guard Sistemi - Tek Kaynaktan Yönetim

## ✅ Tamamlanan İşlemler

### 1. `firebase.js` - `waitAuthReady()` Eklendi
- Firebase v10 `authStateReady()` kullanıyor
- Auth durumu kesinleşmeden karar vermiyor
- Fallback mekanizması mevcut

### 2. `assets/js/auth-guard.js` - Ortak Guard Oluşturuldu
- **`initAuthGuard()`**: Ana auth guard (login/app sayfaları için)
- **`initProfileGuard()`**: Profil/rol zorunlu kontrolü (onboarding için)
- **`initCompanyJoinGuard()`**: Şirket kodlu kayıt durumu kontrolü
- **`initAllGuards()`**: Tüm guard'ları başlatır

### 3. `index.html` - Manuel Redirect'ler Kaldırıldı
- ❌ Giriş butonlarından redirect kaldırıldı
- ❌ Google login redirect'leri kaldırıldı
- ✅ Guard otomatik yönlendirecek

### 4. `dashboard.html` - Guard Entegre Edildi
- Guard sayfa yüklendiğinde otomatik çalışıyor
- Auth state değişikliklerini dinliyor

## 📋 Kullanım

### Yeni Sayfalara Guard Eklemek

```javascript
// Sayfanın script bloğunun en üstüne ekle
import { initAuthGuard } from './assets/js/auth-guard.js';

// Guard'ı başlat
initAuthGuard().catch(console.error);
```

### Guard'ın Yaptıkları

1. **Login Sayfası (`index.html`)**:
   - Kullanıcı giriş yapmışsa → Dashboard'a yönlendirir
   - Şirket kodlu kayıt durumu `pending/rejected` ise → `company-join-waiting.html`'e yönlendirir

2. **App Sayfaları (dashboard, demands, bids, vb.)**:
   - Kullanıcı giriş yapmamışsa → Login'e yönlendirir
   - `?from=...` parametresi ile geri dönüş URL'i saklanır

3. **Auth State Değişiklikleri**:
   - `onAuthStateChanged` ile giriş/çıkış dinlenir
   - Otomatik yönlendirme yapılır

## 🚫 Yapılmaması Gerekenler

### ❌ Manuel Redirect Yapma

```javascript
// ❌ YANLIŞ - Guard yapmaz
await login(email, password);
location.href = "./dashboard.html"; // ❌

// ✅ DOĞRU - Guard yapar
await login(email, password);
// Guard otomatik yönlendirecek
```

### ❌ requireAuth() İçinde Redirect Yapma

`requireAuth()` artık sadece kullanıcı kontrolü yapar, redirect yapmaz. Guard yönlendirir.

## 🔧 Debug Modu

Guard'ı devre dışı bırakmak için URL'ye `?skipAutoRedirect=true` ekle:

```
http://localhost:5173/index.html?skipAutoRedirect=true
```

## 📝 Guard Fonksiyonları

### `initAuthGuard()`
- Login ve app sayfaları için
- Otomatik yönlendirme yapar
- Auth state değişikliklerini dinler

### `initProfileGuard()`
- Profil/rol zorunlu kontrolü
- Profil yoksa onboarding'e yönlendirir (login'e değil!)

### `initCompanyJoinGuard()`
- Şirket kodlu kayıt durumu kontrolü
- `pending/rejected` → `company-join-waiting.html`
- `approved` → `dashboard.html`

## 🎯 Sonraki Adımlar

Diğer sayfalara guard eklenebilir:
- `demands.html`
- `bids.html`
- `settings.html`
- `company-join-waiting.html`
- `demand-new.html`
- `demand-detail.html`

## ⚠️ Önemli Notlar

1. **Guard'ı her sayfaya ekle** - Manuel redirect yapma
2. **`skipAutoRedirect` parametresi** - Test için kullanılabilir, production'da kaldırılabilir
3. **Auth state kesinleşmeden karar verme** - `waitAuthReady()` kullan
4. **Redirect loop önleme** - Guard tek kaynaktan yönetir

## 🐛 Sorun Giderme

### Guard çalışmıyor
- Console'da `initAuthGuard` hatası var mı kontrol et
- Import path'leri doğru mu kontrol et (`./assets/js/auth-guard.js`)

### Redirect loop
- `skipAutoRedirect=true` parametresi var mı kontrol et
- Guard'ın birden fazla kez çağrıldığından emin ol

### Auth state güncellenmiyor
- `waitAuthReady()` Firebase v10 `authStateReady()` kullanıyor
- Fallback mekanizması çalışıyor mu kontrol et

