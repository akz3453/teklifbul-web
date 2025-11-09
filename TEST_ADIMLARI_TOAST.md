# 🧪 Toast Dönüşümü Test Adımları

**Tarih**: 2025-01-21  
**Dosya**: `demand-detail.html`  
**Durum**: ✅ Kod Analizi Tamamlandı

---

## 📋 ÖN HAZIRLIK

### 1. Vite Development Server Başlatma

Proje Vite kullanıyor. Test için development server'ı başlatmanız gerekiyor:

```bash
# Terminal'de proje klasörüne gidin
cd C:\Users\faruk\OneDrive\Desktop\teklifbul-web

# Vite development server'ı başlatın
npm run dev
```

**Beklenen Çıktı**:
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 2. Tarayıcıda Açma

1. Tarayıcıda `http://localhost:5173/demand-detail.html` adresine gidin
2. Veya `http://localhost:5173` adresinden `demand-detail.html` sayfasına gidin

---

## 🔍 KOD ANALİZİ SONUÇLARI

### ✅ Kontrol Edilenler

1. **Import Yolu**: ✅ Doğru
   - `demand-detail.html`: `./src/shared/ui/toast.js` (relative path)
   - `index.html`: `/src/shared/ui/toast.js` (absolute path)
   - **Not**: Her iki yol da Vite'da çalışır, ancak relative path daha güvenli

2. **Toast Modülü**: ✅ Mevcut ve Çalışıyor
   - Dosya: `src/shared/ui/toast.js`
   - Export: `export const toast = { success, error, warn, info }`
   - CSS Animasyonları: Otomatik ekleniyor

3. **Syntax Kontrolü**: ✅ Hata Yok
   - Linter: 0 hata
   - Import: Doğru
   - Toast Kullanımı: 66 adet

---

## 🧪 TEST SENARYOLARI

### Test 1: Sayfa Yükleme ve Import Kontrolü

**Adımlar**:
1. `demand-detail.html` sayfasını açın
2. Browser Console'u açın (F12)
3. Console'da hata olmamalı

**Beklenen Sonuç**:
- ✅ Sayfa yüklenir
- ✅ Console'da import hatası yok
- ✅ Toast modülü yüklenir

**Olası Hatalar**:
- ❌ `Failed to resolve module "./src/shared/ui/toast.js"`
  - **Çözüm**: Vite server'ın çalıştığından emin olun
- ❌ `toast is not defined`
  - **Çözüm**: Import satırını kontrol edin (satır 758)

---

### Test 2: Toast Görünürlüğü

**Adımlar**:
1. Browser Console'u açın
2. Şu komutu çalıştırın:
```javascript
toast.success("Test mesajı");
```

**Beklenen Sonuç**:
- ✅ Sağ üstte yeşil toast görünür
- ✅ 3 saniye sonra otomatik kapanır
- ✅ Animasyon çalışır (slideIn/slideOut)

**Test Komutları**:
```javascript
// Success toast
toast.success("Başarılı işlem!");

// Error toast
toast.error("Hata oluştu!");

// Warning toast
toast.warn("Uyarı mesajı!");

// Info toast
toast.info("Bilgi mesajı!");
```

---

### Test 3: Talep Yükleme Senaryoları

#### 3.1. Talep ID Yok
**Adımlar**:
1. URL'den `?id=` parametresini kaldırın
2. Sayfayı yenileyin

**Beklenen Sonuç**:
- ✅ `toast.error("Talep ID bulunamadı.")` görünür
- ✅ Kırmızı toast mesajı
- ✅ `demands.html` sayfasına yönlendirilir

#### 3.2. Talep Bulunamadı
**Adımlar**:
1. URL'ye geçersiz bir ID ekleyin: `?id=gecersiz-id-123`
2. Sayfayı yenileyin

**Beklenen Sonuç**:
- ✅ `toast.error("Talep bulunamadı.")` görünür
- ✅ Kırmızı toast mesajı

#### 3.3. Yetki Hatası
**Adımlar**:
1. Başka bir kullanıcının talebine erişmeye çalışın

**Beklenen Sonuç**:
- ✅ `toast.error("Bu talebi görme yetkiniz yok...")` görünür
- ✅ Kırmızı toast mesajı

---

### Test 4: Teklif Gönderme Senaryoları

#### 4.1. Başarılı Teklif Gönderme
**Adımlar**:
1. Geçerli bir talep açın
2. Teklif formunu doldurun
3. "Teklif Gönder" butonuna tıklayın

**Beklenen Sonuç**:
- ✅ `toast.success("Teklif başarıyla gönderildi!")` görünür
- ✅ Yeşil toast mesajı
- ✅ Form temizlenir

