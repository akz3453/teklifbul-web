# 🏢 Teklifbul Web Sistemi - ChatGPT İçin Özet

**Bu doküman ChatGPT'ye sistem özelliklerini aktarmak için hazırlanmıştır.**

---

## 📋 SİSTEM GENEL BAKIŞ

**Teklifbul**, alıcı ve tedarikçileri buluşturan bir **teklif/talep yönetim platformu**dur.

### Temel İşlevler
- Talep Yönetimi (oluşturma, yayınlama, yönetim)
- Teklif Yönetimi (verme, revizyon, onay)
- Otomatik Tedarikçi Eşleştirme (kategori bazlı)
- Rol Bazlı Onay Sistemi (e-imza desteği)
- Stok Takip Sistemi (şantiye bazlı)
- Fiyat Karşılaştırma (Excel bazlı)
- Çoklu Şirket ve Rol Desteği

---

## 🛠️ TEKNOLOJİ STACK

| Kategori | Teknoloji | Versiyon | Kullanım |
|----------|-----------|----------|----------|
| **Frontend** | HTML5, JavaScript (ES6+), TypeScript | 5.9.3 | Ana yapı |
| **Build Tool** | Vite | 7.1.7 | Build ve dev server |
| **Database** | Firebase Firestore | 10.13.1 | NoSQL veritabanı |
| **Auth** | Firebase Auth | 10.13.1 | Kimlik doğrulama |
| **Storage** | Firebase Storage | 10.13.1 | Dosya depolama |
| **Push** | Firebase Cloud Messaging | 10.13.1 | Bildirimler |
| **Excel** | ExcelJS, XLSX | 4.4.0, 0.18.5 | Import/Export |
| **PDF** | jsPDF | 2.5.1 | PDF oluşturma |
| **Harita** | Leaflet | 1.9.4 | Harita entegrasyonu |
| **Test** | Jest | 29.7.0 | Test framework |
| **CI/CD** | GitHub Actions | - | Otomatik kontrol |

---

## 🏗️ MİMARİ YAPI

### Klasör Yapısı
```
teklifbul-web/
├── src/shared/          # Paylaşılan modüller (logger, toast, constants)
├── src/categories/      # Kategori yönetimi
├── src/matching/        # Tedarikçi eşleştirme
├── assets/js/           # JavaScript modülleri
│   ├── ui/              # UI bileşenleri
│   ├── services/        # Servis katmanı
│   └── firebase/        # Firebase yardımcıları
├── pages/               # HTML sayfaları
├── test/                # Test/debug (prod'dan hariç)
└── functions/           # Firebase Cloud Functions
```

### Mimari Prensipler
- **Modüler Yapı**: Her modül bağımsız
- **Service Layer**: İş mantığı services/ klasöründe
- **UI Layer**: Görsel katman sadece görüntüleme
- **Constants**: Hard-coded değerler yasak
- **DRY**: Kod tekrarı yok
- **Async/Await**: Tüm async işlemler async/await ile

---

## 📦 ANA MODÜLLER

| Modül | Dosyalar | Özellikler |
|-------|----------|------------|
| **Talep Yönetimi** | `demands.html`, `demand-detail.html`, `demand-new.html` | Oluşturma, yayınlama, dosya yükleme, PDF/Excel export |
| **Teklif Yönetimi** | `bids.html`, `bid-detail.html`, `bid-upload.html` | Teklif verme, revizyon, e-imza onay, Excel import |
| **Kategori Sistemi** | `src/categories/category-service.js` | ID bazlı, hiyerarşik, slug bazlı arama, yıldızlı arama |
| **Tedarikçi Eşleştirme** | `src/matching/match-service.js` | Kategori bazlı, Levenshtein distance, skor bazlı |
| **Onay Sistemi** | `assets/js/services/approval-guards.js` | Rol bazlı, e-imza, onay limitleri, audit log |
| **Stok Takip** | `inventory-index.html`, `pages/stock-*.html` | Excel import/export, ortalama maliyet, şantiye bazlı hareketler |
| **Çoklu Şirket/Rol** | `assets/js/auth-guard.js`, `settings.html` | Birden fazla şirket, aktif şirket seçimi, rol bazlı yetki |
| **Adres Yönetimi** | `assets/js/address-service.js` | İl/İlçe/Mahalle, sokak arama, harita entegrasyonu |
| **Fiyat Karşılaştırma** | `src/price-comparison.js` | Excel bazlı, çoklu tedarikçi, toplam maliyet |

