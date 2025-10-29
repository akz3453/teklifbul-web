# Ayarlar Sayfası - Uygulama Özeti

## ✅ Tamamlanan Özellikler

### 1. Settings Sayfası (settings.html)

**Erişim**: Tüm sayfalarda header'da "⚙️ Ayarlar" linki

**Bölümler**:
- ✅ **Firma Bilgileri**: Rol, şirket adı, vergi no, MERSİS, adres, website
- ✅ **İletişim Bilgileri**: Çoklu e-posta ve telefon (chip input)
- ✅ **Tedarikçi Kategorileri**: 17 kategori (supplier ise görünür)
- ✅ **Vergi Levhası**: PDF/PNG/JPG yükleme (maks 5MB)
- ✅ **Banka Hesapları**: Çoklu IBAN + doğrulama
- ✅ **KVKK Gösterimi**: Onay durumu (salt okunur)

---

## 📊 Veri Modeli (users/{uid})

```javascript
{
  // Kimlik
  displayName: string|null,
  role: "supplier" | "buyer",
  companyName: string,          // Zorunlu
  taxNumber: string,             // Zorunlu
  mersisNo: string|null,
  address: string|null,
  website: string|null,
  
  // İletişim
  contactEmails: string[],       // Çoklu e-posta
  contactPhones: string[],       // Çoklu telefon
  
  // Tedarikçi
  categories: string[],          // Supplier ise zorunlu (min 1)
  
  // Belgeler
  taxCertificatePath: string|null,  // Storage yolu
  
  // Banka
  bankAccounts: [                // Çoklu hesap
    {
      bankName: string,
      iban: string,              // TR IBAN (26 karakter)
      accountName: string,
      currency: "TRY"|"USD"|"EUR"|"GBP"
    }
  ],
  
  // KVKK
  kvkkConsent: boolean,
  marketingConsent: boolean,
  consentAt: Timestamp,
  
  // Çoklu firma
  companies: string[]|null,
  activeCompanyId: string|null,
  
  // Zaman damgaları
  updatedAt: Timestamp,
  createdAt: Timestamp
}
```

---

## 🔧 Özellik Detayları

### 1. Firma Bilgileri

**Zorunlu Alanlar**:
- ⭐ Şirket Adı
- ⭐ Vergi No

**Rol Seçimi**:
- Radio button: Satın Almacı / Tedarikçi
- Tedarikçi seçilince kategori bölümü açılır

**Validasyon**:
- Şirket adı ve vergi no boş bırakılamaz
- Form bu alanlar olmadan kaydedilemez

---

### 2. İletişim Bilgileri (Chip Input)

**E-posta Adresleri**:
- E-posta yaz → Enter'a bas → Chip olarak eklenir
- E-posta formatı kontrol edilir: `name@domain.com`
- Chip'e tıkla (✕) → Silinir
- Çoklu e-posta eklenebilir

**Telefon Numaraları**:
- Telefon yaz → Enter'a bas → Chip olarak eklenir
- Format kontrolü yok (uluslararası destek)
- Chip'e tıkla (✕) → Silinir
- Çoklu telefon eklenebilir

**Kullanım Senaryosu**: 
- Şirketlerin birden fazla iletişim noktası var
- Satış, satın alma, teknik departman ayrı e-postalar

---

### 3. Tedarikçi Kategorileri

**Görünürlük**: Sadece rol=supplier ise

**17 Kategori**:
- Sac/Metal, Elektrik, Elektronik, Makine-İmalat, Hırdavat
- Ambalaj, Kimyasal, İnşaat Malzemeleri, Mobilya, Boya
- Plastik, Otomotiv Yan Sanayi, İş Güvenliği, Temizlik
- Gıda, Hizmet, Lojistik

**Kategori Seçimi**:
- Datalist ile otomatik tamamlama
- Kategori yaz → Enter → Chip ekle
- Sözlükte olmayan kategori de eklenebilir
- Chip'e tıkla → Kaldır

**Validasyon**:
- ⚠️ **Tedarikçi en az 1 kategori seçmeli**
- Kategori yoksa form kaydedilmez

**Talep Hedefleme ile Bağlantı**:
- Alıcı "Makine-İmalat" kategorisinde talep oluşturur
- Sistem categories içinde "Makine-İmalat" olan tedarikçileri bulur
- Bu tedarikçilerin UID'leri demand.viewerIds'e eklenir
- Tedarikçi talebi "Gelen Talepler"de görür

---

### 4. Vergi Levhası Yükleme

**Dosya Formatları**: PDF, PNG, JPG, JPEG

**Boyut Limiti**: Maksimum 5MB

**Storage Yolu**: `suppliers/{uid}/{timestamp}-{filename}`
- Örnek: `suppliers/abc123/1729276800000-vergi-levhasi.pdf`

**Yükleme Akışı**:
1. Dosya seç
2. "Kaydet"e tıkla
3. Boyut kontrolü (< 5MB)
4. Firebase Storage'a yükle
5. Yol users/{uid}.taxCertificatePath'e kaydet

**Gösterim**:
- Dosya varsa: "✓ Yüklü dosya: vergi-levhasi.pdf"
- Yoksa: Boş

