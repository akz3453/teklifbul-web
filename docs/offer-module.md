# Teklif Modülü Dokümantasyonu

## Genel Bakış

Teklif Modülü, talep detayındaki bilgilerden tedarikçinin tek ekranda teklif doldurmasını sağlar. Excel şablonu kullanarak alan eşleme, doğrulama, fark uyarıları, ödeme şartları, KDV/kur ve tek tuşla gönder akışını sağlar.

## Akış Diyagramı

```
Talep Detay Sayfası
    ↓
Teklif Sekmesi (OfferTab.tsx)
    ↓
Form Doldurma
    ├─ Başlık Bilgileri
    ├─ Kur Bilgileri (TRY dışı için)
    └─ Ürün Satırları
         ├─ Miktar/Birim/Fiyat girişi
         ├─ Otomatik KDV hesaplama
         ├─ Talep vs Teklif fark gösterimi
         └─ Ödeme şartları
    ↓
Doğrulama
    ├─ Schema Validation (Zod)
    └─ İş Kuralları Kontrolü
    ↓
Excel Export (İsteğe Bağlı)
    ↓
Gönder
    ├─ API: POST /api/offers
    └─ Durum: draft → submitted
    ↓
Kıyaslama Ekranı
    └─ Fiyat karşılaştırması
```

## Şema Alanları

### Header (Başlık Bilgileri)

| Alan | Tip | Açıklama | Zorunlu |
|------|-----|----------|---------|
| `satfkCode` | string | SATFK kodu | ✅ |
| `title` | string | Talep başlığı | ✅ |
| `site` | string? | Şantiye adı | ❌ |
| `purchaseCity` | string? | Alım yeri (İl) | ❌ |
| `priority` | 'price'\|'date'\|'quality'? | Öncelik | ❌ |
| `dueDate` | string? (ISO) | Termin tarihi | ❌ |
| `currency` | 'TRY'\|'USD'\|'EUR'\|'GBP' | Para birimi | ✅ (default: TRY) |
| `paymentTerms` | PaymentTerms? | Ödeme şartları | ❌ |
| `isSealedBid` | boolean | Gizli teklif (tek tur) | ❌ (default: false) |

### Line (Satır Bilgileri)

| Alan | Tip | Açıklama | Zorunlu |
|------|-----|----------|---------|
| `category` | string? | Kategori | ❌ |
| `itemName` | string | Ürün adı | ✅ |
| `spec` | string? | Teknik özellikler | ❌ |
| `uom` | string | Birim | ✅ |
| `quantity` | number | Miktar (>0) | ✅ |
| `unitPrice` | number | Birim fiyat (KDV hariç, ≥0) | ✅ |
| `vatRate` | number | KDV oranı (%) (0-100) | ✅ (default: 18) |
| `deliveryDate` | string? (ISO) | Teslim tarihi | ❌ |
| `brand` | string? | Marka | ❌ |
| `notes` | string? | Notlar | ❌ |
| `netUnitWithVat` | number? | KDV dahil birim fiyat (hesaplanan) | ❌ |
| `totalExVat` | number? | KDV hariç toplam (hesaplanan) | ❌ |
| `totalWithVat` | number? | KDV dahil toplam (hesaplanan) | ❌ |
| `demandQuantity` | number? | Talep miktarı (karşılaştırma için) | ❌ |
| `demandUnitPrice` | number? | Talep birim fiyatı | ❌ |
| `demandDeliveryDate` | string? (ISO) | Talep teslim tarihi | ❌ |
| `demandUom` | string? | Talep birimi | ❌ |

### PaymentTerms (Ödeme Şartları)

| Tip | Alanlar | Açıklama |
|-----|---------|----------|
| `pesin_escrow` | `escrowDays?` | Peşin (Escrow / X gün) |
| `pesin_teslim_onay` | `deliveryConfirmDays?` | Peşin (Teslim&Onay / X gün) |
| `pesin_on_odeme` | `advancePercent?` (0-100) | Peşin (Ön Ödeme %X) |
| `kredi_karti` | `installments?`, `financeRate?` | Kredi Kartı (X taksit / %Y faiz) |
| `acik_hesap` | `invoiceDate?`, `dueDays?` | Açık Hesap (X gün) |
| `evrak_cek` | `checkCount?`, `checkAmount?`, `checkDays?[]` | Evrak/Çek (X adet) |

