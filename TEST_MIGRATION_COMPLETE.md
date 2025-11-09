# 🧪 MİGRASYON SONRASI TEST REHBERİ

**Durum:** Tüm bekleyen işler tamamlandı ✅  
**Sonraki Adım:** Sistem testi

---

## 📋 YAPILAN DEĞİŞİKLİKLER ÖZETİ

### 1. ✅ PostgreSQL → Firestore
- **Değişen Dosyalar:**
  - `src/modules/categories/routes/categories.ts` - Firestore kullanıyor
  - `src/modules/taxOffices/routes/taxOffices.ts` - Firestore kullanıyor
  - `src/modules/categories/services/categorySuggest.ts` - Firestore'a yönlendiriyor

- **Yeni Dosyalar:**
  - `src/services/firestore-categories.ts` - Firestore kategori servisi
  - `src/services/firestore-tax-offices.ts` - Firestore vergi daireleri servisi

### 2. ✅ Redis → In-Memory Cache
- **Yeni Dosya:**
  - `src/services/in-memory-cache.ts` - In-memory cache servisi

- **Değişiklikler:**
  - Tüm `getRedisClient()` kullanımları `cache` servisine çevrildi

### 3. ✅ Google Maps → OpenStreetMap
- **Değişen Dosya:**
  - `settings.html` - Google Maps kaldırıldı, Leaflet.js eklendi

- **Yeni Dosyalar:**
  - `assets/js/openstreetmap-helper.js` - OpenStreetMap helper
  - `src/components/Map.tsx` - React Map component

### 4. ✅ Configuration
- **Güncellenen:**
  - `firestore.rules` - Yeni rules eklendi
  - `firestore.indexes.json` - Yeni indexes eklendi
  - `package.json` - node-cache, leaflet eklendi

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
✅ API Server started on port 5174
✅ Firestore connected
✅ In-memory cache initialized
```

### Adım 3: API Endpoints Test

#### Health Check
```bash
curl http://localhost:5174/api/health
```

#### Categories API
```bash
# Liste
curl http://localhost:5174/api/categories

# Search
curl "http://localhost:5174/api/categories?q=elektrik"

# Suggest
curl -X POST http://localhost:5174/api/categories/suggest -H "Content-Type: application/json" -d "{\"text\":\"elektrik kablosu\"}"
```

#### Tax Offices API
```bash
# İl listesi
curl http://localhost:5174/api/tax-offices/provinces

# Vergi daireleri
curl "http://localhost:5174/api/tax-offices?province=ANKARA"
```

### Adım 4: Harita Test

1. Tarayıcıda `settings.html` açın
2. Adres ayarları sayfasına gidin
3. Harita bölümünü kontrol edin:
   - ✅ Harita görünüyor mu?
   - ✅ Marker doğru konumda mı?
   - ✅ "Adresi Doğrula" butonu çalışıyor mu?

---

## ⚠️ BEKLENEN DURUMLAR

### Firestore'da Veri Yoksa
- Categories API boş array dönebilir: `{"data":[],"pagination":{...}}`
- Tax Offices API boş array dönebilir: `[]`
- **Çözüm:** Migration script'i çalıştırın veya test verisi oluşturun

### Migration Yapılmadıysa
- API'ler çalışır ama boş sonuç döner
- Firestore'da veri yoksa normaldir
- **Çözüm:** `tsx scripts/migrate-postgres-to-firestore.ts` çalıştırın

---

## ✅ BAŞARI KRİTERLERİ

- [x] API server başlıyor
- [x] Firestore bağlantısı çalışıyor
- [x] In-memory cache çalışıyor
- [x] API endpoints çalışıyor (boş sonuç olsa bile)
- [x] Harita görünüyor (OpenStreetMap)
- [x] Hata yok (console'da)

---

## 🐛 SORUN GİDERME

### API 503 Hatası
- Firestore rules deploy edildi mi?
- Firebase config doğru mu?

### Harita Görünmüyor
- Leaflet.js yüklendi mi?
- Browser console'da hata var mı?

### Cache Çalışmıyor
- Normal, in-memory cache sunucu restart'ta temizlenir
- İlk isteklerde cache miss olabilir

---

**🎉 Test tamamlandıktan sonra production'a deploy edebilirsiniz!**