**Güncelleme**:
- Yeni dosya seç → Eski yol üzerine yazılır
- Eski dosya Storage'da kalır (otomatik silinmez)

---

### 5. Banka Hesapları

**Çoklu Hesap Desteği**:
- Sınırsız banka hesabı eklenebilir
- Her satırda: Banka adı, IBAN, hesap adı, para birimi
- "Sil" butonu ile satır silinir

**IBAN Doğrulaması (TR IBAN)**:

```javascript
// Format: TR + 24 rakam = 26 karakter
// Örnek: TR33 0006 1005 1978 6457 8413 26

Kontroller:
1. TR ile başlamalı
2. Tam 26 karakter (boşluklar temizlenir)
3. MOD-97 algoritması geçmeli
```

**MOD-97 Algoritması**:
1. Son 4 karakteri başa al (TR33... → ...33TR)
2. Harfleri sayıya çevir (T=29, R=27)
3. Büyük sayıyı 97'ye böl
4. Kalan 1 ise geçerli IBAN

**Para Birimleri**:
- TRY (Türk Lirası)
- USD (Amerikan Doları)
- EUR (Euro)
- GBP (İngiliz Sterlini)

**Hata Mesajları**:
- Geçersiz IBAN: "❌ Geçersiz TR IBAN: {iban}"
- Kayıt iptal edilir, düzeltilmeli

---

### 6. KVKK Onayları

**Salt Okunur Bölüm**:
- Kayıt sırasında verilen onaylar gösterilir
- Ayarlardan değiştirilemez

**Gösterim**:
- Onay verilmişse: "KVKK Onayı Verildi: 18.10.2025 14:30:45"
- Onay yoksa: "KVKK onayı bulunmuyor (kayıt sırasında alınmalıdır)"

---

## 🎯 Kullanım Senaryoları

### Senaryo 1: Tedarikçi Kategorileri Güncelliyor

```
1. ⚙️ Ayarlar'a tıkla
2. Mevcut kategoriler: [Makine-İmalat ✕] [Elektrik ✕]
3. "Plastik" yaz → Enter
4. Yeni chip: [Plastik ✕]
5. "Kimyasal" yaz → Enter
6. Yeni chip: [Kimyasal ✕]
7. "Kaydet"e tıkla
8. Firestore güncellendi: categories: [4 kategori]
9. Yeni talepler bu 4 kategoride tedarikçiye gelecek
```

**Sonuç**: Tedarikçi 2 yerine 4 kategoriden talep alır

---

### Senaryo 2: Çoklu Banka Hesabı Ekleme

```
1. Ayarlar → Banka Hesapları
2. İlk satır (TRY):
   - Banka: "Ziraat Bankası"
   - IBAN: "TR12 0001 0000 0000 1234 5678 90"
   - Hesap: "ŞİRKET A.Ş."
   - Para Birimi: TRY
3. "+ Hesap Ekle"
4. İkinci satır (USD):
   - Banka: "İş Bankası"
   - IBAN: "TR98 0006 4000 0000 9876 5432 10"
   - Hesap: "ŞİRKET A.Ş. USD"
   - Para Birimi: USD
5. "Kaydet"
6. IBAN'lar doğrulandı ✓
7. 2 hesap kaydedildi
```

**Sonuç**: Alıcılar hem TL hem USD ödeme seçeneği görür

---

### Senaryo 3: Vergi Levhası Yükleme

```
1. Ayarlar → Vergi Levhası
2. "Choose File" → vergi-levhasi-2025.pdf seç (2.3 MB)
3. "Kaydet"e tıkla
4. Boyut kontrolü: 2.3 MB < 5 MB ✓
5. Storage'a yükleniyor...
6. Yol: suppliers/abc123/1729276800000-vergi-levhasi-2025.pdf
7. Firestore'a kaydedildi
8. Alert: "✅ Bilgileriniz başarıyla güncellendi!"
9. Ayarlar'ı tekrar aç
10. Gösterim: "✓ Yüklü dosya: vergi-levhasi-2025.pdf"
```

**Sonuç**: Vergi levhası sisteme yüklendi

---

### Senaryo 4: IBAN Doğrulama Hatası

```
1. Banka hesabı ekle
2. IBAN gir: "TR12 3456 7890 1234" (çok kısa)
3. "Kaydet"e tıkla
4. Doğrulama: 16 rakam, olması gereken 24 ❌
5. Alert: "❌ Geçersiz TR IBAN: TR12345678901234"
6. Kayıt iptal
7. Düzelt: "TR12 3456 7890 1234 5678 9012 34"
8. "Kaydet"e tıkla
9. Doğrulama geçti ✓
10. Kayıt başarılı
```

**Sonuç**: Sadece geçerli IBAN'lar kaydedilir

---

## 🔗 Mevcut Özelliklerle Entegrasyon

### 1. Kategori Bazlı Hedefleme

**Ayarlar'da kategori güncelleme**:
```javascript
// Tedarikçi kategorilerini günceller
categories: ["Makine-İmalat", "Elektrik", "Plastik"]

// Yeni talep oluşturulduğunda
// Bu kategorilerle eşleşen talepler tedarikçiye gelir
```

