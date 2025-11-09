# 🧪 Excel Export Nasıl Test Edilir?

## 🚀 Hızlı Test Yöntemleri

### 1️⃣ Tarayıcıdan Health Check (En Kolay)

1. Tarayıcıda şu URL'i açın:
   ```
   https://exportpurchaseform-vsh2lbzujq-uc.a.run.app
   ```

2. Beklenen sonuç:
   ```
   exportPurchaseForm OK (use POST for Excel).
   ```
   
✅ **Eğer bu mesajı görürseniz:** Backend çalışıyor!

---

### 2️⃣ Frontend'ten Test (Önerilen)

1. **Sayfayı açın:**
   - `demand-detail.html?id=[bir_talep_id]` 
   - Veya mevcut bir talep detay sayfasına gidin

2. **"Excel İndir" butonuna tıklayın**
   - Excel (SATFK) bölümündeki "⬇️ Excel İndir" butonu

3. **Kontrol edin:**
   - ✅ Excel dosyası indirildi mi?
   - ✅ Dosya adı doğru mu? (örn: `SATFK-20251030-RR1E.xlsx`)
   - ✅ Dosya boş değil mi?

4. **Network Tab'ı açın (F12):**
   - POST isteği → `https://exportpurchaseform-vsh2lbzujq-uc.a.run.app`
   - Status: **200 OK** olmalı
   - Response Headers:
     - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
     - `Access-Control-Allow-Origin: *`

---

### 3️⃣ PowerShell ile Terminal Testi

**Komut:**
```powershell
$body = @{
    talep_kodu = "SATFK-TEST"
    stf_no = "STF-1"
    santiye = "Rize"
    items = @(
        @{
            name = "CIMENTO 32 KG"
            qty = 10
            unit = "torba"
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "https://exportpurchaseform-vsh2lbzujq-uc.a.run.app" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body `
  -OutFile "SATFK-TEST.xlsx"
```

**Kontrol:**
```powershell
# Dosya oluştu mu?
Test-Path "SATFK-TEST.xlsx"  # True olmalı

# Dosya boş değil mi?
(Get-Item "SATFK-TEST.xlsx").Length  # 0'dan büyük olmalı
```

✅ **Dosya oluştuysa:** Backend çalışıyor!

---

### 4️⃣ Test Script ile (Otomatik)

**Komut:**
```powershell
.\test-excel-export.ps1
```

Bu script:
- ✅ Health check yapar (GET)
- ✅ Excel export testi yapar (POST)
- ✅ Dosya kontrolü yapar
- ✅ Sonuçları gösterir

---

## 🔍 Detaylı Test Adımları

### Adım 1: Console'u Açın
1. `demand-detail.html` sayfasını açın
2. F12 → Console tab'ını açın

### Adım 2: Network Tab'ını İzleyin
1. F12 → Network tab'ını açın
2. "Excel İndir" butonuna tıklayın
3. İstekleri kontrol edin:
   - ✅ OPTIONS (Preflight) → 204 No Content
   - ✅ POST → 200 OK

### Adım 3: Response Kontrolü
Network tab'da POST isteğine tıklayın:
- **Status:** 200 OK
- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Size:** 0'dan büyük olmalı

### Adım 4: Excel Dosyasını Açın
1. İndirilen `.xlsx` dosyasını açın
2. Kontrol edin:
   - ✅ Talep Kodu satırı var mı?
   - ✅ Ürün Adı, Miktar, Birim kolonları var mı?
   - ✅ Ürün verileri doğru mu?

---

## 🐛 Sorun Çıkarsa

### Problem: "Export failed: 404"
**Sebep:** URL yanlış veya function deploy edilmemiş

**Çözüm:**
1. Firebase Console'da function'ın deploy edildiğini kontrol edin
2. `firebase functions:list` ile URL'i kontrol edin
3. `demand-detail.html`'de URL'i güncelleyin

### Problem: "CORS Error"
**Sebep:** CORS headers yanlış

**Kontrol:**
1. Network → OPTIONS → Response Headers
2. `Access-Control-Allow-Origin: *` var mı?
3. `Access-Control-Allow-Methods: POST, OPTIONS, GET` var mı?

### Problem: "415 Unsupported Media Type"
**Sebep:** Content-Type header eksik

**Kontrol:**
```javascript
headers: {
  "Content-Type": "application/json"  // Bu satır var mı?
}
```

### Problem: "Boş Excel Dosyası"
**Sebep:** Items dizisi boş veya yanlış format

**Kontrol:**
```javascript
console.log("Payload:", payload);
// items bir array mi?
// Her item'da name, qty, unit var mı?
```

---

## ✅ Başarılı Test Kriterleri

- [x] Health check (GET) → "exportPurchaseForm OK" dönüyor
- [x] Excel export (POST) → 200 OK
- [x] Excel dosyası indiriliyor
- [x] Dosya boş değil
- [x] Network tab'da CORS headers görünüyor
- [x] Console'da "✅ Excel indirildi" mesajı var
- [x] Excel dosyası açılıyor ve veri görünüyor

---

## 🎯 Hızlı Test (1 Dakika)

1. Tarayıcıda aç: `https://exportpurchaseform-vsh2lbzujq-uc.a.run.app`
2. Mesaj görünüyor mu? → ✅ Backend çalışıyor
3. `demand-detail.html` aç → "Excel İndir" tıkla
4. Dosya indirildi mi? → ✅ Frontend çalışıyor

**Hepsi bu kadar!** 🎉

---

**Son Güncelleme:** 2025-10-31  
**Test Durumu:** ✅ Hazır

