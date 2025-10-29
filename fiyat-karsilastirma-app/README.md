# Fiyat Karşılaştırma Tablosu - PySide6/Qt

Teklifbul tarafından geliştirilen, ürün tekliflerini karşılaştıran ve Excel/CSV export sağlayan masaüstü uygulaması.

## 🎯 Özellikler

### ✨ Temel Özellikler
- **Ürün-Teklif Eşleştirme**: `urun_kodu` anahtarı ile otomatik eşleştirme
- **Dinamik Kolonlar**: Tedarikçi sayısına göre dinamik tablo kolonları
- **Dual Export Sistemi**: 
  - **Programmatic Export**: xlsxwriter ile programatik Excel oluşturma
  - **Template Injection**: TEKLİF MUKAYESE FORMU.xlsx şablonuna veri enjeksiyonu
- **Satın Alma Talep Formu**: Excel template ile talep oluşturma ve RFQ gönderimi
- **CSV Export**: Düz veri formatında CSV export
- **Para Birimi Dönüşümü**: Otomatik kur çevrimi ile TL hesaplama
- **En İyi Teklif**: Otomatik en düşük fiyat tespiti ve vurgulama

### 👥 Üyelik Desteği
- **Standard Üyelik**: En fazla 3 tedarikçi yan yana
- **Premium Üyelik**: Sınırsız tedarikçi, 5'li gruplar halinde sayfalar

### 🎨 UI/UX
- **Modern Qt Arayüzü**: PySide6 ile modern masaüstü deneyimi
- **Tab Sistemi**: Fiyat Karşılaştırma ve Satın Alma Talepleri sekmeleri
- **Responsive Tablo**: Yatay scroll ile dinamik kolon desteği
- **İstatistik Paneli**: Canlı özet bilgiler
- **Progress Bar**: Uzun işlemler için ilerleme göstergesi
- **Keyboard Shortcuts**: Ctrl+R (Yenile), Ctrl+E (Excel), Ctrl+Q (Çıkış)

### 📊 Excel Export Özellikleri

#### **Programmatic Export (xlsxwriter)**
- ✅ Profesyonel format (kenarlık, gri şeritler, merge hücreler)
- ✅ Çok sayfa desteği (Premium'da 5'li vendor grupları)
- ✅ İmza alanları (HAZIRLAYAN, SATIN ALMA MÜDÜRÜ, GENEL MÜDÜR vb.)
- ✅ Teknik değerlendirme (otomatik en iyi tedarikçi yazısı)
- ✅ Dinamik kolon genişlikleri

#### **Template Injection Export (openpyxl)**
- ✅ TEKLİF MUKAYESE FORMU.xlsx şablonu korunur
- ✅ Sadece veri enjeksiyonu (formatlar değişmez)
- ✅ Sabit koordinatlar ile hassas veri yerleştirme
- ✅ Çok sayfa desteği (Premium'da 5'li vendor grupları)
- ✅ Footer alanlarına otomatik en iyi tedarikçi yazısı

#### **Ortak Özellikler**
- ✅ Tarih damgalı dosya adları (`mukayese_YYYY-MM-DD_HHMM.xlsx`)
- ✅ Üyelik kuralları (Standard 3, Premium unlimited)
- ✅ Para birimi dönüşümü ve TL hesaplama

### 📋 Satın Alma Talep Formu Özellikleri

#### **Excel Template İşlemleri**
- ✅ **Boş Şablon İndirme**: `satın alma talep formu.xlsx` template'i indirme
- ✅ **Dolu Form Yükleme**: Doldurulmuş Excel formunu parse etme
- ✅ **Otomatik Parsing**: FORM_MAP ile koordinat bazlı veri çıkarma
- ✅ **Veri Validasyonu**: Numeric ve tarih alanları için otomatik temizleme

#### **Talep Yönetimi**
- ✅ **Talep Önizleme**: Parse edilen verilerin tablo görünümü
- ✅ **Talep Oluşturma**: Veritabanına talep kaydetme
- ✅ **Meta Bilgi Çıkarma**: Şantiye, STF No, tarih, alım yeri bilgileri
- ✅ **Kalem Detayları**: Malzeme kodu, tanımı, marka, miktar, fiyat bilgileri

