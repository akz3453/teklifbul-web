# 📊 Excel Talep ve Teklif Mukayese Sistemi

Bu sistem Excel şablonlarını okuyup JSON'a çeviren ve tekrar Excel'e dönüştüren Python scriptlerini içerir.

## 📁 Dosya Yapısı

```
teklifbul-web/
├── assets/
│   ├── satın alma talep formu.xlsx    # Talep şablonu
│   └── teklif mukayese formu.xlsx     # Mukayese şablonu
├── import_purchase.py                 # Excel → JSON (Talep)
├── export_comparison.py              # JSON → Excel (Mukayese)
├── talep.json                        # Örnek talep verisi
├── bids.json                         # Örnek teklif verisi
└── README.md                         # Bu dosya
```

## 🔧 Kurulum

```bash
pip install openpyxl
```

## 📋 Kullanım

### 1. Talep Formu Okuma (Excel → JSON)

```bash
python import_purchase.py
```

**Çıktı**: `talep.json`

**Özellikler**:
- Excel şablonundaki üst bilgileri okur
- Ürün kalemlerini sıralı şekilde çıkarır
- Başlık satırını otomatik bulur
- Türkçe karakter desteği

### 2. Teklif Mukayese (JSON → Excel)

```bash
python export_comparison.py
```

**Çıktı**: `mukayese_tablo_STF-2025-0001.xlsx`

**Özellikler**:
- Firmaları toplam fiyata göre sıralar (en ucuz solda)
- Premium üyeler için dinamik sütun genişletme
- Birim fiyat × miktar = satır toplamı
- Firma toplamları alt satırlarda

## 📊 Veri Formatları

### talep.json
```json
{
  "company_name": "Firma Adı",
  "talep_konusu": "Talep Konusu",
  "stf_no": "STF-2025-0001",
  "talep_kodu": "FBXR1L8A5P",
  "santiye": "Şantiye Adı",
  "usd_try": 34.85,
  "termin_tarihi": "2025-10-25",
  "alim_yeri": "Teslim Yeri",
  "aciklama": "Açıklama",
  "items": [
    {
      "no": 1,
      "sku": "Malzeme Kodu",
      "name": "Ürün Adı",
      "brand": "Marka",
      "qty": 100,
      "unit": "Birim",
      "req_date": "2025-10-23"
    }
  ]
}
```

### bids.json
```json
{
  "firms": [
    {
      "firma_adi": "Tedarikçi Adı",
      "tel": "05001234567",
      "odeme": "%50 Peşin",
      "termin": "2025-10-25",
      "fiyatlar": [250, 400, null, 33.0]
    }
  ]
}
```

## 🎯 Şablon Hücre Eşleştirmeleri

### Talep Formu (import_purchase.py)
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

### Mukayese Formu (export_comparison.py)
```python
COMPARE_TOP_MAP = {
    "talep_kodu": "T1",
    "stf_no": "T2",
    "santiye": "T3",
    "usd_try": "T4",
    "talep_konusu": "B5",
}
```

## 🔧 Özelleştirme

### Şablon Değişiklikleri
Şablon hücreleri değişirse sadece mapping'leri güncelleyin:

- **Talep Formu**: `PURCHASE_FORM_MAP` ve `ITEM_HEADER_KEYS`
- **Mukayese Formu**: `COMPARE_TOP_MAP` ve `BASE_COLS`

### Premium Üye Desteği
3+ firma durumunda otomatik sütun genişletme:
- İlk 5 firma: F, I, L, O, R sütunları
- 6+ firma: Otomatik 3'er sütun blokları (U, X, AA...)

### Fiyat Verilmeyen Kalemler
`null` değer gönderin → Excel hücresi boş kalır, toplam hesaplanmaz.

## 🎉 Özellikler

✅ **Excel Şablon Okuma**: Üst bilgiler ve ürün kalemleri
✅ **Otomatik Başlık Bulma**: Türkçe başlık desteği
✅ **Fiyat Sıralama**: En ucuz firma solda
✅ **Dinamik Sütun**: Premium üyeler için otomatik genişletme
✅ **Toplam Hesaplama**: Birim fiyat × miktar
✅ **Hata Yönetimi**: Dosya bulunamama ve format hataları
✅ **Türkçe Desteği**: UTF-8 encoding

## 🚀 Gelişmiş Kullanım

### Özel Dosya Yolları
```bash
python import_purchase.py "custom_talep.xlsx"
python export_comparison.py "custom_talep.json" "custom_bids.json" "custom_template.xlsx" "output.xlsx"
```

### Batch İşlem
```bash
# Birden fazla talep dosyası işle
for file in *.xlsx; do
    python import_purchase.py "$file"
done
```

## 📝 Notlar

- **KDV Hesaplama**: Şu anda KDV dahil değil, gerekirse şablona ek sütun eklenebilir
- **Tarih Formatı**: Excel'deki tarih formatı korunur
- **Boş Değerler**: `null` değerler Excel'de boş hücre olarak gösterilir
- **Performans**: Büyük dosyalar için optimize edilmiştir

## 🔍 Sorun Giderme

### Yaygın Hatalar
1. **"Dosya bulunamadı"**: Dosya yollarını kontrol edin
2. **"Başlık satırı bulunamadı"**: `ITEM_HEADER_KEYS`'i güncelleyin
3. **"Hücre bulunamadı"**: `PURCHASE_FORM_MAP`'i kontrol edin

### Debug Modu
Scriptlerde detaylı log çıktısı vardır, hata durumunda console'u kontrol edin.
