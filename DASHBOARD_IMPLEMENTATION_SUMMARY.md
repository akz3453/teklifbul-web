# Dashboard + Firma Seçici + TCMB Kur + Çoklu İskonto - Implementation Summary

## ✅ Tamamlanan Özellikler

### 1. Dashboard (Ana Ekran)
**Dosya**: `dashboard.html`

✅ **Metrik Kartları**:
- Gelen Talepler (inbox count)
- Gönderdiğim Talepler (sent count)
- Taslak Talepler (draft count)
- TCMB Kurları (USD/TRY ve EUR/TRY)

✅ **Son Taleplerim Tablosu**:
- Son 5 talep gösterimi
- STF No, Başlık, Kategoriler, Durum, Tarih
- Her talebe tıklanabilir link

✅ **Hızlı Aksiyonlar**:
- "+ Yeni Talep" butonu
- "Tüm Talepler" linki
- Her metrik kart tıklanabilir (ilgili filtreye yönlendirir)

### 2. Ortak Header (Tüm Sayfalarda)
**Dosyalar**: `dashboard.html`, `demands.html`, `demand-new.html`, `demand-detail.html`

✅ **Özellikler**:
- Teklifbul logo
- Gerçek zamanlı saat (TR locale)
- Firma seçici dropdown
- Kullanıcı email görüntüleme
- Çıkış butonu

✅ **Firma Seçici**:
- Kullanıcının erişebildiği tüm firmaları gösterir
- Seçim localStorage'a kaydedilir
- Seçim değişince sayfa yenilenir
- Eğer firma yoksa otomatik "Kendi Firmam" oluşturulur

### 3. Çoklu Firma Desteği

✅ **Veri Modeli**:
```javascript
// users/{uid}
{
  activeCompanyId: string|null,  // Seçili firma
  companies: string[]            // Erişilebilir firma ID'leri
}

// companies/{companyId}
{
  name: string,
  taxNumber: string|null,
  createdAt: Timestamp
}
```

✅ **Firestore Güvenlik Kuralları**:
- Companies koleksiyonu için okuma/yazma izinleri eklendi
- Herkes kendi erişebildiği firmaları görebilir

### 4. Çoklu İskonto Sistemi
**Dosya**: `demand-detail.html` (Teklif Ver formu)

✅ **Form Alanları**:
- Liste Fiyatı (base price)
- İskonto 1-5 (her biri 0-100% arası)
- Net Fiyat (otomatik hesaplanan, salt okunur)
- Termin (gün)
- Marka
- Ödeme Şartları

✅ **Hesaplama Mantığı**:
```javascript
netPrice = listPrice × (1 - d1/100) × (1 - d2/100) × ... × (1 - d5/100)
```

✅ **Otomatik Güncelleme**:
- Her iskonto değişiminde net fiyat otomatik hesaplanır
- Input event listeners ile gerçek zamanlı

✅ **Bid Dokümanı**:
```javascript
{
  priceList: number,
  discount1-5: number,
  netPrice: number,
  price: number,  // netPrice ile aynı (sıralama için)
  // ... diğer alanlar
}
```

### 5. TCMB Kur Servisi
**Dosyalar**: `functions/index.js`, `dashboard.html`

✅ **Cloud Function**:
- Endpoint: `/fx` (Firebase Hosting rewrite ile)
- TCMB XML API'den gerçek zamanlı kurlar
- CORS desteği
- Hata yönetimi

✅ **Response Format**:
```json
{
  "USD": "34.5678",
  "EUR": "37.1234",
  "asOf": "2025-10-18"
}
```

✅ **Dashboard Widget**:
- Her 60 saniyede otomatik güncelleme
- Görsel kur kartı
- Güncelleme tarihi gösterimi

### 6. Navigasyon Akışı

✅ **Giriş Akışı**:
1. `index.html` → Login
2. Otomatik yönlendirme → `dashboard.html`
3. Oturum varsa direkt dashboard

✅ **Dashboard'dan**:
- Metrik kartlara tıkla → `demands.html` (filtrelenmiş)
- "+ Yeni Talep" → `demand-new.html`
- Talep başlığı → `demand-detail.html`
- "Tüm Talepler" → `demands.html`

✅ **Her Sayfadan**:
- "← Dashboard" linki ile geri dönüş
- Header'daki firma seçici her yerde aktif
- Çıkış butonu her yerde erişilebilir

## 📁 Oluşturulan/Değiştirilen Dosyalar

### Yeni Dosyalar
- ✅ `dashboard.html` - Ana dashboard sayfası
- ✅ `functions/index.js` - TCMB FX Cloud Function
- ✅ `functions/package.json` - Function bağımlılıkları
- ✅ `firebase.json` - Firebase yapılandırması
- ✅ `firestore.indexes.json` - Composite index tanımları
- ✅ `DASHBOARD_DEPLOYMENT_GUIDE.md` - Deployment rehberi

### Değiştirilen Dosyalar
- ✅ `index.html` - Dashboard'a yönlendirme
- ✅ `demands.html` - Ortak header eklendi
- ✅ `demand-new.html` - Ortak header eklendi
- ✅ `demand-detail.html` - Ortak header + çoklu iskonto formu
- ✅ `firestore.rules` - Companies collection kuralları

## 🚀 Deployment Adımları

### 1. Cloud Functions Kurulum
```bash
cd functions
npm install
```

### 2. Firestore Rules Deploy
```bash
firebase deploy --only firestore:rules
```

