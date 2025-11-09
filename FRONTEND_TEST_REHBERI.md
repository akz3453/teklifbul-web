# 🧪 Frontend Test Rehberi

**Tarih:** 2025-11-03  
**Durum:** Sistem yeniden başlatıldı, test için hazır

---

## 🚀 Sistem Durumu

- ✅ Docker Containers: Çalışıyor
- ✅ PostgreSQL: Port 5433
- ✅ Redis: Port 6379
- ✅ API Server: Port 5174 (npm run dev:api)

---

## 📋 Test Adımları

### Test 1: role-select.html - Vergi Dairesi Seçimi

1. **Dosyayı Aç:**
   ```
   file:///C:/Users/faruk/OneDrive/Desktop/teklifbul-web/role-select.html
   ```
   veya tarayıcıda `role-select.html` dosyasını sürükle-bırak

2. **Test Senaryosu:**
   - Sayfa yüklendiğinde "İl" (invoiceIl veya inv_il) alanını bul
   - Bir il seç (örn: **ANKARA**)
   - "Vergi Dairesi" dropdown'ının otomatik dolmasını bekle
   - Dropdown'da vergi dairelerinin göründüğünü kontrol et

3. **Beklenen Sonuç:**
   - ✅ İl seçildikten sonra vergi dairesi dropdown'ı otomatik dolmalı
   - ✅ ANKARA için yaklaşık 36 daire görünmeli
   - ✅ Dropdown'dan bir daire seçilebilmeli

4. **Sorun Giderme:**
   - Browser Console'u aç (F12)
   - Hata var mı kontrol et
   - API çağrısı yapılıyor mu kontrol et:
     ```
     GET /api/tax-offices?province=ANKARA
     ```

---

### Test 2: demand-new.html - Kategori Öneri Sistemi

1. **Dosyayı Aç:**
   ```
   file:///C:/Users/faruk/OneDrive/Desktop/teklifbul-web/demand-new.html
   ```

2. **Test Senaryosu:**
   - Sayfa yüklendiğinde "Açıklama" veya "Not" alanını bul
   - Açıklama alanına şunu yaz:
     ```
     elektrik kablosu motor
     ```
   - 300ms bekleyin (debounce var)
   - Kategori önerilerinin göründüğünü kontrol et

3. **Beklenen Sonuç:**
   - ✅ Açıklama yazıldıktan sonra öneri kartları görünmeli
   - ✅ En iyi öneri: **Makine-İmalat** veya **Elektrik** olmalı
   - ✅ Öneriler skor (% olarak) ile gösterilmeli
   - ✅ "Uygula" butonu ile kategori seçilebilmeli

4. **Sorun Giderme:**
   - Browser Console'u aç (F12)
   - Network tab'ında şu çağrıyı kontrol et:
     ```
     POST /api/categories/suggest
     ```
   - Request body'de `text` parametresi var mı kontrol et

---

## 🔍 Kontrol Listesi

### role-select.html
- [ ] İl seçimi dropdown'ı çalışıyor
- [ ] İl seçildikten sonra vergi dairesi API çağrısı yapılıyor
- [ ] Vergi dairesi dropdown'ı otomatik doluyor
- [ ] Dropdown'dan daire seçilebiliyor
- [ ] Seçilen daire input alanına yazılıyor

### demand-new.html
- [ ] Açıklama alanı var
- [ ] Açıklama yazıldıktan sonra öneri kartları görünüyor
- [ ] Öneriler doğru (örn: "elektrik kablosu" → Elektrik kategorisi)
- [ ] Skorlar gösteriliyor
- [ ] "Uygula" butonu çalışıyor
- [ ] Otomatik seçim çalışıyor (≥70% güven)

---

## 📝 Test Sonuçları

Test sonuçlarını buraya yazabilirsiniz:

### role-select.html
- Durum: ⏳ Test ediliyor
- Notlar: ...

### demand-new.html
- Durum: ⏳ Test ediliyor
- Notlar: ...

---

## 🐛 Bilinen Sorunlar

- **API Server çalışmıyor:** `npm run dev:api` komutunu çalıştırın
- **Vergi dairesi dropdown boş:** Browser Console'da API hatası var mı kontrol edin
- **Kategori önerisi gelmiyor:** Network tab'ında `/api/categories/suggest` çağrısı var mı kontrol edin

---

**Test Edildi:** -  
**Sonuç:** -

