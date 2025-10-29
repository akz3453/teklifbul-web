# 🔐 ACL (Access Control List) + Kategori Bazlı Paylaşım - Kurulum Kılavuzu

## ✅ Ne Yapıldı?

### 1. **Firestore Security Rules - ACL Uygulandı**
- ❌ **Eski:** `allow read: if true` (herkes her şeyi görürdü)
- ✅ **Yeni:** Sadece yetkili kullanıcılar görebilir

**Yetki Mantığı:**
```javascript
// Bir talebi görebilir miyim?
- Talebi ben oluşturdum (createdBy == auth.uid) VEYA
- viewerIds listesinde benim UID'im var
```

### 2. **Users Collection - Kategori Desteği**
```javascript
users/{uid} {
  role: "buyer" | "supplier",
  categories: string[],  // Tedarikçi kategorileri
  email: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Supplier seçerken:**
- Kategori seçimi ZORUNLU (en az 1)
- Chip sistemiyle çoklu seçim
- Buyer için opsiyonel

### 3. **Demands Collection - viewerIds Eklendi**
```javascript
demands/{id} {
  // ... mevcut alanlar ...
  viewerIds: string[],  // Bu talebi görebilecek UID'ler
  categoryTags: string[],  // Talep kategorileri
  createdBy: string,
  createdAt: timestamp
}
```

**viewerIds nasıl hesaplanır:**
1. Talep oluşturan (owner) otomatik eklenir
2. Talebin categoryTags'ı ile eşleşen supplier'lar bulunur
3. Eşleşen supplier UID'leri viewerIds'e eklenir

### 4. **Otomatik Kategori Eşleştirme**
```javascript
// Talep: categoryTags = ["Elektrik", "Makine-İmalat"]
// Tedarikçi A: categories = ["Elektrik", "Boya"]  ✅ Eşleşir
// Tedarikçi B: categories = ["Ambalaj", "Gıda"]   ❌ Eşleşmez
```

---

## 🚀 Kurulum Adımları (SIRALAMA ÖNEMLİ!)

### ADIM 1: Firestore Rules'u Publish Et

1. **Firebase Console'u aç:**
   https://console.firebase.google.com/

2. **Projeyi seç:** teklifbul

3. **Firestore Database > Rules** git

4. **firestore.rules dosyasındaki kuralları kopyala ve yapıştır**

5. **"Publish" butonuna tıkla** ⚠️ EN ÖNEMLİ ADIM!

### ADIM 2: Mevcut Taleplere viewerIds Ekle (Gerekirse)

Eğer database'de zaten talepler varsa, onlara `viewerIds` eklemen gerekir:

**Firebase Console > Firestore Database:**
- Her `demands` belgesini aç
- `viewerIds` alanı ekle: `[createdBy değeri]`
- Kaydet

**VEYA** tek seferlik script çalıştır (Firebase Functions veya admin SDK ile):
```javascript
const demands = await admin.firestore().collection('demands').get();
for (const doc of demands.docs) {
  await doc.ref.update({
    viewerIds: [doc.data().createdBy]
  });
}
```

### ADIM 3: Kullanıcılara Kategori Ekle (Supplier'lar için)

**Yeni kullanıcılar:** role-select.html otomatik halleder
**Mevcut supplier'lar:** Manuel olarak ekle veya tekrar rol seçimi yapsınlar

---

## 📊 Kullanıcı Akışları

### 🟢 Buyer Akışı:
1. Login/Register
2. Role seçimi: "Alıcı (buyer)" → Kategori opsiyonel
3. Demands listesi: **Sadece kendi talepleri**
4. Talep oluştur → Otomatik viewerIds hesaplanır
5. Detay sayfası: Kendi talebi

### 🔵 Supplier Akışı:
1. Login/Register
2. Role seçimi: "Tedarikçi (supplier)" → **Kategori seçimi ZORUNLU**
   - Chip sistemiyle çoklu kategori
   - Enter'a basarak ekle, ✕ ile çıkar
3. Demands listesi: 
   - **Kendi oluşturduğu talepler** (varsa)
   - **Kategorileriyle eşleşen talepler**
4. Talep detayı: Teklif verebilir

---

## 🔒 Güvenlik Özeti

### Firestore Rules Mantığı:

```javascript
// DEMANDS - Okuma
✅ Sahibi görebilir
✅ viewerIds içindeki kullanıcılar görebilir
❌ Diğer herkes göremez

// DEMANDS - Yazma
✅ Sadece sahibi update/delete yapabilir
✅ CREATE sırasında createdBy == auth.uid olmalı

