# 🚀 Talep Detay Sayfası - Yeni Özellikler

## 📊 Özet Kart

Talep detay sayfası artık profesyonel bir özet kartı ile açılıyor:

- **STF Bilgileri:** STF No, STF Tarihi
- **Zaman Bilgileri:** Termin, Oluşturma Tarihi, Gönderim Tarihi
- **Durum:** Taslak (sarı) veya Gönderildi (yeşil)
- **Kategoriler:** Badge formatında gösterim
- **Kalem Sayısı:** Dinamik hesaplama

## 📎 Ek Dosyalar (Sadece Talep Sahibi)

### Yükleme
- **Format:** PDF, DOC, DOCX, XLS, XLSX, PNG, JPG
- **Maksimum Boyut:** 10 MB
- **Çoklu Seçim:** Aynı anda birden fazla dosya yüklenebilir

### Yönetim
- **İndirme:** Her dosya için ayrı indirme linki
- **Silme:** Dosya silme (onay ile)
- **Görüntüleme:** Dosya adı, boyut, tür, yükleme tarihi

### Storage Yapısı
```
demands/{demandId}/{userId}/{timestamp-filename}
```

## 📤 Yayınlama Sistemi

### Taslak Durumu (`published: false`)
- ✅ Talep sahibi: Görür ve düzenler
- ❌ Tedarikçi: Göremez (ACL bloklar)
- 🔒 Durum: "Taslak" badge'i (sarı)

### Yayınlanmış Durumu (`published: true`)
- ✅ Talep sahibi: Görür, geri çekebilir
- ✅ Tedarikçi: Görür, teklif verebilir
- 🟢 Durum: "Gönderildi" badge'i (yeşil)
- 📅 Gönderim tarihi: `sentAt` timestamp kaydedilir

### Butonlar

**"Tedarikçilere Gönder"** (Taslak iken)
- Onay modalı açılır
- `published: true` olarak güncellenir
- `sentAt: serverTimestamp()` eklenir
- Tedarikçiler artık görebilir

**"Geri Çek"** (Gönderildi iken)
- Onay modalı açılır
- `published: false` olarak güncellenir
- Tedarikçiler artık göremez
- `sentAt` değeri korunur (geçmiş için)

## 📄 Dışa Aktarma

### PDF İndirme
**Kütüphane:** jsPDF 2.5.1

**İçerik:**
- Talep başlığı
- STF bilgileri (No, Tarih, Termin, Öncelik)
- Kategoriler
- Kalemler (ilk 30 satır)

**Dosya adı:** `{stfNo}.pdf`

### Excel İndirme
**Kütüphane:** SheetJS 0.18.5

**İçerik:**
- **Sheet 1 (Özet):** Başlık, STF, Termin, Öncelik, Kategoriler, Açıklama
- **Sheet 2 (Kalemler):** Sıra, Kod, Tanım, Marka/Model, Miktar, Birim, Teslim Tarihi

**Dosya adı:** `{stfNo}.xlsx`

## 🔐 Güvenlik Kuralları

### Firestore Rules

```javascript
// Talep görüntüleme
allow read: if request.auth != null && (
  resource.data.createdBy == request.auth.uid ||
  (resource.data.published == true && 
   request.auth.uid in resource.data.viewerIds)
);
```

### Storage Rules

```javascript
// Dosya yazma
allow write: if request.auth != null &&
  request.auth.uid == uploaderId &&
  firestore.get(/databases/(default)/documents/demands/$(demandId))
    .data.createdBy == request.auth.uid;

// Dosya okuma  
allow read: if request.auth != null;
```

## 🎨 UI/UX Geliştirmeleri

### Renkler ve Badge'ler
- **Taslak:** Sarı badge (`#fef3c7` bg, `#92400e` text)
- **Gönderildi:** Yeşil badge (`#d1fae5` bg, `#065f46` text)
- **Kategoriler:** Mavi badge (mevcut `utils.css`)

