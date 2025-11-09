# Excel'den Teklif Yükleme Sistemi

## Genel Bakış

Sistem tedarikçilere Excel şablonu sağlar, tedarikçiler bu şablonu doldurup yükler, sistem otomatik olarak teklifi işler.

## Akış

1. **Tedarikçi Excel İndirir (SATFK)**
   - `demand-detail.html` sayfasında "Excel İndir" butonu
   - Excel'de talep bilgileri ve ürün listesi (sıralama, adet, miktar aynı)
   - Tedarikçinin dolduracağı alanlar: Fiyat, Marka, Ödeme, Termin, vb.

2. **Tedarikçi Excel'i Doldurur**
   - Ürün sırası değiştirilmez
   - Adet/miktar değiştirilmez
   - Teklif alanları doldurulur

3. **Excel Yüklenir**
   - "Excel'den Teklif Yükle" butonu ile yüklenir
   - Sistem Excel'i analiz eder
   - Teklif oluşturulur

## Excel Yapısı

### Mevcut SATFK Excel Formatı (Export)

```
A: Satır No
B: Ürün Adı/Tanım
C: Miktar
D: Birim
E: Termin (hedef)
F: ... (ek alanlar)
```

### Teklif Excel Formatı (Yeni - Tedarikçi Doldurur)

```
A: Satır No (aynı)
B: Ürün Adı (aynı)
C: Miktar (aynı - değiştirilemez)
D: Birim (aynı - değiştirilemez)
E: Termin (hedef - görüntülenir)
F: Birim Fiyat (TEDARİKÇİ DOLDURUR)
G: Marka (TEDARİKÇİ DOLDURUR)
H: Ödeme Şartları (TEDARİKÇİ DOLDURUR)
I: KDV Oranı (TEDARİKÇİ DOLDURUR)
J: Toplam Fiyat (TEDARİKÇİ DOLDURUR veya otomatik hesaplanır)
K: Açıklama/Not (TEDARİKÇİ DOLDURUR)
```

## Uygulama Gereksinimleri

### 1. Excel Export - Tedarikçi Şablonu

`exportSatfkExcel()` fonksiyonu güncellenecek:
- Mevcut ürün bilgileri + teklif alanları (boş)
- Sütun başlıkları açık olmalı
- Talep adı ve SATFK görünür olmalı

### 2. Excel Import - Teklif İşleme

`importBidFromExcel()` fonksiyonu güncellenecek:
- Excel'den teklif verilerini okur
- Ürün sıralamasını kontrol eder
- Teklif oluşturur

### 3. Validasyon

- Ürün sayısı eşleşmeli
- Sıralama korunmalı
- Zorunlu alanlar doldurulmalı (Fiyat, vb.)

## Dosya Yapısı

- `demand-detail.html`: Excel export/import fonksiyonları
- `exportSatfkExcel()`: Tedarikçi şablonu oluşturur
- `importBidFromExcel()`: Doldurulmuş Excel'i işler

