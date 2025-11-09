# ⚡ HIZLI HARITA TESTİ

## 🎯 3 ADIMDA TEST

### 1️⃣ Sayfayı Aç
```
http://localhost:5173/settings.html
```
veya
```
settings.html (dosyayı direkt aç)
```

### 2️⃣ Adres Ayarları Sekmesine Git
- Sol menüden "Adres Ayarları" tıkla
- Veya `settings.html#address`

### 3️⃣ Kontrol Et
- ✅ Harita görünüyor mu?
- ✅ Marker var mı? (adres varsa)
- ✅ "Adresi Doğrula" butonu çalışıyor mu?

---

## 🔍 BROWSER CONSOLE (F12)

**Beklenen:**
```javascript
typeof L !== 'undefined' // true
```

**Hata varsa:**
- Console'da hata mesajı görünür
- Network tab'de Leaflet.js yüklenmiş mi kontrol et

---

## ⚠️ SORUN GİDERME

### Harita görünmüyor
→ Console'u kontrol et (F12)

### Geocoding çalışmıyor
→ 1 saniye bekleyin (rate limit)

### Marker görünmüyor
→ Adres geçerli mi kontrol et

---

**Toplam Süre: ~2 dakika**

