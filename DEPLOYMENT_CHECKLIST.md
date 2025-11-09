# Stok Takip Sistemi - Deployment Checklist

## ✅ Tamamlanan Dosyalar

### Utilities
- [x] `scripts/lib/tr-utils.js` - TR normalization, wildcard search
- [x] `scripts/inventory-cost.js` - Cost calculations
- [x] `scripts/lib/normalize-tr.js` - (Var olan)

### Pages
- [x] `pages/stock-import.html` - Stok içe aktarım
- [x] `pages/price-update.html` - Toplu fiyat güncelleme
- [x] `pages/stock-movements.html` - Stok hareketleri
- [x] `pages/request-site.html` - ŞMTF oluşturma
- [x] `pages/request-detail.html` - Talep detayı
- [x] `pages/invoice-import.html` - Fatura karşılaştırma
- [x] `pages/reports.html` - Raporlar

### Scripts
- [x] `scripts/stock-import.js`
- [x] `scripts/price-update.js`
- [x] `scripts/stock-movements.js`
- [x] `scripts/request-site.js`
- [x] `scripts/request-detail.js`
- [x] `scripts/invoice-import.js`
- [x] `scripts/invoice-compare.js`
- [x] `scripts/reports.js`

### Documentation
- [x] `INVENTORY_SYSTEM_README.md` - Kullanım kılavuzu
- [x] `INVENTORY_IMPLEMENTATION_SUMMARY.md` - Teknik detaylar
- [x] `inventory-index.html` - Ana navigasyon sayfası
- [x] `DEPLOYMENT_CHECKLIST.md` - Bu dosya

### Initialization
- [x] `scripts/init-stock-data.js` - Sample data

## 🔧 Deployment Adımları

### 1. Firestore Collections Oluştur

Firestore'da bu koleksiyonları oluşturun:
```
stocks
stock_locations
stock_movements
internal_requests
internal_requests/{requestId}/material_lines
price_updates
invoices
```

### 2. Firestore Indexes

Aşağıdaki indexler gerekebilir (Firestore Console → Indexes):
```
Collection: stocks
- search_keywords: array-contains
- name_norm: ascending

Collection: stock_movements
- createdAt: descending
- type: ascending
- locationId: ascending

Collection: internal_requests
- createdAt: descending
- status: ascending
```

### 3. Firestore Rules (TODO: Deploy)

`firestore.rules` dosyasına ekleyin:
```javascript
// Stocks
match /stocks/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'purchasing'];
}

// Stock locations
match /stock_locations/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}

// Stock movements
match /stock_movements/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if request.auth != null && 
    resource.data.createdBy == request.auth.uid;
}

// Internal requests
match /internal_requests/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null && 
    (resource.data.requesterUserId == request.auth.uid || 
     getUserRole() in ['admin', 'purchasing']);
}

match /internal_requests/{requestId}/material_lines/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}

// Price updates
match /price_updates/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
    getUserRole() in ['admin', 'purchasing'];
}

// Invoices
match /invoices/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}

// Helper function
function getUserRole() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
}
```

Deploy:
```bash
firebase deploy --only firestore:rules
```

### 4. Initialize Sample Data

Tarayıcı konsolunda veya Node.js ile:
```javascript
// Browser Console:
import('/scripts/init-stock-data.js').then(m => m.initData());

// OR create an HTML page:
// <script type="module" src="/scripts/init-stock-data.js"></script>
```

### 5. Navigation Entegrasyonu

Ana header/footer'a linkler ekleyin (opsiyon):
```html
<a href="/inventory-index.html">Stok Takip</a>
<a href="/pages/stock-import.html">Stok İçe Aktar</a>
<a href="/pages/request-site.html">ŞMTF Oluştur</a>
<a href="/pages/reports.html">Raporlar</a>
```

### 6. Test Senaryoları

Her modülü test edin:

#### Test 1: Stok İçe Aktarım
1. `/pages/stock-import.html` sayfasına git
2. Sample Excel dosyası hazırla
3. Dosyayı yükle
4. Validasyon sonuçlarını kontrol et
5. "İçe Aktar" ile kaydet
6. Firestore'da stocks koleksiyonunu kontrol et

