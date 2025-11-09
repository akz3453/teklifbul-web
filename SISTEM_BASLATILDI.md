# 🚀 SİSTEM BAŞLATILDI

**Tarih:** 2025-01-XX  
**Durum:** Tüm server'lar çalışıyor ✅

---

## ✅ BAŞLATILAN SERVER'LAR

### 1. API Server ✅
- **Port:** 5174
- **URL:** http://localhost:5174
- **Komut:** `npm run dev:api`
- **Durum:** Çalışıyor

**Test:**
```bash
curl http://localhost:5174/api/health
```

**Endpoints:**
- `http://localhost:5174/api/categories`
- `http://localhost:5174/api/tax-offices`
- `http://localhost:5174/api/health`

### 2. Frontend Server (Vite) ✅
- **Port:** 5173
- **URL:** http://localhost:5173
- **Komut:** `npm run dev`
- **Durum:** Çalışıyor

**Test:**
- Tarayıcıda aç: http://localhost:5173
- Settings: http://localhost:5173/settings.html

---

## 📋 ERİŞİM ADRESLERİ

### Frontend
- **Ana Sayfa:** http://localhost:5173
- **Settings:** http://localhost:5173/settings.html
- **Adres Ayarları:** http://localhost:5173/settings.html#address

### API
- **Health Check:** http://localhost:5174/api/health
- **Categories:** http://localhost:5174/api/categories
- **Tax Offices:** http://localhost:5174/api/tax-offices/provinces

---

## 🧪 TEST ADIMLARI

### 1. API Test
```bash
curl http://localhost:5174/api/health
# Beklenen: {"ok":true}
```

### 2. Frontend Test
1. Tarayıcıda http://localhost:5173 aç
2. Sayfa yükleniyor mu kontrol et

### 3. Harita Test
1. http://localhost:5173/settings.html#address aç
2. Harita görünüyor mu kontrol et
3. "Adresi Doğrula" butonu çalışıyor mu test et

---

## ⚠️ SERVER'LARI DURDURMA

### PowerShell'de:
```powershell
# Tüm node process'lerini durdur
Get-Process node | Stop-Process
```

### Veya:
- Terminal'de `Ctrl+C` tuşlarına basın

---

## 🔍 SORUN GİDERME

### Port Kullanımda
```powershell
# Port kontrolü
netstat -ano | findstr :5173
netstat -ano | findstr :5174
```

### Server Başlamıyor
1. Port'ları kontrol et
2. Node process'lerini durdur
3. Tekrar başlat

---

**🎉 Tüm sistemler çalışıyor! Test edebilirsiniz!**

