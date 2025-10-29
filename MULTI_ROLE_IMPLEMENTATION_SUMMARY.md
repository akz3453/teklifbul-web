# Teklifbul Çok-Rollü Firma + Yönlendirme + Teklifler Ekranı

## 🎯 Özellikler

### ✅ Çok-Rollü Firma Desteği
- Firmalar hem alıcı hem tedarikçi olabilir
- `roles: { buyer: boolean, supplier: boolean }` yapısı
- Kategori ve grup bazlı eşleştirme

### ✅ Talep Yönlendirme
- Talep, firma gruplarına ve kategorilere göre ilgili firmalara gider
- Kategori eşleşmesi: `users.categories array-contains-any demand.categories`
- Grup eşleşmesi: `users.groupIds array-contains-any demand.groupIds`
- `demandRecipients` koleksiyonunda eşleştirmeler

### ✅ Teklifler Sayfası
- **Gelen Teklifler**: Firmamın taleplerine gelen teklifler
- **Gönderdiğim Teklifler**: Firmamın verdiği teklifler
- Ana sayfadaki talepten verilen teklifler "Gelen Teklifler" sekmesinde görünür

### ✅ Header ve Navigasyon
- Tüm sayfalarda tutarlı header
- Dashboard / Talepler / Teklifler / Ayarlar / Çıkış / Firma
- Hatalarda UI kaybolmuyor

## 📁 Değişen Dosyalar

### 🔧 Core Files
- `demand-detail.html` - `publishDemandAndMatchSuppliers` fonksiyonu eklendi
- `header.js` - Export edilebilir `setupHeader` fonksiyonu
- `firestore.rules` - `demandRecipients` koleksiyonu için kurallar
- `firestore.indexes.json` - Gerekli index'ler eklendi

### 📋 Data Model
- `migrate-users-multi-role.js` - Users koleksiyonu migration script'i
- `deploy-multi-role-features.sh` - Deployment script'i
- `TEST_SCENARIOS_MULTI_ROLE.md` - Test senaryoları

## 🗄️ Veri Sözleşmesi

### users/{uid}
```javascript
{
  companyId: string,
  companyName: string,
  roles: { 
    buyer: boolean, 
    supplier: boolean 
  },
  categories: string[], // kategori slug/ID
  groupIds: string[], // firma grupları
  isActive: boolean
}
```

### demands/{id}
```javascript
{
  createdBy: uid,
  companyId: string,
  categories: string[], // slug/ID
  groupIds: string[], // talebin hedef grup(lar)ı
  isPublished: boolean,
  visibility: "public" | "company" | "private",
  createdAt: Timestamp
}
```

### demandRecipients/{id}
```javascript
{
  demandId: string,
  buyerId: string,
  supplierId: string,
  supplierCompanyId: string,
  matchedAt: Timestamp,
  status: "pending" | "notified" | ...
}
```

### bids/{id}
```javascript
{
  demandId: string,
  supplierId: string,
  buyerId: string,
  price: number,
  leadTimeDays: number,
  brand: string,
  paymentMethod: string,
  status: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## 🚀 Deployment

### 1. Migration
```bash
node migrate-users-multi-role.js
```

### 2. Deploy
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 3. Test
- `TEST_SCENARIOS_MULTI_ROLE.md` dosyasındaki senaryoları takip et

## 🔍 Firestore Index'leri

### Gerekli Index'ler
- `bids → demandId (ASC), createdAt (DESC)`
- `bids → supplierId (ASC), createdAt (DESC)`
- `demandRecipients → supplierId (ASC), matchedAt (DESC)`
- `demands → createdBy (ASC), createdAt (DESC)`
- `users → isActive (ASC), roles.supplier (ASC), categories (CONTAINS)`
- `users → isActive (ASC), roles.supplier (ASC), groupIds (CONTAINS)`

### Index Hatası Çözümü
Firebase Console'da "Create index" linkine tıkla, "Ready" olunca sayfayı yenile.

## 🐛 Hata Yakalama

### Index Hatası
```javascript
if (String(err.message).includes('index')) {
  emptyEl.textContent = 'Index hazırlanıyor. Konsoldaki "Create index"e tıklayıp Ready olunca sayfayı yenileyin.';
}
```

### Permission Denied
```javascript
if (e.code === "permission-denied") {
  alert("Bu talebi görme yetkiniz yok. Lütfen sistem yöneticinizle iletişime geçin.");
}
```

## ✅ Kabul Kriterleri

- [x] Publish edilen talep, kategori/grup eşleşmesiyle ilgili tüm firmalara `demandRecipients` oluşturuyor
- [x] Tüm Talepler'de Gelen/Giden sekmeleri doluyor
- [x] Teklifler sayfasında Gelen Teklifler: firmamın taleplerine gelen teklifler listeleniyor
- [x] Teklifler sayfasında Gönderdiğim Teklifler: firmamın verdiği teklifler listeleniyor
- [x] Ana sayfadaki talepten gelen teklifler, Teklifler > Gelen Teklifler listesinde de görülüyor
- [x] Header tüm sayfalarda var; hatalarda UI kaybolmuyor
- [x] `serverTimestamp()` hatası yok

## 📞 Destek

Herhangi bir sorun durumunda:
1. `TEST_SCENARIOS_MULTI_ROLE.md` dosyasını kontrol et
2. Firebase Console'da Firestore rules ve index'leri kontrol et
3. Browser console'da hata mesajlarını kontrol et
4. Migration script'ini tekrar çalıştır
