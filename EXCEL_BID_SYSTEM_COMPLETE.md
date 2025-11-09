# 📊 Excel'den Teklif Yükleme Sistemi - Tamamlandı

## ✅ Özellikler

### 1. **Excel İndirme (Tedarikçi Şablonu)**
- **Buton**: `demand-detail.html` → "Excel İndir" (SATFK butonu)
- **İçerik**:
  - Üst bilgiler: Talep Kodu, Talep Başlığı, Şantiye, Teslimat Adresi, vb.
  - Ürün listesi: Sıra No, Ürün Kodu, Ürün Adı, Miktar, Birim (değiştirilemez)
  - Teklif alanları (boş, tedarikçi dolduracak):
    - Birim Fiyat
    - Marka
    - KDV (%)
    - KDV Hariç Toplam
    - KDV Dahil Toplam
    - Ödeme Şartları
    - Açıklama/Not

### 2. **Excel Yükleme (Teklif Gönderme)**
- **Buton**: `demand-detail.html` → "Excel'den Teklif Yükle"
- **İşlem**:
  - Excel dosyasını okur
  - Ürün sıralamasını kontrol eder
  - Teklif verilerini analiz eder
  - Otomatik teklif oluşturur

## 📋 Excel Formatı

### Sütun Yapısı

| Sütun | Alan | Açıklama |
|-------|------|----------|
| A | Sıra No | ✅ Değiştirilemez |
| B | Ürün Kodu | ✅ Değiştirilemez |
| C | Ürün Adı/Tanım | ✅ Değiştirilemez |
| D | Miktar | ✅ Değiştirilemez |
| E | Birim | ✅ Değiştirilemez |
| F | İstenen Termin | 👁️ Görüntülenir |
| G | **Birim Fiyat** | ✍️ TEDARİKÇİ DOLDURUR |
| H | **Marka** | ✍️ TEDARİKÇİ DOLDURUR (opsiyonel) |
| I | **KDV (%)** | ✍️ TEDARİKÇİ DOLDURUR (varsayılan: 20) |
| J | **KDV Hariç Toplam** | ✍️ TEDARİKÇİ DOLDURUR veya otomatik |
| K | **KDV Dahil Toplam** | ✍️ TEDARİKÇİ DOLDURUR veya otomatik |
| L | **Ödeme Şartları** | ✍️ TEDARİKÇİ DOLDURUR |
| M | **Açıklama/Not** | ✍️ TEDARİKÇİ DOLDURUR |

### Üst Bilgiler (İlk 7 Satır)

```
Satır 1: TEKLİF FORMU
Satır 2: (Boş)
Satır 3: Talep Kodu: [SATFK] | Talep Tarihi: [Tarih]
Satır 4: Talep Başlığı: [Başlık] | Termin Tarihi: [Tarih]
Satır 5: Şantiye: [Şantiye] | Para Birimi: [TRY]
Satır 6: Teslimat Adresi: [Adres] | Ödeme Şartları: [Şartlar]
Satır 7: (Boş)
Satır 8: Başlık Satırı (Sıra No, Ürün Kodu, vb.)
```

## 🔄 Kullanım Akışı

### Adım 1: Tedarikçi Excel İndirir
1. `demand-detail.html` sayfasına gider
2. "Excel İndir" (SATFK) butonuna tıklar
3. `Teklif_Formu_[SATFK].xlsx` dosyası indirilir

### Adım 2: Tedarikçi Excel'i Doldurur
- ✅ **Değiştirilmeyecek**: Sıra No, Ürün Kodu, Ürün Adı, Miktar, Birim
- ✍️ **Doldurulacak**: Birim Fiyat (G sütunu), Marka (H), KDV (I), Toplamlar (J, K), Ödeme (L), Notlar (M)

### Adım 3: Excel Yüklenir
1. "Excel'den Teklif Yükle" butonuna tıklar
2. Doldurulmuş Excel dosyasını seçer
3. Sistem otomatik olarak:
   - Excel'i okur
   - Ürün sıralamasını kontrol eder
   - Teklif verilerini analiz eder
   - Firestore'a kaydeder

### Adım 4: Teklif Görüntülenir
- Talep detay sayfasında teklif görünür
- `bids.html` → "Gönderdiğim Teklifler" sekmesinde görünür

## ✅ Validasyonlar

1. **Ürün Sıralaması**: Orijinal talep ile eşleşir (uyarı verilir ama devam edilir)
2. **Zorunlu Alanlar**: Birim Fiyat ve Miktar mutlaka dolu olmalı
3. **Boş Satırlar**: Otomatik atlanır
4. **Toplam Satırı**: "TOPLAM" kelimesi görünce durur

## 📊 Oluşturulan Teklif Yapısı

```javascript
{
  demandId: "...",
  supplierId: "...",
  buyerId: "...",
  status: "sent",
  currency: "TRY",
  vatRate: 20, // Ortalama
  netPrice: 1000, // KDV Hariç Toplam
  grossPrice: 1200, // KDV Dahil Toplam
  totalAmount: "1200.00",
  paymentTerms: "...",
  items: [
    {
      lineNo: 1,
      description: "Ürün Adı",
      quantity: 10,
      unit: "adet",
      unitPrice: 100,
      netPrice: 100,
      totalPrice: 120,
      vatRate: 20,
      brand: "...",
      deliveryDate: "...",
      notes: "..."
    }
  ],
  notes: "...",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## 🎯 Özellikler

- ✅ Talep bilgileri Excel'de görünür
- ✅ Ürün sıralaması korunur
- ✅ Adet/miktar değiştirilemez
- ✅ Teklif alanları açıkça işaretlenmiş
- ✅ Otomatik KDV hesaplama
- ✅ Validasyon ve hata kontrolü
- ✅ Detaylı log mesajları

## 🔧 Teknik Detaylar

### Export Fonksiyonu
- `exportSatfkExcel()`: Frontend'de XLSX.js ile Excel oluşturur
- Üst bilgiler + ürün listesi + boş teklif alanları
- Başlık satırı vurgulu (mavi, beyaz yazı)

### Import Fonksiyonu
- `importBidFromExcel()`: Excel'i okur ve analiz eder
- Yeni format desteği (A=Sıra No, D=Miktar, G=Birim Fiyat)
- Eski format desteği (fallback)
- Validasyon ve eşleştirme kontrolü

## 📝 Notlar

- Excel formatı: `.xlsx` veya `.xls`
- Maksimum boyut: Browser limiti
- Encoding: UTF-8
- Tarih formatı: `tr-TR` (DD.MM.YYYY)

---

**Tarih**: 2025-01-XX  
**Dosya**: `demand-detail.html`  
**Durum**: ✅ Tamamlandı ve Test Edilmeye Hazır

