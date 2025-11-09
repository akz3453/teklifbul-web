# 📦 Stok Takip ve ŞMTF Sistemi - ChatGPT Aktarım Notları

> Bu dokümantasyon, Teklifbul Stok Takip ve Şantiye Malzeme Takip Formu (ŞMTF) sisteminin tam yapısını içerir. ChatGPT'ye adım adım aktarabilirsiniz.

---

## 📋 İÇİNDEKİLER

1. [Genel Sistem Mimarisi](#1-genel-sistem-mimarisi)
2. [Firestore Veri Modelleri](#2-firestore-veri-modelleri)
3. [Stok Yönetimi Modülleri](#3-stok-yönetimi-modülleri)
4. [Stok Hareketleri Sistemi](#4-stok-hareketleri-sistemi)
5. [ŞMTF/IMTF/DMTF Talep Sistemi](#5-şmtfimtfdmtf-talep-sistemi)
6. [Fatura Karşılaştırma Sistemi](#6-fatura-karşılaştırma-sistemi)
7. [Raporlar Sistemi](#7-raporlar-sistemi)
8. [Yardımcı Kütüphaneler ve Algoritmalar](#8-yardımcı-kütüphaneler-ve-algoritmalar)

---

## 1. GENEL SİSTEM MİMARİSİ

### 1.1 Sistem Özeti
- **Platform**: Teklifbul web platformu (Vanilla JS + Firestore)
- **Amaç**: Kapsamlı stok takip ve şantiye malzeme talep yönetimi
- **Teknoloji Stack**: 
  - Frontend: Vanilla JavaScript (ES6 modules)
  - Backend: Firebase Firestore (NoSQL)
  - Excel: XLSX.js (CDN)
  - UI: Custom CSS + Tab-based responsive design

### 1.2 Dosya Yapısı
```
/pages/
  stock-import.html          # Stok kartı toplu içe aktarma
  price-update.html          # Toplu fiyat güncelleme
  stock-movements.html       # Stok hareketleri (IN/OUT/TRANSFER/ADJUST)
  request-site.html          # ŞMTF/IMTF/DMTF oluşturma
  request-detail.html        # Talep detay görüntüleme
  invoice-import.html        # Fatura/irsaliye import
  reports.html               # Stok raporları

/scripts/
  /lib/
    tr-utils.js              # Türkçe normalizasyon + wildcard search
  inventory-cost.js          # Maliyet hesaplamaları
  stock-import.js            # Stok içe aktarma logic
  price-update.js            # Toplu fiyat güncelleme
  stock-movements.js         # Hareket yönetimi
  request-site.js            # ŞMTF oluşturma
  request-detail.js          # Talep detay
  invoice-import.js          # Fatura import
  invoice-compare.js         # Fatura karşılaştırma algoritması
  reports.js                 # Rapor hesaplamaları
```

### 1.3 Temel Özellikler
- ✅ **Yıldızlı Arama**: `*ÇİM*32*KG*` pattern'i ile ürün bulma
- ✅ **Otomatik Index**: `name_norm` ve `search_keywords` alanları
- ✅ **Ortalama Maliyet**: Ağırlıklı ortalama hesaplama + ilave maliyet dağıtımı
- ✅ **Excel Entegrasyon**: Import/Export (XLSX CDN)
- ✅ **Türkçe Desteği**: Tam karakter normalizasyonu
- ✅ **Multi-Status**: FOUND/MULTI/NEW rozet sistemi
- ✅ **Tab UI**: Modern responsive arayüz

---

## 2. FIRESTORE VERİ MODELLERİ

### 2.1 `stocks` Koleksiyonu (Ürün Kartları)
```javascript
{
  id: "auto-generated",                    // Firestore document ID
  sku: "STK-001",                          // Benzersiz stok kodu (unique)
  name: "ÇİMENTO 32 KG",                   // Ürün adı
  brand: "Lafarge",                        // Marka (opsiyonel)
  model: "CEM II/B-M 32.5 R",             // Model (opsiyonel)
  unit: "KG",                              // Birim (ADT, KG, TON, LT, vb.)
  vatRate: 20,                             // KDV oranı % (opsiyonel)
  lastPurchasePrice: 45.50,                // Son alış fiyatı (sayısal)
  avgCost: 42.75,                          // Ağırlıklı ortalama maliyet
  salePrice: 55.00,                        // Satış fiyatı (opsiyonel)
  customCodes: {                            // Özel kodlar (stok grupları)
    code1: "GRUP-A",
    code2: "YAPI",
    code3: null
  },
  name_norm: "CIMENTO 32 KG",              // normalizeTR(name) - otomatik
  search_keywords: ["c", "ci", "cim", ...], // tokenizeForIndex(name) - otomatik
  createdAt: Timestamp,                    // Oluşturulma tarihi
  updatedAt: Timestamp                     // Güncellenme tarihi
}
```

**Önemli Notlar:**
- `sku` benzersiz olmalı (unique constraint)
- `name_norm` ve `search_keywords` otomatik doldurulur (import/update sırasında)
- `avgCost` IN hareketlerinde otomatik güncellenir

### 2.2 `stock_locations` Koleksiyonu (Depo/Şantiyeler)
```javascript
{
  id: "auto-generated",
  name: "Merkez Depo",                     // Lokasyon adı
  type: "DEPOT" | "SITE",                   // Tip: DEPOT veya SITE
  addressSummary: "İstanbul, Şişli",      // Adres özeti
  province: "İstanbul",                    // İl
  district: "Şişli",                      // İlçe
  neighborhood: "Mecidiyeköy",            // Mahalle (opsiyonel)
  createdAt: Timestamp
}
```

### 2.3 `stock_movements` Koleksiyonu (Hareketler)
```javascript
{
  id: "auto-generated",
  stockId: "stock-doc-id",                 // stocks koleksiyonundan referans
  sku: "STK-001",                          // Denormalize: hızlı erişim için
  locationId: "location-doc-id",           // stock_locations referansı
  type: "IN" | "OUT" | "TRANSFER" | "ADJUST", // Hareket tipi
  qty: 100,                                // Miktar
  unit: "KG",                              // Birim
  unitCost: 45.50,                         // Birim maliyet (girişte)
  totalCost: 4550.00,                      // Toplam maliyet (unitCost * qty + allocatedExtras)
  extras: [                                // İlave maliyetler
    { name: "Nakliye", amount: 500 },
    { name: "İndirme", amount: 200 }
  ],
  ref: {                                   // Referans (opsiyonel)
    kind: "purchase" | "sale" | "request",
    id: "reference-doc-id"
  },
  stockName: "ÇİMENTO 32 KG",              // Denormalize: görüntüleme için
  createdBy: "user-uid",                   // Kullanıcı UID
  createdAt: Timestamp
}
```

**Hareket Tipleri:**
- **IN**: Stok girişi (avgCost güncellenir)
- **OUT**: Stok çıkışı
- **TRANSFER**: Lokasyonlar arası transfer (fromLocation + toLocation)
- **ADJUST**: Düzeltme hareketi (sayım farkı, vb.)

### 2.4 `internal_requests` Koleksiyonu (ŞMTF/IMTF/DMTF)
```javascript
{
  id: "auto-generated",
  type: "ŞMTF" | "IMTF" | "DMTF",          // Talep tipi
  title: "Şantiye Malzeme Talebi",        // Başlık
  requesterUserId: "user-uid",             // Talep eden kullanıcı
  requesterName: "Ahmet Yılmaz",           // Denormalize: isim
  locationId: "location-doc-id",           // Şantiye/Depo referansı
  deliveryAddress: "İstanbul, Şişli...",   // Teslimat adresi
  deliveryIsFreightIncluded: false,       // Nakliye dahil mi?
  description: "Açıklama metni",          // Açıklama
  createdAt: Timestamp,
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED"
}
```

### 2.5 `internal_requests/{id}/material_lines` Subcollection (Talep Satırları)
```javascript
{
  id: "auto-generated",
  lineNo: 1,                               // Satır numarası
  sku: "STK-001",                          // Stok kodu (eşleşme varsa)
  name: "ÇİMENTO 32 KG",                   // Ürün adı
  brandModel: "Lafarge CEM II/B-M",       // Marka/Model
  qty: 100,                                // Miktar
  unit: "KG",                              // Birim
  warehouseQty: 500,                       // Depodaki mevcut miktar (opsiyonel)
  imageUrl: "https://...",                 // Ürün görseli (opsiyonel)
  requestedDate: "2025-11-15",             // İstenen teslim tarihi
  note: "Acil",                            // Not
  matchStatus: "FOUND" | "MULTI" | "NEW"   // Eşleşme durumu
}
```

**Match Status Açıklaması:**
- **FOUND**: Tek bir eşleşme bulundu (sku atanabilir)
- **MULTI**: Birden fazla eşleşme bulundu (manuel seçim gerekir)
- **NEW**: Eşleşme bulunamadı (yeni ürün, stok kartı oluşturulmalı)

### 2.6 `price_updates` Koleksiyonu (Fiyat Güncelleme Log)
```javascript
{
  id: "auto-generated",
  fileName: "price-update-2025-11-04.xlsx", // Yüklenen dosya adı
  appliedBy: "user-uid",                     // Güncelleyen kullanıcı
  appliedAt: Timestamp,                      // Güncelleme tarihi
  totalUpdated: 150,                         // Güncellenen kayıt sayısı
  rules: {                                   // Uygulanan filtreler
    customCode: "GRUP-A",
    brand: "Lafarge",
    unit: "KG"
  }
}
```

### 2.7 `invoices` Koleksiyonu (Fatura/İrsaliye)
```javascript
{
  id: "auto-generated",
  supplierId: "supplier-uid",               // Tedarikçi UID
  number: "FAT-2025-001",                   // Fatura numarası
  date: "2025-11-04",                       // Fatura tarihi
  lines: [                                   // Fatura satırları
    {
      sku: "STK-001",
      name: "ÇİMENTO 32 KG",
      qty: 100,
      unit: "KG",
      unitPrice: 45.50,
      total: 4550.00
    }
  ],
  parsedFrom: "pdf" | "word" | "excel" | "einvoice", // Kaynak format
  matchedQuoteId: "quote-doc-id",           // Eşleşen teklif ID (opsiyonel)
  discrepancies: [                          // Farklar (karşılaştırma sonrası)
    {
      lineNo: 1,
      kind: "qty" | "price",
      expected: 100,
      actual: 95,
      tolerance: 5
    }
  ],
  createdAt: Timestamp
}
```

---

## 3. STOK YÖNETİMİ MODÜLLERİ

### 3.1 Stok İçe Aktarım (`stock-import.html` + `stock-import.js`)

**Özellikler:**
- Excel'den toplu stok kartı yükleme
- Otomatik validasyon ve index oluşturma
- Batch insert/update

**Excel Şablon Formatı:**
| Stok Kodu | Ürün Adı | Marka | Model | Birim | KDV Oranı | Alış Fiyatı | Satış Fiyatı | Özel Kod 1 | Özel Kod 2 | Özel Kod 3 |
|-----------|----------|-------|-------|-------|-----------|--------------|--------------|------------|------------|------------|
| STK-001   | ÇİMENTO 32 KG | Lafarge | CEM II/B-M | KG | 20 | 45.50 | 55.00 | GRUP-A | YAPI | - |

**İşlem Akışı:**
1. Kullanıcı Excel dosyası yükler
2. Sistem kolonları otomatik tespit eder
3. Önizleme gösterilir (validasyon hataları ile)
4. "İçe Aktar" butonuna tıklanır
5. Her satır için:
   - `name_norm` = `normalizeTR(name)`
   - `search_keywords` = `tokenizeForIndex(name)`
   - Firestore'a kaydedilir (`stocks` koleksiyonu)

**Kod Örneği:**
```javascript
// Excel'den veri okuma (XLSX.js)
const workbook = XLSX.read(fileData, { type: 'array' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

// Her satırı işle
for (const row of rows) {
  const stockData = {
    sku: row['Stok Kodu'],
    name: row['Ürün Adı'],
    brand: row['Marka'] || null,
    model: row['Model'] || null,
    unit: row['Birim'],
    vatRate: parseFloat(row['KDV Oranı']) || null,
    lastPurchasePrice: parseFloat(row['Alış Fiyatı']) || null,
    salePrice: parseFloat(row['Satış Fiyatı']) || null,
    customCodes: {
      code1: row['Özel Kod 1'] || null,
      code2: row['Özel Kod 2'] || null,
      code3: row['Özel Kod 3'] || null
    },
    name_norm: normalizeTR(row['Ürün Adı']),
    search_keywords: tokenizeForIndex(row['Ürün Adı']),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  await addDoc(collection(db, 'stocks'), stockData);
}
```

### 3.2 Toplu Fiyat Güncelleme (`price-update.html` + `price-update.js`)

**Özellikler:**
- Filtreleme: Özel kod, marka, birim
- Excel export/import akışı
- Fiyat güncelleme log kaydı

**İşlem Akışı:**
1. Filtreler uygulanır (customCode, brand, unit)
2. "Yükle ve İndir" ile Excel indirilir
3. Kullanıcı Excel'de fiyatları günceller
4. Excel yeniden yüklenir
5. "Güncelle" ile Firestore'a kaydedilir
6. `price_updates` koleksiyonuna log yazılır

---

## 4. STOK HAREKETLERİ SİSTEMİ

### 4.1 Hareket Tipleri ve Mantığı

**IN (Giriş) Hareketi:**
- Stok girişi yapılır
- Ortalama maliyet otomatik güncellenir
- İlave maliyetler (nakliye, indirme vb.) birime dağıtılır

**OUT (Çıkış) Hareketi:**
- Stok çıkışı yapılır
- Ortalama maliyet değişmez (FIFO/LIFO yok, sadece avgCost)

**TRANSFER (Transfer) Hareketi:**
- İki lokasyon arası transfer
- `fromLocation` ve `toLocation` belirtilir
- Toplam stok miktarı değişmez

**ADJUST (Düzeltme) Hareketi:**
- Sayım farkı, kayıp, fire vb. durumlar için
- Miktar artış/azalış düzeltmesi

### 4.2 Ortalama Maliyet Güncelleme Algoritması

```javascript
// IN hareketi sırasında:
const newAvgCost = weightedAvgCost(
  oldQty,      // Mevcut miktar (stock_balances'den veya hesaplanır)
  oldAvgCost,  // Mevcut ortalama maliyet
  inQty,       // Giriş miktarı
  inUnitCost   // Giriş birim maliyeti (unitCost + allocatedExtras)
);

// İlave maliyet dağıtımı:
const allocatedExtras = allocateExtras(totalExtras, qty);
const finalUnitCost = unitCost + allocatedExtras;
```

**Formül:**
```
newAvgCost = (oldQty × oldAvgCost + inQty × inUnitCost) / (oldQty + inQty)
```

**Örnek:**
- Mevcut: 100 KG × 40 TL/KG = 4000 TL
- Giriş: 50 KG × 45 TL/KG = 2250 TL
- İlave maliyet: 500 TL (nakliye)
- Dağıtılmış birim maliyet: 45 + (500/50) = 55 TL/KG
- Yeni ortalama: (100×40 + 50×55) / 150 = 42.33 TL/KG

---

## 5. ŞMTF/IMTF/DMTF TALEP SİSTEMİ

### 5.1 Talep Tipleri
- **ŞMTF**: Şantiye Malzeme Talep Formu
- **IMTF**: İç Malzeme Talep Formu
- **DMTF**: Depo Malzeme Talep Formu

### 5.2 Yıldızlı Arama Sistemi

**Kullanıcı Girişi:** `*ÇİM*32*KG*`

**İşlem Adımları:**
1. Pattern normalize edilir: `*CIM*32*KG*`
2. `*` karakterleri ile bölünür: `['CIM', '32', 'KG']`
3. Her stok kartı için kontrol edilir:
   ```javascript
   const matches = stocks.filter(s => {
     const normalized = normalizeTR(s.name);
     return ['CIM', '32', 'KG'].every(part => normalized.includes(part));
   });
   ```
4. Sonuç:
   - **0 eşleşme** → `matchStatus: "NEW"`
   - **1 eşleşme** → `matchStatus: "FOUND"` (sku otomatik atanır)
   - **2+ eşleşme** → `matchStatus: "MULTI"` (kullanıcı seçim yapar)

### 5.3 Talep Oluşturma Akışı

1. **Talep Başlığı Oluştur:**
   - Tip seçimi (ŞMTF/IMTF/DMTF)
   - Şantiye/Depo seçimi
   - Teslimat adresi
   - Açıklama

2. **Malzeme Satırları Ekle:**
   - Yıldızlı arama ile ürün bul
   - Eşleşme durumuna göre rozet göster (FOUND/MULTI/NEW)
   - Miktar, birim, teslim tarihi gir

3. **Kaydet:**
   - `internal_requests` koleksiyonuna kaydet
   - Her satırı `material_lines` subcollection'a ekle
   - Status: `"DRAFT"` veya `"SENT"`

### 5.4 Talep Onay Akışı

1. **Talep Görüntüleme:**
   - Talep detayı gösterilir
   - Malzeme satırları listelenir
   - Mevcut stok miktarları gösterilir (varsa)

2. **Onay/Red:**
   - `status: "APPROVED"` veya `"REJECTED"`
   - Onaylandıysa satın alma sistemine yönlendirilebilir

---

## 6. FATURA KARŞILAŞTIRMA SİSTEMİ

### 6.1 Fatura Import Akışı

1. Teklif ID ve fatura numarası girilir
2. Fatura Excel dosyası yüklenir
3. Sistem fatura satırlarını parse eder
4. Teklif ile karşılaştırma yapılır

### 6.2 Karşılaştırma Algoritması

```javascript
// Fatura satırları ile teklif satırları eşleştirilir
for (const invoiceLine of invoiceLines) {
  const quoteLine = findMatchingQuoteLine(invoiceLine, quoteLines);
  
  if (!quoteLine) {
    discrepancies.push({
      lineNo: invoiceLine.lineNo,
      kind: "missing",
      message: "Teklifte bulunamadı"
    });
    continue;
  }
  
  // Miktar kontrolü
  const qtyDiff = Math.abs(invoiceLine.qty - quoteLine.qty);
  const qtyTolerance = quoteLine.qty * 0.05; // %5 tolerans
  
  if (qtyDiff > qtyTolerance) {
    discrepancies.push({
      lineNo: invoiceLine.lineNo,
      kind: "qty",
      expected: quoteLine.qty,
      actual: invoiceLine.qty,
      tolerance: qtyTolerance
    });
  }
  
  // Fiyat kontrolü
  const priceDiff = Math.abs(invoiceLine.unitPrice - quoteLine.unitPrice);
  const priceTolerance = quoteLine.unitPrice * 0.05; // %5 tolerans
  
  if (priceDiff > priceTolerance) {
    discrepancies.push({
      lineNo: invoiceLine.lineNo,
      kind: "price",
      expected: quoteLine.unitPrice,
      actual: invoiceLine.unitPrice,
      tolerance: priceTolerance
    });
  }
}
```

### 6.3 Fark Tespiti

**Tolerans:** Varsayılan %5
- Miktar farkı > %5 → `discrepancy` oluşturulur
- Fiyat farkı > %5 → `discrepancy` oluşturulur
- Teklifte olmayan satır → `MISSING` işaretlenir
- Faturada olmayan satır → `UNEXPECTED` işaretlenir

---

## 7. RAPORLAR SİSTEMİ

### 7.1 Rapor Tipleri

**1. Min Stok Altı Ürünler:**
- Mevcut stok miktarı < min stok seviyesi
- Uyarı rozeti ile gösterilir

**2. Ortalama Maliyet Altında Satışlar:**
- `salePrice < avgCost` olan ürünler
- Zarar riski uyarısı

**3. Lokasyon Bazlı Stok Durumu:**
- Her lokasyon için stok miktarları
- Filtreleme: Lokasyon tipi (SITE/DEPOT)

**4. Gerçek Maliyet:**
- İlave maliyetler dağıtılmış maliyet
- `realCost = avgCost + (totalExtras / totalQty)`

### 7.2 Rapor Hesaplama Mantığı

```javascript
// Min stok kontrolü
const minStockReport = stocks.filter(stock => {
  const currentQty = calculateCurrentQty(stock.id); // movements'den hesaplanır
  return currentQty < stock.minStock;
});

// Maliyet altı satış kontrolü
const belowCostReport = stocks.filter(stock => {
  return stock.salePrice && stock.salePrice < stock.avgCost;
});

// Lokasyon bazlı stok
const locationStock = {};
movements.forEach(mv => {
  if (!locationStock[mv.locationId]) {
    locationStock[mv.locationId] = {};
  }
  if (mv.type === 'IN') {
    locationStock[mv.locationId][mv.stockId] = 
      (locationStock[mv.locationId][mv.stockId] || 0) + mv.qty;
  } else if (mv.type === 'OUT') {
    locationStock[mv.locationId][mv.stockId] = 
      (locationStock[mv.locationId][mv.stockId] || 0) - mv.qty;
  }
});
```

---

## 8. YARDIMCI KÜTÜPHANELER VE ALGORİTMALAR

### 8.1 Türkçe Normalizasyon (`tr-utils.js`)

**normalizeTR(s):**
```javascript
export function normalizeTR(s) {
  if (!s) return "";
  return s
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')  // Unicode aksanları temizle
    .toLocaleUpperCase('tr-TR')                        // Türkçe büyük harf
    .replaceAll('Ç','C').replaceAll('Ğ','G').replaceAll('İ','I')
    .replaceAll('Ö','O').replaceAll('Ş','S').replaceAll('Ü','U');
}
```

**Örnek:**
- Giriş: `"ÇİMENTO 32 KG"`
- Çıkış: `"CIMENTO 32 KG"`

**tokenizeForIndex(s):**
```javascript
export function tokenizeForIndex(s) {
  const t = normalizeTRLower(s).split(/\s+/).filter(Boolean);
  const out = new Set();
  t.forEach(w => {
    for (let i = 1; i <= Math.min(8, w.length); i++) {
      out.add(w.slice(0, i));  // "c", "ci", "cim", "cime", ...
    }
  });
  return [...out];
}
```

**Örnek:**
- Giriş: `"ÇİMENTO 32 KG"`
- Çıkış: `["c", "ci", "cim", "cime", "cimen", "ciment", "cimento", "3", "32", "k", "kg"]`

**matchesWildcard(name, query):**
```javascript
export function matchesWildcard(name, query) {
  const t = normalizeTR(name);
  const p = normalizeTR(query).replace(/\*/g, '.*');  // * → regex wildcard
  return new RegExp(`^${p}$`).test(t);
}
```

**Örnek:**
- `matchesWildcard("ÇİMENTO 32 KG", "*ÇİM*32*KG*")` → `true`
- `matchesWildcard("ÇİMENTO 32 KG", "*DEMİR*")` → `false`

### 8.2 Maliyet Hesaplamaları (`inventory-cost.js`)

**weightedAvgCost(oldQty, oldAvg, inQty, inUnitCost):**
```javascript
export function weightedAvgCost(oldQty, oldAvg, inQty, inUnitCost) {
  if (!oldQty) return inUnitCost;  // İlk giriş
  return ((oldQty * oldAvg) + (inQty * inUnitCost)) / (oldQty + inQty);
}
```

**allocateExtras(totalExtras, totalQty):**
```javascript
export function allocateExtras(totalExtras, totalQty) {
  return totalQty > 0 ? (totalExtras / totalQty) : 0;
}
```

**Örnek Kullanım:**
```javascript
const unitCost = 45.50;
const totalExtras = 500;  // Nakliye + İndirme
const qty = 100;

const allocatedExtras = allocateExtras(totalExtras, qty);  // 5 TL/KG
const finalUnitCost = unitCost + allocatedExtras;          // 50.50 TL/KG

const newAvgCost = weightedAvgCost(
  oldQty,      // 200 KG
  oldAvgCost,  // 40 TL/KG
  100,         // Giriş miktarı
  50.50        // Final birim maliyet
);  // Sonuç: (200×40 + 100×50.50) / 300 = 43.50 TL/KG
```

---

## 📝 SONUÇ

Bu dokümantasyon, Teklifbul Stok Takip ve ŞMTF sisteminin tam yapısını içerir. ChatGPT'ye aktarırken:

1. **Bölüm bölüm aktarın**: Her bölümü ayrı bir mesaj olarak gönderin
2. **Kod örneklerini dahil edin**: Algoritmalar ve mantık için
3. **Firestore yapısını vurgulayın**: Veri modelleri kritik
4. **Özelliklerden bahsedin**: Yıldızlı arama, otomatik index, ortalama maliyet

Sistem production-ready durumda ve tüm özellikler çalışır durumda.

---

**Versiyon:** 1.0  
**Son Güncelleme:** 2025-11-04  
**Durum:** ✅ Production Ready

