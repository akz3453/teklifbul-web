# ✅ Firebase Functions Deploy Tamamlandı!

## 🎉 Başarılı Deploy

**Function:** `exportPurchaseForm`  
**Codebase:** `excel-export`  
**Region:** `us-central1`  
**Runtime:** Node.js 22 (2nd Gen)  
**URL:** `https://exportpurchaseform-vsh2lbzuja-uc.a.run.app`

---

## ⚠️ Son Adım: IAM İzinleri (403 Çözümü)

Deploy başarılı ama function henüz **herkese açık değil**. İzin vermeniz gerekiyor:

### Firebase Console'dan:

1. **Firebase Console:**
   - https://console.firebase.google.com → **teklifbul**

2. **Functions:**
   - Sol menü: **Functions** → **Functions**
   - `exportPurchaseForm` function'ını bulun

3. **Permissions:**
   - Function'a tıklayın
   - **PERMISSIONS** sekmesi
   - **"Add member"** butonu
   - **New principals:** `allUsers`
   - **Role:** `Cloud Run Invoker` (veya `Cloud Functions Invoker`)
   - **Save**

### Veya Google Cloud Console:

1. **Google Cloud Console:**
   - https://console.cloud.google.com → **teklifbul**

2. **Cloud Functions:**
   - Sol menü: **Cloud Functions**
   - `exportPurchaseForm` bulun

3. **Permissions:**
   - Function'a tıklayın
   - **PERMISSIONS** sekmesi
   - **GRANT ACCESS**
   - **New principals:** `allUsers`
   - **Role:** `Cloud Run Invoker`
   - **SAVE**

---

## 🧪 Test (İzin Verildikten Sonra)

### 1. Health Check (GET)
```
https://exportpurchaseform-vsh2lbzuja-uc.a.run.app
```
**Beklenen:** `exportPurchaseForm OK (use POST for Excel).`

### 2. Excel Export (POST) - PowerShell
```powershell
$body = @{
    talep_kodu = "SATFK-TEST"
    stf_no = "STF-01"
    santiye = "Rize"
    items = @(
        @{
            name = "ÇİMENTO 32 KG"
            qty = 10
            unit = "torba"
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "https://exportpurchaseform-vsh2lbzuja-uc.a.run.app" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body `
  -OutFile "export-test.xlsx"
```

**Beklenen:** `export-test.xlsx` dosyası oluşur ve içinde veri var.

### 3. Frontend Test
- `demand-detail.html` sayfasında "Excel İndir" butonuna tıklayın
- Excel dosyası indirilmeli

---

## ✅ Yapılan İşlemler

- [x] functions klasörü temizlendi (node_modules, package-lock.json)
- [x] functions/excel-export klasörü temizlendi
- [x] Her iki codebase için npm install çalıştırıldı
- [x] package.json engines.node = "22" kontrol edildi
- [x] functions/excel-export/index.js güncellendi (CORS + GET/OPTIONS/POST)
- [x] Firebase Functions deploy edildi
- [x] URL frontend'de güncellendi
- [ ] IAM permissions verilmeli (403 çözümü)

---

## 📝 Notlar

- **Function URL:** `https://exportpurchaseform-vsh2lbzuja-uc.a.run.app`
- **Frontend:** `demand-detail.html` güncellendi
- **IAM:** Firebase Console'dan `allUsers` → `Cloud Run Invoker` ekleyin
- **Test:** İzinler verildikten 1-2 dakika sonra test edin

---

## 🔒 Güvenlik

⚠️ **allUsers** = Herkes erişebilir (kimlik doğrulama yok)

İleride:
- Firebase Auth token kontrolü eklenebilir
- Firebase App Check eklenebilir
- Rate limiting eklenebilir

---

**Durum:** ✅ Deploy Başarılı, IAM İzinleri Bekleniyor  
**Tarih:** 2025-10-31

