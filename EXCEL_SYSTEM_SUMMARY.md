# 🎯 Excel Talep ve Teklif Mukayese Sistemi - Tamamlandı

## ✅ **Oluşturulan Dosyalar**

### 1. **Python Scriptleri**
- **`import_purchase.py`**: Excel talep formu → JSON dönüştürücü
- **`export_comparison.py`**: JSON + teklifler → Excel mukayese dönüştürücü

### 2. **Örnek Veri Dosyaları**
- **`talep.json`**: Örnek talep verisi (4 ürün kalemi)
- **`bids.json`**: Örnek teklif verisi (5 firma)

### 3. **Dokümantasyon**
- **`EXCEL_SYSTEM_README.md`**: Detaylı kullanım kılavuzu

## 🔧 **Sistem Özellikleri**

### **Excel → JSON (Talep Okuma)**
- ✅ Excel şablonundaki üst bilgileri okur
- ✅ Ürün kalemlerini sıralı şekilde çıkarır
- ✅ Başlık satırını otomatik bulur
- ✅ Türkçe karakter desteği
- ✅ Hata yönetimi ve validasyon

### **JSON → Excel (Teklif Mukayese)**
- ✅ Firmaları toplam fiyata göre sıralar (en ucuz solda)
- ✅ Premium üyeler için dinamik sütun genişletme
- ✅ Birim fiyat × miktar = satır toplamı
- ✅ Firma toplamları alt satırlarda
- ✅ Ödeme, termin, teslim, açıklama bilgileri

## 📊 **Veri Formatları**

### **talep.json Yapısı**
```json
{
  "company_name": "Test Firma A.Ş.",
  "talep_konusu": "İnşaat Malzemeleri Alımı",
  "stf_no": "STF-2025-0001",
  "talep_kodu": "FBXR1L8A5P",
  "santiye": "Ankara Şantiyesi",
  "usd_try": 34.85,
  "termin_tarihi": "2025-10-25",
  "alim_yeri": "Merkez Depo",
  "aciklama": "Teknik şartnameye uygun ürünler tercih edilecek.",
  "items": [
    {
      "no": 1,
      "sku": "CMT-001",
      "name": "Çimento",
      "brand": "Akçansa",
      "qty": 100,
      "unit": "Torba",
      "req_date": "2025-10-23"
    }
  ]
}
```

### **bids.json Yapısı**
```json
{
  "firms": [
    {
      "firma_adi": "Akz Petrol Ltd.",
      "tel": "05001234567",
      "odeme": "%50 Peşin",
      "termin": "2025-10-25",
      "fiyatlar": [250, 400, null, 33.0]
    }
  ]
}
```

## 🎯 **Şablon Hücre Eşleştirmeleri**

### **Talep Formu Mapping**
```python
PURCHASE_FORM_MAP = {
    "company_name": "A1",    # Talep eden firma ismi
    "talep_konusu": "B5",    # Talep Konusu
    "stf_no": "S2",          # STF No
    "talep_kodu": "T1",      # Talep Kodu
    "santiye": "S3",         # Şantiye
    "usd_try": "T4",         # USD/TRY Kuru
    "termin_tarihi": "B23",  # Termin Tarihi
    "alim_yeri": "B24",      # Alım Yeri
    "aciklama": "F25",       # Açıklama
}
```

### **Mukayese Formu Mapping**
```python
COMPARE_TOP_MAP = {
    "talep_kodu": "T1",
    "stf_no": "T2",
    "santiye": "T3",
    "usd_try": "T4",
    "talep_konusu": "B5",
}
```

## 🔧 **Kullanım**

### **1. Talep Formu Okuma**
```bash
pip install openpyxl
python import_purchase.py
# Çıktı: talep.json
```

### **2. Teklif Mukayese**
```bash
python export_comparison.py
# Çıktı: mukayese_tablo_STF-2025-0001.xlsx
```

## 🎨 **Excel Çıktı Özellikleri**

### **Üst Bilgiler**
- ✅ Talep Kodu (T1)
- ✅ STF No (T2)
- ✅ Şantiye (T3)
- ✅ USD/TRY Kuru (T4)
- ✅ Talep Konusu (B5)

### **Ürün Tablosu**
- ✅ Sıra No (B8, B9...)
- ✅ Ürün İsmi (C8, C9...)
- ✅ Miktar (D8, D9...)
- ✅ Birim (E8, E9...)

### **Firma Teklifleri**
- ✅ Firma Adı + Telefon (F6, I6, L6...)
- ✅ Birim Fiyatlar (F8, F9...)
- ✅ Satır Toplamları (G8, G9...)
- ✅ Firma Toplamları (F21, I21...)
- ✅ Ödeme Şartları (F22, I22...)
- ✅ Teslim Süresi (F23, I23...)
- ✅ Teslim Şekli (F24, I24...)
- ✅ Açıklama (F25, I25...)

## 🚀 **Premium Özellikler**

### **Dinamik Sütun Genişletme**
- **İlk 5 Firma**: F, I, L, O, R sütunları
- **6+ Firma**: Otomatik 3'er sütun blokları (U, X, AA...)
- **Sınırsız**: Premium üyeler için sınırsız firma desteği

### **Akıllı Sıralama**
- ✅ Firmalar toplam fiyata göre sıralanır
- ✅ En ucuz firma en solda
- ✅ Fiyat verilmeyen kalemler toplamdan çıkarılır

## 🔍 **Hata Yönetimi**

### **Dosya Kontrolleri**
- ✅ Excel dosyası varlığı
- ✅ JSON format validasyonu
- ✅ Şablon hücre kontrolü

### **Veri Validasyonu**
- ✅ Başlık satırı otomatik bulma
- ✅ Boş değer kontrolü
- ✅ Sayısal değer kontrolü

## 🎉 **Sonuç**

✅ **Excel talep formu okuma sistemi tamamlandı**
✅ **Teklif mukayese Excel çıktı sistemi tamamlandı**
✅ **Örnek veri dosyaları oluşturuldu**
✅ **Detaylı dokümantasyon hazırlandı**
✅ **Premium üye desteği eklendi**
✅ **Türkçe karakter desteği**
✅ **Hata yönetimi ve validasyon**

**Artık Excel şablonlarından talep verisi okuyup, teklifleri karşılaştırarak Excel çıktısı üretebilirsiniz!** 🚀

### 📋 **Sonraki Adımlar**
1. `pip install openpyxl` ile gerekli kütüphaneyi yükleyin
2. `python import_purchase.py` ile talep formu okuyun
3. `python export_comparison.py` ile mukayese Excel'i oluşturun
4. Çıktıları kontrol edin ve sistemi test edin
