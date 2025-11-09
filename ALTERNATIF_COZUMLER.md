# 💰 ÜCRETSİZ ALTERNATİF ÇÖZÜMLER - Maksimum Performans, Minimum Maliyet

## 🎯 HEDEF
- ✅ **Maksimum Performans**
- ✅ **Maksimum Kalite**
- ✅ **Maksimum Dosya Kaydı Güvencesi**
- ✅ **Minimum Maliyet ($0)**

---

## 📊 MEVCUT DURUM ANALİZİ

### 1. PostgreSQL Kullanımı
- **Kullanım:** Kategori öneri sistemi (25 kategori, 134 keyword), Vergi daireleri
- **Veri Boyutu:** ~200-500 KB (çok küçük)
- **Sorgu Tipi:** Basit SELECT, INSERT, UPDATE
- **İlişkisel Yapı:** categories → category_keywords, tax_offices

### 2. Redis Kullanımı
- **Kullanım:** Cache (24 saat TTL)
- **Veri Tipi:** Key-value cache
- **Opsiyonel:** Zaten `CACHE_DISABLED=1` ile kapatılabiliyor

### 3. Google Maps API
- **Kullanım:** Adres gösterimi, harita embed
- **Maliyet:** $200 kredi/ay (sonrası ücretli)
- **API Key:** Kodda açık (güvenlik riski)

---

## 🚀 ÇÖZÜM 1: PostgreSQL → Firestore Migration

### ✅ Avantajlar
- **$0 Maliyet:** Firestore ücretsiz tier yeterli (1 GB depolama, 50K okuma/gün)
- **Otomatik Yedekleme:** Firebase otomatik yedekleme yapar
- **Gerçek Zamanlı:** Real-time updates
- **Zaten Kullanılıyor:** Projede Firestore zaten aktif
- **Scalable:** Otomatik ölçeklenir

### 📊 Veri Yapısı

#### Firestore Collections:
```
categories/{categoryId}
  ├── id: number
  ├── name: string
  ├── short_desc: string
  ├── examples: string[]
  ├── createdAt: timestamp
  └── updatedAt: timestamp

category_keywords/{keywordId}
  ├── category_id: number
  ├── keyword: string
  ├── weight: number
  └── createdAt: timestamp

category_feedback/{feedbackId}
  ├── query: string
  ├── suggested_category_id: number | null
  ├── chosen_category_id: number | null
  ├── user_id: string | null
  └── createdAt: timestamp

tax_offices/{officeId}
  ├── province_name: string
  ├── district_name: string
  ├── office_name: string
  ├── office_code: string
  ├── office_type: string
  └── createdAt: timestamp
```

### 🔧 Implementation Plan

#### Adım 1: Firestore Service Layer
```typescript
// src/services/firestore-categories.ts
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc, addDoc } from 'firebase/firestore';

export async function getCategories(search?: string) {
  const categoriesRef = collection(db, 'categories');
  let q = query(categoriesRef);
  
  if (search) {
    q = query(categoriesRef, where('name', '>=', search), where('name', '<=', search + '\uf8ff'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function suggestCategory(text: string) {
  // Normalize text
  const normalized = normalizeTurkish(text.toLowerCase());
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  // Get all keywords
  const keywordsRef = collection(db, 'category_keywords');
  const keywordsSnapshot = await getDocs(keywordsRef);
  const keywords = keywordsSnapshot.docs.map(doc => doc.data());
  
  // Match keywords
  const matches = keywords.filter(kw => 
    words.some(word => kw.keyword.toLowerCase().includes(word))
  );
  
  // Group by category and calculate scores
  const categoryScores = new Map();
  matches.forEach(match => {
    const catId = match.category_id;
    const current = categoryScores.get(catId) || { category_id: catId, score: 0, keywords: [] };
    current.score += match.weight;
    current.keywords.push(match.keyword);
    categoryScores.set(catId, current);
  });
  
  // Get category details and sort
  const suggestions = await Promise.all(
    Array.from(categoryScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(async (item) => {
        const catDoc = await getDoc(doc(db, 'categories', item.category_id.toString()));
        return {
          category_id: item.category_id,
          name: catDoc.data()?.name || '',
          score: Math.min(item.score / 10, 1.0),
          reasons: item.keywords.slice(0, 3)
        };
      })
  );
  
  return {
    query: text,
    suggestions,
    auto_select: suggestions[0]?.score >= 0.70 ? suggestions[0].name : null
  };
}
```

