# ✅ Yapılacaklar Listesi - Excel Şablon Projesi

**Başlangıç Tarihi**: 2025-01-21  
**Durum**: Planlama tamamlandı, uygulama bekliyor

---

## 🎯 FAZE 1: Standart Excel Şablonu (Öncelik: YÜKSEK)

### Backend
- [ ] `server/services/templateGenerator.ts` oluştur
  - [ ] ExcelJS ile workbook oluştur
  - [ ] "Talep Bilgileri" sayfası oluştur
  - [ ] "Kalemler" sayfası oluştur
  - [ ] Formatlama (başlıklar, renkler, border'lar)
  - [ ] Örnek veriler ekle
  - [ ] Data validation ekle
  - [ ] Buffer döndür

- [ ] `server/routes/template.ts` oluştur
  - [ ] `GET /api/template/demand` endpoint'i
  - [ ] `templateGenerator.ts`'yi kullan
  - [ ] Excel dosyasını response olarak döndür
  - [ ] Content-Type ve Content-Disposition header'ları

- [ ] Ana server dosyasına route kaydet
  - [ ] `app.use('/api/template', templateRouter)`

### Frontend
- [ ] `demand-new.html` güncelle
  - [ ] "📥 Şablon İndir" butonu ekle (satır ~282)
  - [ ] Buton event listener ekle
  - [ ] `/api/template/demand` endpoint'ine istek at
  - [ ] Excel dosyasını indir
  - [ ] Toast ile bilgilendirme

### Test
- [ ] Şablon indirme butonunu test et
- [ ] İndirilen şablonu aç, formatı kontrol et
- [ ] Şablonu doldur, sisteme yükle
- [ ] Formun doğru doldurulduğunu kontrol et

---

## 🔄 FAZE 2: Akıllı Eşleştirme Sistemi (Öncelik: ORTA)

### Backend
- [ ] `server/services/mappingService.ts` güncelle
  - [ ] Eşleştirme detaylarını response'a ekle
  - [ ] Kolon eşleştirme bilgilerini döndür

- [ ] `server/services/supplierMemory.ts` güncelle
  - [ ] Kolon eşleştirme kayıtları ekle
  - [ ] Dosya adı pattern matching
  - [ ] Öğrenme algoritması

- [ ] `server/services/scorers.ts` güncelle
  - [ ] Supplier memory entegrasyonu
  - [ ] Eşleştirme skorlama iyileştirme

- [ ] `POST /api/import/confirm-mapping` endpoint'i
- [ ] `POST /api/supplier-memory/save-mapping` endpoint'i

### Frontend
- [ ] `assets/js/ui/column-mapping-modal.js` oluştur
  - [ ] Modal yapısı
  - [ ] Kolon eşleştirme tablosu
  - [ ] Manuel düzeltme dropdown'ları
  - [ ] Güven skorları gösterimi
  - [ ] Onay/İptal butonları

- [ ] `assets/css/column-mapping.css` oluştur
  - [ ] Modal stilleri
  - [ ] Tablo stilleri
  - [ ] Renk kodlaması (güven skorları)

- [ ] `demand-new.html` güncelle
  - [ ] Modal'ı import et
  - [ ] Import sonrası modal göster
  - [ ] Eşleştirme onayı akışı

---

## 🔍 FAZE 3: Standart Şablon Tanıma (Öncelik: DÜŞÜK)

- [ ] Şablon imzası kontrolü
- [ ] Versiyon kontrolü
- [ ] Otomatik yüksek güven skoru (95%+)

---

## 🎨 FAZE 4: UI/UX İyileştirmeleri (Öncelik: DÜŞÜK)

- [ ] Import akışı iyileştirme
- [ ] Hata yönetimi
- [ ] Şablon yardımı modalı
- [ ] Video/ekran görüntüsü

---

## 📚 Dokümantasyon

- [x] Yol haritası oluşturuldu (`EXCEL_SABLON_VE_AKILLI_ESLESTIRME_YOL_HARITASI.md`)
- [x] Durum raporu oluşturuldu (`DURUM_RAPORU_EXCEL_SABLON_PROJESI.md`)
- [x] Yapılacaklar listesi oluşturuldu (bu dosya)

---

## 🔗 İlgili Dosyalar

### Mevcut
- `demand-new.html` - Frontend form
- `server/services/importParser.ts` - Excel parser
- `server/services/mappingService.ts` - Mapping service
- `server/services/supplierMemory.ts` - Supplier memory
- `server/routes/import.ts` - Import endpoint

### Oluşturulacak
- `server/services/templateGenerator.ts` ⏳
- `server/routes/template.ts` ⏳
- `assets/js/ui/column-mapping-modal.js` ⏳
- `assets/css/column-mapping.css` ⏳

---

**Son Güncelleme**: 2025-01-21  
**Sonraki Adım**: FAZE 1 - Backend şablon oluşturma servisi

