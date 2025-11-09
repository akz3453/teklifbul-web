# Stok Takip Sistemi - İmplementasyon Özeti

## Tamamlanan Modüller

### ✅ Core Utilities
1. **TR Utils** (`scripts/lib/tr-utils.js`)
   - Türkçe normalizasyon
   - Tokenization for indexing
   - Wildcard search matching

2. **Inventory Cost** (`scripts/inventory-cost.js`)
   - Weighted average cost calculation
   - Extra cost allocation

### ✅ Stok Yönetimi
3. **Stock Import** (`pages/stock-import.html` + `scripts/stock-import.js`)
   - Excel import with validation
   - Auto-indexing with name_norm and search_keywords
   - Batch insert/update

4. **Price Update** (`pages/price-update.html` + `scripts/price-update.js`)
   - Filter by code, brand, unit
   - Excel export/import flow
   - Price update logging

### ✅ Hareket Yönetimi
5. **Stock Movements** (`pages/stock-movements.html` + `scripts/stock-movements.js`)
   - 4 movement types: IN, OUT, TRANSFER, ADJUST
   - Auto avgCost update on IN
   - Extra cost distribution
   - Tab-based UI

### ✅ Talep Yönetimi
6. **Site Request** (`pages/request-site.html` + `scripts/request-site.js`)
   - ŞMTF/IMTF/DMTF creation
   - Wildcard search integration
   - FOUND/MULTI/NEW badges
   - Material lines subcollection

7. **Request Detail** (`pages/request-detail.html` + `scripts/request-detail.js`)
   - View request details
   - Approve/reject flow
   - Forward to purchasing

### ✅ Fatura Karşılaştırma
8. **Invoice Import** (`pages/invoice-import.html` + `scripts/invoice-import.js`)
   - Excel import
   - Quote matching
   - Discrepancy detection

9. **Invoice Compare** (`scripts/invoice-compare.js`)
   - Comparison algorithm
   - Tolerance checking
   - Missing/unexpected detection

### ✅ Raporlar
10. **Reports** (`pages/reports.html` + `scripts/reports.js`)
    - Min stock below threshold
    - Below-cost sales
    - Location-based stock
    - Real cost (with extras)

## Firestore Koleksiyonları

1. **stocks** - Ürün kartları
2. **stock_locations** - Depo/şantiyeler
3. **stock_movements** - Hareketler
4. **internal_requests** - Talepler
5. **internal_requests/{id}/material_lines** - Talep satırları
6. **price_updates** - Fiyat güncelleme logları
7. **invoices** - Fatura/irsaliye kayıtları

## Teknik Detaylar

### Wildcard Search Pattern
```javascript
// User enters: *ÇİM*32*KG*
// Split by '*' → ['ÇİM', '32', 'KG']
// For each stock, check if name includes all parts
matchesWildcard(name, query) → boolean
```

### Average Cost Update
```javascript
// On IN movement:
unitCost = purchasePrice + (totalExtras / qty)
newAvg = weightedAvgCost(oldQty, oldAvg, qty, unitCost)
```

### Index Fields
```javascript
{
  name_norm: normalizeTR(name),      // "çimento 32 kg"
  search_keywords: tokenize(name)    // ["c", "ci", "cim", "cime", ...]
}
```

## Özellikler

### 1. Yıldızlı Arama
- Pattern: `*ÇİM*32*KG*`
- Normalizes: Türkçe karakterler
- Returns: FOUND (1), MULTI (>1), NEW (0)
- UI: Badge ile görsel gösterim

### 2. Otomatik Index
- Create/Update stock sırasında
- name_norm ve search_keywords doldurulur
- Arama performansı optimize edilir

### 3. Ortalama Maliyet
- Her IN hareketinde güncellenir
- İlave maliyetler dağıtılır
- Weighted average ile doğru hesaplama

### 4. Excel Entegrasyonu
- CDN: XLSX 0.18.5
- Import: Auto column mapping
- Export: Template-based
- Validasyon: Client-side

### 5. Türkçe Desteği
- Karakter normalizasyonu
- Diakritik temizleme
- Case-insensitive search
- Special character handling

## Kullanım Örnekleri

### Örnek 1: Stok İçe Aktarım
```javascript
// Excel: Stok Kodu | Ürün Adı | Marka | Birim
// → Firestore: stocks collection
// → Auto: name_norm, search_keywords
```

### Örnek 2: ŞMTF Oluşturma
```javascript
// 1. User ara: *ÇİM*32*KG*
// 2. Find: ÇİMENTO 32 KG (FOUND)
// 3. Add line with FOUND badge
// 4. Save: internal_requests + material_lines
```

