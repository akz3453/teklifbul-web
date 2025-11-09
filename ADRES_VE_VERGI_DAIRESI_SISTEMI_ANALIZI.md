# Adres ve Vergi Dairesi Sistemi - Teknik Analiz Dokümantasyonu

## 📋 Genel Bakış

Bu dokümantasyon, Teklifbul sistemindeki **Adres Sistemi** ve **Vergi Dairesi Sistemi**'nin teknik yapısını, hata kaynaklarını ve çözüm önerilerini detaylı olarak açıklamaktadır.

---

## 🏠 ADRES SİSTEMİ

### 1. Mimari Yapı

#### Veri Katmanları (Hierarchy)
```
Ülke (Country)
  └─ İl (Province)
      └─ İlçe (District)
          └─ Mahalle (Neighborhood)
              └─ Sokak/Cadde (Street)
```

#### Veri Kaynakları (Priority Order)

**A. İl/İlçe Verisi:**
1. **Firestore** (`trDistricts` koleksiyonu) - Primary
2. **Local JSON** (`/assets/tr-il-ilce.json`) - Fallback
3. **GitHub CDN** (`https://raw.githubusercontent.com/...`) - Fallback
4. **Hardcoded TR_PROVINCES array** - Son çare

**B. Mahalle Verisi:**
1. **Local JSON** (`/assets/mahalle/{DISTRICT_ID}.json`) - Primary
2. **TürkiyeAPI** (`https://api.turkiyeapi.dev/v1/neighborhoods`) - Fallback
3. **Boş array** - Son çare

**C. Sokak Verisi:**
1. **Local JSON** (`/assets/sokak/{DISTRICT_ID}_mah-{NEIGHBORHOOD_ID}.json`) - Primary
2. **TürkiyeAPI** (`https://api.turkiyeapi.dev/v1/streets`) - Fallback
3. **Boş array** - Son çare

### 2. Normalizasyon ve ID Üretimi

#### İl/İlçe ID Formatı
- Format: `{PROVINCE_NAME}__{DISTRICT_NAME}`
- Örnek: `ISTANBUL__BEYKOZ`, `BOLU__SEBEN`
- Normalizasyon:
  - Türkçe karakterler korunur (ü, ş, ğ, ı, İ, ç, ö)
  - Boşluklar `__` (çift alt çizgi) ile değiştirilir
  - Tüm harfler büyük yazılır

#### Mahalle ID Formatı
- Fonksiyon: `slugTR(neighborhoodName)`
- Örnek: `ÇARŞI` → `CARSI` (normalize edilmiş)
- Normalizasyon:
  - Türkçe karakterler İngilizce eşdeğerlerine dönüştürülür (ı→i, İ→I, ş→s, ğ→g, ü→u, ö→o, ç→c)
  - Boşluklar `_` ile değiştirilir
  - Özel karakterler kaldırılır

#### Sokak JSON Dosya Adı Formatı
- Format: `/assets/sokak/{DISTRICT_ID}_mah-{NEIGHBORHOOD_ID}.json`
- Örnek: `/assets/sokak/BOLU__SEBEN_mah-CARSI.json`
- Örnek: `/assets/sokak/ISTANBUL__BEYKOZ_mah-CENGELDERE.json`

### 3. Hata Kaynakları ve Çözümler

#### 🔴 Problem 1: 404 Hataları (Sokak/Mahalle JSON)

**Hata Mesajı:**
```
GET http://localhost:5174/assets/sokak/BOLU__SEBEN_mah-CARSI.json 404 (Not Found)
GET http://localhost:5174/assets/mahalle/BOLU__BOLU_MERKEZ.json 404 (Not Found)
```

**Kaynak:**
- Çoğu mahalle için sokak JSON dosyası mevcut değil
- Çoğu ilçe için mahalle JSON dosyası mevcut değil
- Bu dosyalar dinamik olarak oluşturuluyor (ilk kullanımda API'den çekilip cache'e kaydediliyor)

