# 🧪 TEST PLANI - Migration Sonrası Sistem Testi

**Tarih:** 2025-01-XX  
**Durum:** Migration tamamlandı, test aşaması

---

## 📋 TEST ADIMLARI

### 1. ✅ Ön Hazırlık

#### 1.1. Paketleri Yükle
```bash
npm install
```

#### 1.2. Firestore Rules Deploy
```bash
firebase deploy --only firestore:rules
```

#### 1.3. Firestore Indexes Deploy
```bash
firebase deploy --only firestore:indexes
```

#### 1.4. Veri Migration (Opsiyonel - Eğer PostgreSQL'de veri varsa)
```bash
tsx scripts/migrate-postgres-to-firestore.ts
```

**Not:** Eğer PostgreSQL'de veri yoksa, test için sample data oluşturulabilir.

---

### 2. 🔧 API Server Başlat

```bash
npm run dev:api
```

**Beklenen Çıktı:**
```
✅ API Server started on port 5174
✅ Firestore connected
✅ In-memory cache initialized
```

---

### 3. 🧪 API Endpoints Test

#### 3.1. Health Check
```bash
curl http://localhost:5174/api/health
```

**Beklenen:** `200 OK`

#### 3.2. Categories API Test
```bash
# Liste
curl http://localhost:5174/api/categories

# Search
curl "http://localhost:5174/api/categories?q=elektrik"

# Detay
curl http://localhost:5174/api/categories/1

# Suggest
curl -X POST http://localhost:5174/api/categories/suggest \
  -H "Content-Type: application/json" \
  -d '{"text":"elektrik kablosu"}'
```

#### 3.3. Tax Offices API Test
```bash
# İl listesi
curl http://localhost:5174/api/tax-offices/provinces

# Vergi daireleri
curl "http://localhost:5174/api/tax-offices?province=ANKARA"
```

#### 3.4. Otomatik Test Script
```bash
npm run test:categories-api
npm run test:tax-offices-api
npm run test:category-system
```

---

### 4. 🗺️ Harita Test (OpenStreetMap)

#### 4.1. Settings.html Test
1. Tarayıcıda `settings.html` açın
2. Adres ayarları sayfasına gidin
3. Harita bölümünü kontrol edin:
   - ✅ Harita görünüyor mu?
   - ✅ Marker doğru konumda mı?
   - ✅ "Adresi Doğrula" butonu çalışıyor mu?

#### 4.2. Console Kontrolü
- Browser console'da hata var mı?
- Leaflet.js yüklendi mi?
- Geocoding çalışıyor mu?

---

### 5. 💾 Cache Test

#### 5.1. In-Memory Cache Test
```typescript
// Browser console'da veya test script'te
import { cache } from './src/services/in-memory-cache';

// Test
await cache.set('test', 'value', 60);
const value = await cache.get('test');
console.log(value); // "value"

// Stats
console.log(cache.getStats());
```

---

### 6. 🔍 Firestore Veri Kontrolü

#### 6.1. Firebase Console Kontrolü
1. Firebase Console → Firestore Database
2. Şu koleksiyonları kontrol edin:
   - `categories` - Veri var mı?
   - `category_keywords` - Veri var mı?
   - `tax_offices` - Veri var mı?

#### 6.2. Veri Yapısı Kontrolü
- Document ID'ler doğru mu?
- Field'lar doğru mu?
- Timestamp'ler var mı?

---

## 🐛 SORUN GİDERME

### API 503 Hatası
**Sebep:** Firestore bağlantı hatası veya veri yok  
**Çözüm:**
- Firebase config kontrol et
- Firestore rules deploy edildi mi?
- Veri migration yapıldı mı?

### Harita Görünmüyor
**Sebep:** Leaflet.js yüklenmemiş  
**Çözüm:**
- Browser console'da hata kontrol et
- Leaflet.js CDN linkini kontrol et
- Container height ayarlandı mı?

### Cache Çalışmıyor
**Sebep:** Cache servisi initialize olmamış  
**Çözüm:**
- `src/services/in-memory-cache.ts` import kontrol et
- Cache stats kontrol et

---

## ✅ BAŞARI KRİTERLERİ

- [ ] API server çalışıyor
- [ ] Categories API çalışıyor
- [ ] Tax Offices API çalışıyor
- [ ] Harita görünüyor ve çalışıyor
- [ ] Cache çalışıyor
- [ ] Firestore'da veri var
- [ ] Hata yok (console temiz)

---

## 📊 TEST SONUÇLARI

Test sonuçlarını buraya kaydedin:

```
✅ API Health Check: PASS
✅ Categories List: PASS
✅ Category Suggest: PASS
✅ Tax Offices: PASS
✅ Harita: PASS
✅ Cache: PASS
```

---

**🎯 Test tamamlandıktan sonra production'a deploy edilebilir!**

