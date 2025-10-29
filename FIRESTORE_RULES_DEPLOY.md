# 🔥 Firestore "Missing or Insufficient Permissions" - COMPLETE SOLUTION

## ⚡ CRITICAL: Follow These Steps IN ORDER

---

## 1️⃣ Firestore Rules'u Birebir Yayınla (PUBLISH!)

### 👉 AşAĞIDAKİ ADIMLARI TAKİP ET:

1. **Firebase Console'u aç:**
   - https://console.firebase.google.com/
   - **Projeyi seç:** teklifbul

2. **Firestore Database > Rules** bölümüne git

3. **Aşağıdaki kuralları AYNEN yapıştır:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Talepler (header)
    match /demands/{id} {
      allow read: if true;

      // CREATE: createdBy = giriş yapan olmalı
      allow create: if request.auth != null
        && request.resource.data.createdBy == request.auth.uid;

      // UPDATE/DELETE: sadece sahibi
      allow update, delete: if request.auth != null
        && resource.data.createdBy == request.auth.uid;
    }

    // Talep kalemleri (items)
    match /demands/{id}/items/{itemId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null
        && get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }

    // Teklifler
    match /bids/{bidId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null
        && resource.data.supplierId == request.auth.uid;
    }
  }
}
```

4. **"Publish" (Yayınla) butonuna tıkla** ✅

5. **Sayfayı yenile ve tekrar dene**

⚠️ **EN YAYGIN HATA:** Rules'u değiştirdikten sonra **Publish etmemek**!

---

## 2️⃣ App Check Kontrolü

### App Check Enforce = ON ise ama koda ekli değilse TAM BU HATAYI alırsın!

### 💡 Hızlı Test Çözümü:

1. Firebase Console > **Build** > **App Check**
2. **Cloud Firestore** satırını bul
3. **Enforcement = Off** yap, kaydet (Sadece deneme için)
4. Test et

### 🔒 Üretim Çözümü (firebase.js'e ekle):

```javascript
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js";

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("RECAPTCHA_V3_SITE_KEYİNİZ"),
  isTokenAutoRefreshEnabled: true
});
```

Site key'i App Check sayfasından alın.

---

## 3️⃣ Talep Oluşturma Kodu - Zorunlu Alan ve Sıra

### ✅ DOĞRU SIRA (demand-new.html):

```javascript
const user = await requireAuth(); // GİRİŞ GARANTİ

// 1) HEADER ÖNCE
const headerData = {
  stfNo, stfDate, title, dueDate, priority, currency,
  siteName: siteName || null,
  purchaseLocation: purchaseLocation || null,
  spec: spec || null,
  paymentTerms: paymentTerms || null,
  deliveryCity: deliveryCity || null,
  deliveryAddress: deliveryAddress || null,
  categoryTags: [...chips],
  customCategory: (catInput.value.trim() || null),
  createdBy: user.uid,        // **ŞART**
  createdAt: serverTimestamp()
};

const docRef = await addDoc(collection(db, "demands"), headerData);

// 2) ITEMS SONRA (parent oluştuğu için kurallar geçer)
for (const row of rows) {
  await addDoc(collection(db, "demands", docRef.id, "items"), {
    lineNo, sku, name, brandModel, qty, unit, itemDueDate, notes,
    createdAt: serverTimestamp()
  });
}
```

⚠️ **Hata çoğu kez:**
- `createdBy` header'da yazılmadığı için
- `items`, `header`'dan önce yazıldığı için

---

## 4️⃣ Hızlı Teşhis (Hemen Gör)

### demand-new.html'de Kaydet'in başına şu logları koy:

```javascript
console.log("auth uid:", (await requireAuth()).uid);
console.log("payload.createdBy:", user.uid);
```

### Ve catch'te hatayı detaylı göster:

```javascript
} catch (e) {
  console.error(e);
  alert(`❌ Hata: ${e.code || ""} ${e.message || e}`);
}
```

### 🔍 Teşhis Tablosu:

| Log Sonucu | Anlamı | Çözüm |
|------------|---------|--------|
| `auth uid` boş | Kullanıcı girişli değil | `requireAuth()` çağrısını en üste ekle |
| `payload.createdBy` boş | Header'a yazmıyorsun | 3. maddedeki örneği uygula |
| Hâlâ `permissions` | App Check veya Rules | 1. ve 2. maddeyi kontrol et |

---

## 5️⃣ Küçük ama Kritik Kontroller

### ✅ Kontrol Listesi:

- [ ] Sayfayı `http://localhost:5500` üzerinden çalıştır (`file://` değil)
- [ ] Project ID `teklifbul` ile aynı mı (firebase.js)?
- [ ] Authorized domains'te `localhost` var (Firebase Auth → Settings → Authorized domains)
- [ ] **Rules Publish ettin mi?** ← EN ÖNEMLİ!

---

## 🛠️ Firebase CLI ile Deploy (Alternatif)

### Kurulum:
```bash
npm install -g firebase-tools
firebase login
```

### Deploy:
```bash
cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web
firebase deploy --only firestore:rules
```

---

## 🎯 Son Kontrol Adımları

1. ✅ Rules Publish edildi mi?
2. ✅ App Check OFF mu?
3. ✅ `createdBy: user.uid` header'da var mı?
4. ✅ Header önce, items sonra mı?
5. ✅ `await requireAuth()` en üstte mi?
6. ✅ `http://localhost:5500` kullanılıyor mu?

---

## 🔴 Hâlâ Hata Alıyorsan

1. **Browser Console'u aç (F12)**
2. **Network sekmesine git**
3. **Firestore isteğini bul**
4. **Request Payload'a bak:**
   - `createdBy` alanı var mı?
   - Değeri doğru uid mi?
5. **Response'u oku:**
   - Hata kodu nedir?
   - Mesaj ne diyor?

**Eğer çözemezsen, Console screenshot'unu paylaş!**
