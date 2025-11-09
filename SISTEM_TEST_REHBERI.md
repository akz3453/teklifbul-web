# 🧪 SİSTEM TEST REHBERİ - Migration Sonrası

**Durum:** ✅ Migration tamamlandı, test aşaması

---

## 🎯 YAPILAN DEĞİŞİKLİKLER ÖZETİ

### 1. ✅ PostgreSQL → Firestore
- Tüm API routes Firestore kullanıyor
- Yeni servisler: `firestore-categories.ts`, `firestore-tax-offices.ts`
- Migration script hazır

### 2. ✅ Redis → In-Memory Cache
- Yeni servis: `in-memory-cache.ts`
- Tüm cache kullanımları güncellendi

### 3. ✅ Google Maps → OpenStreetMap
- `settings.html` harita kodları güncellendi
- Leaflet.js entegrasyonu tamamlandı

### 4. ✅ Firestore Rules & Indexes
- Rules güncellendi
- Indexes eklendi

---

## 🚀 TEST ADIMLARI

### Adım 1: Paketleri Yükle
```bash
npm install
```

### Adım 2: API Server Başlat
```bash
npm run dev:api
```

**Beklenen Çıktı:**
```
API listening on http://localhost:5174
```

### Adım 3: Otomatik Test Çalıştır
```bash
npm run test:migration
```

Bu test şunları kontrol eder:
- ✅ API health check
- ✅ Categories API (list, detail, suggest)
- ✅ Tax Offices API (provinces, list)
- ✅ Cache performance

### Adım 4: Manuel Test

#### 4.1. API Endpoints
```bash
# Health
curl http://localhost:5174/api/health

# Categories
curl http://localhost:5174/api/categories
curl -X POST http://localhost:5174/api/categories/suggest -H "Content-Type: application/json" -d '{"text":"elektrik kablosu"}'

# Tax Offices
curl http://localhost:5174/api/tax-offices/provinces
curl "http://localhost:5174/api/tax-offices?province=ANKARA"
```

#### 4.2. Harita Test
1. Tarayıcıda `settings.html` açın
2. Adres ayarları sayfasına gidin
3. Harita bölümünü kontrol edin

---

## ✅ BAŞARI KRİTERLERİ

- [ ] API server çalışıyor
- [ ] Categories API çalışıyor
- [ ] Tax Offices API çalışıyor
- [ ] Harita görünüyor
- [ ] Cache çalışıyor
- [ ] Hata yok

---

## 📊 BEKLENEN SONUÇLAR

### API Responses
- `GET /api/categories` → `{ data: [...], pagination: {...} }`
- `POST /api/categories/suggest` → `{ query: "...", suggestions: [...], auto_select: "..." }`
- `GET /api/tax-offices/provinces` → `["ANKARA", "İSTANBUL", ...]`
- `GET /api/tax-offices?province=ANKARA` → `[{ id: "...", office_name: "...", ... }]`

### Harita
- Leaflet.js haritası görünüyor
- Marker doğru konumda
- Geocoding çalışıyor

---

**🎯 Test tamamlandıktan sonra production'a deploy edilebilir!**