#### **RFQ Gönderimi**
- ✅ **Tedarikçi Grupları**: Multi-select ile grup seçimi
- ✅ **Toplu RFQ Gönderimi**: Seçili gruplara otomatik RFQ oluşturma
- ✅ **Durum Takibi**: RFQ gönderim durumları ve hata yönetimi
- ✅ **Progress Dialog**: Uzun işlemler için iptal edilebilir progress bar

## 🏗️ Proje Yapısı

```
fiyat-karsilastirma-app/
├── app/
│   ├── ui/                    # UI bileşenleri
│   │   ├── main_window.ui     # Ana pencere UI
│   │   ├── main_window.py     # Ana pencere logic
│   │   ├── compare_view.py    # Karşılaştırma görünümü
│   │   ├── purchase_tab.ui    # Satın alma sekmesi UI
│   │   └── purchase_tab.py    # Satın alma sekmesi logic
│   ├── domain/                # Domain modelleri
│   │   └── models.py          # Item, Offer, Vendor, Config, PurchaseRequest, RFQ
│   ├── data/                  # Veri erişim katmanı
│   │   └── repo.py            # Mock veri repository + purchase request methods
│   ├── services/              # İş mantığı servisleri
│   │   ├── mapping.py         # Kolon normalizasyonu
│   │   ├── match_service.py   # Eşleştirme ve hesaplama
│   │   ├── form_parser.py     # Excel form parsing
│   │   ├── rfq_service.py     # RFQ gönderimi ve takibi
│   │   └── export_service/    # Dual export sistemi
│   │       ├── __init__.py    # Factory ve main service
│   │       ├── base.py        # Base export service
│   │       ├── programmatic.py # xlsxwriter export
│   │       ├── template_injection.py # openpyxl template injection
│   │       └── template_mapping.py # Template koordinatları
│   └── workers/               # Arka plan işlemleri
│       └── refresh_worker.py  # Veri yükleme worker
├── assets/                    # Kaynak dosyalar
│   ├── mapping.json           # Vendor kolon mapping
│   ├── satın alma talep formu.xlsx # Satın alma talep template'i
│   └── TEKLİF MUKAYESE FORMU.xlsx # Fiyat karşılaştırma template'i
├── tests/                     # Test dosyaları
│   ├── test_mapping.py
│   ├── test_match_service.py
│   ├── test_export_service.py
│   ├── test_form_parser.py
│   ├── test_rfq_routing.py
│   └── test_export_factory.py
├── main.py                    # Ana giriş noktası
├── requirements.txt           # Python bağımlılıkları
└── README.md                  # Bu dosya
```

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- Python 3.8+
- PySide6
- pandas
- openpyxl
- xlsxwriter

### Kurulum
```bash
# Projeyi klonlayın
cd fiyat-karsilastirma-app

# Sanal ortam oluşturun (önerilen)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# veya
venv\Scripts\activate     # Windows

# Bağımlılıkları yükleyin
pip install -r requirements.txt
```

### Çalıştırma
```bash
# Uygulamayı başlatın
python main.py
```

### Test Çalıştırma
```bash
# Tüm testleri çalıştırın
pytest tests/

# Belirli test dosyasını çalıştırın
pytest tests/test_mapping.py -v
```

## 📋 Kullanım

### 1. Veri Yükleme
- Uygulama açıldığında otomatik olarak mock veriler yüklenir
- "Yenile" butonu ile verileri yeniden yükleyebilirsiniz (Ctrl+R)

### 2. Karşılaştırma Tablosu
- **NO**: Satır numarası
- **HİZMETİN ADI**: Ürün/hizmet adı
- **MİKTAR**: Miktar
- **BİRİM**: Birim
- **Tedarikçi Kolonları**: Her tedarikçi için 3 alt kolon:
  - BİRİM FİYAT
  - TOPLAM
  - TOPLAM (TL)

