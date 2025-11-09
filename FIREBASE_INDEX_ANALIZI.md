# Firebase Index Analizi - settings.html

## 📊 Mevcut Index'ler (firestore.indexes.json)

### ✅ Kullanılan Index'ler:
1. **demands koleksiyonu** (5 index)
   - `isPublished + createdAt` - Dashboard'da yayınlanmış talepler
   - `creatorCompanyId + isPublished + createdAt` - Şirket bazlı talepler
   - `creatorCompanyId + status + updatedAt` - Durum bazlı talepler
   - `isPublished + categoryTags (CONTAINS) + createdAt` - Kategori filtresi (eski)
   - `isPublished + categoryIds (CONTAINS) + createdAt` - Kategori filtresi (yeni)

2. **users koleksiyonu** (2 index)
   - `contactEmails (CONTAINS)` - E-posta araması
   - `contactPhones (CONTAINS)` - Telefon araması

3. **bids koleksiyonu** (1 index)
   - `supplierId + createdAt` - Tedarikçi teklifleri

4. **companies koleksiyonu** (1 index)
   - `code` - Şirket kodu araması

---

## ⚠️ settings.html'de Kullanılan ve EKSİK Index Gerektiren Sorgular

### 🔴 EKSİK INDEX'LER (Firebase otomatik oluşturuyor):

1. **companies/{companyId}/notifications koleksiyonu**
   ```javascript
   query(
     collection(db, 'companies', companyId, 'notifications'),
     where('type', '==', 'referral_request'),
     where('read', '==', false),
     orderBy('createdAt', 'desc')
   )
   ```
   **Gerekli Index:**
   - Collection: `companies/{companyId}/notifications`
   - Fields: `type (ASC) + read (ASC) + createdAt (DESC)`

2. **companies/{companyId}/notifications koleksiyonu** (2. sorgu)
   ```javascript
   query(
     collection(db, 'companies', companyId, 'notifications'),
     where('type', '==', 'referral_request'),
     where('companyId', '==', requestingCompanyId)
   )
   ```
   **Gerekli Index:**
   - Collection: `companies/{companyId}/notifications`
   - Fields: `type (ASC) + companyId (ASC)`

3. **companies/{companyId}/referralCompanies koleksiyonu**
   ```javascript
   query(
     collection(db, 'companies', companyDoc.id, 'referralCompanies'),
     where('referredCompanyId', '==', companyId),
     where('status', '==', 'pending')
   )
   ```
   **Gerekli Index:**
   - Collection: `companies/{companyId}/referralCompanies`
   - Fields: `referredCompanyId (ASC) + status (ASC)`

---

## ✅ Index Gerektirmeyen Sorgular (Tüm koleksiyon okunuyor):

1. `getDocs(collection(db, 'companies'))` - Tüm şirketler (performans sorunu olabilir!)
2. `getDocs(collection(db, 'users'))` - Tüm kullanıcılar (performans sorunu olabilir!)
3. `getDocs(collection(db, 'taxOffices'))` - Tüm vergi daireleri (küçük koleksiyon, sorun yok)
4. `getDocs(collection(db, 'categories'))` - Tüm kategoriler (küçük koleksiyon, sorun yok)
5. `getDocs(collection(db, 'countries'))` - Tüm ülkeler (küçük koleksiyon, sorun yok)

---

## 🚨 PERFORMANS SORUNLARI

### ❌ Kritik Sorunlar:

1. **Line 1814**: `getDocs(collection(db, 'companies'))`
   - **Sorun:** Tüm şirketleri çekiyor, sonra her birinin `referralCompanies` koleksiyonunu tarıyor
   - **Etki:** Büyük şirket sayısında çok yavaş!
   - **Çözüm:** Alternatif yaklaşım gerekli (notification sistemi veya Cloud Function)

2. **Line 1627**: `getDocs(collection(db, 'users'))`
   - **Sorun:** Tüm kullanıcıları çekiyor, sonra `companyId` ile filtreliyor
   - **Etki:** Büyük kullanıcı sayısında yavaş!
   - **Çözüm:** `where('companyId', '==', myCompanyId)` ile index'li sorgu kullanılmalı

---

## 💡 ÖNERİLER

### 1. Eksik Index'leri Ekleyin:

`firestore.indexes.json` dosyasına şunları ekleyin:

```json
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "type", "order": "ASCENDING"},
    {"fieldPath": "read", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "DESCENDING"}
  ]
},
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "type", "order": "ASCENDING"},
    {"fieldPath": "companyId", "order": "ASCENDING"}
  ]
},
{
  "collectionGroup": "referralCompanies",
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "referredCompanyId", "order": "ASCENDING"},
    {"fieldPath": "status", "order": "ASCENDING"}
  ]
}
```

### 2. Performans Optimizasyonları:

1. **users sorgusu optimizasyonu (Line 1627):**
   ```javascript
   // ESKİ (YAVAŞ):
   const qs = await getDocs(collection(db, 'users'));
   qs.forEach(d => {
     if (d.data()?.companyId !== myCompanyId) return;
     // ...
   });
   
   // YENİ (HIZLI):
   const qs = await getDocs(query(
     collection(db, 'users'),
     where('companyId', '==', myCompanyId)
   ));
   ```

2. **Referans istekleri optimizasyonu (Line 1814):**
   - Mevcut yaklaşım tüm şirketleri çekiyor - bu çok yavaş
   - Alternatif: Notification sistemi kullanılmalı
   - Veya: Cloud Function ile otomatik bildirim oluşturulmalı

---

## 📝 SONUÇ

### Gereksiz Index: YOK
Tüm mevcut index'ler aktif kullanılıyor.

### Eksik Index: 3 adet
Settings.html'deki referans istekleri sorguları için index gerekli.

### Performans Sorunu: 2 adet
- Tüm şirketlerin çekilmesi (Line 1814)
- Tüm kullanıcıların çekilmesi (Line 1627)

Bu sorgular optimize edilmeli!