#### Adım 2: API Routes Güncelleme
```typescript
// src/modules/categories/routes/categories.ts
import { getCategories, suggestCategory } from '../../../services/firestore-categories';

router.get('/', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const categories = await getCategories(q as string);
    res.json({ data: categories });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    const result = await suggestCategory(text);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

#### Adım 3: Migration Script
```typescript
// scripts/migrate-postgres-to-firestore.ts
// PostgreSQL'den Firestore'a veri aktarımı
```

### 📈 Performans Optimizasyonu
- **Indexing:** Firestore composite indexes
- **Caching:** Firestore cache + in-memory cache
- **Batch Operations:** Toplu okuma/yazma

---

## 🚀 ÇÖZÜM 2: Redis → In-Memory Cache

### ✅ Avantajlar
- **$0 Maliyet:** Sunucu RAM'inde çalışır
- **Hızlı:** Redis'ten daha hızlı (network latency yok)
- **Basit:** Ek servis yok
- **Yeterli:** Küçük veri seti için ideal

### 🔧 Implementation

```typescript
// src/services/in-memory-cache.ts
import NodeCache from 'node-cache';

class InMemoryCache {
  private cache: NodeCache;
  
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 86400, // 24 saat
      checkperiod: 3600, // 1 saatte bir temizlik
      useClones: false // Performans için
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    const value = this.cache.get<T>(key);
    return value || null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (ttl) {
      this.cache.set(key, value, ttl);
    } else {
      this.cache.set(key, value);
    }
  }
  
  async del(key: string): Promise<void> {
    this.cache.del(key);
  }
  
  async clear(): Promise<void> {
    this.cache.flushAll();
  }
  
  getStats() {
    return this.cache.getStats();
  }
}

export const cache = new InMemoryCache();
```

### 📊 Kullanım

```typescript
// src/modules/categories/services/categorySuggest.ts
import { cache } from '../../../services/in-memory-cache';

export async function suggestCategory(text: string) {
  const cacheKey = `cat:suggest:${normalized}`;
  
  // Cache kontrolü
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // ... hesaplama ...
  
  // Cache'e kaydet
  await cache.set(cacheKey, result, 86400); // 24 saat
  
  return result;
}
```

### 📈 Performans
- **Memory Usage:** ~10-50 MB (küçük veri seti için)
- **Latency:** <1ms (Redis'ten 10x daha hızlı)
- **Scalability:** Tek sunucu için yeterli

---

## 🚀 ÇÖZÜM 3: Google Maps → OpenStreetMap (Leaflet.js)

### ✅ Avantajlar
- **$0 Maliyet:** Tamamen ücretsiz
- **Açık Kaynak:** Sınırsız kullanım
- **Güvenlik:** API key yok, güvenlik riski yok
- **Özelleştirilebilir:** Tam kontrol
- **Offline:** Gerekirse offline kullanılabilir

### 🔧 Implementation

#### Adım 1: Leaflet.js Kurulumu
```bash
npm install leaflet
npm install --save-dev @types/leaflet
```

#### Adım 2: CSS ve JS Ekleme
```html
<!-- HTML -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

#### Adım 3: Harita Component
```typescript
// src/components/Map.tsx
import { useEffect, useRef } from 'react';
import L from 'leaflet';

interface MapProps {
  address: string;
  lat?: number;
  lng?: number;
}

export function Map({ address, lat, lng }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Harita oluştur
    const map = L.map(mapRef.current).setView(
      lat && lng ? [lat, lng] : [41.0082, 28.9784], // İstanbul default
      13
    );
    
    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    // Marker ekle (eğer koordinat varsa)
    if (lat && lng) {
      L.marker([lat, lng])
        .addTo(map)
        .bindPopup(address)
        .openPopup();
    } else {
      // Geocoding (ücretsiz Nominatim API)
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(res => res.json())
        .then(data => {
          if (data.length > 0) {
            const { lat, lon } = data[0];
            map.setView([lat, lon], 13);
            L.marker([lat, lon])
              .addTo(map)
              .bindPopup(address)
              .openPopup();
          }
        });
    }
    
    mapInstanceRef.current = map;
    
    return () => {
      map.remove();
    };
  }, [address, lat, lng]);
  
  return <div ref={mapRef} style={{ height: '400px', width: '100%' }} />;
}
```

