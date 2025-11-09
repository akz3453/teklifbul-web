# 📊 Excel Şablon ve Akıllı Eşleştirme Sistemi - Yol Haritası

**Tarih**: 2025-01-21  
**Hedef**: Kullanıcıların standart Excel şablonu indirip doldurması ve firmaların kendi formlarını yükleyebilmesi

---

## 🎯 PROJE HEDEFLERİ

### 1. Standart Excel Şablonu
- ✅ Kullanıcılar indirebilecek
- ✅ Tüm gerekli alanları içerecek
- ✅ Örnek verilerle dolu olacak
- ✅ Sistem tarafından otomatik tanınacak

### 2. Akıllı Eşleştirme Sistemi
- ✅ Firmalar kendi formlarını yükleyebilecek
- ✅ Sistem kolonları otomatik eşleştirecek
- ✅ Öğrenme sistemi (supplier memory)
- ✅ Yüksek güven skoru ile otomatik, düşük skor ile manuel onay

---

## 📋 MEVCUT DURUM ANALİZİ

### ✅ Mevcut Özellikler
1. **Import Sistemi**: `/api/import/preview` endpoint'i var
2. **Excel Parser**: `server/services/importParser.ts` - Levenshtein distance ile kolon eşleştirme
3. **Mapping Service**: `server/services/mappingService.ts` - Akıllı eşleştirme
4. **Supplier Memory**: `server/services/supplierMemory.ts` - Öğrenme sistemi
5. **Frontend Import**: `demand-new.html` - Excel/Word/PDF yükleme butonları

### ❌ Eksik Özellikler
1. **Standart Şablon İndirme**: Kullanıcılar şablon indiremiyor
2. **Şablon Oluşturma Endpoint**: Backend'de Excel oluşturma yok
3. **Şablon Tanıma**: Sistem standart şablonu özel olarak tanımıyor
4. **Eşleştirme Görselleştirme**: Kullanıcı kolon eşleştirmelerini göremiyor
5. **Eşleştirme Onayı**: Düşük güven skorunda manuel onay yok

---

## 🗺️ YOL HARİTASI

### **FAZE 1: Standart Excel Şablonu Oluşturma** (2-3 saat)

#### 1.1. Şablon Tasarımı
**Dosya**: `public/templates/demand-template.xlsx` (örnek)

**Yapı**:
```
Sayfa 1: "Talep Bilgileri"
- A1: "SATFK" | B1: [Otomatik oluşturulacak]
- A2: "Başlık" | B2: [Örnek: "İnşaat Malzemeleri Talep Formu"]
- A3: "Talep Eden" | B3: [Örnek: "Ahmet Yılmaz"]
- A4: "Talep Tarihi" | B4: [Örnek: "2025-01-21"]
- A5: "Teslim Tarihi" | B5: [Örnek: "2025-02-15"]
- A6: "Para Birimi" | B6: [Örnek: "TRY"]
- A7: "Şantiye" | B7: [Örnek: "Ankara Şantiyesi"]
- A8: "Alım Yeri (İl)" | B8: [Örnek: "Ankara"]
- A9: "Notlar" | B9: [Örnek: "Acil ihtiyaç"]

Sayfa 2: "Kalemler"
- Başlık satırı (Satır 1):
  - A1: "Sıra No"
  - B1: "Malzeme Kodu (SKU)"
  - C1: "Malzeme Tanımı"
  - D1: "Marka"
  - E1: "Model"
  - F1: "Miktar"
  - G1: "Birim"
  - H1: "Ambar Miktarı"
  - I1: "Hedef Birim Fiyat"
  - J1: "KDV %"
  - K1: "Teslim Tarihi"
  - L1: "Notlar"

- Örnek veriler (Satır 2-4):
  - Satır 2: 1 | "SKU001" | "Çimento CEM I 42.5R" | "Lafarge" | "42.5R" | 100 | "Ton" | 50 | 850.00 | 18 | "2025-02-15" | "Acil"
  - Satır 3: 2 | "SKU002" | "Demir Çubuk Ø12" | "İçdaş" | "Ø12" | 500 | "Kg" | 200 | 12.50 | 18 | "2025-02-20" | ""
  - Satır 4: 3 | "SKU003" | "Kum 0-5mm" | "Yerel" | "" | 20 | "m³" | 10 | 45.00 | 18 | "2025-02-10" | ""
```

