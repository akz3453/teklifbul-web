# 🚀 TEST BAŞLATMA REHBERİ

**Durum:** Migration tamamlandı, test aşaması ✅

---

## 🎯 HIZLI BAŞLANGIÇ

### Adım 1: API Server Başlat
```bash
npm run dev:api
```

**Beklenen Çıktı:**
```
✅ API Server started on port 5174
✅ Firestore connected
```

### Adım 2: Otomatik Test Çalıştır
```bash
npm run test:migration
```

Bu test şunları kontrol eder:
- ✅ API health check
- ✅ Categories list
- ✅ Category detail
- ✅ Category suggest
- ✅ Tax offices provinces
- ✅ Tax offices list
- ✅ Cache performance

---

## 📋 MANUEL TEST

### 1. API Endpoints

#### Health Check
```bash
curl http://localhost:5174/api/health
```

#### Categories
```bash
# Liste
curl http://localhost:5174/api/categories

# Search
curl "http://localhost:5174/api/categories?q=elektrik"

# Suggest
curl -X POST http://localhost:5174/api/categories/suggest \
  -H "Content-Type: application/json" \
  -d '{"text":"elektrik kablosu"}'
```

#### Tax Offices
```bash
# İl listesi
curl http://localhost:5174/api/tax-offices/provinces

# Vergi daireleri
curl "http://localhost:5174/api/tax-offices?province=ANKARA"
```

### 2. Harita Test

1. Tarayıcıda `settings.html` açın
2. Adres ayarları sayfasına gidin
3. Harita bölümünü kontrol edin:
   - Harita görünüyor mu?
   - Marker doğru konumda mı?
   - "Adresi Doğrula" butonu çalışıyor mu?

### 3. Firestore Kontrolü

1. Firebase Console → Firestore Database
2. Şu koleksiyonları kontrol edin:
   - `categories`
   - `category_keywords`
   - `tax_offices`

---

## ⚠️ SORUN GİDERME

### API 503 Hatası
- Firestore rules deploy edildi mi?
- Veri migration yapıldı mı?
- Firebase config doğru mu?

### Harita Görünmüyor
- Leaflet.js yüklendi mi?
- Browser console'da hata var mı?
- Container height ayarlandı mı?

---

## ✅ BAŞARI KRİTERLERİ

- [ ] API server çalışıyor
- [ ] Tüm API endpoints çalışıyor
- [ ] Harita görünüyor ve çalışıyor
- [ ] Cache çalışıyor
- [ ] Firestore'da veri var
- [ ] Hata yok

---

**🎯 Test tamamlandıktan sonra production'a deploy edilebilir!**