## Excel Kolon Eşleme Tablosu

### UI Alanı → Excel Hücre Adresi

| UI Alanı | Excel Hücresi | Açıklama |
|----------|---------------|----------|
| SATFK Kodu | N1 | Başlık bölgesi |
| Başlık | N2 | Başlık bölgesi |
| Şantiye | N3 | Başlık bölgesi |
| Alım Yeri | N4 | Başlık bölgesi |
| Para Birimi | P1 | Başlık bölgesi |
| Öncelik | P2 | Başlık bölgesi |
| Termin Tarihi | P3 | Başlık bölgesi |
| Ödeme Şartları | P4 | Başlık bölgesi |
| **Satır Başlıkları (Satır 5)** |
| BİRİM FİYAT (KDV Hariç) | H5 | Sütun başlığı |
| KDV HARİÇ TOPLAM TL | K5-L5 (merge) | Sütun başlığı |
| KDV ORANI (%) | N5 | Sütun başlığı |
| KDV DAHİL BİRİM FİYAT | P5 | Sütun başlığı |
| KDV DAHİL TOPLAM TL | O5 | Sütun başlığı |
| ÖDEME ŞARTLARI | M5 | Sütun başlığı |
| **Satır Verileri (Satır 6+)** |
| No | A{r} | Satır numarası |
| Ürün Adı | B{r} | itemName |
| Spec | C{r} | spec |
| Marka | D{r} | brand |
| Birim | E{r} | uom |
| Miktar | F{r} | quantity |
| Birim Fiyat (KDV Hariç) | H{r} | unitPrice |
| Termin | J{r} | deliveryDate |
| KDV Hariç Toplam | K{r}-L{r} (merge) | `=F{r}*H{r}` |
| Ödeme Şartları | M{r} | Payment terms text |
| KDV Oranı (%) | N{r} | vatRate |
| KDV Dahil Toplam | O{r} | `=F{r}*P{r}` |
| KDV Dahil Birim Fiyat | P{r} | `=H{r}*(1+N{r}/100)` |
| **Toplam Satırı** |
| TOPLAM | A{total} | Etiket |
| KDV Hariç Toplam | K{total}-L{total} | `=SUM(K6:L{total-1})` |
| KDV Dahil Toplam | O{total} | `=SUM(O6:O{total-1})` |

Not: `{r}` = satır numarası (6, 7, 8, ...), `{total}` = toplam satır numarası

## Hesaplama Formülleri

### KDV Dahil Birim Fiyat
```
netUnitWithVat = unitPrice * (1 + vatRate / 100)
```

### KDV Hariç Toplam
```
totalExVat = quantity * unitPrice
```

### KDV Dahil Toplam
```
totalWithVat = quantity * netUnitWithVat
```

## Fark Gösterimi

Talep vs Teklif karşılaştırması:

| Fark Türü | Gösterim | Renk |
|-----------|----------|------|
| Miktar farkı | `+X` veya `-X` | Sarı arka plan |
| Fiyat farkı | `%+X` veya `%-X` | Kırmızı (artış) / Yeşil (azalış) |
| Termin farkı | `+X gün` veya `-X gün` | Mavi arka plan |
| Birim farkı | Birim değişikliği | Sarı arka plan |

## Kur Bilgileri

TRY dışı para birimi seçildiğinde otomatik olarak "Kur Bilgileri" bölümü gösterilir:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `fxCurrency` | Currency | Para birimi |
| `fxRate` | number | Kur değeri |
| `fxDate` | string (ISO) | Kur tarihi |
| `source` | 'TCMB'\|'XE'\|'MANUAL'\|'OTHER'? | Kur kaynağı |

## API Endpoints

### POST /api/offers/parse
Excel veya JSON'dan teklif şemasına parse eder.

**Request:**
- `file` (multipart/form-data): Excel dosyası
- VEYA `offer` (JSON body): Teklif objesi

**Response:**
```json
{
  "ok": true,
  "offer": { ... }
}
```

### POST /api/offers/validate
Teklif şemasını doğrular.

**Request:**
```json
{
  "offer": { ... }
}
```

**Response:**
```json
{
  "ok": true,
  "valid": true,
  "offer": { ... },
  "businessRules": {
    "valid": true,
    "issues": []
  }
}
```

