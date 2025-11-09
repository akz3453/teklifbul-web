# 📋 Teklifbul Kategori Sistemi - Dokümantasyon

## 🎯 Genel Bakış

Teklifbul platformunda, firmalar kayıt olurken **tedarikçi** veya **alıcı** kategorileri seçer. Yeni talep oluşturulurken de **talep kategorileri** seçilir. Bu kategoriler, taleplerin hangi tedarikçilere gösterileceğini belirlemek için kullanılır (tedarikçi eşleştirme sistemi).

## 📊 Kategori Tanımları

### Kategori Listesi (ID-Based System)

Sistemde **17 kategori** tanımlıdır. Her kategorinin:
- **ID**: Benzersiz tanımlayıcı (örn: `cat_sac_metal`)
- **İsim**: Kullanıcıya gösterilen isim (örn: `Sac/Metal`)

**Kategori Listesi:**
```javascript
export const CATEGORIES = [
  { id: 'cat_sac_metal', name: 'Sac/Metal' },
  { id: 'cat_elektrik', name: 'Elektrik' },
  { id: 'cat_elektronik', name: 'Elektronik' },
  { id: 'cat_makine_imalat', name: 'Makine-İmalat' },
  { id: 'cat_hirdavat', name: 'Hırdavat' },
  { id: 'cat_ambalaj', name: 'Ambalaj' },
  { id: 'cat_kimyasal', name: 'Kimyasal' },
  { id: 'cat_insaat_malzemeleri', name: 'İnşaat Malzemeleri' },
  { id: 'cat_mobilya', name: 'Mobilya' },
  { id: 'cat_boya', name: 'Boya' },
  { id: 'cat_plastik', name: 'Plastik' },
  { id: 'cat_otomotiv_yan_sanayi', name: 'Otomotiv Yan Sanayi' },
  { id: 'cat_is_guvenligi', name: 'İş Güvenliği' },
  { id: 'cat_temizlik', name: 'Temizlik' },
  { id: 'cat_gida', name: 'Gıda' },
  { id: 'cat_hizmet', name: 'Hizmet' },
  { id: 'cat_lojistik', name: 'Lojistik' }
];
```

**Dosya:** `categories.js`

---

## 1️⃣ Tedarikçi/Alıcı Kayıt Sistemi (settings.html)

### 1.1 Kategori Seçimi

**Ekran:** Hesap Ayarları (`settings.html`)

**Süreç:**
1. Kullanıcı "Hesap Ayarları" sayfasına gider
2. "Tedarikçi Kategorileri" veya "Alıcı Kategorileri" bölümünde kategorileri seçer
3. Kategoriler **checkbox listesi** olarak gösterilir
4. Kullanıcı seçtiği kategorileri kaydeder

### 1.2 Kayıt Formatı

**Firestore'a kaydedilen alanlar:**

#### Tedarikçi Kategorileri:
```javascript
{
  supplierCategories: ['Sac/Metal', 'Elektrik', 'Gıda'],  // İsim formatında (eski sistem)
  supplierCategoryKeys: ['sac-metal', 'elektrik', 'gida'], // Slug formatında (orta sistem)
  supplierCategoryIds: ['cat_sac_metal', 'cat_elektrik', 'cat_gida'] // ID formatında (yeni sistem - HENÜZ UYGULANMADI)
}
```

#### Alıcı Kategorileri:
```javascript
{
  buyerCategories: ['Sac/Metal', 'Elektrik'], // İsim formatında (eski sistem)
  // Not: Alıcı kategorileri için ID sistemi henüz uygulanmadı
}
```

### 1.3 Slug Dönüşümü

Kategoriler kaydedilirken **Türkçe karakter normalizasyonu** yapılır:

```javascript
// Örnek dönüşümler:
'Sac/Metal' → 'sac-metal'
'Gıda' → 'gida'
'Hırdavat' → 'hirdavat'
'İş Güvenliği' → 'is-guvenligi'
'İnşaat Malzemeleri' → 'insaat-malzemeleri'
```

**Sorun:** Bazı durumlarda yanlış slug üretimi:
- `'Gıda'` → `'gda'` (yanlış - 'ı' karakteri kaybolmuş)
- `'Hırdavat'` → `'hrdavat'` (yanlış - 'ı' karakteri kaybolmuş)
- `'İş Güvenliği'` → `'i-gvenlii'` (yanlış - Türkçe karakterler yanlış normalize edilmiş)

**Çözüm:** `utils/slugify-tr.js` dosyasında düzeltilmiş slug fonksiyonu kullanılıyor.