#### 1.2. Backend: Şablon Oluşturma Endpoint
**Dosya**: `server/routes/template.ts` (yeni)

**Endpoint**: `GET /api/template/demand`

**Özellikler**:
- ExcelJS ile şablon oluşturma
- İki sayfa: "Talep Bilgileri" ve "Kalemler"
- Örnek verilerle dolu
- Formatlanmış (başlıklar kalın, renkli)
- Data validation (birim listesi, para birimi listesi)

#### 1.3. Frontend: Şablon İndirme Butonu
**Dosya**: `demand-new.html`

**Konum**: Import butonlarının yanına

**Buton**: "📥 Şablon İndir" veya "📥 Örnek Excel İndir"

**Özellikler**:
- Butona tıklayınca `/api/template/demand` endpoint'ine istek
- Excel dosyası indirilir
- Toast ile bilgilendirme

---

### **FAZE 2: Akıllı Eşleştirme Sistemi Geliştirme** (4-5 saat)

#### 2.1. Kolon Eşleştirme Görselleştirme
**Dosya**: `demand-new.html` (yeni modal)

**Özellikler**:
- Dosya yüklendikten sonra eşleştirme önizlemesi
- Kolon eşleştirmeleri tablo halinde göster
- Kullanıcı eşleştirmeleri düzeltebilsin
- Güven skorları göster (renk kodlu)
- "Onayla" butonu ile devam et

**Modal Yapısı**:
```
┌─────────────────────────────────────────┐
│  📊 Kolon Eşleştirme Önizlemesi        │
├─────────────────────────────────────────┤
│  Dosya: talep-formu.xlsx               │
│  Güven Skoru: 85% ✅                    │
│                                         │
│  ┌─────────────┬─────────────┬────────┐│
│  │ Excel Kolonu│ Sistem Alanı│ Güven  ││
│  ├─────────────┼─────────────┼────────┤│
│  │ Ürün Adı    │ itemName    │ 95% ✅ ││
│  │ Miktar      │ qty         │ 90% ✅ ││
│  │ Birim       │ unit        │ 88% ✅ ││
│  │ Marka       │ brand       │ 75% ⚠️ ││
│  │ ???         │ ???         │ 0% ❌  ││
│  └─────────────┴─────────────┴────────┘│
│                                         │
│  [❌ İptal]  [✅ Onayla ve Devam Et]   │
└─────────────────────────────────────────┘
```

#### 2.2. Manuel Eşleştirme Düzeltme
**Özellikler**:
- Dropdown ile sistem alanları seçilebilir
- "Eşleştirme Yok" seçeneği
- Gerçek zamanlı önizleme
- Kaydet butonu ile supplier memory'ye kaydet

#### 2.3. Supplier Memory Geliştirme
**Dosya**: `server/services/supplierMemory.ts` (güncelle)

**Özellikler**:
- Firma bazlı kolon eşleştirme kayıtları
- Dosya adı pattern matching
- Öğrenme: Kullanıcı düzeltirse kaydet
- Öncelik: En çok kullanılan eşleştirmeleri öner

**Veri Yapısı**:
```typescript
interface SupplierColumnMapping {
  supplierId: string;
  fileNamePattern: string; // regex veya basit pattern
  mappings: {
    [excelColumn: string]: {
      systemField: string;
      confidence: number;
      usageCount: number;
      lastUsed: Date;
    }
  };
}
```

