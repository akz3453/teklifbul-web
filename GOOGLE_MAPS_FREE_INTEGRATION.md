# 🗺️ Google Maps Entegrasyonu - ÜCRETSİZ Çözüm

## 💰 Maliyet: TAMAMEN ÜCRETSİZ

Bu entegrasyon Google Places API kullanmaz, sadece ücretsiz Google Maps embed iframe kullanır.

---

## 🎯 Yaklaşım

### 1. Manuel Google Business Link Paylaşımı
- Şirket sahipleri kendi Google Business profil linklerini manuel olarak ekler
- Sistem sadece linki saklar ve gösterir
- **Maliyet: $0** ✅

### 2. Google Maps Embed (Iframe)
- Şirket adresi varsa, Google Maps iframe'i ile harita gösterilir
- Kullanıcılar haritadan direkt Google'a yönlendirilebilir
- **Maliyet: $0** ✅

### 3. Internal Yorumlar (Mevcut Sistem)
- Teklifbul'daki kendi yorum sistemimiz kullanılır
- Tam kontrol bizde
- **Maliyet: $0** ✅

---

## 📊 Veri Yapısı

```javascript
companies/{companyId}/
  ├── googleBusinessUrl: string (optional)
  │   // Örnek: "https://www.google.com/maps/place/..."
  │   // Kullanıcı tarafından manuel eklenir
  │
  ├── showGoogleMaps: boolean (default: false)
  │   // Şirket sahibi Google Maps'i göstermek isterse true
  │
  └── reviews: subcollection
      └── {reviewId}:
          ├── userId: string
          ├── rating: number
          ├── comment: string
          ├── source: "internal" (her zaman internal)
          └── createdAt: timestamp
```

---

## 🔧 Implementasyon

### Frontend (company-profile.html):
1. **Google Business Link Alanı**: Şirket sahibi linki ekler
2. **Google Maps Iframe**: Adres varsa embed gösterilir
3. **"Google'da Görüntüle" Butonu**: Link varsa gösterilir

### Backend:
- ❌ Cloud Functions yok
- ❌ API çağrıları yok
- ✅ Sadece Firestore'da veri saklama

---

## ✅ Avantajlar

1. **Tamamen Ücretsiz**: Hiçbir API maliyeti yok
2. **Basit**: Karmaşık senkronizasyon yok
3. **Hızlı**: API çağrısı beklemesi yok
4. **Yasal**: Google'ın ToS'una uygun
5. **Kontrol**: Şirket sahibi kendi linkini yönetir

---

## ⚠️ Dezavantajlar

1. **Manuel**: Şirket sahibi linki kendisi eklemeli
2. **Otomatik Değil**: Google yorumları otomatik çekilmez
3. **Ayrı Sistemler**: Teklifbul ve Google yorumları ayrı

---

## 🎨 Kullanıcı Deneyimi

1. Şirket sahibi `settings.html`'de Google Business linkini ekler
2. `company-profile.html`'de:
   - Link varsa "📌 Google'da Görüntüle" butonu gösterilir
   - Adres varsa Google Maps iframe gösterilir
   - Internal yorumlar normal şekilde gösterilir

---

## 📝 Sonuç

**Ücretsiz çözüm için:**
- ✅ Google Business link manuel eklenir
- ✅ Google Maps iframe embed gösterilir
- ✅ Internal yorum sistemi kullanılır
- ✅ Hiçbir API maliyeti yok

Bu yaklaşım %100 ücretsiz ve yasal açıdan güvenlidir.