### Modal Dialogs
- **Yayınla Modalı:** "Bu talep tedarikçilerinize açılacak. Devam edilsin mi?"
- **Geri Çek Modalı:** "Tedarikçiler artık bu talebi göremeyecek. Devam edilsin mi?"

### Responsive Layout
- **Grid System:** Summary card otomatik responsive (min 200px)
- **Action Buttons:** Flex wrap ile mobil uyumlu
- **File Upload:** 2px dashed border ile drag-drop görünümü

## 🧪 Test Checklist

### Talep Sahibi Testi
- [ ] Yeni talep oluştur
- [ ] Detay sayfasında "Taslak" durumunu gör
- [ ] PDF dosyası yükle
- [ ] Dosyayı indir ve sil
- [ ] "Tedarikçilere Gönder" tıkla
- [ ] Onay modalı çıksın
- [ ] Durum "Gönderildi" olsun
- [ ] Gönderim tarihi görünsün
- [ ] PDF ve Excel indir
- [ ] "Geri Çek" ile taslağa al

### Tedarikçi Testi
- [ ] Sadece yayınlanmış talepleri gör
- [ ] Taslak talepleri görme
- [ ] Detay sayfasında dosya yükleme alanı görme
- [ ] PDF/Excel indirme butonları görme
- [ ] Teklif verme formunu gör
- [ ] Teklif ver

### Performans
- [ ] Dosya yükleme süresi (1 MB → ~2 saniye)
- [ ] PDF oluşturma (30 kalem → <1 saniye)
- [ ] Excel oluşturma (30 kalem → <1 saniye)
- [ ] Sayfa yüklenme (RTT → <2 saniye)

## 📦 Deployment Checklist

- [ ] `firestore.rules` → Firebase Console → Publish
- [ ] `storage.rules` → Firebase Console → Publish
- [ ] 3 Firestore index oluştur
- [ ] Storage'ı aktifleştir
- [ ] Test senaryolarını çalıştır
- [ ] Production'a deploy

## 🐛 Bilinen Sorunlar ve Çözümleri

### "Missing or insufficient permissions"
**Sebep:** Rules yayınlanmamış  
**Çözüm:** Firebase Console → Firestore/Storage → Rules → Publish

### "The query requires an index"
**Sebep:** Index'ler build olmamış  
**Çözüm:** Firebase Console → Indexes → Build (2-5 dakika bekle)

### Dosya yüklenmiyor
**Sebep:** Storage rules hatalı veya path yanlış  
**Çözüm:** Storage rules'u kontrol et, path format: `demands/{id}/{uid}/{file}`

### Tedarikçi göremedi
**Sebep:** `published=false` veya `viewerIds`'te yok  
**Çözüm:** "Tedarikçilere Gönder" butonuna tıkla

### PDF Türkçe karakter sorunu
**Sebep:** jsPDF varsayılan font Türkçe desteklemiyor  
**Çözüm:** Bu versiyon için kabul edilebilir (ileride custom font eklenebilir)

## 💡 İpuçları

1. **Dosya yüklemeden önce gönder:** Taslak iken dosyaları yükle, test et, ardından gönder
2. **Index'leri önceden oluştur:** Production'a almadan önce index'lerin build olmasını bekle
3. **Storage quota:** Firebase free tier: 1 GB storage, 1 GB/day download
4. **Backup:** Excel export'u düzenli yedekleme için kullanabilirsin

## 🎯 Roadmap (Gelecek Özellikler)

- [ ] Dosya önizleme (PDF viewer)
- [ ] Drag & drop file upload
- [ ] Toplu dosya indirme (ZIP)
- [ ] Dosya versiyonlama
- [ ] Tedarikçi dosya yükleme (teklif eki)
- [ ] Email bildirimi (talep gönderildiğinde)
- [ ] Push notification (gerçek zamanlı)

---

**Son Güncelleme:** 2025-10-14  
**Versiyon:** 2.0  
**Durum:** ✅ Production Ready
