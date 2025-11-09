# 🗺️ Google Maps & Yorumları Entegrasyon Planı

## 📊 Teknik Fizibilite Analizi

### ✅ Mümkün mü?
**EVET**, ancak bazı kısıtlamalar var:

1. **Google Places API** ile şirket bilgileri ve yorumları çekilebilir
2. **Google My Business API** (eski adı) ile daha detaylı erişim mümkün
3. **Rate Limiting**: Günlük/haftalık istek limitleri var
4. **Kullanım Koşulları**: Yorumları çekme ve gösterme kurallarına uymak zorunlu

---

## 🔧 Önerilen Entegrasyon Mimarisi

### Yöntem 1: Google Places API (Önerilen)
```
┌─────────────────┐
│  Teklifbul      │
│  Frontend       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Firebase        │      │  Google Places    │
│  Cloud Functions │ ◄─── │  API              │
│  (Backend)       │      │  (Harici API)     │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐
│  Firestore      │
│  (Veri Saklama) │
└─────────────────┘
```

**Avantajlar:**
- ✅ Resmi API, yasal açıdan güvenli
- ✅ Otomatik güncellemeler yapılabilir
- ✅ Google'ın verilerini senkron tutabiliriz

**Dezavantajlar:**
- ⚠️ API maliyeti (belirli limitler üzerinde)
- ⚠️ Rate limiting (günlük istek sınırı)
- ⚠️ Şirket Google Maps'te kayıtlı olmalı

---

## 💾 Veri Yapısı Önerisi

### Firestore Yapısı:
```javascript
companies/{companyId}/
  ├── googlePlaceId: string          // Google'daki Place ID
  ├── googleRating: number            // Google'dan gelen ortalama puan
  ├── googleReviewCount: number       // Toplam yorum sayısı
  ├── googleReviews: subcollection    // Google yorumları (cache)
  │   ├── {reviewId}:
  │   │   ├── author: string
  │   │   ├── rating: number
  │   │   ├── text: string
  │   │   ├── time: timestamp
  │   │   ├── source: "google"
  │   │   └── syncedAt: timestamp
  │
  └── reviews: subcollection         // Mevcut sistem (internal reviews)
      └── {reviewId}:
          ├── userId: string
          ├── rating: number
          ├── comment: string
          ├── source: "internal"
          └── createdAt: timestamp
```

---

## 🔄 Senkronizasyon Stratejisi

### Seçenek 1: Hybrid Sistem (Önerilen)
- **İç yorumlar**: Kullanıcıların Teklifbul üzerinden yaptığı yorumlar
- **Google yorumları**: Google Maps'ten çekilen ve cache'lenen yorumlar
- **Birleşik gösterim**: Her iki kaynak birleştirilerek gösterilir

### Seçenek 2: Sadece Google (Basit)
- Sadece Google yorumlarını çeker ve gösterir
- Teklifbul içi yorum sistemi kaldırılır
- **Önerilmez** çünkü kendi ekosistemimizden bağımsızlaşırız

### Seçenek 3: Sadece Internal (Mevcut)
- Sadece Teklifbul yorumları kullanılır
- Google entegrasyonu yok

---

## 🛠️ Implementasyon Planı

### Adım 1: Firebase Cloud Functions
```typescript
// functions/src/google-places-sync.ts

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

const GOOGLE_PLACES_API_KEY = functions.config().google.places_api_key;

// Şirket için Google Place ID bul
export const findPlaceId = async (companyName: string, address: string) => {
  const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
  const params = {
    input: `${companyName} ${address}`,
    inputtype: 'textquery',
    fields: 'place_id,name,formatted_address',
    key: GOOGLE_PLACES_API_KEY
  };
  
  const response = await axios.get(url, { params });
  return response.data.candidates[0]?.place_id || null;
};

// Yorumları çek
export const fetchGoogleReviews = async (placeId: string) => {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`;
  const params = {
    place_id: placeId,
    fields: 'name,rating,user_ratings_total,reviews',
    key: GOOGLE_PLACES_API_KEY
  };
  
  const response = await axios.get(url, { params });
  return response.data.result;
};

// Otomatik senkronizasyon (günlük)
export const syncGoogleReviewsDaily = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    // Tüm şirketlerdeki googlePlaceId'leri çek
    const companies = await admin.firestore()
      .collection('companies')
      .where('googlePlaceId', '!=', null)
      .get();
    
    for (const company of companies.docs) {
      const placeId = company.data().googlePlaceId;
      const reviews = await fetchGoogleReviews(placeId);
      
      // Firestore'a kaydet
      await updateCompanyReviews(company.id, reviews);
    }
  });