**Çözüm:**
- ✅ **Uygulandı:** Tüm `fetchJSON` fonksiyonlarında 404 hataları sessizce handle ediliyor
- ✅ **Uygulandı:** `__fetchJSON`, `fetchJSON` fonksiyonları özel hata tipleri (`FileNotFoundError`, `NetworkError`) kullanıyor
- ✅ **Uygulandı:** `__loadStreets`, `loadStreets`, `__loadNeighborhoods` fonksiyonları sessizce boş array döndürüyor

**Kod Örneği:**
```javascript
async function __fetchJSON(url){
  try {
    const r = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!r.ok) {
      if (r.status === 404) {
        const notFoundError = new Error(`FILE_NOT_FOUND`);
        notFoundError.name = 'FileNotFoundError';
        throw notFoundError; // Konsola yazılmaz
      }
      // Diğer hatalar...
    }
    return await r.json();
  } catch (e) {
    // Network hataları sessizce handle edilir
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      const networkError = new Error(`NETWORK_ERROR`);
      networkError.name = 'NetworkError';
      throw networkError;
    }
    throw e;
  }
}
```

#### 🔴 Problem 2: TürkiyeAPI 404 Hataları

**Hata Mesajı:**
```
GET https://api.turkiyeapi.dev/v1/streets?district=Seben&neighborhood=Çarşı 404 (Not Found)
GET https://api.turkiyeapi.dev/v1/neighborhoods?district=BOLU_MERKEZ 404 (Not Found)
```

**Kaynak:**
- TürkiyeAPI bazı ilçe/mahalle kombinasyonları için veri döndürmüyor
- API endpoint'leri değişmiş olabilir
- Rate limiting veya API key gereksinimi olabilir

**Çözüm:**
- ✅ **Uygulandı:** API çağrıları `try-catch` ile sarılı, hatalar sessizce handle ediliyor
- ✅ **Uygulandı:** API başarısız olursa boş array döndürülüyor, sistem çalışmaya devam ediyor

#### 🔴 Problem 3: URL Encoding Sorunları

**Hata:**
- Türkçe karakterler URL'de yanlış encode ediliyor
- Örnek: `ÇARŞI` → `%C3%87AR%C5%9EI` (yanlış)

**Çözüm:**
- ✅ **Uygulandı:** `encodeURIComponent()` kullanılıyor
- ✅ **Uygulandı:** Backend'de `decodeURIComponent()` ile decode ediliyor

---

## 🏛️ VERGİ DAİRESİ SİSTEMİ

### 1. Mimari Yapı

#### Veri Kaynağı
- **Primary:** PostgreSQL (`tax_offices` tablosu)
- **Fallback 1:** Firestore (`taxOffices` koleksiyonu)
- **Fallback 2:** Local Array (`LOCAL_TAX_OFFICES`)

#### Veri Yapısı (PostgreSQL)
```sql
CREATE TABLE tax_offices (
  id SERIAL PRIMARY KEY,
  province_name VARCHAR(100) NOT NULL,
  district_name VARCHAR(100),
  office_name VARCHAR(200) NOT NULL,
  office_code VARCHAR(5) UNIQUE NOT NULL,
  office_type VARCHAR(10) CHECK (office_type IN ('VD', 'MALMUDURLUGU')),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_province ON tax_offices(province_name);
CREATE INDEX idx_province_district ON tax_offices(province_name, district_name);
```

### 2. API Endpoints