#### 2.4. Eşleştirme Skorlama İyileştirme
**Dosya**: `server/services/scorers.ts` (güncelle)

**Özellikler**:
- Supplier memory'den öğrenilen eşleştirmeler +20 puan
- Dosya adı pattern eşleşmesi +15 puan
- Levenshtein distance (mevcut) +10 puan
- Toplam skor: 0-100

**Eşik Değerleri**:
- 90+ : Otomatik onay (kullanıcıya gösterilmez)
- 70-89: Önizleme göster, otomatik onay
- 50-69: Önizleme göster, manuel onay iste
- <50: Önizleme göster, zorunlu manuel onay

---

### **FAZE 3: Standart Şablon Tanıma** (1-2 saat)

#### 3.1. Şablon İmzası
**Özellikler**:
- Standart şablonu özel olarak tanı
- Şablon versiyonu kontrolü
- Otomatik yüksek güven skoru (95%+)

**Tanıma Yöntemi**:
- Sayfa adları: "Talep Bilgileri" ve "Kalemler"
- Başlık satırı: A1="SATFK", A2="Başlık", vb.
- Kalemler sayfası: A1="Sıra No", C1="Malzeme Tanımı", vb.

#### 3.2. Şablon Versiyonlama
**Özellikler**:
- Şablon içinde versiyon bilgisi (hidden sheet veya metadata)
- Yeni versiyonlarda uyumluluk kontrolü
- Eski versiyonları destekle

---

### **FAZE 4: UI/UX İyileştirmeleri** (2-3 saat)

#### 4.1. Import Akışı İyileştirme
**Akış**:
1. Kullanıcı "Excel'den İçe Aktar" butonuna tıklar
2. Dosya seçer
3. Sistem analiz eder (loading)
4. Eşleştirme önizlemesi gösterilir (gerekirse)
5. Kullanıcı onaylar
6. Form doldurulur
7. Başarı mesajı

#### 4.2. Hata Yönetimi
**Özellikler**:
- Eşleştirilemeyen kolonlar için uyarı
- Eksik zorunlu alanlar için hata
- Örnek veri göster (ilk 3 satır)
- "Yardım" butonu ile dokümantasyon

#### 4.3. Şablon Yardımı
**Özellikler**:
- "Şablon nasıl kullanılır?" modalı
- Video/ekran görüntüsü
- Örnek doldurulmuş şablon

---

## 📁 OLUŞTURULACAK DOSYALAR

### Backend
1. `server/routes/template.ts` - Şablon oluşturma endpoint'i
2. `server/services/templateGenerator.ts` - Excel şablon oluşturma servisi
3. `server/services/supplierMemory.ts` - Güncelle (kolon eşleştirme kayıtları)
4. `server/services/scorers.ts` - Güncelle (supplier memory entegrasyonu)

### Frontend
1. `demand-new.html` - Güncelle (şablon indirme butonu, eşleştirme modalı)
2. `assets/js/ui/column-mapping-modal.js` - Yeni (eşleştirme modalı)
3. `assets/css/column-mapping.css` - Yeni (modal stilleri)