```

### Adım 2: Frontend Entegrasyonu
```javascript
// company-profile.html içinde

// Google yorumlarını göster
async function loadGoogleReviews(companyId) {
  const companyDoc = await getDoc(doc(db, 'companies', companyId));
  const companyData = companyDoc.data();
  
  if (!companyData.googlePlaceId) {
    // Google Place ID yoksa, kullanıcıdan iste veya otomatik bul
    return;
  }
  
  // Cloud Function'ı çağır
  const syncFunction = httpsCallable(functions, 'syncGoogleReviews');
  await syncFunction({ companyId, placeId: companyData.googlePlaceId });
  
  // Firestore'dan oku (güncellenmiş)
  const googleReviewsQuery = query(
    collection(db, 'companies', companyId, 'googleReviews'),
    orderBy('time', 'desc'),
    limit(10)
  );
  const googleReviewsSnap = await getDocs(googleReviewsQuery);
  
  // UI'da göster
  displayGoogleReviews(googleReviewsSnap.docs);
}
```

---

## 📊 Sistem Zorlanması Analizi

### ⚠️ Potansiyel Sorunlar:

1. **API Rate Limiting**
   - Google Places API: Günde 10,000 istek (ücretsiz tier)
   - Şirket başına günde 1-2 istek yeterli
   - **Çözüm**: Cache mekanizması (24 saat)

2. **Maliyet**
   - Ücretsiz: $200 kredi/ay
   - Places Details: $17/1000 istek
   - 1000 şirket = ~$17/ay
   - **Çözüm**: Sadece aktif şirketlerde çalıştır

3. **Veri Güncelliği**
   - Google yorumları anlık güncellenir
   - Cache mekanizması gecikme yaratır
   - **Çözüm**: Günlük senkronizasyon + manuel refresh

4. **Performans**
   - Her şirket için API çağrısı yapmak yavaş olabilir
   - **Çözüm**: Batch işleme, arka plan çalıştırma

---

## 🎯 Önerilen Yaklaşım

### Hibrit Sistem:
1. **Şirket kaydı sırasında**:
   - Google Place ID otomatik bulunur (adres + isim ile)
   - `companies/{id}/googlePlaceId` kaydedilir

2. **Günlük senkronizasyon** (Cloud Functions):
   - Tüm şirketlerdeki Google yorumları güncellenir
   - Firestore'a cache'lenir

3. **Frontend gösterimi**:
   - İç yorumlar + Google yorumları birleştirilerek gösterilir
   - Kaynak etiketi ile ayrılır: "Google'dan" / "Teklifbul'dan"

4. **Manuel refresh**:
   - Şirket sahibi "Google Yorumlarını Yenile" butonuna basabilir
   - Cloud Function tetiklenir

---

## ✅ Avantajlar

1. **Güvenilirlik**: Google'ın resmi API'si kullanılır
2. **Zenginlik**: Google'daki mevcut yorumlar gösterilir
3. **SEO**: Google yorumları SEO açısından faydalı
4. **Güven**: Kullanıcılar Google'daki yorumları daha çok güvenir

---

## ❌ Dezavantajlar

1. **Bağımlılık**: Google API'sine bağımlı oluruz
2. **Maliyet**: Büyük ölçekte API maliyeti artar
3. **Güncelleme Gecikmesi**: Cache mekanizması gecikme yaratır
4. **Kontrol**: Google yorumlarını kontrol edemeyiz

---

## 🚀 Hızlı Başlangıç Adımları

1. **Google Cloud Console**'da API Key oluştur
2. **Places API**'yi etkinleştir
3. **Firebase Cloud Functions**'a entegrasyon ekle
4. **Test**: Bir şirket için manuel test
5. **Yayınlama**: Production'a deploy et

---

## 📝 Sonuç

**Sistem zorlar mı?**
- **Hayır**, doğru implementasyon ile sorun olmaz
- Cache mekanizması ile performans korunur
- Rate limiting ile maliyet kontrol edilir

**Öneri:**
- ✅ Hibrit sistem kullan (internal + Google)
- ✅ Günlük otomatik senkronizasyon
- ✅ Manuel refresh seçeneği sun
- ✅ API maliyetlerini izle

