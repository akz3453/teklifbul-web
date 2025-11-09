# 🧪 Excel Export Test Rehberi

## ✅ Tamamlanan İşlemler

### Backend (Firebase Functions)
- ✅ `functions/excel-export/index.js` → CORS + GET/OPTIONS/POST
- ✅ Region: us-central1
- ✅ Deploy edildi
- ✅ URL: `https://exportpurchaseform-vsh2lbzujq-uc.a.run.app`

### Frontend
- ✅ `demand-detail.html` → Firebase Functions URL kullanıyor
- ✅ Payload formatı: `{ talep_kodu, stf_no, santiye, items }`
- ✅ Blob indirme mantığı çalışıyor

---

## 🧪 Test Senaryoları

### 1. Health Check (GET)

**Tarayıcıda:**
```
https://exportpurchaseform-vsh2lbzujq-uc.a.run.app
```

**Beklenen:**
```
exportPurchaseForm OK (use POST for Excel).
```

### 2. Excel Export Test (POST) - PowerShell

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

**Beklenen:** SATFK-TEST.xlsx dosyası oluşur ve içinde:
- Talep Kodu: SATFK-TEST
- Ürün Adı, Miktar, Birim kolonları
- 1 satır veri (CIMENTO 32 KG, 10, torba)

### 3. Frontend Test (demand-detail.html)

**Adımlar:**
1. Bir talep detay sayfasına gidin
2. "Excel İndir" butonuna tıklayın
3. Excel dosyası indirilmeli

**Network Tab Kontrolü:**
- POST → `https://exportpurchaseform-vsh2lbzujq-uc.a.run.app`
- Status: 200 OK
- Response Headers:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename=[talep_kodu].xlsx`
  - `Access-Control-Allow-Origin: *`

---

## 🐛 Sorun Giderme

### 415 Unsupported Media Type / 400 Bad Request
**Sebep:** Content-Type veya body formatı yanlış

**Çözüm:**
- ✅ Header: `Content-Type: application/json`
- ✅ Body: Valid JSON (stringify edilmiş)

### CORS Error
**Sebep:** Preflight (OPTIONS) başarısız

**Kontrol:**
1. Network tab → OPTIONS request → Status: 204
2. Response headers'da `Access-Control-Allow-Origin: *` var mı?

### Boş Excel Dosyası
**Sebep:** Items dizisi yanlış formatta

**Kontrol:**
- ✅ `items` bir array mi?
- ✅ Her item'da `name`, `qty`, `unit` var mı?
- ✅ Backend log'larını kontrol edin: `firebase functions:log`

### Timeout / Fonksiyon Çok Yavaş
**Sebep:** Çok büyük data (1000+ satır)

**Çözüm (ileride):**
- Streaming kullanın (ExcelJS write(res) ile)
- Batch processing

### 500 Internal Server Error
**Sebep:** Backend hatası

**Kontrol:**
```bash
firebase functions:log --only excel-export:exportPurchaseForm
```

Console'da hata mesajını görün.

---

## 📊 Beklenen Sonuçlar

### Backend Response
```
Status: 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename=[talep_kodu].xlsx
Body: [Excel file binary]
```

### Frontend Behavior
1. ✅ Fetch başarılı (200 OK)
2. ✅ Blob oluşturulur
3. ✅ Download link tıklanır
4. ✅ Excel dosyası indirilir
5. ✅ Console: "✅ Excel indirildi: [filename].xlsx"

---

## 🔒 Güvenlik Notları

**Mevcut Durum:**
- ⚠️ Fonksiyon herkese açık (CORS: *)
- ⚠️ Authentication yok

**Öneriler:**
1. **Firebase Auth:** Request'te Firebase Auth token kontrolü
2. **App Check:** Firebase App Check ile request doğrulama
3. **Rate Limiting:** Aynı IP'den çok fazla istek engelleme
4. **Domain Whitelist:** Sadece belirli domain'lerden erişime izin ver

**Örnek Auth Ekleme:**
```javascript
// functions/excel-export/index.js
const { getAuth } = require("firebase-admin/auth");

// Request'te Authorization header kontrol et
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return res.status(401).send("Unauthorized");
}
const token = authHeader.split('Bearer ')[1];
const decoded = await getAuth().verifyIdToken(token);
// decoded.uid kullanıcı ID'si
```

---

## 📝 Deployment Checklist

- [x] Node.js runtime 22'ye güncellendi
- [x] firebase-functions ve firebase-admin yüklendi
- [x] CORS desteği eklendi
- [x] GET/OPTIONS/POST metodları eklendi
- [x] Frontend URL güncellendi
- [x] Deploy edildi
- [x] Health check test edildi
- [x] Excel export test edildi
- [ ] Auth eklenmesi (opsiyonel)
- [ ] App Check eklenmesi (opsiyonel)

---

**Son Güncelleme:** 2025-10-31  
**Durum:** ✅ Test Edilmeye Hazır