**Kod Konumu:** `settings.html` satır 2308-2316

---

## 2️⃣ Talep Oluşturma Sistemi (demand-new.html)

### 2.1 Kategori Seçimi

**Ekran:** Yeni Talep Oluştur (`demand-new.html`)

**Süreç:**
1. Kullanıcı "Yeni Talep" sayfasına gider
2. "Kategori Grupları" bölümünde kategorileri seçer
3. Kategoriler **chip (badge) formatında** gösterilir
4. Kullanıcı seçtiği kategorileri "Talep Oluştur" butonu ile kaydeder

### 2.2 Kayıt Formatı

**Talep oluşturulurken Firestore'a kaydedilen alanlar:**

```javascript
{
  categoryIds: ['cat_sac_metal', 'cat_elektrik', 'cat_gida'], // ID formatında (yeni sistem - PRİMARY)
  categoryTags: ['sac-metal', 'elektrik', 'gida'], // Slug formatında (geriye dönük uyumluluk için)
  supplierCategoryKeys: ['sac-metal', 'elektrik', 'gida'], // Slug formatında (tedarikçi eşleştirme için)
}
```

### 2.3 Kategori Grupları

Kullanıcılar **kategori grupları** oluşturabilir ve bunları tekrar kullanabilir:

**Firestore Yapısı:**
```
users/{uid}/categoryGroups/{groupId}
{
  name: 'Tüm Kategoriler',
  categories: ['cat_sac_metal', 'cat_elektrik', ...], // ID veya slug formatında
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Not:** Kategori gruplarında **eski slug formatları** (`gda`, `hrdavat`, `i-gvenlii`) kayıtlı olabilir. Sistem bunları otomatik olarak doğru ID'lere çevirir.

**Kod Konumu:** `demand-new.html` satır 1032-1061 (nameToCategoryId fonksiyonu)

---

## 3️⃣ Tedarikçi Eşleştirme Sistemi

### 3.1 Eşleştirme Mantığı

Talep oluşturulup "Onayla ve Gönder" butonuna basıldığında, sistem:

1. **Talep kategorilerini** alır (`categoryIds` veya `categoryTags`)
2. **Aktif tedarikçileri** arar
3. **Üç farklı alan** kontrol eder:
   - `supplierCategoryIds` (yeni ID sistemi)
   - `supplierCategoryKeys` (slug format - geriye dönük uyumluluk)
   - `supplierCategories` (isim format - geriye dönük uyumluluk)
4. Eşleşen tedarikçilere talebi **otomatik olarak gönderir**

### 3.2 Sorgu Yapısı

**Firestore Sorguları (batch'ler halinde, max 10 kategori):**

```javascript
// Query 1: ID-based matching (yeni sistem)
query(
  collection(db, 'users'),
  where('isActive', '==', true),
  where('roles', 'array-contains', 'supplier'),
  where('supplierCategoryIds', 'array-contains-any', ['cat_sac_metal', 'cat_elektrik', ...])
)

// Query 2: Slug-based matching (orta sistem - geriye dönük uyumluluk)
query(
  collection(db, 'users'),
  where('isActive', '==', true),
  where('roles', 'array-contains', 'supplier'),
  where('supplierCategoryKeys', 'array-contains-any', ['sac-metal', 'elektrik', ...])
)

