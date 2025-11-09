# Teklifbul Sistem Teşhis Araçları

Bu klasörde sistemdeki sorunları teşhis etmek için kullanılan araçlar bulunmaktadır.

## Mevcut Teşhis Araçları

### 1. Debug Bilgi Sayfası
**Dosya:** `debug-info.html`
**Amaç:** Sistem durumu hakkında detaylı bilgi sağlar

#### Özellikler:
- Auth durumu kontrolü
- Kullanıcı bilgileri görüntüleme
- Şirket bilgileri kontrolü
- Tedarikçi kategorileri listeleme
- Veritabanı erişim testi
- Detaylı log kayıtları

#### Kullanım:
1. Yerel sunucuyu başlatın: `python -m http.server 8000`
2. Tarayıcıda açın: http://localhost:8000/debug-info.html
3. "Bilgileri Yenile" butonuna tıklayın

### 2. Veri Yükleme Testi
**Dosya:** `test-data-loading.html`
**Amaç:** Spesifik sistem bileşenlerinin çalışıp çalışmadığını test eder

#### Özellikler:
- Auth ve kullanıcı testi
- Talep verileri testi
- Şirket verileri testi
- Kategori eşleştirme testi
- Tüm testleri çalıştırma
- Sonuçları temizleme

#### Kullanım:
1. Yerel sunucuyu başlatın: `python -m http.server 8000`
2. Tarayıcıda açın: http://localhost:8000/test-data-loading.html
3. İlgili test butonlarına tıklayın

## Sorun Giderme Akışı

### 1. İlk Adım: Sistem Durumu Kontrolü
1. `debug-info.html` sayfasını açın
2. Tüm bilgilerin doğru görünüp görünmediğini kontrol edin
3. Hatalı alanlar varsa ilgili ayarları kontrol edin

### 2. İkinci Adım: Spesifik Testler
1. `test-data-loading.html` sayfasını açın
2. Tek tek testleri çalıştırın
3. Hatalı testleri belirleyin

### 3. Üçüncü Adım: Çözüm Uygulama
1. Hata mesajlarını inceleyin
2. Önerilen çözümleri uygulayın
3. Testleri tekrar çalıştırın

## Sık Karşılaşılan Sorunlar ve Çözümleri

### "Kullanıcı oturumu kapalı" hatası
**Nedeni:** Giriş yapılmamış
**Çözümü:** Ana sayfadan giriş yapın

### "Şirket bilgisi bulunamadı" hatası
**Nedeni:** Kullanıcıya şirket atanmamış
**Çözümü:** Ayarlar sayfasından şirket bilgilerini girin

### "Tedarikçi kategorisi seçilmemiş" uyarısı
**Nedeni:** Gelen talepler kategori bazında filtrelendiği için
**Çözümü:** Ayarlar sayfasından tedarikçi kategorilerinizi seçin

### "Missing or insufficient permissions" hatası
**Nedeni:** Firestore güvenlik kuralları izin vermiyor
**Çözümü:** Firestore kurallarını kontrol edin

## Teknik Bilgiler

### Gerekli Sistem Bileşenleri
- Python 3.x (yerel sunucu için)
- Modern web tarayıcısı
- İnternet bağlantısı

### Yerel Sunucu Başlatma
```bash
# Ana dizinde çalıştırın
python -m http.server 8000
```

### Erişim Adresleri
- Debug sayfası: http://localhost:8000/debug-info.html
- Test sayfası: http://localhost:8000/test-data-loading.html
- Dashboard: http://localhost:8000/dashboard.html
- Talepler: http://localhost:8000/demands.html

## Geliştirme Notları

### Yeni Test Ekleme
1. `test-data-loading.html` dosyasını düzenleyin
2. Yeni test fonksiyonu ekleyin
3. Gerekli event listener'ı tanımlayın

### Log Kayıtlarını Görüntüleme
1. Her iki sayfada da "Detaylı Loglar" bölümü bulunur
2. Loglar otomatik olarak en alta kaydırılır
3. "Sonuçları Temizle" butonu ile logları silebilirsiniz

## Destek

Sorun devam ederse lütfen aşağıdaki bilgileri sağlayın:
1. Hangi testte hata alıyorsunuz?
2. Hata mesajı nedir?
3. Tarayıcı konsolundaki hata mesajları
4. Debug sayfası çıktısı

## Dosya Yapısı
```
teklifbul-web/
├── debug-info.html          # Sistem durumu kontrolü
├── test-data-loading.html   # Spesifik testler
├── SOLUTION_SUMMARY.md     # Çözüm özeti
└── README_DIAGNOSTICS.md   # Bu dosya
```