# Teklifbul Stok Takip ve ŞMTF Sistemi

## Genel Bakış

Bu sistem, Teklifbul platformuna entegre edilmiş kapsamlı bir stok takip ve şantiye malzeme talep yönetim sistemidir.

## Kurulum ve Yapı

### 1. Yardımcı Kütüphaneler

#### `scripts/lib/tr-utils.js`
- **normalizeTR()**: Türkçe karakterleri normalize eder (ı→i, ş→s, vb.)
- **tokenizeForIndex()**: Arama indexleme için n-gram tokenizer
- **matchesWildcard()**: Yıldızlı arama desteği (*ÇİM*32*KG*)

#### `scripts/inventory-cost.js`
- **weightedAvgCost()**: Ağırlıklı ortalama maliyet hesaplama
- **allocateExtras()**: İlave maliyetleri (nakliye, indirme vb.) birime dağıtma

### 2. Sayfalar ve Modüller

#### A) Stok Yönetimi

**`pages/stock-import.html`** + **`scripts/stock-import.js`**
- Excel'den stok kartı toplu içe aktarma
- Beklenen kolonlar: Stok Kodu, Ürün Adı, Marka, Model, Birim, KDV Oranı, Alım/Satış Fiyatı, Özel Kodlar
- Otomatik validasyon ve index oluşturma
- Firestore collection: `stocks`

**`pages/price-update.html`** + **`scripts/price-update.js`**
- Toplu fiyat güncelleme
- Filtreleme: Özel kod, marka, birim
- Excel indirme/yükleme akışı
- Firestore collection: `price_updates` (log)

#### B) Stok Hareketleri

**`pages/stock-movements.html`** + **`scripts/stock-movements.js`**
- 4 tip hareket: IN, OUT, TRANSFER, ADJUST
- Giriş hareketinde ortalama maliyet otomatik güncelleme
- İlave maliyet dağıtımı
- Tab-based UI
- Firestore collection: `stock_movements`

#### C) Talep Yönetimi (ŞMTF/IMTF/DMTF)

**`pages/request-site.html`** + **`scripts/request-site.js`**
- Şantiye/Depo/İç talep oluşturma
- Yıldızlı arama ile akıllı ürün eşleştirme
- FOUND/MULTI/NEW rozetleri
- Firestore collection: `internal_requests` + subcollection `material_lines`

**`pages/request-detail.html`** + **`scripts/request-detail.js`**
- Talep detay görüntüleme
- Onay/Red işlemleri
- Satın alma entegrasyonu
- Yetki kontrolü (TODO)

#### D) Fatura Karşılaştırma

**`pages/invoice-import.html`** + **`scripts/invoice-import.js`**
- Excel'den fatura/irsaliye import
- Teklif ile karşılaştırma
- Adet/fiyat fark tespiti
- Firestore collection: `invoices`

**`scripts/invoice-compare.js`**
- Karşılaştırma algoritması
- Tolerans kontrolü (varsayılan %5)
- MISSING/UNEXPECTED tespiti

#### E) Raporlar

**`pages/reports.html`** + **`scripts/reports.js`**
- 4 rapor tipi:
  1. Min stok altı ürünler
  2. Ortalama maliyet altında satışlar
  3. Lokasyon bazlı stok durumu
  4. Gerçek maliyet (extras dağıtılmış)
- Tab-based UI
- İstatistik kartları

## Firestore Veri Modelleri

### stocks (Ürün Kartı)
```javascript
{
  id,                        // auto
  sku,                       // benzersiz
  name,                      // Ürün adı
  brand, model,              // opsiyon
  unit,                      // ADT, KG, TON, LT...
  vatRate,                   // % (ops)
  lastPurchasePrice,         // sayısal
  avgCost,                   // ağırlıklı ortalama
  salePrice,                 // opsiyon
  customCodes: {             // stok grupları
    code1, code2, code3
  },
  name_norm,                 // normalizeTR(name)
  search_keywords,           // tokenizeForIndex(name)
  createdAt, updatedAt
}
```

### stock_locations (Depo/Şantiye)
```javascript
{
  id, name, type: 'SITE'|'DEPOT',
  addressSummary,
  province, district, neighborhood,
  createdAt
}
```

