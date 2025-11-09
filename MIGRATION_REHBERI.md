# 🚀 MİGRASYON REHBERİ - Ücretsiz Alternatiflere Geçiş

## 📋 ÖZET

Bu rehber, projeyi ücretsiz alternatiflere geçirmek için adım adım talimatlar içerir:

1. **PostgreSQL → Firestore** ($0 maliyet)
2. **Redis → In-Memory Cache** ($0 maliyet)
3. **Google Maps → OpenStreetMap** ($0 maliyet)

**Toplam Tasarruf:** $0-100/ay → **$0/ay** ✅

---

## 📦 ADIM 1: Gerekli Paketleri Yükle

```bash
# In-memory cache için
npm install node-cache

# OpenStreetMap (Leaflet.js) için
npm install leaflet
npm install --save-dev @types/leaflet
```

---

## 🔄 ADIM 2: PostgreSQL → Firestore Migration

### 2.1. Firestore Collections Oluştur

Firebase Console'da şu koleksiyonları oluşturun:
- `categories`
- `category_keywords`
- `category_feedback`
- `tax_offices`

### 2.2. Migration Script Çalıştır

```bash
# PostgreSQL'in çalıştığından emin olun
npm run migrate:categories  # Önce PostgreSQL'de veri olduğundan emin olun

# Migration script'i çalıştır
tsx scripts/migrate-postgres-to-firestore.ts
```

### 2.3. API Routes Güncelle

`src/modules/categories/routes/categories.ts` dosyasını güncelleyin:

```typescript
// ÖNCE (PostgreSQL)
import { getPgPool } from '../../../db/connection';
const pool = getPgPool();
const result = await pool.query('SELECT * FROM categories');

// SONRA (Firestore)
import { getCategories, suggestCategory } from '../../../services/firestore-categories';
const categories = await getCategories({ search: q });
```

### 2.4. Test Et

```bash
npm run dev:api
# Tarayıcıda: http://localhost:5174/api/categories
```

---

## 💾 ADIM 3: Redis → In-Memory Cache

### 3.1. Cache Service Kullan

Mevcut Redis kullanımlarını değiştirin:

```typescript
// ÖNCE (Redis)
import { getRedisClient } from '../../../db/connection';
const redis = getRedisClient();
const cached = await redis.get(cacheKey);

// SONRA (In-Memory)
import { cache } from '../../../services/in-memory-cache';
const cached = await cache.get(cacheKey);
```

### 3.2. .env Güncelle

`.env` dosyasına ekleyin:

```env
# Cache ayarları
CACHE_DISABLED=0  # In-memory cache aktif
USE_IN_MEMORY_CACHE=1  # Redis yerine in-memory kullan
```

### 3.3. Redis Bağımlılıklarını Kaldır (Opsiyonel)

```bash
# Artık Redis'e ihtiyaç yok
npm uninstall ioredis
```

---

## 🗺️ ADIM 4: Google Maps → OpenStreetMap

### 4.1. Google Maps API Key'i Kaldır

Tüm HTML dosyalarından Google Maps script'ini kaldırın:

```html
<!-- ÖNCE -->
<script src="https://maps.googleapis.com/maps/api/js?key=AIzaSy..."></script>

<!-- SONRA -->
<!-- Google Maps kaldırıldı, OpenStreetMap kullanılıyor -->
```

### 4.2. Leaflet.js Ekle

HTML dosyalarına Leaflet.js ekleyin:

```html
<!-- CSS -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

<!-- JS -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

### 4.3. Map Component Kullan

React component:

```tsx
import { Map } from '../components/Map';

<Map 
  address="İstanbul, Türkiye"
  lat={41.0082}
  lng={28.9784}
  height="400px"
/>
```

Standalone HTML/JS:

```html
<div id="map" style="height: 400px;"></div>
<script>
  import { initMap } from './components/Map';
  initMap('map', 'İstanbul, Türkiye');
</script>
```

### 4.4. Mevcut Google Maps Kullanımlarını Değiştir

`settings.html`, `company-profile.html` gibi dosyalarda:

```javascript
// ÖNCE
const map = new google.maps.Map(document.getElementById('map'), {
  center: { lat: 41.0082, lng: 28.9784 },
  zoom: 13
});