### Örnek 3: Stok Hareketi (Giriş)
```javascript
// 1. Select stock
// 2. Enter: qty=100, unitCost=45, extras=500
// 3. Calculate: finalCost = 45 + (500/100) = 50
// 4. Update avgCost: weightedAvgCost(...)
```

### Örnek 4: Fatura Karşılaştırma
```javascript
// 1. Load quote lines
// 2. Load invoice lines
// 3. Compare: qty, price differences
// 4. Check tolerance: 5%
// 5. Report discrepancies
```

### Örnek 5: Rapor (Min Stok)
```javascript
// 1. Load all stocks
// 2. Calculate current qty (from movements)
// 3. Filter: current < threshold
// 4. Display with warning badge
```

## Sınırlamalar ve TODO

### Firestore Rules
- ⚠️ Firestore rules henüz eklenmedi
- ⚠️ Yetki kontrolü yapılmalı
- ✅ Index fields otomatik

### Stock Balances
- ⚠️ `stock_balances` koleksiyonu yok
- ⚠️ Gerçek zamanlı miktar takibi için eklenecek
- ✅ Hareket bazlı hesaplama çalışıyor

### Bildirimler
- ⚠️ `notifications` entegrasyonu yok
- ✅ Trigger logic hazır (TODO: entegrasyon)

### SKU Değişim
- ⚠️ `sku_change_requests` yok
- ⚠️ Merge functionality yapılmalı

### Charts
- ⚠️ Chart.js entegrasyonu yok
- ✅ Raw data ready
- ✅ CDN script yok

### PDF Processing
- ⚠️ PDF/e-irsaliye import yok
- ✅ Excel import çalışıyor
- ✅ Structure extensible

## Test Checklist

- [ ] Stok import: Geçerli/geçersiz veri
- [ ] Yıldızlı arama: *ÇİM*32*KG* → FOUND
- [ ] Ortalama maliyet: IN hareketi → avgCost update
- [ ] ŞMTF: Talep oluştur → Gönder → Onay
- [ ] Fatura karşılaştır: Adet/fiyat farkı
- [ ] Raporlar: Min stok, maliyet altı

## Bağımlılıklar

### CDN
- XLSX 0.18.5 (Excel)
- Firebase 10.13.1 (Firestore)
- (OPSİYON) Chart.js (Graphs)

### Local
- `/firebase.js` - Firebase config
- `/scripts/lib/normalize-tr.js` - Existing TR utils
- Existing utils.css styling

## Performans Notları

### Large Datasets
- 1000+ stocks: Index fields önemli
- Search: array-contains-any + client filter
- Pagination: TODO (şu an limit yok)

### Real-time
- onSnapshot: Kullanılmamış (cost yüksek)
- getDocs: Read-heavy pages için yeterli
- Listeners: Gerekirse eklenebilir

### Caching
- Stock list: Page-level cache yok
- Locations: Her load'da fetch
- TODO: LocalStorage cache

## Güvenlik Notları

### Authentication
- ✅ requireAuth() kullanımı
- ✅ User UID check
- ⚠️ Role check: TODO

### Firestore Rules
- ⚠️ Rules not deployed
- ✅ Structure ready
- TODO: Deploy rules

### Data Validation
- ✅ Client-side validation
- ✅ Type checking
- ✅ Number parsing
- ⚠️ Server-side: Rules

## Deployment Notları

### Dosya Yapısı
```
/pages/
  stock-import.html ✅
  price-update.html ✅
  stock-movements.html ✅
  request-site.html ✅
  request-detail.html ✅
  invoice-import.html ✅
  reports.html ✅

/scripts/
  /lib/
    tr-utils.js ✅
  inventory-cost.js ✅
  stock-import.js ✅
  price-update.js ✅
  stock-movements.js ✅
  request-site.js ✅
  request-detail.js ✅
  invoice-import.js ✅
  invoice-compare.js ✅
  reports.js ✅
  init-stock-data.js ✅
```

### Navigation Entegrasyonu
- ⚠️ Header/footer linkleri yok
- ✅ Standalone pages
- ✅ Back buttons çalışıyor
- TODO: Main nav'e ekle

### Initialization
- ✅ init-stock-data.js hazır
- ⚠️ Run edilmedi (manual run gerekli)
- ✅ Sample data var

## Sonraki Adımlar

1. **Firestore Rules**: Deploy security rules
2. **Navigation**: Header'a linkleri ekle
3. **Init Script**: Run init-stock-data.js
4. **Test**: Tüm senaryoları test et
5. **Performance**: Pagination ekle
6. **Charts**: Chart.js entegrasyonu
7. **Notifications**: Toast/Alert sistemi
8. **SKU Merge**: Change request flow

## Katkılar

Tüm modüller vanilla JS + Firestore ile yazıldı. Mevcut sistem yapısı korundu, yeni modüller bağımsız çalışıyor.