// Query 3: Name-based matching (eski sistem - geriye dönük uyumluluk)
query(
  collection(db, 'users'),
  where('isActive', '==', true),
  where('roles', 'array-contains', 'supplier'),
  where('supplierCategories', 'array-contains-any', ['Sac/Metal', 'Elektrik', ...])
)
```

**Kod Konumu:** `demand-new.html` satır 3187-3235

### 3.3 Eşleştirme Sonucu

Eşleşen tedarikçiler `demandRecipients` koleksiyonuna kaydedilir:

```javascript
{
  demandId: 'demand_123',
  buyerId: 'buyer_uid',
  supplierId: 'supplier_uid',
  matchedAt: timestamp,
  status: 'pending',
  createdAt: timestamp
}
```

---

## 4️⃣ Format Dönüşümleri

### 4.1 İsim → Slug Dönüşümü

**Fonksiyon:** `slugifyTr()` (`utils/slugify-tr.js`)

```javascript
// Örnekler:
'Sac/Metal' → 'sac-metal'
'Gıda' → 'gida'
'Hırdavat' → 'hirdavat'
'İş Güvenliği' → 'is-guvenligi'
'İnşaat Malzemeleri' → 'insaat-malzemeleri'
```

### 4.2 İsim → ID Dönüşümü

**Fonksiyon:** `getCategoryIdByName()` (`categories.js`)

```javascript
// Örnekler:
'Sac/Metal' → 'cat_sac_metal'
'Gıda' → 'cat_gida'
'Hırdavat' → 'cat_hirdavat'
```

### 4.3 Slug/ID → İsim Dönüşümü

**Fonksiyon:** `categoryToDisplayName()` (`demand-detail.html`)

```javascript
// Örnekler:
'cat_sac_metal' → 'Sac/Metal'
'sac-metal' → 'Sac/Metal'
'cat_gida' → 'Gıda'
```

---

## 5️⃣ Geriye Dönük Uyumluluk

### 5.1 Eski Veriler

Sistemde **üç farklı format** bulunabilir:

1. **İsim formatı** (eski): `['Sac/Metal', 'Elektrik']`
2. **Slug formatı** (orta): `['sac-metal', 'elektrik']`
3. **ID formatı** (yeni): `['cat_sac_metal', 'cat_elektrik']`

### 5.2 Çoklu Format Desteği

Sistem, eşleştirme sırasında **her üç formatı da** kontrol eder:

```javascript
// Talep kategorileri → Tedarikçi kategorileri eşleştirmesi
const talepKategorileri = ['cat_sac_metal', 'cat_elektrik']; // ID formatı

// Tedarikçi 1: supplierCategoryIds = ['cat_sac_metal'] → ✅ Eşleşir
// Tedarikçi 2: supplierCategoryKeys = ['sac-metal'] → ✅ Eşleşir (slug'a çevrilerek)
// Tedarikçi 3: supplierCategories = ['Sac/Metal'] → ✅ Eşleşir (isim'e çevrilerek)
```

**Kod Konumu:** `demand-new.html` satır 3187-3235

---

## 6️⃣ Bilinen Sorunlar ve Çözümler

### 6.1 Yanlış Slug Üretimi

**Sorun:** Eski sistemde Türkçe karakterler yanlış normalize edilmiş:
- `'Gıda'` → `'gda'` ❌
- `'İş Güvenliği'` → `'i-gvenlii'` ❌

**Çözüm:** `nameToCategoryId()` fonksiyonu yanlış slug'ları otomatik olarak doğru ID'lere eşler:

```javascript
const incorrectSlugMap = {
  'gda': 'cat_gida',
  'hrdavat': 'cat_hirdavat',
  'inaat-malzemeleri': 'cat_insaat_malzemeleri',
  'i-gvenlii': 'cat_is_guvenligi',
  'sacmetal': 'cat_sac_metal',
  'makine-imalat': 'cat_makine_imalat'
};
```

**Kod Konumu:** `demand-new.html` satır 1032-1061

### 6.2 Tedarikçi Eşleştirme Hatası

**Sorun:** "No matching suppliers found" hatası alınıyor.

**Olası Nedenler:**
1. Tedarikçilerde `supplierCategoryIds` alanı yok (henüz güncellenmemiş)
2. Tedarikçilerde `supplierCategoryKeys` alanı eksik veya yanlış slug formatında
3. Tedarikçilerde `supplierCategories` alanı eksik veya yanlış isim formatında
4. Firestore composite index eksik

**Çözüm:** Sistem şu anda **her üç alanı da** kontrol ediyor. Detaylı log çıktıları konsola yazılıyor.

**Kod Konumu:** `demand-new.html` satır 3277-3285

---

## 7️⃣ Özet: Veri Akışı

```
┌─────────────────────────────────────────────────────────────┐
│ 1. TEDARİKÇİ/ALICI KAYIT (settings.html)                    │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kullanıcı kategorileri seçer
         ├─→ Kategoriler slug formatına çevrilir
         └─→ Firestore'a kaydedilir:
             • supplierCategories (isim)
             • supplierCategoryKeys (slug)
             • supplierCategoryIds (ID - HENÜZ UYGULANMADI)


┌─────────────────────────────────────────────────────────────┐
│ 2. TALEP OLUŞTURMA (demand-new.html)                        │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Kullanıcı kategorileri seçer (chip formatında)
         ├─→ Kategoriler ID formatına çevrilir
         └─→ Firestore'a kaydedilir:
             • categoryIds (ID - PRİMARY)
             • categoryTags (slug - backward compatibility)
             • supplierCategoryKeys (slug - matching için)


