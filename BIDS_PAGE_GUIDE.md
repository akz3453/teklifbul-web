# 📥 Gelen Teklifler Sayfası - Kullanım Kılavuzu

## ✅ Ne Yapıldı?

Taleplerinize gelen tüm teklifleri **firma adlarıyla birlikte** görüntüleyebileceğiniz yeni bir sayfa oluşturuldu.

### Temel Özellikler

1. **Firma Adları Görünür**: Artık "Tedarikçi-xxxx" yerine gerçek firma adları gösteriliyor
2. **Tüm Teklifler Tek Sayfada**: Birden fazla talebe gelen teklifler tek ekranda
3. **Gelişmiş Filtreleme**: Talep, teklif tipi ve tedarikçi adına göre filtrele
4. **İstatistikler**: Toplam teklif sayısı, aktif talep sayısı, ortalama teklif/talep
5. **Kolay Erişim**: Tüm sayfalarda (Dashboard, Talepler, vb.) "Gelen Teklifler" linki eklendi

---

## 📊 Sayfa Özellikleri

### İstatistik Kartları

```
┌─────────────────────┬─────────────────────┬──────────────────────┐
│  Toplam Teklif      │  Aktif Talepler     │  Ort. Teklif/Talep  │
│       15            │         5           │        3.0          │
└─────────────────────┴─────────────────────┴──────────────────────┘
```

### Filtreler

1. **Talep Filtrele**: Dropdown ile spesifik bir talebi seç
2. **Teklif Tipi**: Gizli / Açık / Hibrit
3. **Tedarikçi Ara**: Firma adına göre arama yap

### Teklif Tablosu

| Talep | Tedarikçi Firma | Fiyat | Teslimat | Marka | Ödeme | Teklif Tipi | Tarih | |
|-------|----------------|-------|----------|-------|-------|-------------|-------|---|
| İnşaat Malzemeleri | ABC İnşaat A.Ş. | ₺ 25,000 | 15 gün | Bosch | %50 peşin | Gizli | 20.01.2025 | Görüntüle → |

---

## 🔄 Veri Yapısı

### Firestore Koleksiyonları

#### `bids` Collection
```javascript
{
  demandId: "demand123",      // Hangi talebe ait
  supplierId: "user123",      // Teklifi veren tedarikçinin UID'si
  price: 25000,
  netPrice: 22500,            // İskontolu fiyat
  leadTimeDays: 15,
  brand: "Bosch",
  paymentTerms: "%50 peşin",
  createdAt: Timestamp
}
```

#### `users` Collection
```javascript
{
  companyName: "ABC İnşaat A.Ş.",  // ← Bu gösteriliyor
  email: "info@abc.com",
  roles: ["supplier"],
  supplierCategories: ["İnşaat", "Elektrik"]
}
```

#### `demands` Collection
```javascript
{
  title: "İnşaat Malzemeleri",
  createdBy: "buyer_uid",
  biddingMode: "secret",  // secret | open | hybrid
  published: true
}
```

---

## 🚀 Kullanım

### 1. Sayfaya Erişim

**Yöntem 1**: Header menüsünden
```
Dashboard → Gelen Teklifler
Talepler → Gelen Teklifler
```

**Yöntem 2**: Doğrudan URL
```
https://your-domain.com/bids.html
```

### 2. Filtreleme

**Örnek 1**: Sadece bir talebin tekliflerini gör
```
Talep Filtrele dropdown → "İnşaat Malzemeleri" seç
```

**Örnek 2**: Sadece açık artırma tekliflerini gör
```
Teklif Tipi dropdown → "Açık" seç
```

**Örnek 3**: Belirli bir tedarikçiyi bul
```
Tedarikçi Ara → "ABC" yaz
```

### 3. Teklif Detayına Git

Her satırın sonundaki **"Görüntüle →"** butonuna tıklayarak ilgili talebin detay sayfasına gidebilirsiniz.

---

## 🔐 Güvenlik

### Kimler Ne Görür?

