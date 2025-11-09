# İl Bazında Vergi Dairesi Listesi

## 📊 Genel Bilgiler

- **Toplam İl Sayısı**: 81 il
- **Vergi Dairesi Bulunan İl**: 81 il (hepsi)
- **Toplam Vergi Dairesi**: 1,459 vergi dairesi

## 🔍 Nasıl Çalışır?

1. Kullanıcı "İl" dropdown'ından bir il seçer (örn: **Diyarbakır**, **Ardahan**, **Isparta**)
2. Sistem otomatik olarak seçilen il ile eşleşen vergi dairelerini bulur
3. Vergi daireleri 3 gruba ayrılarak gösterilir:
   - **İlçene Uygun**: İlçe bazlı vergi daireleri
   - **İl Genelinde Geçerli**: İl genelinde geçerli vergi daireleri  
   - **Özel/Kapsamlı**: Nationwide (tüm ülkede geçerli) vergi daireleri

## 📋 İl Bazında Vergi Dairesi Sayıları

### En Çok Vergi Dairesi Olan İlk 10 İl:

1. **İstanbul**: 70 vergi dairesi
2. **Ankara**: 63 vergi dairesi
3. **Konya**: 62 vergi dairesi
4. **İzmir**: 58 vergi dairesi
5. **Denizli**: 39 vergi dairesi
6. **Balıkesir**: 38 vergi dairesi
7. **Erzurum**: 38 vergi dairesi
8. **Ordu**: 38 vergi dairesi
9. **Trabzon**: 36 vergi dairesi
10. **Bursa**: 35 vergi dairesi

### En Az Vergi Dairesi Olan İlk 10 İl:

1. **Kilis**: 1 vergi dairesi
2. **Bayburt**: 3 vergi dairesi
3. **Yalova**: 4 vergi dairesi
4. **Iğdır**: 4 vergi dairesi
5. **Bartın**: 4 vergi dairesi
6. **Hakkari**: 5 vergi dairesi
7. **Ardahan**: 6 vergi dairesi
8. **Batman**: 6 vergi dairesi
9. **Siirt**: 6 vergi dairesi
10. **Karabük**: 6 vergi dairesi

## 📝 Örnek İller ve Vergi Daireleri

### Ardahan (6 vergi dairesi)
- Ardahan Vergi Dairesi
- Göle Vergi Dairesi
- Çıldır Malmüdürlüğü
- Damal Malmüdürlüğü
- Hanak Malmüdürlüğü
- Posof Malmüdürlüğü

### Diyarbakır (29 vergi dairesi)
- Bismil Vergi Dairesi
- Dicle Malmüdürlüğü
- Ergani Vergi Dairesi
- Eğil Malmüdürlüğü
- Hani Malmüdürlüğü
- Hazro Malmüdürlüğü
- Kocaköy Malmüdürlüğü
- Kulp Malmüdürlüğü
- Lice Malmüdürlüğü
- Silvan Vergi Dairesi
- Çermik Vergi Dairesi
- Çüngüş Malmüdürlüğü
- Çınar Vergi Dairesi
- Cahit Sıtkı Tarancı Vergi Dairesi
- Gökalp Vergi Dairesi
- ... ve 14 tane daha

### Isparta (14 vergi dairesi)
- Aksu Malmüdürlüğü
- Atabey Malmüdürlüğü
- Davraz Vergi Dairesi
- Eğirdir Vergi Dairesi
- Gelendost Vergi Dairesi
- ... ve 9 tane daha

## 🔧 Eşleştirme Mantığı

Sistem şu yöntemlerle eşleştirme yapar:

1. **Tam Eşleşme**: İl adı ile vergi dairesi cityCode'u tamamen eşleşiyorsa
   - Örnek: `"ardahan" === "ardahan"`

2. **Kısmi Eşleşme**: İl adı vergi dairesi cityCode'unda geçiyorsa (her iki yönde)
   - Örnek: `"ardahan"` içinde `"ardahan"` geçiyor

3. **Başlangıç Eşleşmesi**: İl adı ile başlıyorsa
   - Örnek: `"ardahan"` ile başlıyor

4. **Vergi Dairesi Adında İl**: Vergi dairesi adında il adı geçiyorsa
   - Örnek: "Ardahan Vergi Dairesi" içinde "ardahan" geçiyor

## 📄 Detaylı Raporlar

- **JSON Formatı**: `data/tax-offices-report.json` - Tüm iller için detaylı JSON raporu
- **Metin Formatı**: `data/tax-offices-summary-by-city.txt` - Tüm iller için metin raporu

## ✅ Test Senaryosu

1. Ana Adres (Fatura Adresi) bölümüne gidin
2. İl dropdown'ından bir il seçin (örn: **Ardahan**)
3. Vergi Dairesi dropdown'ında o ile ait vergi daireleri görünmeli
4. İl değiştirdiğinizde (örn: **Diyarbakır**), yeni il için vergi daireleri gösterilmeli

## 🔄 Yenile Butonu

"Yenile" butonu vergi dairesi listesini Firestore'dan veya PDF'den yeniden yükler. Bu buton:
- Firestore'da güncel veri varsa onu yükler
- Yoksa PDF'den çıkarılan verileri yükler
- Son olarak yerel (LOCAL_TAX_OFFICES) verileri kullanır