### Public
1. `public/templates/demand-template.xlsx` - Örnek şablon (opsiyonel, backend'den oluşturulabilir)

---

## 🔧 TEKNİK DETAYLAR

### Excel Şablon Formatı

**Sayfa 1: "Talep Bilgileri"**
- A kolonu: Etiketler
- B kolonu: Değerler
- Satır 1-9: Talep bilgileri
- Format: Başlıklar kalın, renkli (#E3F2FD)

**Sayfa 2: "Kalemler"**
- Satır 1: Başlıklar (kalın, renkli)
- Satır 2-4: Örnek veriler
- Satır 5+: Kullanıcı verileri
- Format: Tablo formatı, border'lar

### Kolon Eşleştirme Dictionary

**Mevcut Dictionary** (`importParser.ts`):
```typescript
const DICT: Record<string,string[]> = {
  itemName: ['ürün adı','ürün ismi','malzeme','stok adı','açıklama','ürün'],
  qty: ['miktar','qty','adet'],
  unit: ['birim','unit'],
  // ...
};
```

**Geliştirme**: Supplier memory'den öğrenilen eşleştirmeleri önceliklendir

### API Endpoints

**Yeni Endpoint'ler**:
1. `GET /api/template/demand` - Standart şablon indir
2. `POST /api/import/preview` - Mevcut (güncelle: eşleştirme detayları döndür)
3. `POST /api/import/confirm-mapping` - Yeni: Manuel eşleştirme onayı
4. `POST /api/supplier-memory/save-mapping` - Yeni: Eşleştirme kaydet

**Response Format** (`/api/import/preview` güncelle):
```json
{
  "ok": true,
  "demand": { ... },
  "items": [ ... ],
  "mapping": {
    "columns": [
      {
        "excelColumn": "Ürün Adı",
        "systemField": "itemName",
        "confidence": 95,
        "suggested": true
      }
    ],
    "overallConfidence": 85,
    "needsReview": false
  },
  "warnings": [ ... ]
}
```

---

## 📊 BAŞARI KRİTERLERİ

### Standart Şablon
- ✅ Kullanıcılar şablonu indirebiliyor
- ✅ Şablon tüm gerekli alanları içeriyor
- ✅ Şablon sistem tarafından %95+ güvenle tanınıyor
- ✅ Şablon doldurulup yüklendiğinde form otomatik dolduruluyor

### Akıllı Eşleştirme
- ✅ Firmalar kendi formlarını yükleyebiliyor
- ✅ Sistem kolonları %70+ güvenle eşleştiriyor
- ✅ Kullanıcı eşleştirmeleri düzeltebiliyor
- ✅ Düzeltilen eşleştirmeler kaydediliyor
- ✅ Sonraki yüklemelerde öğrenilen eşleştirmeler kullanılıyor

---

## 🚀 UYGULAMA SIRASI

### Öncelik 1: Standart Şablon (Hızlı Kazanım)
1. Excel şablonu tasarla
2. Backend endpoint oluştur
3. Frontend buton ekle
4. Test et

### Öncelik 2: Eşleştirme Görselleştirme (Kullanıcı Deneyimi)
1. Modal tasarla
2. Eşleştirme verilerini göster
3. Manuel düzeltme ekle
4. Test et

### Öncelik 3: Supplier Memory (Uzun Vadeli)
1. Veri yapısını tasarla
2. Kaydetme endpoint'i
3. Öğrenme algoritması
4. Test et

---

## ⚠️ RİSKLER VE ÇÖZÜMLER

### Risk 1: Çok Fazla Kolon Çeşitliliği
**Çözüm**: Supplier memory ile öğren, en yaygın formatları destekle

### Risk 2: Düşük Eşleştirme Skorları
**Çözüm**: Manuel düzeltme modalı, kullanıcıya kontrol ver

### Risk 3: Performans (Büyük Dosyalar)
**Çözüm**: Streaming parse, progress bar, timeout kontrolü

### Risk 4: Şablon Versiyon Uyumsuzluğu
**Çözüm**: Versiyon kontrolü, geriye dönük uyumluluk

---

## 📝 NOTLAR

- Mevcut import sistemi zaten iyi çalışıyor, sadece geliştirilecek
- Supplier memory sistemi var, sadece kolon eşleştirme eklenmeli
- ExcelJS kütüphanesi mevcut, şablon oluşturma kolay
- Frontend'de modal sistemi var, yeni modal eklemek kolay

---

## ✅ ONAY BEKLİYOR

Bu yol haritası ile devam edelim mi? Hangi fazdan başlayalım?

**Önerilen Başlangıç**: FAZE 1 (Standart Excel Şablonu) - Hızlı kazanım, kullanıcılar hemen kullanabilir.