---

## 🔐 GÜVENLİK VE YETKİLENDİRME

### Firestore Security Rules
- Kullanıcı bazlı erişim kontrolü
- Rol bazlı yetkilendirme
- Şirket bazlı veri izolasyonu
- Published kontrolü (talepler için)

### Authentication
- Email/Password
- Google Sign-In (opsiyonel)
- Session yönetimi
- Auth guard (sayfa bazlı koruma)

### Authorization
- Rol bazlı yetkiler (Genel Müdür, GMY, CEO, vb.)
- Onay limitleri (miktar/tutar bazlı)
- E-imza kontrolü
- Audit logging

---

## 📐 KOD STANDARTLARI (Teklifbul Rules v1.0)

### 1. Kodlama Davranışları
- ✅ **Modüler**: Her modül bağımsız
- ✅ **DRY**: Kod tekrarı yok
- ✅ **Async/Await**: Tüm async işlemler async/await ile
- ✅ **Try/Catch**: Her async işlemde hata yakalama
- ✅ **Toast Bildirimleri**: Başarı/hata mesajları toast ile
- ✅ **Structured Logging**: `console.log` yasak, `logger` kullan

### 2. Dosya Adlandırma
- **Dosya adları**: kebab-case (`demand-detail.html`)
- **Fonksiyon/değişken**: camelCase (`getUserData`)
- **Constants**: UPPER_SNAKE_CASE (`TOAST_COLORS`)

### 3. Hard-Coded Değerler Yasak
- **Renkler**: `src/shared/constants/colors.js`
- **Timing**: `src/shared/constants/timing.js`
- **UI**: `src/shared/constants/ui.js`
- **Mesajlar**: `src/shared/constants/messages.ts`

### 4. Error Handling
- Her `try/catch` bloğunda `toast.error()` veya `toast.success()`
- `logger.error()` ile loglama
- Kullanıcı dostu hata mesajları

### 5. Logging
- Production'da sadece `logger.error()` görünür
- Development'ta tüm loglar aktif
- Debug modu: `localStorage.setItem('teklifbul:debug', 'true')`

---

## 📊 VERİ YAPISI

### Ana Firestore Collections