### POST /api/offers
Teklifi kalıcı kaydeder.

**Request:**
```json
{
  "offer": { ... }
}
```

**Response:**
```json
{
  "ok": true,
  "offer": { ... },
  "message": "Teklif kaydedildi"
}
```

### POST /api/offers/:id/submit
Teklifi gönderir (durum: draft → submitted).

**Request:**
```json
{
  "offer": { ... }
}
```

**Response:**
```json
{
  "ok": true,
  "offer": { ... },
  "message": "Teklif başarıyla gönderildi"
}
```

### POST /api/offers/export
Excel export oluşturur.

**Request:**
```json
{
  "offer": { ... }
}
```

**Response:**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Body: Excel buffer

## Doğrulama ve Kurallar

### Zorunlu Alanlar
- `header.satfkCode`
- `header.title`
- `header.currency`
- En az 1 satır (`lines.length >= 1`)
- Her satırda: `itemName`, `uom`, `quantity > 0`, `unitPrice >= 0`

### Tür Kontrolleri
- Tarih formatları: ISO string veya Date object
- `quantity > 0`
- `unitPrice >= 0`
- `vatRate` 0-100 arası

### İş Kuralları
- `isSealedBid = true` ise tek sefer gönderim (düzenleme kilidi)
- `dueDate` geçmiş olmasın
- `validUntil >= today`
- Gizli teklifler sadece `draft` veya `submitted` durumunda olabilir

## Kullanım Örnekleri

### React Komponenti Kullanımı

```tsx
import OfferTab from '@/pages/demands/[id]/OfferTab';
import { DemandData } from '@/domain/offer/schema';

function DemandDetailPage() {
  const demandData: DemandData = {
    satfk: 'SATFK-20251024-00C9',
    title: 'Test Talep',
    // ...
  };
  
  const handleSubmit = async (offer: Offer) => {
    const response = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer }),
    });
    // ...
  };
  
  return (
    <OfferTab
      demandId="demand_123"
      demandData={demandData}
      onSubmit={handleSubmit}
    />
  );
}
```

### Excel Export

```typescript
import { exportSupplierOffer } from '@/export/excel/supplierOfferExport';

const offer: Offer = { /* ... */ };
const buffer = await exportSupplierOffer(offer);

// Tarayıcıda
const blob = new Blob([buffer], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `Teklif_${offer.header.satfkCode}.xlsx`;
a.click();
```

### Excel Import

```typescript
import { importSupplierOfferBrowser } from '@/import/excel/supplierOfferImport';

const fileInput = document.querySelector('input[type="file"]');
fileInput.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const offer = await importSupplierOfferBrowser(file);
    console.log('Parsed offer:', offer);
  }
};
```

## Dosya Yapısı

```
src/
├── domain/
│   └── offer/
│       ├── schema.ts          # TypeScript şemaları
│       ├── mapping.ts         # Alan eşleme
│       └── synonyms.tr.json   # Türkçe sözlük
├── pages/
│   └── demands/
│       └── [id]/
│           └── OfferTab.tsx  # React form komponenti
├── services/
│   └── currency.ts           # Para birimi ve kur servisi
├── export/
│   └── excel/
│       └── supplierOfferExport.ts  # Excel export
├── import/
│   └── excel/
│       └── supplierOfferImport.ts  # Excel import
└── __tests__/
    └── offer.spec.ts         # Testler

server/src/api/
└── offers.ts                # HTTP API endpoints

assets/
└── SATINALMAVETEKLİFFORMU.xlsx  # Excel şablonu
```

## Testler

Testleri çalıştırmak için:
```bash
npm test
```

Testler şunları kapsar:
- ✅ Mapping (priority EN→TR)
- ✅ KDV/net hesapları
- ✅ Termin/miktar fark uyarıları
- ✅ Ödeme şartları yazımı
- ✅ Excel export formülleri ve alan yerleşimi
- ✅ Schema validation

## Build

Build çalıştırmak için:
```bash
npm run build
```

Tüm TypeScript dosyaları derlenir ve Vite build çıktısı oluşturulur.

## Geliştirme

Geliştirme sunucusunu başlatmak için:
```bash
npm run dev
```

API sunucusunu başlatmak için:
```bash
npm run dev:api
```