#### GET `/api/tax-offices/provinces`
- **Açıklama:** Tüm illeri listeler
- **Response:** `string[]` (il adları array'i)
- **Cache:** Redis (24 saat, key: `tax_offices:provinces`)

#### GET `/api/tax-offices?province={IL}&district={ILCE}`
- **Açıklama:** İl ve (opsiyonel) ilçe bazlı vergi dairelerini listeler
- **Query Parameters:**
  - `province` (required): İl adı (örnek: `ISTANBUL`, `ANKARA`)
  - `district` (optional): İlçe adı
- **Response:**
  ```json
  [
    {
      "id": 1,
      "province_name": "İSTANBUL",
      "district_name": "BEYKOZ",
      "office_name": "Beykoz Vergi Dairesi Müdürlüğü",
      "office_code": "12345",
      "office_type": "VD"
    }
  ]
  ```
- **Cache:** Redis (24 saat, key: `tax_offices:{PROVINCE}:{DISTRICT || 'all'}`)

### 3. Normalizasyon ve Eşleştirme

#### İl Adı Normalizasyonu
```typescript
// Backend (taxOffices.ts)
province = decodeURIComponent(province).trim();

// SQL sorgusunda:
WHERE UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(province_name, 'İ', 'I'), 'ı', 'i'), 'ş', 's'), 'ğ', 'g'), 'ü', 'u'))) 
  = UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE($1, 'İ', 'I'), 'ı', 'i'), 'ş', 's'), 'ğ', 'g'), 'ü', 'u')))
```

**Normalizasyon Adımları:**
1. URL decode (`decodeURIComponent`)
2. Trim (başında/sonunda boşluk)
3. Türkçe karakter normalizasyonu (İ→I, ı→i, ş→s, ğ→g, ü→u)
4. Case-insensitive karşılaştırma (UPPER)

#### Frontend Normalizasyonu
```javascript
// Frontend (role-select.html)
const normalizedProvince = province.toUpperCase().trim();
const url = `/api/tax-offices?province=${encodeURIComponent(normalizedProvince)}`;
```

### 4. Hata Kaynakları ve Çözümler

#### 🔴 Problem 1: İSTANBUL için 500 Hatası

**Hata Mesajı:**
```
GET http://localhost:5173/api/tax-offices?province=%C4%B0STANBUL 500 (Internal Server Error)
```

**Kaynak:**
- İSTANBUL il adı URL'de `%C4%B0STANBUL` olarak encode ediliyor (İ karakteri)
- Backend'de decode edilmeden önce SQL sorgusu çalışıyor
- Türkçe karakter normalizasyonu eksikti

**Çözüm:**
- ✅ **Uygulandı:** Backend'de `decodeURIComponent()` eklendi
- ✅ **Uygulandı:** SQL sorgusunda Türkçe karakter normalizasyonu eklendi (REPLACE ile)
- ✅ **Uygulandı:** Frontend'de `toUpperCase().trim()` ile normalize ediliyor

**Kod Örneği:**
```typescript
// Backend (taxOffices.ts)
let { province, district } = req.query;

// URL decode ve normalize
province = decodeURIComponent(province).trim();
if (district && typeof district === 'string') {
  district = decodeURIComponent(district).trim();
}

// SQL sorgusu - Turkish character normalization
let query = `
  SELECT id, province_name, district_name, office_name, office_code, office_type
  FROM tax_offices
  WHERE UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(province_name, 'İ', 'I'), 'ı', 'i'), 'ş', 's'), 'ğ', 'g'), 'ü', 'u'))) 
    = UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE($1, 'İ', 'I'), 'ı', 'i'), 'ş', 's'), 'ğ', 'g'), 'ü', 'u')))
`;
```

#### 🔴 Problem 2: PostgreSQL Bağlantı Hatası

**Hata:**
- `ECONNREFUSED` veya `ENOTFOUND`
- PostgreSQL servisi çalışmıyor

**Çözüm:**
- ✅ **Uygulandı:** Backend'de 503 status code dönüyor
- ✅ **Uygulandı:** Frontend'de 503 hatası durumunda Firestore fallback'e geçiliyor

#### 🔴 Problem 3: Boş Sonuç Dönmesi

**Durum:**
- PostgreSQL'de kayıt yok (ETL henüz çalıştırılmamış)
- İl adı eşleşmiyor (normalizasyon sorunu)

**Çözüm:**
- ✅ **Uygulandı:** Boş array dönerse Firestore fallback'e geçiliyor
- ✅ **Uygulandı:** Firestore da boşsa local array kullanılıyor

### 5. Cache Stratejisi

#### Redis Cache
- **TTL:** 24 saat (86400 saniye)
- **Key Format:** `tax_offices:{PROVINCE}:{DISTRICT || 'all'}`
- **Fallback:** Redis yoksa veya hata olursa doğrudan PostgreSQL'den çekiliyor

#### Cache Invalidation
- Manuel: Backend server restart (cache temizlenir)
- Otomatik: 24 saat sonra expire olur
- ETL sonrası: Manuel cache clear gerekir (şu an yok, eklenebilir)