┌─────────────────────────────────────────────────────────────┐
│ 3. TEDARİKÇİ EŞLEŞTİRME (demand-new.html)                   │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ Talep kategorileri alınır (categoryIds)
         ├─→ 3 sorgu çalıştırılır:
         │   • supplierCategoryIds (ID)
         │   • supplierCategoryKeys (slug)
         │   • supplierCategories (isim)
         ├─→ Eşleşen tedarikçiler bulunur
         └─→ demandRecipients kayıtları oluşturulur


┌─────────────────────────────────────────────────────────────┐
│ 4. TALEP DETAY GÖSTERİMİ (demand-detail.html)                │
└─────────────────────────────────────────────────────────────┘
         │
         ├─→ categoryIds öncelikli okunur
         ├─→ categoryTags (slug) fallback olarak okunur
         ├─→ Her ikisi de isim formatına çevrilir
         └─→ Kullanıcıya gösterilir: "Sac/Metal", "Gıda", etc.
```

---

## 8️⃣ Kontrol Edilmesi Gerekenler

### ✅ Çalışan Özellikler:
- Kategori tanımları (`categories.js`)
- İsim → Slug dönüşümü (`slugify-tr.js`)
- İsim → ID dönüşümü (`getCategoryIdByName`)
- Slug → İsim dönüşümü (`categoryToDisplayName`)
- Yanlış slug'ları düzeltme (`nameToCategoryId` - incorrectSlugMap)
- Talep oluşturma sırasında ID sistemi kullanımı
- Tedarikçi eşleştirme (3 alan kontrolü)

### ⚠️ Eksik/İyileştirilebilir Özellikler:
- **Tedarikçi kayıt sisteminde ID kullanımı** (settings.html henüz slug formatında kaydediyor)
- Firestore veri migrasyonu (eski slug'ları düzeltme)
- Kategori gruplarında eski slug formatlarını temizleme

---

## 9️⃣ Test Senaryoları

### Senaryo 1: Tedarikçi Kaydı → Talep Oluşturma
1. Tedarikçi hesabı ile giriş yap
2. Hesap Ayarları'ndan "Sac/Metal", "Elektrik" kategorilerini seç ve kaydet
3. Alıcı hesabı ile giriş yap
4. Yeni Talep oluştur, "Sac/Metal" kategorisini seç
5. "Talebi Onayla ve Gönder" butonuna bas
6. **Beklenen:** Tedarikçi talebi görmeli

### Senaryo 2: Eski Slug Formatı ile Uyumluluk
1. Firestore'da bir tedarikçi kaydı var: `supplierCategoryKeys: ['sacmetal', 'gda']` (yanlış slug)
2. Alıcı "Sac/Metal" ve "Gıda" kategorileri ile talep oluşturur
3. **Beklenen:** Sistem yanlış slug'ları otomatik olarak düzeltir ve eşleştirir

### Senaryo 3: Çoklu Format Desteği
1. Tedarikçi 1: `supplierCategoryIds: ['cat_sac_metal']`
2. Tedarikçi 2: `supplierCategoryKeys: ['sac-metal']`
3. Tedarikçi 3: `supplierCategories: ['Sac/Metal']`
4. Alıcı "Sac/Metal" kategorisi ile talep oluşturur
5. **Beklenen:** Her üç tedarikçi de talebi görmeli

---

## 🔟 Önemli Notlar

1. **ID Sistemi Yeni:** Sistem şu anda **karma bir yapıda** çalışıyor:
   - Talep oluşturma → ID sistemi kullanılıyor ✅
   - Tedarikçi kayıt → Slug sistemi kullanılıyor ⚠️
   - Eşleştirme → Her iki sistem de destekleniyor ✅

2. **Backward Compatibility:** Eski verilerle uyumluluk için üç format da destekleniyor.

3. **Slug Normalizasyonu:** Türkçe karakterler için özel normalizasyon yapılıyor.

4. **Firestore Sorguları:** `array-contains-any` maksimum 10 değer destekler, bu yüzden kategoriler batch'lere bölünüyor.

---

## 📝 Dosya Referansları

- **Kategori Tanımları:** `categories.js`
- **Slug Fonksiyonu:** `utils/slugify-tr.js`
- **Tedarikçi Kayıt:** `settings.html` (satır 2308-2316)
- **Talep Oluşturma:** `demand-new.html` (satır 2690-4000)
- **Tedarikçi Eşleştirme:** `demand-new.html` (satır 3143-3320)
- **Talep Detay Gösterimi:** `demand-detail.html` (satır 1154-1197)

---

**Son Güncelleme:** 2025-11-02
**Versiyon:** 2.0 (ID-Based System ile güncellendi)