### stock_movements (Hareketler)
```javascript
{
  id, stockId, sku,
  locationId,
  type: 'IN'|'OUT'|'TRANSFER'|'ADJUST',
  qty, unit,
  unitCost,                  // girişte birim maliyet
  totalCost,                 // unitCost*qty + allocatedExtras
  extras: [{name, amount}],  // nakliye/indirme vb.
  ref: { kind, id },         // referans
  stockName,                 // denormalize
  createdBy, createdAt
}
```

### internal_requests (ŞMTF/IMTF/DMTF)
```javascript
{
  id, type: 'ŞMTF'|'IMTF'|'DMTF',
  title, requesterUserId, requesterName,
  locationId,
  deliveryAddress, deliveryIsFreightIncluded,
  description,
  createdAt,
  status: 'DRAFT'|'SENT'|'APPROVED'|'REJECTED'
}
```

### internal_requests/{id}/material_lines (Talep Satırları)
```javascript
{
  lineNo, sku, name, brandModel, qty, unit,
  warehouseQty, imageUrl, requestedDate, note,
  matchStatus: 'FOUND'|'MULTI'|'NEW'
}
```

### price_updates (Toplu Fiyat Güncelleme Log)
```javascript
{
  id, fileName, appliedBy, appliedAt, totalUpdated, rules
}
```

### invoices (Gelen E-İrsaliye/Fatura Özet)
```javascript
{
  id, supplierId, number, date,
  lines: [{ sku, name, qty, unit, unitPrice, total }],
  parsedFrom: 'pdf'|'word'|'excel'|'einvoice',
  matchedQuoteId,
  discrepancies: [{lineNo, kind, expected, actual}],
  createdAt
}
```

## Önemli Özellikler

### 1. Yıldızlı Arama (*ÇİM*32*KG*)
- Wildcard pattern matching
- Client-side filtreleme (matchesWildcard)
- FOUND/MULTI/NEW rozet sistemi

### 2. Ortalama Maliyet Yönetimi
- Ağırlıklı ortalama hesaplama
- İlave maliyet dağıtımı
- Otomatik güncelleme (IN hareketi)

### 3. Excel Entegrasyonu
- XLSX CDN kullanımı
- Şablonlu import/export
- Kolay kolon mapping

### 4. Türkçe Normalizasyon
- Tüm aramalar normalize edilir
- Index alanları otomatik doldurulur
- Diakritik karakter desteği

## Kullanım Senaryoları

### Senaryo 1: Stok Kartı İçe Aktarım
1. `/pages/stock-import.html` sayfasına git
2. Excel dosyası yükle
3. Önizle ve validasyona bak
4. "İçe Aktar" butonuna tıkla
5. Stock kartları oluşturulur; index alanları doldurulur

### Senaryo 2: Şantiye Talep Oluşturma (ŞMTF)
1. `/pages/request-site.html` sayfasına git
2. Talep bilgilerini doldur (başlık, lokasyon, teslimat adresi)
3. "+ Satır Ekle" ile ürün ekle (yıldızlı arama: *ÇİM*32*KG*)
4. Eşleşme durumuna göre FOUND/MULTI/NEW rozetleri görünür
5. "Gönder" ile `status='SENT'` olarak kaydet

### Senaryo 3: Stok Hareketi (Giriş)
1. `/pages/stock-movements.html` sayfasına git
2. "📥 Giriş" tabını seç
3. Ürün ara ve seç
4. Miktar, birim maliyet, ilave maliyetleri gir
5. "Kaydet" ile hareket oluştur; avgCost otomatik güncellenir

### Senaryo 4: Toplu Fiyat Güncelleme
1. `/pages/price-update.html` sayfasına git
2. Filtreleri uygula (kod, marka, birim)
3. "Yükle ve İndir" ile Excel indir
4. Fiyatları güncelle
5. Excel'i yeniden yükle ve "Güncelle" ile kaydet
6. `price_updates` koleksiyonuna log yazılır