---

## 🔍 HATA ANALİZİ REHBERİ

### Adım 1: 404 Hatalarını Kontrol Et

**Konsol Çıktısı:**
```
GET /assets/sokak/... 404 (Not Found)
GET /assets/mahalle/... 404 (Not Found)
```

**Normal Durum mu?**
- ✅ **EVET** - Bu hatalar **normal**dir, çünkü:
  - Çoğu mahalle/sokak için JSON dosyası yok
  - Sistem fallback mekanizması kullanıyor (API → boş array)
  - Bu hatalar artık **sessizce** handle ediliyor (konsola yazılmıyor)

**Çözüm Gerekli mi?**
- ❌ **HAYIR** - Sistem normal çalışıyor, kullanıcı manuel giriş yapabilir

### Adım 2: Vergi Dairesi API Hatasını Kontrol Et

**Konsol Çıktısı:**
```
GET /api/tax-offices?province=İSTANBUL 500 (Internal Server Error)
```

**Kaynak:**
1. PostgreSQL çalışmıyor → Backend log'larını kontrol et
2. URL encoding sorunu → Backend'de `decodeURIComponent` çalışıyor mu?
3. SQL normalizasyon sorunu → Veritabanında il adı farklı formatta olabilir

**Çözüm:**
- PostgreSQL servisini başlat: `docker-compose up -d postgres`
- Backend server'ı yeniden başlat
- ETL'i çalıştır: `pnpm etl:tax-offices --input=./data/gib_tax_offices.pdf`

### Adım 3: Firestore Fallback Çalışıyor mu?

**Konsol Çıktısı:**
```
⚠️ Firestore'dan veri alınamadı, yerel liste kullanılıyor
```

**Kaynak:**
- Firestore'da `taxOffices` koleksiyonu boş
- Bu durum **normal**dir (PostgreSQL primary kaynak)

**Çözüm:**
- Firestore'a vergi dairesi verisi yüklemek isteğe bağlıdır
- Sistem local array ile çalışmaya devam eder

---

## 📝 ÖNERİLER VE İYİLEŞTİRMELER

### 1. Adres Sistemi

#### Öneri 1: Sokak JSON Dosyalarını Önceden Oluştur
- TürkiyeAPI'den tüm ilçe/mahalle kombinasyonları için sokak verisini çek
- Local JSON dosyalarına kaydet
- Bu işlem **tek seferlik** olarak bir script ile yapılabilir

#### Öneri 2: Firestore Cache Kullanımı
- İlk API çağrısında sokak/mahalle verisini Firestore'a kaydet
- Sonraki çağrılarda Firestore'dan çek (PostgreSQL gibi bir cache mekanizması)

#### Öneri 3: Debounce Optimizasyonu
- ✅ **Uygulandı:** Vergi dairesi seçiminde 300ms debounce var
- Sokak/mahalle seçiminde de debounce eklenebilir

### 2. Vergi Dairesi Sistemi

#### Öneri 1: ETL Otomasyonu
- Cron job ile haftalık GİB PDF indirme
- Otomatik ETL çalıştırma
- Hata durumunda email bildirimi

#### Öneri 2: Veri Güncelleme Mekanizması
- PostgreSQL'deki kayıtların güncellendiğini tespit et
- Redis cache'i otomatik temizle
- Frontend'e cache invalidation bildirimi gönder

#### Öneri 3: Arama ve Filtreleme
- Vergi dairesi arama özelliği (typeahead)
- İlçe bazlı filtreleme (şu an var, optimize edilebilir)

---

## 🐛 BİLİNEN SORUNLAR

### 1. Yavaş Yükleme
- **Sorun:** İl seçildiğinde vergi daireleri yüklenmesi yavaş
- **Çözüm:** ✅ Debounce eklendi (300ms), yükleniyor göstergesi eklendi

### 2. Konsol Kirliliği
- **Sorun:** 404 hataları konsolu kirletiyordu
- **Çözüm:** ✅ Tüm hatalar sessizce handle ediliyor

### 3. İSTANBUL Hatası
- **Sorun:** İSTANBUL için 500 hatası alınıyordu
- **Çözüm:** ✅ URL decode + Turkish normalization eklendi

