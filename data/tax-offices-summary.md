# Vergi Dairesi Raporu - Tüm İller

Bu dosya, PDF'den çıkarılan vergi dairesi verilerinin özetidir.

## 📊 Özet

- **Toplam İl Sayısı**: 81 il
- **Vergi Dairesi Bulunan İl**: 81 il (hepsi)
- **Toplam Vergi Dairesi**: 1,459 vergi dairesi

## 📄 Detaylı Rapor

Detaylı rapor için `data/tax-offices-report.json` dosyasına bakın.

Bu JSON dosyasında her il için:
- `pdf_city_name`: PDF'deki ham il adı
- `normalized`: Normalize edilmiş il adı (eşleştirme için)
- `count`: O il için vergi dairesi sayısı
- `offices`: Vergi dairesi adları listesi

## 🔍 İller Bazında Sayılar

Tüm 81 il için vergi dairesi verisi mevcut. Her il için en az 1, en fazla 70 vergi dairesi var.

- **En çok vergi dairesi olan il**: İstanbul (70 vergi dairesi)
- **En az vergi dairesi olan il**: Bayburt (3 vergi dairesi)

## 📝 Notlar

- PDF'den çıkarılan veriler normalize edilmiş (Türkçe karakterler düzeltilmiş)
- Plaka numaraları otomatik olarak kaldırılmış
- Geçersiz kayıtlar (GENEL, SIRA, NO., vb.) filtrelenmiş