### 3. Export İşlemleri
- **Export Modu Seçimi**: Toolbar'da "Export Modu" dropdown'ından seçin:
  - **Programatik**: xlsxwriter ile programatik Excel oluşturma
  - **Şablona Bas**: TEKLİF MUKAYESE FORMU.xlsx şablonuna veri enjeksiyonu
- **Excel Export** (Ctrl+E): Seçilen moda göre Excel dosyası
- **CSV Export**: Düz veri formatında CSV dosyası
- Dosyalar otomatik olarak tarih-saat damgası ile adlandırılır

### 4. Satın Alma Talep Formu İşlemleri
- **Satın Alma Talepleri** sekmesine geçin
- **Boş Şablonu İndir**: Excel template'ini indirin
- **Dolu Formu Yükle**: Doldurulmuş Excel formunu yükleyin
- **Önizle & Oluştur**: Parse edilen verileri kontrol edin ve talebi oluşturun
- **Tedarikçi Gruplarına Gönder**: Seçili tedarikçi gruplarına RFQ gönderin

### 5. Üyelik Ayarları
- **Standard**: En fazla 3 tedarikçi görüntülenir
- **Premium**: Tüm tedarikçiler, Excel'de 5'li gruplar halinde sayfalar

## 🔧 Konfigürasyon

### mapping.json
Vendor dosyalarındaki kolon adlarını normalize eder:
```json
{
  "match_key": "urun_kodu",
  "vendor_columns": ["ÜRÜN KODU", "STOK KODU", "SKU"],
  "offer_price_keys": ["TEKLİF FİYATI", "BİRİM FİYAT"],
  "offer_currency_keys": ["PARA BİRİMİ", "CURRENCY"]
}
```

### Template Dosyaları
**TEKLİF MUKAYESE FORMU.xlsx** dosyasını `assets/` klasörüne koyun:
- Template dosyası zorunludur (Template Injection export için)
- Sabit koordinatlar ile veri enjeksiyonu yapılır
- Dosya bulunamazsa export hatası verir

**satın alma talep formu.xlsx** dosyasını `assets/` klasörüne koyun:
- Satın alma talep formu template'i zorunludur
- FORM_MAP koordinatları ile parse edilir
- Sheet name: "SATINALMA", Header row: 7, Data start: 9

### Üyelik Ayarları
```python
# Config sınıfında
membership_tier: "standard" | "premium"
max_vendors_standard: 3
max_vendors_per_sheet: 5
```

## 🧪 Test

### Test Kapsamı
- **Mapping Service**: Kolon normalizasyonu
- **Match Service**: Eşleştirme ve hesaplama
- **Export Service Factory**: Dual export sistemi
- **Programmatic Export**: xlsxwriter ile Excel export
- **Template Injection Export**: openpyxl ile şablon enjeksiyonu
- **Form Parser Service**: Excel form parsing ve validation
- **RFQ Service**: RFQ gönderimi, durum takibi ve istatistikler
- **Export Validation**: Üyelik kuralları ve template kontrolü
- **Purchase Request Models**: Domain model testleri
- **Mock Data**: Gerçekçi test verileri

### Test Çalıştırma
```bash
# Tüm testler
pytest

# Verbose mode
pytest -v

# Coverage raporu
pytest --cov=app tests/
```

## 📝 Geliştirme

### Yeni Özellik Ekleme
1. Domain modeli güncelleyin (`app/domain/models.py`)
2. Service katmanında iş mantığını ekleyin (`app/services/`)
3. UI bileşenini güncelleyin (`app/ui/`)
4. Test yazın (`tests/`)

### Mock Veri Güncelleme
`app/data/repo.py` dosyasındaki `_load_mock_data()` metodunu düzenleyin.

### Excel Şablonu Özelleştirme
`app/services/export_service.py` dosyasındaki format ayarlarını güncelleyin.

## 🐛 Hata Bildirimi

Hata bulursanız lütfen aşağıdaki bilgileri içeren bir issue oluşturun:
- Python sürümü
- İşletim sistemi
- Hata mesajı
- Adımlar (steps to reproduce)

## 📄 Lisans

Bu proje Teklifbul tarafından geliştirilmiştir.

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

---

**Teklifbul** - Fiyat karşılaştırma çözümleri
