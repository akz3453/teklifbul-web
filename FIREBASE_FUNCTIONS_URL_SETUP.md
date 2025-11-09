# 🔧 Firebase Functions URL Kurulumu

## ✅ Yapılan Güncellemeler

### 1. functions/excel-export/index.js
- ✅ CORS desteği eklendi (Access-Control-Allow-Origin: *)
- ✅ GET/OPTIONS/POST metodları destekleniyor
- ✅ Region: us-central1 ayarlandı
- ✅ GET isteği için health check eklendi

### 2. demand-detail.html
- ✅ Firebase Functions URL'i kullanılacak şekilde güncellendi
- ✅ Payload formatı sadeleştirildi (talep_kodu, items)

---

## 📋 Deploy Sonrası URL Bulma

### Yöntem 1: Firebase Console
1. https://console.firebase.google.com
2. Proje: teklifbul
3. Functions → excel-export → exportPurchaseForm
4. URL'i kopyalayın

### Yöntem 2: Firebase CLI
```bash
firebase functions:list
```

Çıktıda şunu göreceksiniz:
```
excel-export: exportPurchaseForm
  URL: https://exportpurchaseform-[hash]-uc.a.run.app
```

### Yöntem 3: Deploy Log'ları
Deploy sonrası terminal'de URL gösterilir:
```
✅ functions[excel-export/exportPurchaseForm]: Successful update operation.
   URL: https://exportpurchaseform-[hash]-uc.a.run.app
```

---

## 🔄 URL'i Güncelleme

`demand-detail.html` dosyasında şu satırı bulun:

```javascript
const endpoint = "https://exportpurchaseform-vsh2lbzujq-uc.a.run.app"; // Deploy sonrası güncellenecek
```

Deploy sonrası aldığınız gerçek URL ile değiştirin.

---

## 🧪 Test

### 1. Health Check (GET)
Tarayıcıda açın:
```
https://exportpurchaseform-[hash]-uc.a.run.app
```

Beklenen yanıt:
```
exportPurchaseForm OK (use POST for Excel).
```

### 2. Excel Export (POST)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"talep_kodu":"SATFK-TEST","items":[{"name":"Deneme","qty":1,"unit":"adet"}]}' \
  https://exportpurchaseform-[hash]-uc.a.run.app \
  --output SATFK-TEST.xlsx
```

---

## 📝 Deploy Komutları

### Deploy
```bash
firebase deploy --only functions:excel-export
```

### Log Kontrol
```bash
firebase functions:log --only excel-export:exportPurchaseForm
```

---

## ✅ Kontrol Listesi

- [x] functions/excel-export/index.js güncellendi (CORS + GET/OPTIONS)
- [x] demand-detail.html güncellendi (Firebase Functions URL)
- [ ] Deploy edildi
- [ ] Gerçek URL alındı
- [ ] demand-detail.html'de URL güncellendi
- [ ] Test edildi (GET ve POST)

---

**Tarih:** 2025-10-31  
**Durum:** ✅ Kod Hazır, Deploy Sonrası URL Güncellenecek

