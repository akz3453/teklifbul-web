# 🔍 Firebase Function URL'ini Bulma

## ❌ Sorun: 404 Error

URL'de 404 hatası alıyorsunuz. Bu, URL'nin yanlış olabileceği anlamına gelir.

---

## 🔧 Doğru URL'i Bulma Yöntemleri

### Yöntem 1: Firebase Console (En Kolay)

1. **Firebase Console'a gidin:**
   - https://console.firebase.google.com
   - Proje: `teklifbul` seçin

2. **Functions sayfasına gidin:**
   - Sol menüden **Functions** → **Functions** tıklayın

3. **Function'ı bulun:**
   - `exportPurchaseForm` function'ını bulun
   - **URL** veya **Trigger** kolonunda URL'i göreceksiniz

4. **URL formatı:**
   ```
   https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
   ```
   veya
   ```
   https://exportpurchaseform-[hash]-uc.a.run.app
   ```

---

### Yöntem 2: Deploy Çıktısından

**Deploy edin:**
```bash
firebase deploy --only functions:excel-export
```

**Çıktıda şunu göreceksiniz:**
```
✔  functions[excel-export/exportPurchaseForm(us-central1)] Successful update operation.
Function URL: https://[URL-BURAYA]
```

Bu URL'i kopyalayın.

---

### Yöntem 3: Firebase CLI ile

**Project ID'yi bulun:**
```bash
firebase projects:list
```

**URL formatı hesaplayın:**
```
https://us-central1-[PROJECT-ID].cloudfunctions.net/exportPurchaseForm
```

---

## 🔄 URL'i Güncelleme

`demand-detail.html` dosyasında satır 3992'yi bulun:

```javascript
const endpoint = "https://exportpurchaseform-vsh2lbzujq-uc.a.run.app";
```

Doğru URL ile değiştirin.

---

## ⚠️ Önemli Not

Firebase Functions v1 için URL formatı:
```
https://[region]-[project-id].cloudfunctions.net/[function-name]
```

Örnek:
```
https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
```

---

## ✅ Test

URL'i güncelledikten sonra:

1. Tarayıcıda açın: `https://[DOĞRU-URL]`
2. "exportPurchaseForm OK (use POST for Excel)." mesajı görünmeli
3. 404 hatası gitmeli

---

**Sonraki Adım:** Firebase Console'dan URL'i alın ve `demand-detail.html`'de güncelleyin.