#### Adım 4: Google Maps Kaldırma
```html
<!-- ÖNCE (settings.html) -->
<script src="https://maps.googleapis.com/maps/api/js?key=AIzaSy..."></script>

<!-- SONRA -->
<!-- Google Maps kaldırıldı, Leaflet.js kullanılıyor -->
```

### 📊 Alternatif Tile Providers (Ücretsiz)
- **OpenStreetMap:** Varsayılan, tamamen ücretsiz
- **CartoDB:** Styled maps, ücretsiz
- **Stamen:** Farklı stiller, ücretsiz

### ⚠️ Nominatim Geocoding Limitleri
- **Rate Limit:** 1 istek/saniye (yeterli)
- **Usage Policy:** Aşırı kullanım yasak (cache kullanın)

---

## 📊 KARŞILAŞTIRMA TABLOSU

| Özellik | PostgreSQL | Firestore | Fark |
|---------|-----------|-----------|------|
| **Maliyet** | $0 (self-hosted) | $0 (ücretsiz tier) | ✅ Eşit |
| **Yedekleme** | Manuel | Otomatik | ✅ Firestore |
| **Scalability** | Manuel | Otomatik | ✅ Firestore |
| **Performans** | Çok hızlı | Hızlı | ⚠️ PostgreSQL |
| **Kurulum** | Karmaşık | Basit | ✅ Firestore |

| Özellik | Redis | In-Memory | Fark |
|---------|-------|-----------|------|
| **Maliyet** | $0 (self-hosted) | $0 | ✅ Eşit |
| **Hız** | Hızlı | Çok hızlı | ✅ In-Memory |
| **Kurulum** | Gerekli | Otomatik | ✅ In-Memory |
| **Scalability** | İyi | Tek sunucu | ⚠️ Redis |

| Özellik | Google Maps | OpenStreetMap | Fark |
|---------|-------------|---------------|------|
| **Maliyet** | $200 kredi/ay | $0 | ✅ OpenStreetMap |
| **API Key** | Gerekli | Gerekmez | ✅ OpenStreetMap |
| **Limit** | Var | Yok | ✅ OpenStreetMap |
| **Özelleştirme** | Sınırlı | Tam | ✅ OpenStreetMap |

---

## 🎯 MİGRASYON PLANI

### Faz 1: Firestore Migration (1-2 gün)
1. ✅ Firestore collections oluştur
2. ✅ Migration script yaz
3. ✅ API routes güncelle
4. ✅ Test et

### Faz 2: In-Memory Cache (1 gün)
1. ✅ In-memory cache service yaz
2. ✅ Redis kullanımlarını değiştir
3. ✅ Test et

### Faz 3: OpenStreetMap (1 gün)
1. ✅ Leaflet.js kur
2. ✅ Map component yaz
3. ✅ Google Maps kaldır
4. ✅ Test et

**Toplam Süre:** 3-4 gün

---

## 💰 MALİYET ANALİZİ

### Önceki Durum
- PostgreSQL: $0 (self-hosted) veya $15-50/ay (cloud)
- Redis: $0 (self-hosted) veya $10-30/ay (cloud)
- Google Maps: $0-20/ay (kredi sonrası)
- **Toplam:** $0-100/ay

### Yeni Durum
- Firestore: $0 (ücretsiz tier yeterli)
- In-Memory Cache: $0
- OpenStreetMap: $0
- **Toplam:** $0/ay ✅

### Tasarruf
- **Aylık:** $0-100
- **Yıllık:** $0-1200

---

## ✅ SONUÇ

### Önerilen Çözüm
1. ✅ **PostgreSQL → Firestore:** Otomatik yedekleme, scalability, $0
2. ✅ **Redis → In-Memory:** Daha hızlı, basit, $0
3. ✅ **Google Maps → OpenStreetMap:** Tamamen ücretsiz, sınırsız, $0

### Avantajlar
- 💰 **$0 Maliyet**
- 🚀 **Maksimum Performans**
- 🔒 **Maksimum Güvenlik** (API key yok)
- 📈 **Scalable** (Firestore otomatik ölçeklenir)
- 💾 **Otomatik Yedekleme** (Firebase)

### Sonraki Adımlar
1. Migration scriptleri yaz
2. Test et
3. Production'a deploy et

