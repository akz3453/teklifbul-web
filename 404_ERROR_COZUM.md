# 🔧 404 Error Çözümü

## ❌ Sorun

```
Failed to load resource: the server responded with a status of 404
Error: Page not found
```

## 🔍 Neden Oluyor?

URL yanlış veya function deploy edilmemiş.

---

## ✅ Çözüm Adımları

### Adım 1: Firebase Console'dan Gerçek URL'i Alın

1. https://console.firebase.google.com
2. Proje: **teklifbul**
3. **Functions** → **Functions** menüsüne gidin
4. `exportPurchaseForm` function'ını bulun
5. **Trigger** veya **URL** kolonunda URL'i kopyalayın

**Muhtemel URL formatları:**
```
https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
```
veya
```
https://exportpurchaseform-[hash]-uc.a.run.app
```

### Adım 2: URL'i Güncelleyin

`demand-detail.html` dosyasında satır **3992**'yi bulun:

```javascript
const endpoint = "https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm";
```

Firebase Console'dan aldığınız gerçek URL ile değiştirin.

### Adım 3: Test Edin

1. Güncellenmiş sayfayı yenileyin
2. "Excel İndir" butonuna tıklayın
3. 404 hatası gitmeli

---

## 🔄 Alternatif: Yeniden Deploy

Eğer function deploy edilmemişse:

```bash
firebase deploy --only functions:excel-export
```

Deploy çıktısında URL'i göreceksiniz:
```
✔  functions[excel-export/exportPurchaseForm(us-central1)] Successful update operation.
Function URL: https://[URL-BURAYA]
```

Bu URL'i `demand-detail.html`'de güncelleyin.

---

## 🧪 Test

### 1. Health Check
Tarayıcıda URL'i açın:
```
https://[GERÇEK-URL]
```

**Beklenen:**
```
exportPurchaseForm OK (use POST for Excel).
```

### 2. Frontend Test
`demand-detail.html` → "Excel İndir" → Çalışmalı

---

## 📝 Notlar

- Firebase Functions v1 formatı: `https://[region]-[project-id].cloudfunctions.net/[function-name]`
- Project ID: `teklifbul`
- Region: `us-central1`
- Function name: `exportPurchaseForm`
- Codebase: `excel-export`

---

**En Hızlı Çözüm:** Firebase Console'dan URL'i kopyalayın ve `demand-detail.html`'de güncelleyin.

