# 🧪 TEST EDİLMESİ GEREKENLER - Öncelik Sırası

**Durum:** Kod değişiklikleri tamamlandı ✅  
**Sonraki:** Test ve doğrulama

---

## 🔴 YÜKSEK ÖNCELİK (Zorunlu)

### 1. Firestore Rules Deploy ✅/❌
**Durum:** ⏳ Deploy edilmeli  
**Test:**
```bash
firebase deploy --only firestore:rules
```

**Beklenen:**
```
✔  firestore: rules deployed successfully
```

**Sonrasında Test:**
```bash
curl http://localhost:5174/api/categories
# Beklenen: {"data":[],"pagination":{...}} veya kategori listesi
# Hata: "Missing or insufficient permissions" → Rules deploy edilmemiş
```

---

### 2. Firestore Indexes Deploy ✅/❌
**Durum:** ⏳ Deploy edilmeli  
**Test:**
```bash
firebase deploy --only firestore:indexes
```

**Beklenen:**
```
✔  firestore: indexes deployed successfully
```

**Not:** Index oluşturma 1-5 dakika sürebilir. Firebase Console'dan durumu kontrol edin.

---

### 3. API Endpoints Test ✅/❌
**Durum:** ⏳ Rules deploy sonrası test edilmeli

#### 3.1. Health Check ✅
```bash
curl http://localhost:5174/api/health
```
**Beklenen:** `{"ok":true}` ✅ (Zaten çalışıyor)

#### 3.2. Categories API
```bash
# Liste
curl http://localhost:5174/api/categories

# Search
curl "http://localhost:5174/api/categories?q=elektrik"

# Suggest
curl -X POST http://localhost:5174/api/categories/suggest \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"elektrik kablosu\"}"
```
**Beklenen:** 
- Rules deploy öncesi: `{"error":"Missing or insufficient permissions"}`
- Rules deploy sonrası: `{"data":[],"pagination":{...}}` veya kategori listesi

#### 3.3. Tax Offices API
```bash
# İl listesi
curl http://localhost:5174/api/tax-offices/provinces

# Vergi daireleri
curl "http://localhost:5174/api/tax-offices?province=ANKARA"
```
**Beklenen:**
- Rules deploy öncesi: `{"error":"Missing or insufficient permissions"}`
- Rules deploy sonrası: `[]` veya vergi daireleri listesi

---

### 4. Harita (OpenStreetMap) Test ✅/❌
**Durum:** ⏳ Manuel test gerekli

**Test Adımları:**
1. Tarayıcıda `settings.html` açın
2. Adres ayarları sayfasına gidin
3. Harita bölümünü kontrol edin:
   - ✅ Harita görünüyor mu? (OpenStreetMap tile'ları)
   - ✅ Marker doğru konumda mı?
   - ✅ "Adresi Doğrula" butonu çalışıyor mu?
   - ✅ Geocoding çalışıyor mu? (adres → koordinat)

**Beklenen:**
- Leaflet.js haritası görünmeli
- Nominatim geocoding çalışmalı
- Marker ve popup görünmeli

**Hata Kontrolü:**
- Browser console'da hata var mı?
- Leaflet.js yüklendi mi?
- Network tab'de Nominatim istekleri başarılı mı?

---

## 🟡 ORTA ÖNCELİK (Önerilen)

### 5. In-Memory Cache Test ✅/❌
**Durum:** ⏳ API testleri sırasında otomatik test edilebilir

**Test:**
```bash
# İlk istek (cache miss)
curl http://localhost:5174/api/categories
# Response time: ~X ms

# İkinci istek (cache hit - daha hızlı olmalı)
curl http://localhost:5174/api/categories
# Response time: ~Y ms (Y < X olmalı)
```

**Beklenen:**
- İlk istek: Firestore'dan veri çekilir
- İkinci istek: Cache'den veri döner (daha hızlı)

---

### 6. Migration Script Test ✅/❌
**Durum:** ⏳ Opsiyonel (PostgreSQL'de veri varsa)

**Test:**
```bash
# PostgreSQL'in çalıştığından emin olun
tsx scripts/migrate-postgres-to-firestore.ts
```

**Beklenen:**
```
📦 Starting PostgreSQL → Firestore migration...
📦 Migrating categories...
📦 Found X categories
✅ Migrated X categories
📦 Migrating category keywords...
📦 Found Y keywords
✅ Migrated Y keywords
📦 Migrating tax offices...
📦 Found Z tax offices
✅ Migrated Z tax offices
✅ Migration completed successfully!
```

**Not:** Eğer PostgreSQL'de veri yoksa, bu adımı atlayabilirsiniz.

---

## 🟢 DÜŞÜK ÖNCELİK (İyileştirme)

### 7. Otomatik Test Script ✅/❌
**Durum:** ⏳ Test edilmeli

**Test:**
```bash
npm run test:migration-api
```

**Beklenen:**
```
📦 Testing Health Check...
✅ Health Check: OK (200)
📦 Testing Categories List...
✅ Categories List: OK (200)
📦 Testing Categories Search...
✅ Categories Search: OK (200)
...
✅ All tests passed!
```

---

### 8. Performance Test ✅/❌
**Durum:** ⏳ İyileştirme için

**Test:**
- API response time'ları ölçün
- Cache hit/miss oranlarını kontrol edin
- Firestore query performansını kontrol edin

---

## 📋 TEST CHECKLIST

### Ön Hazırlık
- [ ] API server çalışıyor (`npm run dev:api`)
- [ ] Firebase CLI yüklü (`firebase --version`)
- [ ] Firebase'e login olundu (`firebase login`)

### Zorunlu Testler
- [ ] Firestore rules deploy edildi
- [ ] Firestore indexes deploy edildi
- [ ] Health check çalışıyor
- [ ] Categories API çalışıyor
- [ ] Tax Offices API çalışıyor
- [ ] Harita görünüyor (OpenStreetMap)

### Opsiyonel Testler
- [ ] In-memory cache çalışıyor
- [ ] Migration script çalışıyor (eğer PostgreSQL'de veri varsa)
- [ ] Otomatik test script çalışıyor
- [ ] Performance test yapıldı

---

## 🚀 HIZLI TEST SIRASI

1. **Rules Deploy** (2 dakika)
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Indexes Deploy** (2 dakika)
   ```bash
   firebase deploy --only firestore:indexes
   ```

3. **API Test** (1 dakika)
   ```bash
   curl http://localhost:5174/api/categories
   curl http://localhost:5174/api/tax-offices/provinces
   ```

4. **Harita Test** (2 dakika)
   - Tarayıcıda `settings.html` aç
   - Harita görünüyor mu kontrol et

**Toplam Süre:** ~7 dakika

---

## ⚠️ BEKLENEN HATALAR VE ÇÖZÜMLERİ

### 1. "Missing or insufficient permissions"
**Sebep:** Firestore rules deploy edilmemiş  
**Çözüm:** `firebase deploy --only firestore:rules`

### 2. "Index not found"
**Sebep:** Firestore indexes deploy edilmemiş veya henüz oluşturulmamış  
**Çözüm:** `firebase deploy --only firestore:indexes` ve birkaç dakika bekleyin

### 3. Harita görünmüyor
**Sebep:** Leaflet.js yüklenmemiş veya container height ayarlanmamış  
**Çözüm:** Browser console'u kontrol edin, CSS'i kontrol edin

### 4. Geocoding çalışmıyor
**Sebep:** Nominatim rate limit veya network hatası  
**Çözüm:** Rate limit bekleyin (1 request/second), network'i kontrol edin

---

**🎯 Öncelik: Rules ve Indexes deploy → API test → Harita test**