// ITEMS (sub-collection)
✅ Parent demand'i görebilen herkes items'ı görebilir
✅ Sadece demand sahibi items ekleyebilir/değiştirebilir

// BIDS
✅ Herkes okuyabilir (gerekirse sıkılaştırılabilir)
✅ Herkes teklif verebilir
✅ Sadece teklif sahibi kendi teklifini güncelleyebilir
```

---

## 🧪 Test Senaryoları

### Test 1: Buyer Talep Oluşturur
```
1. Buyer login
2. Talep oluştur: categoryTags = ["Elektrik"]
3. viewerIds otomatik hesaplanır
4. Elektrik kategorisindeki supplier'lar bu talebi görür
```

### Test 2: Supplier Listede Görür
```
1. Supplier login (categories = ["Elektrik", "Makine"])
2. Demands listesi:
   - Elektrik veya Makine kategorili talepler görünür
   - Diğer kategoriler görünmez
3. Detaya gir → Teklif ver
```

### Test 3: Yetki Kontrolü
```
1. Supplier A login (categories = ["Ambalaj"])
2. Elektrik kategorili talep ID'sini bilse bile:
   - Liste'de görünmez
   - URL'den direkt gitmeye çalışırsa:
     → "Bu talebi görme yetkiniz yok" mesajı
     → demands.html'e yönlendirilir
```

---

## 🐛 Olası Hatalar ve Çözümleri

### ❌ "Missing or insufficient permissions"

**Sebep:** Rules publish edilmedi
**Çözüm:** Firebase Console > Firestore > Rules > Publish

### ❌ "Bu talebi görme yetkiniz yok"

**Sebep 1:** viewerIds hesaplanmamış (eski talep)
**Çözüm:** Talebi tekrar oluştur VEYA manuel viewerIds ekle

**Sebep 2:** Kategoriler eşleşmiyor
**Çözüm:** Supplier'ın categories alanını kontrol et

### ❌ Liste boş görünüyor

**Sebep:** Queries yetersiz
**Çözüm:** 
- Console log kontrolü: `console.log("My demands:", snapA.size)`
- `console.log("Shared demands:", snapB.size)`

### ❌ Supplier kategorileri kayıtlı değil

**Sebep:** Eski kullanıcı, categories alanı yok
**Çözüm:** role-select.html'den tekrar rol seçimi yapsın

---

## 📝 Firestore İndeks Gereksinimi

**Gerekli indexler:**
```
Collection: demands
Fields: createdBy (Ascending), createdAt (Descending)

Collection: demands
Fields: viewerIds (Array), createdAt (Descending)

Collection: users
Fields: role (Ascending), categories (Array)
```

Firebase otomatik önerecektir. Console'da link çıkarsa tıklayıp oluştur.

---

## 🎯 Özet Checklist

- [ ] Firestore Rules publish edildi
- [ ] Mevcut taleplere viewerIds eklendi (varsa)
- [ ] Supplier kullanıcıların categories alanı var
- [ ] App Check OFF (test için) veya implementasyonu var
- [ ] İndeksler oluşturuldu (Firebase link'ten)
- [ ] Test edildi: Buyer sadece kendi taleplerini görüyor
- [ ] Test edildi: Supplier eşleşen talepleri görüyor
- [ ] Test edildi: Yetki olmayan kullanıcı engelleniyor

---

## 💡 İleri Seviye Özelleştirmeler

### Bid'leri de sıkılaştır:
```javascript
// firestore.rules içinde
match /bids/{bidId} {
  allow read: if isSignedIn() && (
    resource.data.supplierId == request.auth.uid ||
    canReadDemand(/databases/$(database)/documents/demands/$(resource.data.demandId))
  );
}
```

### Custom kategori de eşleşsin:
```javascript
// demand-new.html içinde
const allTags = [...categoryTags];
if (customCategory) allTags.push(customCategory);

const q = query(
  collection(db, "users"),
  where("role", "==", "supplier"),
  where("categories", "array-contains-any", allTags.slice(0, 10))
);
```

### Teklif sayısını göster:
```javascript
// demands.html'de
const bidsSnap = await getDocs(
  query(collection(db, "bids"), where("demandId", "==", demandId))
);
const bidCount = bidsSnap.size;
```

---

## 🚀 Sonraki Adımlar

1. ✅ Rules'u publish et
2. ✅ Test kullanıcılarıyla dene
3. ✅ Production'a al
4. 📊 Analytics ekle (kimler ne görüyor)
5. 🔔 Bildirimler (yeni talep geldiğinde)
6. 📧 Email notifications
