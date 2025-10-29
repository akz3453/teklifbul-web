# ⚡ Quick Start Guide - Talep Detay Revizyonu

## 🎯 Hemen Başla (5 Dakika)

### Step 1: Firebase Console - Firestore Rules (2 dk)

1. **Firebase Console'u aç:** https://console.firebase.google.com
2. **Projen:** `teklifbul`
3. **Sol menü:** Firestore Database → **Rules** sekmesi
4. **Aşağıdaki kodu yapıştır:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    // Bir talebi görebilir miyim?
    function canReadDemand(demandPath) {
      return isSignedIn() && (
        get(demandPath).data.createdBy == request.auth.uid ||
        (get(demandPath).data.published == true && 
         request.auth.uid in get(demandPath).data.viewerIds)
      );
    }

    // USERS
    match /users/{uid} {
      allow read: if isSignedIn() && request.auth.uid == uid;
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    // DEMANDS (header)
    match /demands/{id} {
      // SADECE sahibi veya viewerIds içindekiler okuyabilir
      allow read: if canReadDemand(/databases/$(database)/documents/demands/$(id));

      // CREATE: sadece girişli ve createdBy == uid
      allow create: if isSignedIn()
        && request.resource.data.createdBy == request.auth.uid;

      // UPDATE/DELETE: sadece sahibi
      allow update, delete: if isSignedIn()
        && resource.data.createdBy == request.auth.uid;
    }

    // ITEMS
    match /demands/{id}/items/{itemId} {
      // Okuma: talebi görebilen herkes görür
      allow read: if canReadDemand(/databases/$(database)/documents/demands/$(id));

      // Yazma: sadece talebin sahibi
      allow create, update, delete: if isSignedIn()
        && get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }

    // BIDS
    match /bids/{bidId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn()
        && resource.data.supplierId == request.auth.uid;
    }

    // FILE METADATA (sub-collection)
    match /demands/{id}/files/{fileId} {
      allow read: if isSignedIn() && (
        get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid ||
        (get(/databases/$(database)/documents/demands/$(id)).data.published == true &&
         request.auth.uid in get(/databases/$(database)/documents/demands/$(id)).data.viewerIds)
      );
      allow create, delete: if isSignedIn() &&
        get(/databases/$(database)/documents/demands/$(id)).data.createdBy == request.auth.uid;
    }
  }
}
```

5. **Publish** butonuna tıkla ✅

---

### Step 2: Firebase Console - Storage Rules (1 dk)

1. **Sol menü:** Storage → **Rules** sekmesi
2. **Eğer Storage aktif değilse:** "Get Started" tıkla → Test mode → Enable
3. **Aşağıdaki kodu yapıştır:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /demands/{demandId}/{uploaderId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        request.auth.uid == uploaderId &&
        firestore.get(/databases/(default)/documents/demands/$(demandId)).data.createdBy == request.auth.uid;
    }
  }
}
```

4. **Publish** butonuna tıkla ✅

---

### Step 3: Firebase Console - Indexes (2 dk)

#### Index 1: demands - createdBy + createdAt

1. **Firestore Database → Indexes** → **Create Index**
2. **Collection ID:** `demands`
3. **Fields to index:**
   - Field: `createdBy`, Order: **Ascending**
   - Field: `createdAt`, Order: **Descending**
4. **Create** tıkla

#### Index 2: demands - viewerIds + createdAt

1. **Create Index** (yeni)
2. **Collection ID:** `demands`
3. **Fields to index:**
   - Field: `viewerIds`, Order: **Array**
   - Field: `createdAt`, Order: **Descending**
4. **Create** tıkla

#### Index 3: files (collection group) - createdAt

1. **Create Index** (yeni)
2. **Collection ID:** `files`
3. **Query scope:** ⚠️ **Collection group** seç
4. **Fields to index:**
   - Field: `createdAt`, Order: **Descending**
5. **Create** tıkla

⏳ **2-5 dakika bekle** (index'ler build oluyor)

---

## ✅ Test Et (3 Dakika)

### Test 1: Taslak Talep Oluştur
```
1. Buyer olarak login
2. Yeni talep oluştur
3. Detay sayfasında "Taslak" durumu gör ✅
4. Dosya yükleme alanı görünür ✅
```

### Test 2: Dosya Yükle
```
1. Bir PDF seç
2. "Yükle" tıkla
3. Dosya listede görünsün ✅
4. "İndir" tıkla → dosya açılsın ✅
```

### Test 3: Gönder
```
1. "Tedarikçilere Gönder" tıkla
2. Modal açılsın → "Evet, Gönder" tıkla
3. Durum "Gönderildi" olsun ✅
4. Gönderim tarihi görünsün ✅
```

### Test 4: Export
```
1. "PDF İndir" tıkla → PDF açılsın ✅
2. "Excel İndir" tıkla → XLSX insin ✅
```

### Test 5: Tedarikçi Görünümü
```
1. Logout → Supplier olarak login
2. Talep listesinde yayınlanmış talebi gör ✅
3. Detay sayfasında:
   - Özet kartı görünsün ✅
   - Teklif verme formu görünsün ✅
   - Dosya yükleme alanı GÖRÜNMESIN ✅
   - Export butonları GÖRÜNMESIN ✅
```

---

## 🎉 Tamamlandı!

Artık sisteminiz:
- ✅ Taslak/Gönderildi durumlarını destekliyor
- ✅ Dosya yükleme/indirme/silme çalışıyor
- ✅ PDF ve Excel export yapabiliyor
- ✅ Tedarikçiler sadece yayınlanmış talepleri görüyor

---

## 📚 Ek Kaynaklar

- **Detaylı Deployment:** `DEPLOYMENT_GUIDE.md`
- **Özellikler:** `FEATURES_GUIDE.md`
- **Değişiklikler:** `CHANGELOG.md`

---

## ⚠️ Sorun mu var?

### "Missing or insufficient permissions"
→ Firestore ve Storage rules'u publish ettin mi?

### "The query requires an index"
→ Index'ler build oldu mu? (2-5 dakika)  
→ Firebase Console → Firestore → Indexes → Status: "Enabled" olmalı

### Dosya yüklenmiyor
→ Storage aktif mi?  
→ Storage rules publish edildi mi?

### Tedarikçi talebi görmüyor
→ "Tedarikçilere Gönder" butonuna tıkladın mı?  
→ `published: true` olmalı

---

## 🚀 Production'a Al

Tüm testler başarılı ise:
```
✅ Rules publish edildi
✅ Indexes build oldu
✅ Test senaryoları geçti
✅ Kullanıcılar bilgilendirildi

→ Production'a deploy et!
```

**Kolay gelsin! 🎊**
