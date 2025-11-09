# 🔒 CSP DÜZELTME - Leaflet.js Yükleme Sorunu

**Sorun:** Leaflet.js yüklenemiyor - CSP hatası  
**Çözüm:** `vite.config.ts` dosyasındaki CSP'ye `unpkg.com` eklendi

---

## ✅ YAPILAN DEĞİŞİKLİKLER

### 1. vite.config.ts - CSP Güncellendi
**ÖNCE:**
```typescript
'Content-Security-Policy': "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://cdnjs.cloudflare.com https://maps.googleapis.com;"
```

**SONRA:**
```typescript
'Content-Security-Policy': "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://cdnjs.cloudflare.com https://maps.googleapis.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com;"
```

**Değişiklikler:**
- `https://unpkg.com` eklendi (script-src için)
- `style-src` direktifi eklendi (Leaflet CSS için)

### 2. settings.html - Metin Güncellemeleri
- "Google Maps" → "OpenStreetMap" olarak güncellendi
- Yorum satırları güncellendi

---

## 🔄 SERVER'LARI YENİDEN BAŞLAT

CSP değişikliği için Vite server'ını yeniden başlatmanız gerekiyor:

```bash
# Mevcut server'ı durdur (Ctrl+C)
# Sonra tekrar başlat:
npm run dev
```

---

## ✅ TEST

1. Tarayıcıda http://localhost:5173/settings.html#address aç
2. Browser Console'u kontrol et (F12)
3. Leaflet.js yüklendi mi kontrol et:
   ```javascript
   typeof L !== 'undefined' // true olmalı
   ```
4. Harita görünüyor mu kontrol et

---

**🎉 CSP sorunu çözüldü! Server'ı yeniden başlatın ve test edin.**

