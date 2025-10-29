# TEST SCENARIOS - Multi-Role Company Features

## 🎯 Test Senaryoları

### 1. Çok Rollü Firma Desteği
- [ ] Firma hem alıcı hem tedarikçi olarak kayıt olabilir
- [ ] Firma rolleri: `roles: { buyer: true, supplier: true }`
- [ ] Kategoriler: `categories: ["elektrik", "makine"]`
- [ ] Gruplar: `groupIds: ["TR-ANKARA", "AUTO"]`

### 2. Talep Yönlendirme
- [ ] Talep oluşturulduğunda kategori ve grup bilgileri kaydedilir
- [ ] Publish edildiğinde `publishDemandAndMatchSuppliers` çalışır
- [ ] Kategori eşleşmesi: `users.categories array-contains-any demand.categories`
- [ ] Grup eşleşmesi: `users.groupIds array-contains-any demand.groupIds`
- [ ] `demandRecipients` koleksiyonunda eşleştirmeler oluşturulur

### 3. Talepler Sayfası (demands.html)
- [ ] **Gelen Talepler** sekmesi:
  - `demandRecipients.where('supplierId','==', uid)` sorgusu çalışır
  - Talep detayları join edilir
  - Liste doğru sıralanır (matchedAt desc)
- [ ] **Giden Talepler** sekmesi:
  - `demands.where('createdBy','==', uid)` sorgusu çalışır
  - Liste doğru sıralanır (createdAt desc)

### 4. Teklifler Sayfası (bids.html)
- [ ] **Gelen Teklifler** sekmesi:
  - Firmamın taleplerine gelen teklifler
  - `demands.where('createdBy','==', uid)` → `bids.where('demandId','==', id)`
  - Tedarikçi firma adları gösterilir
- [ ] **Gönderdiğim Teklifler** sekmesi:
  - `bids.where('supplierId','==', uid)` sorgusu çalışır
  - Alıcı firma adları gösterilir

### 5. Header ve Navigasyon
- [ ] Tüm sayfalarda header görünür
- [ ] Firma adı doğru gösterilir
- [ ] Çıkış butonu çalışır
- [ ] Saat gösterimi çalışır

### 6. Firestore Index'leri
- [ ] `bids → demandId (ASC), createdAt (DESC)`
- [ ] `bids → supplierId (ASC), createdAt (DESC)`
- [ ] `demandRecipients → supplierId (ASC), matchedAt (DESC)`
- [ ] `demands → createdBy (ASC), createdAt (DESC)`
- [ ] `users → isActive (ASC), roles.supplier (ASC), categories (CONTAINS)`
- [ ] `users → isActive (ASC), roles.supplier (ASC), groupIds (CONTAINS)`

### 7. Hata Yakalama
- [ ] Index eksikliği durumunda kullanıcı dostu mesaj
- [ ] Permission denied durumunda uygun yönlendirme
- [ ] Network hatalarında retry mekanizması

## 🔧 Test Adımları

### Adım 1: Migration
```bash
# Users koleksiyonunu güncelle
node migrate-users-multi-role.js
```

### Adım 2: Deployment
```bash
# Firestore rules ve index'leri deploy et
firebase deploy --only firestore:rules,firestore:indexes
```

### Adım 3: Test Kullanıcıları
1. **Alıcı Firma**: Kategori: ["elektrik"], Grup: ["TR-ANKARA"]
2. **Tedarikçi Firma**: Kategori: ["elektrik", "makine"], Grup: ["TR-ANKARA"]
3. **Çok Rollü Firma**: Hem alıcı hem tedarikçi

### Adım 4: Test Senaryoları
1. Çok rollü firma olarak talep oluştur
2. Kategori ve grup bilgilerini ekle
3. Talebi publish et
4. Eşleştirmelerin oluştuğunu kontrol et
5. Teklifler sayfasında gelen teklifleri kontrol et
6. Başka firma olarak teklif ver
7. Teklifler sayfasında gönderdiğim teklifleri kontrol et

## 🐛 Bilinen Sorunlar ve Çözümler

### Index Hatası
**Sorun**: "The query requires an index"
**Çözüm**: Firebase Console'da "Create index" linkine tıkla, "Ready" olunca sayfayı yenile

### Permission Denied
**Sorun**: "Missing or insufficient permissions"
**Çözüm**: Firestore rules'ları kontrol et, kullanıcı rolleri doğru mu?

### Eşleştirme Çalışmıyor
**Sorun**: `demandRecipients` oluşturulmuyor
**Çözüm**: 
- Kullanıcıların `isActive: true` olduğunu kontrol et
- Kategori ve grup bilgilerinin doğru olduğunu kontrol et
- `roles.supplier: true` olduğunu kontrol et

## 📊 Başarı Kriterleri

- [ ] Publish edilen talep, kategori/grup eşleşmesiyle ilgili tüm firmalara `demandRecipients` oluşturuyor
- [ ] Tüm Talepler'de Gelen/Giden sekmeleri doluyor
- [ ] Teklifler sayfasında Gelen Teklifler: firmamın taleplerine gelen teklifler listeleniyor
- [ ] Teklifler sayfasında Gönderdiğim Teklifler: firmamın verdiği teklifler listeleniyor
- [ ] Ana sayfadaki talepten gelen teklifler, Teklifler > Gelen Teklifler listesinde de görülüyor
- [ ] Header tüm sayfalarda var; hatalarda UI kaybolmuyor
- [ ] `serverTimestamp()` hatası yok