#### `demands` (Talepler)
```javascript
{
  id: string,
  createdBy: string,
  companyId: string,
  title: string,
  description: string,
  categoryIds: string[],
  published: boolean,
  viewerIds: string[],
  status: 'draft' | 'published' | 'completed',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `bids` (Teklifler)
```javascript
{
  id: string,
  demandId: string,
  supplierId: string,
  buyerId: string,
  status: 'pending' | 'accepted' | 'rejected' | 'revision_requested',
  items: Array<{...}>,
  totalAmount: number,
  approvedBy: string,
  approvedAt: Timestamp,
  createdAt: Timestamp
}
```

#### `users` (Kullanıcılar)
```javascript
{
  id: string,
  email: string,
  displayName: string,
  companies: Array<{
    companyId: string,
    role: string,
    roles: string[]
  }>,
  activeCompanyId: string,
  createdAt: Timestamp
}
```

#### `companies` (Şirketler)
```javascript
{
  id: string,
  name: string,
  code: string,
  taxOffice: string,
  taxNumber: string,
  address: {...},
  ownerId: string,
  createdAt: Timestamp
}
```

---

## 🔧 ÖZEL ÖZELLİKLER

### 1. Yıldızlı Arama
- **Format**: `*ÇİM*32*KG*`
- **Kullanım**: Stok ve kategori aramalarında
- **Özellik**: Türkçe normalizasyon ile çalışır

### 2. Excel Entegrasyonu
- **Import**: Talep, teklif, stok verileri
- **Export**: Fiyat karşılaştırma, stok raporları
- **Template**: Önceden tanımlı şablonlar

### 3. Push Bildirimleri
- Firebase Cloud Messaging (FCM)
- Talep/teklif güncellemeleri
- Onay talepleri

### 4. Harita Entegrasyonu
- Leaflet + OpenStreetMap
- Adres doğrulama
- Lokasyon bazlı filtreleme

### 5. PDF Export
- jsPDF ile PDF oluşturma
- Talep detayları
- Teklif karşılaştırmaları

---

## 🚀 BUILD VE DEPLOY

### Build Sistemi
- **Tool**: Vite 7.1.7
- **Output**: `dist/` klasörü
- **Source Maps**: Aktif
- **Test Klasörü**: Prod build'den hariç

### Deploy Scripts
```json
{
  "build": "tsc -b && vite build",
  "deploy:rules": "firebase deploy --only firestore:rules",
  "deploy:indexes": "firebase deploy --only firestore:indexes",
  "preview": "vite preview"
}
```

### CI/CD Pipeline
- **Platform**: GitHub Actions
- **Adımlar**: Lint → Typecheck → Test → Build → Test klasörü kontrolü

---

## 🧪 TEST VE KALİTE KONTROL

### Test Yapısı
- **Test Klasörü**: `test/` (prod'dan hariç)
- **Framework**: Jest 29.7.0
- **Coverage**: HTML/JS coverage raporları

### Kalite Kontrol
- ✅ **ESLint**: Kod kalitesi
- ✅ **TypeScript**: Type checking
- ✅ **CI/CD**: Otomatik kontrol

---

## 📈 PERFORMANS

### Optimizasyonlar
- ✅ Firebase modül caching
- ✅ Lazy loading (dynamic imports)
- ✅ Code splitting (Vite)
- ✅ Source maps (production'da kapalı)

### Firestore Indexes
- Kategori bazlı sorgular
- Tarih bazlı sıralama
- Array içinde arama

---

## 🎨 UI/UX ÖZELLİKLERİ

### Tema Sistemi
- ✅ Açık/Koyu mod desteği
- ✅ CSS değişkenleri ile yönetim
- ✅ Kullanıcı tercihi localStorage'da

### Toast Bildirimleri
- ✅ Başarı: Yeşil (`toast.success()`)
- ✅ Hata: Kırmızı (`toast.error()`)
- ✅ Uyarı: Turuncu (`toast.warn()`)
- ✅ Bilgi: Mavi (`toast.info()`)

### Responsive Design
- ✅ Mobil uyumlu
- ✅ Tablet uyumlu
- ✅ Desktop optimized

---

## 📝 ÖNEMLİ NOTLAR

### Kod Standartları
- **Logger**: `src/shared/log/logger.ts` (TypeScript)
- **Toast**: `src/shared/ui/toast.js`
- **Constants**: `src/shared/constants/` (colors, timing, ui, messages)
- **Test İzolasyonu**: `test/` klasörü prod build'den hariç

### Güvenlik
- Firestore rules: `firestore.rules`
- Firestore indexes: `firestore.indexes.json`
- Storage rules: `storage.rules`

### Environment Variables
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## ✅ PRODUCTION READINESS

### Kontrol Listesi
- ✅ Test izolasyonu tamamlandı
- ✅ Logger production-safe
- ✅ CI/CD pipeline aktif
- ✅ Firestore rules/indexes deploy script'leri hazır
- ✅ Dokümantasyon güncel
- ✅ Build sistemi çalışıyor
- ✅ Typecheck başarılı

---

## 🎯 ÖZET

**Teklifbul**, modern web teknolojileri kullanılarak geliştirilmiş, **production-ready** bir teklif/talep yönetim platformudur.

**Temel Özellikler**:
- ✅ Çoklu şirket ve rol desteği
- ✅ Kategori bazlı eşleştirme
- ✅ Onay sistemi (e-imza)
- ✅ Stok takip
- ✅ Excel entegrasyonu
- ✅ Push bildirimleri
- ✅ Harita entegrasyonu

**Teknik Özellikler**:
- ✅ TypeScript + Vite
- ✅ Firebase (Firestore, Auth, Storage, FCM)
- ✅ Modüler mimari
- ✅ Structured logging
- ✅ CI/CD pipeline
- ✅ Test izolasyonu

**Durum**: ✅ **PRODUCTION READY**

---

**Versiyon**: 1.0  
**Son Güncelleme**: 2025-01-21

