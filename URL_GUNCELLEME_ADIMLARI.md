# 🔄 URL Güncelleme Adımları

## ✅ Yapılan Güncelleme

URL güncellendi:
```javascript
const endpoint = "https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm";
```

---

## 🧪 Test

### 1. Tarayıcıda Test Edin

Bu URL'i tarayıcıda açın:
```
https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
```

**Beklenen sonuç:**
```
exportPurchaseForm OK (use POST for Excel).
```

**Eğer 404 görürseniz:**
- Function deploy edilmemiş olabilir
- URL formatı farklı olabilir

---

## 🔧 Eğer Hala 404 Alırsanız

### Seçenek 1: Firebase Console'dan URL'i Alın

1. https://console.firebase.google.com → **teklifbul** projesi
2. **Functions** → **Functions** menüsü
3. `exportPurchaseForm` function'ını bulun
4. **URL** veya **Trigger** kolonundaki URL'i kopyalayın
5. `demand-detail.html` satır 3995'teki URL'i değiştirin

### Seçenek 2: Yeniden Deploy Edin

```bash
firebase deploy --only functions:excel-export
```

Deploy çıktısında URL'i göreceksiniz:
```
Function URL: https://[GERÇEK-URL]
```

Bu URL'i kopyalayıp `demand-detail.html`'de güncelleyin.

---

## 📝 Doğru URL Formatları

### Firebase Functions v1
```
https://[region]-[project-id].cloudfunctions.net/[function-name]
```

Örnek:
```
https://us-central1-teklifbul.cloudfunctions.net/exportPurchaseForm
```

### Firebase Functions v2 (Cloud Run)
```
https://[function-name]-[hash]-[region].a.run.app
```

Örnek:
```
https://exportpurchaseform-vsh2lbzujq-uc.a.run.app
```

---

## ✅ Başarı Kontrolü

1. URL'i tarayıcıda açın → Mesaj görünüyor mu?
2. `demand-detail.html` → "Excel İndir" → Çalışıyor mu?
3. Network tab → 200 OK görünüyor mu?

Hepsi ✅ ise, URL doğru!

---

**Son Güncelleme:** 2025-10-31  
**Durum:** URL güncellendi, test edilmeli

