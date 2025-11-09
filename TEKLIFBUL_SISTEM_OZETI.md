# 🏢 Teklifbul Web Sistemi - Genel Özet ve Özellikler

**Versiyon**: 1.0  
**Tarih**: 2025-01-21  
**Durum**: Production Ready ✅

---

## 📋 İÇİNDEKİLER

1. [Sistem Genel Bakış](#sistem-genel-bakış)
2. [Teknoloji Stack](#teknoloji-stack)
3. [Mimari Yapı](#mimari-yapı)
4. [Ana Modüller](#ana-modüller)
5. [Özellikler](#özellikler)
6. [Güvenlik ve Yetkilendirme](#güvenlik-ve-yetkilendirme)
7. [Kod Standartları](#kod-standartları)
8. [Build ve Deploy](#build-ve-deploy)
9. [Test ve Kalite Kontrol](#test-ve-kalite-kontrol)

---

## 🎯 SİSTEM GENEL BAKIŞ

**Teklifbul**, alıcı ve tedarikçileri buluşturan bir **teklif/talep yönetim platformu**dur.

### Temel İşlevler
- ✅ **Talep Yönetimi**: Alıcılar talep oluşturur, yayınlar, yönetir
- ✅ **Teklif Yönetimi**: Tedarikçiler teklif verir, revizyon talep eder
- ✅ **Eşleştirme**: Kategori bazlı otomatik tedarikçi eşleştirme
- ✅ **Onay Sistemi**: Rol bazlı onay akışları (e-imza desteği)
- ✅ **Stok Takip**: Şantiye bazlı stok yönetimi ve hareket takibi
- ✅ **Fiyat Karşılaştırma**: Excel bazlı teklif karşılaştırma
- ✅ **Çoklu Şirket**: Kullanıcılar birden fazla şirkette rol alabilir
- ✅ **Çoklu Rol**: Alıcı ve/veya Tedarikçi rolleri

---

## 🛠️ TEKNOLOJİ STACK

### Frontend
| Teknoloji | Versiyon | Kullanım Amacı |
|-----------|----------|----------------|
| **HTML5** | - | Ana sayfa yapısı |
| **JavaScript (ES6+)** | - | İş mantığı, UI etkileşimleri |
| **TypeScript** | 5.9.3 | Type-safe kod, build sistemi |
| **Vite** | 7.1.7 | Build tool, dev server |
| **CSS3** | - | Stil ve tema yönetimi |

### Backend & Database
| Teknoloji | Versiyon | Kullanım Amacı |
|-----------|----------|----------------|
| **Firebase Firestore** | 10.13.1 | NoSQL veritabanı |
| **Firebase Auth** | 10.13.1 | Kullanıcı kimlik doğrulama |
| **Firebase Storage** | 10.13.1 | Dosya depolama |
| **Firebase Cloud Messaging** | 10.13.1 | Push bildirimleri |
| **Firebase Functions** | - | Cloud Functions (opsiyonel) |

### Kütüphaneler
| Kütüphane | Versiyon | Kullanım Amacı |
|-----------|----------|----------------|
| **ExcelJS** | 4.4.0 | Excel import/export |
| **XLSX** | 0.18.5 | Excel işlemleri (CDN) |
| **jsPDF** | 2.5.1 | PDF oluşturma (CDN) |
| **Leaflet** | 1.9.4 | Harita entegrasyonu |
| **date-fns** | 4.1.0 | Tarih işlemleri |

### Development Tools
| Tool | Versiyon | Kullanım Amacı |
|------|----------|----------------|
| **ESLint** | 9.36.0 | Kod kalitesi kontrolü |
| **TypeScript** | 5.9.3 | Type checking |
| **Jest** | 29.7.0 | Test framework |
| **GitHub Actions** | - | CI/CD pipeline |

---

## 🏗️ MİMARİ YAPI

### Klasör Yapısı
```
teklifbul-web/
├── src/                          # Kaynak kodlar
│   ├── shared/                   # Paylaşılan modüller
│   │   ├── log/                  # Logger sistemi
│   │   ├── ui/                   # UI bileşenleri (toast)
│   │   └── constants/            # Sabitler (colors, timing, messages)
│   ├── categories/               # Kategori yönetimi
│   ├── matching/                 # Tedarikçi eşleştirme
│   └── price-comparison.js       # Fiyat karşılaştırma
├── assets/                       # Statik dosyalar
│   ├── js/                       # JavaScript modülleri
│   │   ├── ui/                   # UI bileşenleri
│   │   ├── services/             # Servis katmanı
│   │   └── firebase/             # Firebase yardımcıları
│   └── css/                      # Stil dosyaları
├── pages/                        # HTML sayfaları
├── test/                         # Test/debug dosyaları (prod'dan hariç)
├── functions/                    # Firebase Cloud Functions
├── firestore.rules              # Firestore güvenlik kuralları
├── firestore.indexes.json       # Firestore index tanımları
└── vite.config.ts               # Vite build konfigürasyonu
```

### Mimari Prensipler
1. **Modüler Yapı**: Her modül bağımsız çalışabilir
2. **Service Layer**: İş mantığı `services/` klasöründe
3. **UI Layer**: Görsel katman sadece görüntüleme yapar
4. **Constants**: Hard-coded değerler yasak, tümü constants'ta
5. **DRY**: Kod tekrarı yok
6. **Async/Await**: Tüm async işlemler async/await ile

---

## 📦 ANA MODÜLLER

### 1. Talep Yönetimi (Demand Management)
**Dosyalar**: `demands.html`, `demand-detail.html`, `demand-new.html`

**Özellikler**:
- ✅ Talep oluşturma (taslak/yayınlanmış)
- ✅ Kategori bazlı filtreleme
- ✅ Dosya yükleme/indirme (Firebase Storage)
- ✅ PDF/Excel export
- ✅ Tedarikçilere gönderme
- ✅ Durum takibi (taslak, yayınlanmış, tamamlandı)

**Firestore Collections**:
- `demands` - Ana talep koleksiyonu
- `demands/{id}/files` - Talep dosyaları (sub-collection)

---

### 2. Teklif Yönetimi (Bid Management)
**Dosyalar**: `bids.html`, `bid-detail.html`, `bid-upload.html`

**Özellikler**:
- ✅ Teklif verme (manuel/Excel)
- ✅ Teklif durumu (beklemede, kabul, red, revizyon)
- ✅ Revizyon talebi
- ✅ E-imza ile onay
- ✅ Excel import/export

**Firestore Collections**:
- `bids` - Ana teklif koleksiyonu
- `bidRevisions` - Revizyon talepleri

---

### 3. Kategori Sistemi (Category System)
**Dosyalar**: `src/categories/category-service.js`

**Özellikler**:
- ✅ ID bazlı kategori yönetimi
- ✅ Hiyerarşik yapı (parent/child)
- ✅ Slug bazlı arama
- ✅ Türkçe normalizasyon
- ✅ Yıldızlı arama desteği (`*ÇİM*32*KG*`)

**Firestore Collections**:
- `categories` - Kategori tanımları

---

### 4. Tedarikçi Eşleştirme (Supplier Matching)
**Dosyalar**: `src/matching/match-service.js`

**Özellikler**:
- ✅ Kategori bazlı otomatik eşleştirme
- ✅ Levenshtein distance algoritması
- ✅ Skor bazlı sıralama
- ✅ Filtreleme (aktif/pasif tedarikçiler)

---

### 5. Onay Sistemi (Approval System)
**Dosyalar**: `assets/js/services/approval-guards.js`

**Özellikler**:
- ✅ Rol bazlı onay yetkileri
- ✅ E-imza desteği
- ✅ Onay limitleri (miktar/tutar bazlı)
- ✅ Onay geçmişi (audit log)

**Roller**:
- Alıcı: Genel Müdür, GMY, CEO, İşveren, YKB, YK Üyesi, Satın Alma Müdürü, vb.
- Tedarikçi: Genel Müdür, Satış Müdürü, Satış Temsilcisi, vb.

---

### 6. Stok Takip Sistemi (Inventory System)
**Dosyalar**: `inventory-index.html`, `pages/stock-*.html`

**Özellikler**:
- ✅ Excel import/export
- ✅ Ortalama maliyet hesaplama
- ✅ Şantiye bazlı stok hareketleri (IN, OUT, TRANSFER)
- ✅ Yıldızlı arama
- ✅ Fatura karşılaştırma
- ✅ Min/Max stok uyarıları

**Firestore Collections**:
- `inventory` - Stok kayıtları
- `stockMovements` - Stok hareketleri

---

### 7. Çoklu Şirket ve Rol (Multi-Company & Multi-Role)
**Dosyalar**: `assets/js/auth-guard.js`, `settings.html`

**Özellikler**:
- ✅ Kullanıcılar birden fazla şirkette rol alabilir
- ✅ Aktif şirket seçimi
- ✅ Rol bazlı yetkilendirme
- ✅ Şirket bazlı veri izolasyonu

**Firestore Collections**:
- `users` - Kullanıcı profilleri
- `companies` - Şirket bilgileri
- `companies/{id}/memberships` - Şirket üyelikleri

---

### 8. Adres Yönetimi (Address Management)
**Dosyalar**: `assets/js/address-service.js`

**Özellikler**:
- ✅ İl/İlçe/Mahalle seçimi
- ✅ Sokak arama
- ✅ Adres doğrulama
- ✅ Harita entegrasyonu (Leaflet/OpenStreetMap)

---

### 9. Fiyat Karşılaştırma (Price Comparison)
**Dosyalar**: `src/price-comparison.js`

**Özellikler**:
- ✅ Excel bazlı karşılaştırma
- ✅ Çoklu tedarikçi karşılaştırması
- ✅ Toplam maliyet hesaplama
- ✅ Export (Excel)

---

## 🔐 GÜVENLİK VE YETKİLENDİRME

### Firestore Security Rules
- ✅ Kullanıcı bazlı erişim kontrolü
- ✅ Rol bazlı yetkilendirme
- ✅ Şirket bazlı veri izolasyonu
- ✅ Published kontrolü (talepler için)

### Authentication
- ✅ Email/Password
- ✅ Google Sign-In (opsiyonel)
- ✅ Session yönetimi
- ✅ Auth guard (sayfa bazlı koruma)

### Authorization
- ✅ Rol bazlı yetkiler
- ✅ Onay limitleri
- ✅ E-imza kontrolü
- ✅ Audit logging

---

## 📐 KOD STANDARTLARI

### Teklifbul Rules v1.0

#### 1. Kodlama Davranışları
- ✅ **Modüler**: Her modül bağımsız
- ✅ **DRY**: Kod tekrarı yok
- ✅ **Async/Await**: Tüm async işlemler async/await ile
- ✅ **Try/Catch**: Her async işlemde hata yakalama
- ✅ **Toast Bildirimleri**: Başarı/hata mesajları toast ile
- ✅ **Structured Logging**: `console.log` yasak, `logger` kullan

#### 2. Dosya Adlandırma
- ✅ **Dosya adları**: kebab-case (`demand-detail.html`)
- ✅ **Fonksiyon/değişken**: camelCase (`getUserData`)
- ✅ **Constants**: UPPER_SNAKE_CASE (`TOAST_COLORS`)

#### 3. Hard-Coded Değerler Yasak
- ✅ **Renkler**: `src/shared/constants/colors.js`
- ✅ **Timing**: `src/shared/constants/timing.js`
- ✅ **UI**: `src/shared/constants/ui.js`
- ✅ **Mesajlar**: `src/shared/constants/messages.ts`

#### 4. Error Handling
- ✅ Her `try/catch` bloğunda `toast.error()` veya `toast.success()`
- ✅ `logger.error()` ile loglama
- ✅ Kullanıcı dostu hata mesajları

#### 5. Logging
- ✅ Production'da sadece `logger.error()` görünür
- ✅ Development'ta tüm loglar aktif
- ✅ Debug modu: `localStorage.setItem('teklifbul:debug', 'true')`

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
- **Adımlar**:
  1. Lint kontrolü
  2. Typecheck
  3. Test (opsiyonel)
  4. Build
  5. Test klasörü kontrolü

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

### Test Dosyaları
- Test/debug dosyaları `test/` klasöründe
- Production build'e dahil edilmez
- Development'ta erişilebilir

---

## 📊 VERİ YAPISI

### Ana Collections

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
- Format: `*ÇİM*32*KG*`
- Türkçe normalizasyon ile çalışır
- Stok ve kategori aramalarında kullanılır

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

## 📝 DOKÜMANTASYON

### Mevcut Dokümanlar
- ✅ `README.md` - Genel bilgiler
- ✅ `CHANGELOG.md` - Değişiklik geçmişi
- ✅ `test/README.md` - Test klasörü açıklaması
- ✅ `STABILIZATION_COMPLETE.md` - Stabilizasyon raporu

---

## 🔄 GELECEK PLANLAR

### Kısa Vadeli
- [ ] MESSAGES constants kullanımı (i18n hazırlık)
- [ ] Lint hatalarının düzeltilmesi
- [ ] Test coverage artırılması

### Uzun Vadeli
- [ ] i18n entegrasyonu (çoklu dil)
- [ ] TypeScript strict mode
- [ ] Sentry entegrasyonu (hata izleme)
- [ ] Performance monitoring

---

## 📞 TEKNİK DETAYLAR

### Environment Variables
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_SENTRY_DSN=... (opsiyonel)
```

### Port Yapılandırması
- **Frontend**: 5173 (Vite dev server)
- **Backend API**: 5174 (Express)
- **Firebase Emulators**: 4000 (UI), 8080 (Firestore), 9099 (Auth)

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

**Son Güncelleme**: 2025-01-21  
**Versiyon**: 1.0  
**Lisans**: ISC