| Kullanıcı Tipi | Görebildikleri |
|---------------|----------------|
| **Talep Sahibi (Buyer)** | Kendi taleplerinin TÜM teklifleri + Firma adları |
| **Tedarikçi (Supplier)** | Bu sayfayı göremez (sadece buyer'lar için) |

### Firestore Rules

```javascript
// bids.html sayfası sadece kendi taleplerinize gelen teklifleri gösterir
const demandsQuery = query(
  collection(db, "demands"),
  where("createdBy", "==", user.uid)  // ← Sadece kendi talepleriniz
);

// Her talep için bids sorgulanır
const bidsQuery = query(
  collection(db, "bids"),
  where("demandId", "==", demandId)
);
```

---

## 📁 Dosya Yapısı

### Yeni Dosya

```
teklifbul-web/
├── bids.html           ← YENİ! Gelen teklifler sayfası
```

### Değiştirilen Dosyalar

```
teklifbul-web/
├── dashboard.html      ← Header'a "Gelen Teklifler" linki eklendi
├── demands.html        ← Header'a "Gelen Teklifler" linki eklendi
├── demand-detail.html  ← Header ve breadcrumb'a link eklendi
├── demand-new.html     ← Breadcrumb'a link eklendi
└── settings.html       ← Favicon eklendi
```

---

## 🎨 UI/UX Özellikleri

### Responsive Design
- Mobil uyumlu tablo
- Filtrelerin esnek yerleşimi
- Touch-friendly butonlar

### Loading States
```javascript
1. Sayfa açılır → Spinner gösterilir
2. Veriler yüklenir → Spinner gizlenir, tablo gösterilir
3. Veri yoksa → Empty state gösterilir
```

### Empty State
```
┌────────────────────────────────┐
│          📄                    │
│   Henüz teklif yok             │
│   Taleplerinize gelen          │
│   teklifler burada görünecek   │
└────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Problem 1: "Henüz teklif yok" Görünüyor
**Sebep**: Taleplerinize henüz teklif gelmemiş
**Çözüm**: 
1. Taleplerinizin yayınlandığından emin olun (demand-detail.html → "Tedarikçilere Gönder")
2. Tedarikçilerin kategorilerinin talep kategorilerinizle eşleştiğini kontrol edin

### Problem 2: Firma Adı "Bilinmeyen Firma" Görünüyor
**Sebep**: Tedarikçi kullanıcısının `companyName` alanı dolu değil
**Çözüm**: Tedarikçiden settings.html'den profil bilgilerini tamamlamasını isteyin

### Problem 3: "Permission Denied" Hatası
**Sebep**: Firestore rules taleplerinizi okuma izni vermiyor
**Çözüm**: 
```javascript
// firestore.rules dosyasını kontrol edin
match /demands/{id} {
  allow read: if isSignedIn() &&
    (resource.data.createdBy == request.auth.uid ||
     request.auth.uid in resource.data.viewerIds);
}
```

---

## 💡 Geliştirme Önerileri

### Gelecek Özellikler

1. **Excel/PDF Export**: Tüm teklifleri dışa aktar
2. **Karşılaştırma Modu**: İki veya daha fazla teklifi yan yana karşılaştır
3. **E-posta Bildirimleri**: Yeni teklif geldiğinde e-posta gönder
4. **Grafik Görünüm**: Fiyat karşılaştırma grafiği
5. **Otomatik Sıralama**: En düşük fiyat, en hızlı teslimat vb.

### Kod Genişletme

**Örnek: Fiyata Göre Sıralama**
```javascript
// bids.html içinde renderBids() fonksiyonuna ekle
filtered.sort((a, b) => {
  const sortBy = document.getElementById("sortBy").value;
  if (sortBy === "price_asc") return a.price - b.price;
  if (sortBy === "price_desc") return b.price - a.price;
  // ... diğer sıralama seçenekleri
});
```

---

## 📚 İlgili Dosyalar

- **Firestore Rules**: `firestore.rules`
- **Ana Teklif Formu**: `demand-detail.html` (bids section)
- **Kategori Listesi**: `categories.js`
- **Firebase Config**: `firebase.js`

---

## ✅ Checklist

Sayfanın doğru çalıştığını test edin:

- [ ] `bids.html` açılıyor
- [ ] Header'da firma adı gösteriliyor
- [ ] İstatistikler doğru hesaplanıyor
- [ ] Tüm talepleriniz dropdown'da görünüyor
- [ ] Tedarikçi firma adları doğru gösteriliyor
- [ ] Filtreler çalışıyor
- [ ] "Görüntüle" butonu doğru talebe yönlendiriyor
- [ ] Veri yoksa empty state gösteriliyor
- [ ] Çıkış butonu çalışıyor

---

## 🎯 Özet

**Sorun**: Kullanıcı, gelen teklifleri görebiliyordu ama tedarikçi firma adları yerine UID kodları görünüyordu.

**Çözüm**: 
1. Yeni `bids.html` sayfası oluşturuldu
2. Tüm teklifler `users` koleksiyonundan tedarikçi bilgileriyle birleştirildi
3. Firma adları (`companyName`) tabloda gösteriliyor
4. Gelişmiş filtreleme ve istatistikler eklendi
5. Tüm sayfalara erişim linkleri eklendi

**Sonuç**: Artık gelen teklifleri gerçek firma adlarıyla, filtreleyerek ve istatistiklerle birlikte görüntüleyebilirsiniz! 🎉