#### Test 2: Yıldızlı Arama
1. `/pages/request-site.html` sayfasına git
2. "+ Satır Ekle" tıkla
3. `*ÇİM*32*KG*` ara
4. FOUND/MULTI/NEW durumunu kontrol et
5. Satır ekle

#### Test 3: Stok Hareketi
1. `/pages/stock-movements.html` sayfasına git
2. "📥 Giriş" tabını seç
3. Ürün ara ve seç
4. Miktar, birim maliyet gir
5. "Kaydet"
6. Firestore'da stock_movements koleksiyonunu kontrol et
7. stocks.avgCost güncellendiğini doğrula

#### Test 4: Fatura Karşılaştırma
1. `/pages/invoice-import.html` sayfasına git
2. Fatura numarası gir
3. Excel dosyası yükle
4. "Karşılaştır" tıkla
5. Farkları kontrol et

#### Test 5: Raporlar
1. `/pages/reports.html` sayfasına git
2. Tab'ları değiştir
3. Her raporu kontrol et
4. İstatistikleri doğrula

## ⚠️ Bilinen Sınırlamalar

1. **Stock Balances**: `stock_balances` koleksiyonu yok - miktar hesaplama hareket bazlı
2. **Role Checking**: Yetki kontrolü yapılmıyor - Firestore rules ile yapılmalı
3. **Notifications**: Bildirim sistemi entegre değil
4. **Charts**: Chart.js entegrasyonu yok
5. **Pagination**: 1000+ satır için performans sorunu olabilir
6. **SKU Merge**: SKU değişim/birleştirme özelliği yok

## 📊 Bağımlılıklar

### CDN (HTML içinde)
- XLSX 0.18.5
- Firebase 10.13.1

### Local (var olan)
- `/firebase.js`
- `/utils.css`
- `/scripts/lib/normalize-tr.js`

## 🔐 Güvenlik

### Tamamlanan
- ✅ Authentication: requireAuth() kullanımı
- ✅ User UID check
- ✅ Input validation

### TODO
- ⚠️ Firestore rules deploy edilmeli
- ⚠️ Role-based access control
- ⚠️ Server-side validation

## 📈 Performans

### Optimizasyonlar
- ✅ Index fields: search_keywords, name_norm
- ✅ Client-side filtering
- ✅ Denormalization: stockName in movements

### TODO
- ⚠️ Pagination for large datasets
- ⚠️ Caching: LocalStorage
- ⚠️ Batch operations

## 🐛 Troubleshooting

### Problem: "Permission denied"
**Çözüm**: Firestore rules deploy edin

### Problem: "Template yüklenemedi"
**Çözüm**: `assets/SATINALMAVETEKLİFFORMU.xlsx` mevcut değil, otomatik header oluşturulacak

### Problem: Yıldızlı arama çok sonuç döndürüyor
**Çözüm**: İlk 1-2 token ile Firestore query, kalanı client-side filtre

### Problem: Ortalama maliyet yanlış
**Çözüm**: `stock_balances` koleksiyonu eklenmeli

## 📞 Destek

Sorunlar için:
1. Firestore Console kontrol edin
2. Browser Console'da hata mesajlarını inceleyin
3. Network tab'da Firestore queries kontrol edin
4. `INVENTORY_SYSTEM_README.md` dosyasını okuyun

## ✨ Özellik Özeti

- ✅ Wildcard search: *ÇİM*32*KG*
- ✅ Auto indexing: name_norm, search_keywords
- ✅ Average cost: Weighted calculation
- ✅ Excel import/export
- ✅ Turkish normalization
- ✅ Invoice comparison
- ✅ Location-based tracking
- ✅ FOUND/MULTI/NEW badges
- ✅ Multi-role support (structure ready)
- ✅ Real-time updates (Firestore listeners available)

## 🎯 Sonraki Adımlar

1. [ ] Firestore rules deploy
2. [ ] Init script çalıştır
3. [ ] Tüm test senaryoları
4. [ ] Navigation entegrasyonu
5. [ ] Role-based access
6. [ ] Stock balances implementation
7. [ ] Notifications
8. [ ] Charts integration
9. [ ] SKU merge feature
10. [ ] Performance optimization

---

**Tamamlanma Durumu**: Core functionality %100, Advanced features %60

**Ready for Production**: ⚠️ Rules ve test sonrası

**Estimated Launch**: Firestore rules deploy + init + test (2-4 saat)