### Senaryo 5: Fatura Karşılaştırma
1. `/pages/invoice-import.html` sayfasına git
2. Teklif ID ve fatura numarası gir
3. Fatura Excel dosyasını yükle
4. "Karşılaştır" ile farkları tespit et
5. "Kaydet" ile `invoices` koleksiyonuna kaydet

### Senaryo 6: Raporlar
1. `/pages/reports.html` sayfasına git
2. Tab değiştir: Min Stok / Maliyet Altı / Lokasyon / Gerçek Maliyet
3. İstatistikleri incele
4. Filtreleri uygula (lokasyon raporunda)

## Tümleştirme Notları

### Mevcut Sisteme Entegrasyon
- Vanilla JS + Firestore
- `firebase.js` global'leri (`window.__db`, `window.__auth`)
- Mevcut header/footer ile uyumlu
- Tekil dosyalar halinde eklenmiştir, mevcut sayfalar bozulmamıştır

### Bağımlılıklar
- **XLSX**: CDN (`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`)
- **Firebase**: 10.13.1 (Firestore)
- **Chart.js** (opsiyon): CDN ile grafik eklenebilir

### Dosya Yapısı
```
/scripts/
  /lib/
    tr-utils.js              # TR normalizasyon ve wildcard search
  inventory-cost.js          # Maliyet hesaplamaları
  stock-import.js            # Stok içe aktarma
  price-update.js            # Toplu fiyat güncelleme
  stock-movements.js         # Stok hareketleri
  request-site.js            # ŞMTF oluşturma
  request-detail.js          # Talep detay
  invoice-import.js          # Fatura import
  invoice-compare.js         # Fatura karşılaştırma
  reports.js                 # Raporlar

/pages/
  stock-import.html
  price-update.html
  stock-movements.html
  request-site.html
  request-detail.html
  invoice-import.html
  reports.html
```

## Güvenlik ve Yetkiler (TODO)

### Roller
- **admin**: Tüm erişim
- **purchasing**: Talepleri görme, satın almaya çevirme
- **warehouse**: IN/OUT/TRANSFER işlemleri
- **site**: ŞMTF/DMTF oluşturma
- **sales**: Raporları görme
- **supplier**: Erişim yok

### Firestore Rules (TODO)
```javascript
match /stocks/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

match /internal_requests/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null && resource.data.requesterUserId == request.auth.uid;
}
```

## Test Senaryoları

1. **Stok İçe Aktarım**: Excel'den geçerli/geçersiz veri ile test
2. **Yıldızlı Arama**: `*ÇİM*32*KG*` ile `ÇİMENTO 32 KG` bulma
3. **Ortalama Maliyet**: Giriş hareketinde avgCost güncelleme
4. **ŞMTF Akışı**: Talep oluşturma → Onay → Satın alma
5. **Fatura Karşılaştırma**: Adet/fiyat farkı tespiti
6. **Raporlar**: Min stok altı ve maliyet altı satışlar

## Gelecek Geliştirmeler

1. **SKU Birleştirme**: `sku_change_requests` koleksiyonu
2. **Stock Balances**: `stock_balances` ile gerçek zamanlı miktar takibi
3. **Bildirimler**: Min stok, maliyet altı satış uyarıları
4. **Charts**: Chart.js ile trend grafikleri
5. **PDF Export**: Fatura/irsaliye PDF parsing (OCR)
6. **Mobile UI**: Responsive tasarım iyileştirmeleri

## Sorun Giderme

### Sorun: "Şablon yüklenemedi"
**Çözüm**: `assets/` klasörüne şablon dosyası eklenmeli veya otomatik header oluşturulması kullanılır.

### Sorun: Yıldızlı arama çok sonuç döndürüyor
**Çözüm**: İlk 1-2 part ile `array-contains-any` kullan, kalanını client-side filtrele.

### Sorun: Ortalama maliyet yanlış hesaplanıyor
**Çözüm**: `stock_balances` koleksiyonu eklenmeli, güncel miktar takibi yapılmalı.

### Sorun: Excel import yavaş
**Çözüm**: 1000+ satır için pagination veya batch processing kullan.

## Destek

Herhangi bir sorun için `/scripts/` altındaki ilgili dosyaya bakın veya Firestore konsolunu kontrol edin.