// SONRA
import L from 'leaflet';
const map = L.map('map').setView([41.0082, 28.9784], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
```

---

## ✅ ADIM 5: Test ve Doğrulama

### 5.1. Kategori Sistemi Test

```bash
# API test
curl http://localhost:5174/api/categories
curl -X POST http://localhost:5174/api/categories/suggest -H "Content-Type: application/json" -d '{"text":"elektrik kablosu"}'
```

### 5.2. Cache Test

```typescript
import { cache } from './services/in-memory-cache';

// Test
await cache.set('test', 'value', 60);
const value = await cache.get('test');
console.log(value); // "value"
```

### 5.3. Harita Test

Tarayıcıda harita component'ini test edin:
- Adres gösterimi çalışıyor mu?
- Marker doğru konumda mı?
- Geocoding çalışıyor mu?

---

## 🔧 ADIM 6: Production Deployment

### 6.1. Firestore Rules Güncelle

`firestore.rules` dosyasına ekleyin:

```javascript
match /categories/{categoryId} {
  allow read: if true;  // Herkes okuyabilir
  allow write: if request.auth != null && isAdmin();  // Sadece admin yazabilir
}

match /category_keywords/{keywordId} {
  allow read: if true;
  allow write: if request.auth != null && isAdmin();
}

match /tax_offices/{officeId} {
  allow read: if true;
  allow write: if request.auth != null && isAdmin();
}
```

### 6.2. Firestore Indexes Oluştur

`firestore.indexes.json` dosyasına ekleyin:

```json
{
  "indexes": [
    {
      "collectionGroup": "categories",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### 6.3. Deploy

```bash
# Firestore rules
firebase deploy --only firestore:rules

# Firestore indexes
firebase deploy --only firestore:indexes
```

---

## 📊 PERFORMANS KONTROLÜ

### Firestore Kullanımı

Firebase Console → Usage and Billing:
- **Reads:** Günlük okuma sayısı
- **Writes:** Günlük yazma sayısı
- **Storage:** Toplam depolama

**Ücretsiz Tier Limitleri:**
- 50K reads/gün ✅
- 20K writes/gün ✅
- 1 GB storage ✅

### In-Memory Cache

```typescript
import { cache } from './services/in-memory-cache';
const stats = cache.getStats();
console.log(stats);
// { keys: 150, hits: 1200, misses: 50, ksize: 5000, vsize: 100000 }
```

### OpenStreetMap

Nominatim API rate limit: **1 request/second**
- Geocoding sonuçlarını cache'leyin
- Session storage kullanın (sayfa kapanana kadar)

---

## ⚠️ ÖNEMLİ NOTLAR

### 1. Firestore Queries

Firestore'da case-insensitive search yok. Client-side filter kullanıyoruz:

```typescript
// Tüm kategorileri al, client-side filter
const allCategories = await getCategories();
const filtered = allCategories.filter(cat => 
  cat.name.toLowerCase().includes(search.toLowerCase())
);
```

### 2. Cache Memory

In-memory cache RAM kullanır. Büyük veri setleri için:
- Max keys limit: 10,000
- TTL kullanın (24 saat)
- Düzenli temizlik yapın

### 3. Nominatim Rate Limit

OpenStreetMap geocoding için:
- 1 request/second limit
- Cache kullanın (session storage)
- Batch geocoding yapmayın

---

## 🐛 SORUN GİDERME

### Firestore Bağlantı Hatası

```typescript
// firebase.js kontrol et
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
```

### Cache Çalışmıyor

```typescript
// Cache service kontrol et
import { cache } from './services/in-memory-cache';
console.log(cache.getStats()); // Stats görünüyor mu?
```

### Harita Görünmüyor

1. Leaflet.js yüklü mü?
2. CSS dosyası eklendi mi?
3. Container height ayarlandı mı?

```html
<div id="map" style="height: 400px;"></div>
```

---

## ✅ BAŞARI KRİTERLERİ

- [ ] PostgreSQL bağımlılığı kaldırıldı
- [ ] Redis bağımlılığı kaldırıldı
- [ ] Google Maps API key kaldırıldı
- [ ] Tüm testler geçiyor
- [ ] Production'da çalışıyor
- [ ] Maliyet $0/ay ✅

---

## 📞 YARDIM

Sorun mu var?
1. `ALTERNATIF_COZUMLER.md` dosyasını okuyun
2. Migration script loglarını kontrol edin
3. Firebase Console'da Firestore verilerini kontrol edin

**Başarılar! 🚀**