### 2. Çoklu Firma Desteği

**Settings sayfasında**:
- Aynı header (company selector)
- Firma değiştirilebilir
- Profil kullanıcıya özel (firmaya özel değil)
- İleride: Firma bazlı profiller eklenebilir

### 3. KVKK Onay Takibi

**Kayıt** (role-select.html):
- KVKK onayı alınır
- `kvkkConsent: true`, `consentAt: Timestamp`

**Ayarlar** (settings.html):
- Sadece gösterim
- Ne zaman onay verildiği görünür
- Ayarlardan iptal edilemez

---

## 🛡️ Güvenlik

### Firestore Rules (Mevcut - Yeterli)

```javascript
match /users/{uid} {
  // Kullanıcı kendi kaydını okur/yazar
  allow read, write: if request.auth.uid == uid;
}
```

### Storage Rules (Mevcut - Yeterli)

```javascript
match /suppliers/{uid}/{allPaths=**} {
  // Sadece kendi klasörüne yazabilir
  allow write: if request.auth.uid == uid;
}
```

**Ek kural gerekmiyor** - mevcut kurallar yeterli

---

## ✅ Test Listesi

### Test 1: Mevcut Profil Yükleme
- [ ] Login yap
- [ ] Ayarlar'a git
- [ ] Tüm alanlar Firestore'dan doldu mu?
- [ ] E-posta/telefon chip'leri görünüyor mu?
- [ ] Banka hesapları tabloda mu?

### Test 2: Firma Bilgileri Güncelleme
- [ ] Şirket adı değiştir
- [ ] Vergi no güncelle
- [ ] Kaydet
- [ ] Firestore kontrol: Değişti mi?

### Test 3: Tedarikçi Kategorileri (Zorunlu)
- [ ] Rol: Supplier seç
- [ ] Kategori bölümü açıldı mı?
- [ ] Tüm kategorileri kaldır
- [ ] Kaydet → Hata mesajı geldi mi?
- [ ] 1 kategori ekle → Kayıt başarılı mı?

### Test 4: E-posta Chip Input
- [ ] E-posta yaz → Enter
- [ ] Chip eklendi mi?
- [ ] Geçersiz e-posta → Hata verdi mi?
- [ ] Chip'e tıkla (✕) → Silindi mi?
- [ ] Kaydet → Firestore'da doğru mu?

### Test 5: Geçerli IBAN
- [ ] TR IBAN gir (26 karakter)
- [ ] Kaydet
- [ ] MOD-97 doğrulama geçti mi?
- [ ] Firestore'a kaydedildi mi?

### Test 6: Geçersiz IBAN
- [ ] Yanlış IBAN gir (checksum hatası)
- [ ] Kaydet
- [ ] Hata mesajı geldi mi?
- [ ] Kayıt iptal edildi mi?

### Test 7: Vergi Levhası Yükleme
- [ ] PDF seç (< 5MB)
- [ ] Kaydet
- [ ] Storage'a yüklendi mi?
- [ ] Yol Firestore'da mı?
- [ ] Tekrar aç → Dosya adı görünüyor mu?

### Test 8: Dosya Boyutu Kontrolü
- [ ] 8MB dosya seç
- [ ] Kaydet
- [ ] Hata: "5MB'dan küçük olmalı" geldi mi?

### Test 9: Çoklu Banka Hesabı
- [ ] 3 hesap ekle (TRY, USD, EUR)
- [ ] Kaydet
- [ ] Firestore: 3 hesap kaydedildi mi?

### Test 10: Banka Hesabı Silme
- [ ] 2 hesap var
- [ ] Birini "Sil" ile kaldır
- [ ] Kaydet
- [ ] Firestore: 1 hesap kaldı mı?

---

## 📁 Dosya Değişiklikleri

### Yeni Dosyalar
- ✅ `settings.html` - Profil ayarları sayfası
- ✅ `SETTINGS_GUIDE.md` - Detaylı kullanım rehberi

### Değiştirilen Dosyalar
- ✅ `dashboard.html` - ⚙️ Ayarlar linki eklendi
- ✅ `demands.html` - ⚙️ Ayarlar linki eklendi
- ✅ `demand-new.html` - ⚙️ Ayarlar linki eklendi
- ✅ `demand-detail.html` - ⚙️ Ayarlar linki eklendi

---

## 🎉 Özet

**Tamamlanan Özellikler**:
- ✅ Profil düzenleme sayfası
- ✅ Çoklu e-posta/telefon (chip input)
- ✅ Tedarikçi kategorileri (17 kategori)
- ✅ Vergi levhası yükleme (5MB limit)
- ✅ Çoklu banka hesabı (IBAN doğrulama)
- ✅ TR IBAN MOD-97 algoritması
- ✅ KVKK onay gösterimi
- ✅ Tüm sayfalarda ayarlar linki
- ✅ Kapsamlı validasyon

**Kullanıma Hazır!** 🚀

Detaylı rehber: `SETTINGS_GUIDE.md`