#### 4.2. Validasyon Hataları
**Adımlar**:
1. Teklif formunu eksik doldurun (miktar, birim, fiyat eksik)
2. "Teklif Gönder" butonuna tıklayın

**Beklenen Sonuç**:
- ✅ `toast.error("Ürün X için miktar, birim ve birim fiyat alanları zorunludur.")` görünür
- ✅ Kırmızı toast mesajı
- ✅ Form gönderilmez

---

### Test 5: Dosya İşlemleri

#### 5.1. Dosya Yükleme
**Adımlar**:
1. Talep detay sayfasında dosya yükleme bölümünü bulun
2. Geçerli bir dosya seçin (max 10 MB)
3. Yükle butonuna tıklayın

**Beklenen Sonuç**:
- ✅ `toast.success("Dosyalar yüklendi.")` görünür
- ✅ Yeşil toast mesajı

#### 5.2. Dosya Çok Büyük
**Adımlar**:
1. 10 MB'dan büyük bir dosya seçin
2. Yükle butonuna tıklayın

**Beklenen Sonuç**:
- ✅ `toast.error("dosya-adi çok büyük (max 10 MB)")` görünür
- ✅ Kırmızı toast mesajı

---

### Test 6: Talep Yayınlama

#### 6.1. Başarılı Yayınlama
**Adımlar**:
1. Kendi talebinizi açın
2. "Yayınla" butonuna tıklayın
3. Onaylayın

**Beklenen Sonuç**:
- ✅ `toast.success("Talep tedarikçilere gönderildi...")` görünür
- ✅ Yeşil toast mesajı

#### 6.2. Yetki Hatası
**Adımlar**:
1. Başka birinin talebini yayınlamaya çalışın

**Beklenen Sonuç**:
- ✅ `toast.error("Yalnız talep sahibi yayınlayabilir.")` görünür
- ✅ Kırmızı toast mesajı

---

### Test 7: Teklif Onaylama

#### 7.1. Başarılı Onaylama
**Adımlar**:
1. Bir teklifi onaylayın (e-imza ile)

**Beklenen Sonuç**:
- ✅ `toast.success("Teklif e-imza ile onaylandı!")` görünür
- ✅ Yeşil toast mesajı

#### 7.2. Yetki Hatası
**Adımlar**:
1. Yetkisi olmayan bir kullanıcıyla teklif onaylamaya çalışın

**Beklenen Sonuç**:
- ✅ `toast.error("Teklif Onay Yetkisi Yok...")` görünür
- ✅ Kırmızı toast mesajı

---

## 🐛 SORUN GİDERME

### Sorun 1: Toast Görünmüyor

**Kontrol Listesi**:
- [ ] Vite server çalışıyor mu? (`npm run dev`)
- [ ] Console'da import hatası var mı?
- [ ] `toast` objesi tanımlı mı? (Console'da `toast` yazın)
- [ ] CSS animasyonları yüklendi mi? (Elements tab'ında `#toast-styles` var mı?)

**Çözüm**:
```javascript
// Console'da test edin
toast.success("Test");
// Eğer çalışmıyorsa, import'u kontrol edin
```

---

### Sorun 2: Toast Çok Hızlı Kapanıyor

**Kontrol**:
- Toast modülünde timeout 3000ms (3 saniye) olarak ayarlı
- Eğer daha uzun istiyorsanız, `src/shared/ui/toast.js` dosyasında değiştirin

---

### Sorun 3: Çoklu Toast Mesajları

**Durum**: Normal
- Her toast ayrı DOM element olarak eklenir
- Üst üste görünebilir
- Her biri 3 saniye sonra kapanır

---

## ✅ BAŞARILI TEST KRİTERLERİ

Test başarılı sayılır eğer:
- ✅ Tüm toast mesajları görünüyor
- ✅ Toast renkleri doğru (success=yeşil, error=kırmızı, warn=turuncu, info=mavi)
- ✅ Toast animasyonları çalışıyor
- ✅ Toast'lar 3 saniye sonra kapanıyor
- ✅ Console'da hata yok
- ✅ Alert() çağrıları yok (sadece toast var)

---

## 📝 TEST RAPORU ŞABLONU

Test sonuçlarını buraya yazabilirsiniz:

```
✅ Test 1: Sayfa Yükleme - BAŞARILI
✅ Test 2: Toast Görünürlüğü - BAŞARILI
✅ Test 3.1: Talep ID Yok - BAŞARILI
✅ Test 3.2: Talep Bulunamadı - BAŞARILI
...
```

---

**Son Güncelleme**: 2025-01-21  
**Hazırlayan**: AI Assistant

