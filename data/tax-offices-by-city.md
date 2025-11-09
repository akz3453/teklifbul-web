# İl Bazında Vergi Dairesi Listesi

Bu dosya, her il için hangi vergi dairelerinin gösterildiğini açıklar.

## 📊 Genel Bilgiler

- **Toplam İl Sayısı**: 81 il
- **Vergi Dairesi Bulunan İl**: 81 il (hepsi)
- **Toplam Vergi Dairesi**: ~1,459 vergi dairesi

## 🔍 Nasıl Çalışır?

1. **İl Seçimi**: Kullanıcı "İl" dropdown'ından bir il seçer (örn: Diyarbakır, Ardahan, Isparta)
2. **Otomatik Filtreleme**: Sistem seçilen il ile eşleşen vergi dairelerini bulur
3. **Gösterim**: Vergi daireleri 3 gruba ayrılır:
   - **İlçene Uygun**: İlçe bazlı vergi daireleri
   - **İl Genelinde Geçerli**: İl genelinde geçerli vergi daireleri
   - **Özel/Kapsamlı**: Nationwide (tüm ülkede geçerli) vergi daireleri

## 📋 İl Bazında Vergi Dairesi Sayıları

Detaylı liste için `data/tax-offices-report.json` dosyasına bakın.

### Örnek İller:

- **Ardahan**: 6 vergi dairesi
- **Diyarbakır**: 29 vergi dairesi
- **Isparta**: 14 vergi dairesi
- **İstanbul**: 70 vergi dairesi
- **Ankara**: 63 vergi dairesi
- **İzmir**: 58 vergi dairesi

## 🔧 Eşleştirme Mantığı

Sistem şu yöntemlerle eşleştirme yapar:

1. **Tam Eşleşme**: `"ardahan" === "ardahan"`
2. **Kısmi Eşleşme**: İl adı vergi dairesi cityCode'unda geçiyorsa
3. **Başlangıç Eşleşmesi**: İl adı ile başlıyorsa
4. **Vergi Dairesi Adında İl**: Vergi dairesi adında il adı geçiyorsa

## 📄 Detaylı Rapor

Tüm iller için detaylı liste: `data/tax-offices-report.json`

Her il için:
- `pdf_city_name`: PDF'deki ham il adı
- `normalized`: Normalize edilmiş il adı (eşleştirme için)
- `count`: O il için vergi dairesi sayısı
- `offices`: Vergi dairesi adları listesi