### 3. Firestore Indexes Deploy
```bash
firebase deploy --only firestore:indexes
```

### 4. Cloud Function Deploy
```bash
firebase deploy --only functions:fx
```

### 5. Hosting Deploy (Opsiyonel)
```bash
firebase deploy --only hosting
```

## 🧪 Test Senaryoları

### Test 1: Dashboard Erişimi
1. ✅ Login yap → Otomatik dashboard'a yönlendir
2. ✅ 4 metrik kartı görüntüle
3. ✅ Son 5 talep listele
4. ✅ TCMB kurları göster

### Test 2: Firma Seçici
1. ✅ Dropdown'da firmalar listelensin
2. ✅ Firma değiştir → Sayfa yenile
3. ✅ localStorage'a kaydet
4. ✅ Tüm sayfalarda aynı firma seçili

### Test 3: Çoklu İskonto
1. ✅ Liste fiyatı: 1000 TL
2. ✅ İskonto 1: %10 → Net: 900 TL
3. ✅ İskonto 2: %5 → Net: 855 TL
4. ✅ İskonto 3: %2 → Net: 837.90 TL
5. ✅ Teklifi gönder
6. ✅ Firestore'da tüm iskontolar kaydedilsin

### Test 4: TCMB Kurları
1. ✅ Dashboard aç → FX widget yüklü
2. ✅ USD ve EUR değerleri göster
3. ✅ 60 saniye bekle → Otomatik güncelle
4. ✅ Network tab'da `/fx` isteği

## 📊 Veri Yapısı Değişiklikleri

### users Collection
```diff
{
  displayName: string,
  email: string,
  role: "buyer" | "supplier",
+ activeCompanyId: string|null,
+ companies: string[]
}
```

### bids Collection (Yeni Alanlar)
```diff
{
  demandId: string,
+ priceList: number,
+ discount1: number,
+ discount2: number,
+ discount3: number,
+ discount4: number,
+ discount5: number,
+ netPrice: number,
  price: number,
  leadTimeDays: number,
  brand: string,
  paymentTerms: string,
  supplierId: string,
  createdAt: Timestamp
}
```

### companies Collection (Yeni)
```javascript
{
  name: string,
  taxNumber: string|null,
  createdAt: Timestamp
}
```

## 🎯 Özellik Detayları

### Dashboard Metrikleri
- **Gelen Talepler**: `viewerIds array-contains uid` ve `createdBy != uid`
- **Gönderdiğim**: `createdBy == uid`
- **Taslak**: `createdBy == uid` ve `published == false`

### Firma Seçici Davranışı
1. Kullanıcı giriş yapar
2. `users/{uid}.companies` kontrol edilir
3. Eğer boşsa → "Kendi Firmam" otomatik oluşturulur
4. Dropdown doldurulur
5. `activeCompanyId` varsa o seçili, yoksa ilk firma
6. Değişim → Firestore + localStorage güncelle + reload

### İskonto Hesaplama Örneği
```javascript
Liste Fiyat: 10,000 TL
İskonto 1: 10% → 9,000 TL
İskonto 2: 5%  → 8,550 TL
İskonto 3: 2%  → 8,379 TL
İskonto 4: 1%  → 8,295.21 TL
İskonto 5: 0.5% → 8,253.73 TL

Net Fiyat: 8,253.73 TL
```

### TCMB API İş Akışı
1. Dashboard yüklenir
2. `/fx` endpoint'ine istek
3. Cloud Function TCMB XML'i fetch eder
4. USD ve EUR ForexSelling parse edilir
5. JSON response döner
6. Widget güncellenir
7. 60 saniye sonra tekrar

## 🔧 Yapılandırma Notları

### Firebase Hosting Rewrite
`firebase.json`:
```json
{
  "rewrites": [
    {
      "source": "/fx",
      "function": "fx"
    }
  ]
}
```

Bu sayede Cloud Function URL'i yerine basitçe `/fx` kullanılabilir.

### Firestore Composite Indexes
İki yeni index gerekli:
1. `demands`: `createdBy (ASC) + createdAt (DESC)`
2. `demands`: `viewerIds (ARRAY) + createdAt (DESC)`

Auto-deploy ile oluşturulur: `firebase deploy --only firestore:indexes`

## ⚠️ Bilinen Sınırlamalar

1. **Firma Bazlı Filtreleme**: Şu an firma seçimi sadece UI'da gösteriliyor. Talepleri firma bazlı filtrelemek için `demands.companyId` alanı eklenebilir (opsiyonel).

2. **FX Rate Caching**: Her istek TCMB'ye gidiyor. Yüksek trafikte Cloud Functions quotası aşılabilir. Firestore'a cache eklenebilir.

3. **Company Access Control**: Şu an herkes her firmayı görebiliyor. Daha katı kontrol için `companies.members` array'i eklenebilir.

4. **Discount Validation**: İskonto toplamının 100%'ü geçmesi kontrol edilmiyor. Client-side validation eklenebilir.

## 🎉 Özet

Tüm özellikler başarıyla implement edildi:
- ✅ Dashboard sayfası
- ✅ Ortak header (4 sayfa)
- ✅ Firma seçici
- ✅ Çoklu iskonto sistemi
- ✅ TCMB kur servisi
- ✅ Firestore kuralları
- ✅ Cloud Function
- ✅ Navigasyon akışı

**Deployment Ready!** 🚀

Detaylı deployment adımları için: `DASHBOARD_DEPLOYMENT_GUIDE.md`