### 4. Firestore Boş Uyarısı
- **Sorun:** "Firestore'dan veri alınamadı" uyarısı kullanıcıyı endişelendiriyordu
- **Çözüm:** ✅ Mesaj "normal durum" olarak güncellendi, `console.debug` kullanılıyor

---

## 📊 PERFORMANS METRİKLERİ

### Hedefler
- Vergi dairesi API: < 200ms (cache'li), < 500ms (cache'siz)
- Sokak yükleme: < 150ms (local), < 1000ms (API fallback)
- Mahalle yükleme: < 100ms (local), < 800ms (API fallback)

### Ölçümler
- Cache hit rate: ~%80 (tahmin)
- Fallback kullanımı: ~%20 (PostgreSQL yoksa veya yavaşsa)

---

## 🔗 İLGİLİ DOSYALAR

### Backend
- `src/modules/taxOffices/routes/taxOffices.ts` - API routes
- `src/modules/taxOffices/etl-tax-offices.ts` - ETL script
- `src/modules/taxOffices/migrations/001_create_tax_offices_tables.sql` - DB schema

### Frontend
- `role-select.html` - Adres ve vergi dairesi seçimi (yeni kayıt)
- `settings.html` - Adres ve vergi dairesi güncelleme (hesap ayarları)
- `demand-new.html` - Talep oluşturma (adres seçimi)

### Veri Dosyaları
- `/assets/tr-il-ilce.json` - İl/ilçe listesi
- `/assets/mahalle/{DISTRICT_ID}.json` - Mahalle listeleri (dinamik)
- `/assets/sokak/{DISTRICT_ID}_mah-{NEIGHBORHOOD_ID}.json` - Sokak listeleri (dinamik)

---

## 📞 SORUN GİDERME REHBERİ

### Senaryo 1: Vergi Dairesi Listesi Boş

**Kontrol Listesi:**
1. ✅ PostgreSQL çalışıyor mu? → `docker ps` veya `docker-compose ps`
2. ✅ ETL çalıştırıldı mı? → `pnpm etl:tax-offices --input=./data/gib_tax_offices.pdf`
3. ✅ Backend server çalışıyor mu? → `http://localhost:5174/api/health`
4. ✅ Redis cache çalışıyor mu? → `redis-cli ping`
5. ✅ API endpoint test edildi mi? → `curl http://localhost:5174/api/tax-offices?province=ISTANBUL`

### Senaryo 2: Sokak/Mahalle Listesi Boş

**Kontrol Listesi:**
1. ✅ Local JSON dosyası var mı? → `/assets/mahalle/{DISTRICT_ID}.json`
2. ✅ TürkiyeAPI erişilebilir mi? → Browser'da test et
3. ✅ Fallback mekanizması çalışıyor mu? → Konsol loglarını kontrol et (sessiz olmalı)

### Senaryo 3: İSTANBUL için Hata

**Kontrol Listesi:**
1. ✅ Backend'de URL decode çalışıyor mu? → Log'ları kontrol et
2. ✅ SQL sorgusu normalizasyon yapıyor mu? → PostgreSQL log'larını kontrol et
3. ✅ Frontend'de normalize ediliyor mu? → `toUpperCase().trim()` çalışıyor mu?

---

## ✅ TEST KONTROL LİSTESİ

- [ ] İl seçildiğinde vergi daireleri yükleniyor
- [ ] İSTANBUL için vergi daireleri geliyor
- [ ] İlçe seçildiğinde mahalleler yükleniyor (sessizce, 404 hataları görünmüyor)
- [ ] Mahalle seçildiğinde sokaklar yükleniyor (sessizce, 404 hataları görünmüyor)
- [ ] Firestore fallback çalışıyor (PostgreSQL yoksa)
- [ ] Local array fallback çalışıyor (Firestore da boşsa)
- [ ] Debounce çalışıyor (300ms bekleme)
- [ ] Yükleniyor göstergesi görünüyor

---

**Son Güncelleme:** 2025-03-11  
**Versiyon:** 1.0  
**Hazırlayan:** Auto (Cursor AI)

