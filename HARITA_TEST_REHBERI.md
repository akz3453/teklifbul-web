# 🗺️ HARITA TEST REHBERİ - OpenStreetMap (Leaflet.js)

**Durum:** Kod hazır ✅  
**Test:** Manuel test gerekli

---

## 📋 TEST ADIMLARI

### 1. Sayfayı Aç
1. Tarayıcıda `settings.html` dosyasını açın
2. Veya Vite server çalışıyorsa: `http://localhost:5173/settings.html`

### 2. Adres Ayarları Sayfasına Git
1. Sol menüden "Adres Ayarları" sekmesine tıklayın
2. Veya direkt URL: `settings.html#address`

### 3. Harita Kontrolü

#### ✅ Kontrol Edilecekler:

1. **Leaflet.js Yüklendi mi?**
   - Browser Console'u açın (F12)
   - Hata var mı kontrol edin
   - `L` (Leaflet) global değişkeni tanımlı mı?

2. **Harita Görünüyor mu?**
   - Harita container'ı görünüyor mu?
   - OpenStreetMap tile'ları yükleniyor mu?
   - Harita interaktif mi? (zoom, pan çalışıyor mu?)

3. **Marker Görünüyor mu?**
   - Adres varsa marker görünüyor mu?
   - Marker doğru konumda mı?
   - Marker'a tıklayınca popup açılıyor mu?

4. **Geocoding Çalışıyor mu?**
   - "Adresi Doğrula" butonuna tıklayın
   - Adres geocoding yapılıyor mu?
   - Harita güncelleniyor mu?

---

## 🧪 TEST SENARYOLARI

### Senaryo 1: Mevcut Adres Varsa
1. Kullanıcı adresi kayıtlıysa
2. Harita otomatik yüklenmeli
3. Marker görünmeli
4. Popup'ta adres bilgisi olmalı

### Senaryo 2: Yeni Adres Ekleme
1. Yeni adres girin (örn: "İstanbul, Kadıköy")
2. "Adresi Doğrula" butonuna tıklayın
3. Harita güncellenmeli
4. Marker yeni konuma taşınmalı

### Senaryo 3: Geocoding Hata Durumu
1. Geçersiz adres girin (örn: "asdfghjkl")
2. "Adresi Doğrula" butonuna tıklayın
3. Hata mesajı görünmeli
4. Harita varsayılan konumda kalmalı (İstanbul)

---

## ⚠️ BEKLENEN DURUMLAR

### ✅ Başarılı Durum
- Harita görünüyor
- Marker görünüyor
- Geocoding çalışıyor
- Popup açılıyor
- Zoom/Pan çalışıyor

### ❌ Hata Durumları

#### 1. "Leaflet.js yüklenemedi"
**Sebep:** CDN'den yüklenemedi  
**Çözüm:** 
- İnternet bağlantısını kontrol edin
- Browser console'da hata var mı kontrol edin
- Sayfayı yenileyin

#### 2. "Geocoding failed"
**Sebep:** Nominatim API rate limit veya network hatası  
**Çözüm:**
- 1 saniye bekleyin (rate limit: 1 request/second)
- İnternet bağlantısını kontrol edin
- Adresi daha spesifik yazın

#### 3. Harita görünmüyor
**Sebep:** Container height ayarlanmamış veya CSS hatası  
**Çözüm:**
- Browser console'u kontrol edin
- Container'ın height'ı ayarlı mı kontrol edin
- CSS yüklenmiş mi kontrol edin

---

## 🔍 BROWSER CONSOLE KONTROLÜ

### Beklenen Console Çıktıları:
```javascript
// Leaflet.js yüklendi
typeof L !== 'undefined' // true olmalı

// Harita oluşturuldu
addressMapInstance // Leaflet map instance olmalı

// Geocoding başarılı
✅ Geocoding successful: {lat: 41.0082, lng: 28.9784, display_name: "..."}
```

### Hata Mesajları:
```javascript
// Leaflet.js yüklenemedi
❌ Leaflet.js yüklenemedi. Lütfen sayfayı yenileyin.

// Geocoding hatası
❌ Geocoding error: ...

// Harita container bulunamadı
❌ Map container not found: ...
```

---

## 📊 TEST CHECKLIST

- [ ] Sayfa açılıyor
- [ ] Adres ayarları sekmesi görünüyor
- [ ] Harita container görünüyor
- [ ] Leaflet.js yüklendi (console'da `L` tanımlı)
- [ ] OpenStreetMap tile'ları yükleniyor
- [ ] Harita interaktif (zoom/pan çalışıyor)
- [ ] Marker görünüyor (adres varsa)
- [ ] Marker popup açılıyor
- [ ] "Adresi Doğrula" butonu çalışıyor
- [ ] Geocoding başarılı
- [ ] Harita güncelleniyor (yeni adres)
- [ ] Hata mesajları görünüyor (geçersiz adres)

---

## 🎯 BAŞARI KRİTERLERİ

✅ **Tüm checklist maddeleri başarılı olmalı**

---

## 🚀 HIZLI TEST

1. Tarayıcıda `settings.html` aç
2. F12 → Console'u aç
3. Adres ayarları sekmesine git
4. Harita görünüyor mu kontrol et
5. "Adresi Doğrula" butonuna tıkla
6. Harita güncelleniyor mu kontrol et

**Toplam Süre:** ~2 dakika

---

**🎉 Test tamamlandıktan sonra sonuçları buraya ekleyin!**

