# 📊 Teklifbul Karşılaştırma Uygulaması

Ürün listesi ile tedarikçi tekliflerini `urun_kodu` üzerinden eşleştiren, canlı tablo gösterimi ve Excel/CSV export özellikleri sunan modern web uygulaması.

## 🚀 Özellikler

### 📋 Karşılaştırma Tablosu
- Ürün-teklif eşleştirme (`urun_kodu` bazlı)
- En iyi teklif vurgulaması
- Fiyat farkı ve yüzde hesaplama
- Gerçek zamanlı veri güncelleme

### 📊 İstatistikler
- Toplam ürün sayısı
- Toplam teklif sayısı
- En iyi teklif sayısı
- En yüksek tasarruf miktarı

### 📥 Export Özellikleri
- **Excel**: 3 sayfa (okunan_veri, gelen_teklifler_sablon, mukayese)
- **CSV**: UTF-8 BOM ile Türkçe karakter desteği
- Dosya adı: `mukayese_YYYY-MM-DD_HHMM.xlsx`

### 🔍 Filtreleme ve Arama
- Global arama
- Sütun bazlı sıralama
- Sayfalama
- Responsive tasarım

## 🛠️ Teknoloji Stack

### Backend
- **Node.js** + **Express.js**
- **TypeScript**
- **XLSX** (Excel export)
- **CSV-Stringify** (CSV export)
- **Jest** (Testing)

### Frontend
- **React 18** + **TypeScript**
- **Vite** (Build tool)
- **Tailwind CSS** (Styling)
- **TanStack Table** (Data table)
- **Vitest** (Testing)

## 📦 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn

### Adımlar

1. **Bağımlılıkları yükle:**
```bash
npm run install:all
```

2. **Development mode'da çalıştır:**
```bash
npm run dev
```

3. **Tarayıcıda aç:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## 🎯 Kullanım

### Ana Sayfa
1. Uygulama açıldığında otomatik olarak veriler yüklenir
2. İstatistik kartları üstte görüntülenir
3. Karşılaştırma tablosu aşağıda listelenir

### Karşılaştırma Tablosu
- **Yeşil satırlar**: En iyi teklifler
- **Fiyat sütunu**: Kaynak fiyat vs teklif fiyatı
- **Fark sütunu**: Tasarruf miktarı ve yüzdesi
- **En İyi sütunu**: 🏆 işareti ile en iyi teklifler

### Export İşlemleri
1. **Excel İndir** butonuna tıklayın
2. **CSV İndir** butonuna tıklayın
3. Dosya otomatik olarak indirilir

### Arama ve Filtreleme
- Üst kısımdaki arama kutusunu kullanın
- Sütun başlıklarına tıklayarak sıralama yapın
- Sayfalama kontrollerini kullanın

## 🔧 API Endpoints

### Ürünler
- `GET /api/products` - Tüm ürünleri getir
- `GET /api/products/:urun_kodu` - Belirli ürünü getir

### Teklifler
- `GET /api/offers` - Tüm teklifleri getir
- `GET /api/offers/:id` - Belirli teklifi getir

### Karşılaştırma
- `GET /api/comparison` - Karşılaştırma sonuçları
- `GET /api/statistics` - İstatistikler

### Export
- `GET /api/export?type=xlsx` - Excel export
- `GET /api/export?type=csv` - CSV export

## 📊 Mock Veri

Uygulama şu anda mock veri ile çalışmaktadır:

### Ürünler
- Çelik Profil 50x50x3mm
- Alüminyum Levha 2mm
- Paslanmaz Çelik Boru Ø25mm
- Bakır Tel 2.5mm²
- PVC Boru Ø110mm

### Tedarikçiler
- Metal A.Ş.
- Çelik Ltd.
- Alüminyum İş
- Paslanmaz Ltd.
- Elektrik Malzeme
- Plastik Boru A.Ş.
- Borular Ltd.

## 🧪 Test

### Test Çalıştırma
```bash
# Tüm testler
npm test

# Sadece server testleri
npm run test:server

# Sadece client testleri
npm run test:client

# Coverage raporu
npm run test:coverage
```

### Test Coverage
- Server: Jest + Supertest
- Client: Vitest + React Testing Library
- Unit tests ve integration tests

## 🚀 Production Build

```bash
# Client build
npm run build

# Server build
cd server && npm run build
```

## 📁 Proje Yapısı

```
teklifbul-compare-app/
├── server/                 # Backend (Node.js/Express)
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── data/         # Data layer
│   │   ├── mapping/      # Column mapping
│   │   └── tests/        # Server tests
│   └── package.json
├── client/                # Frontend (React/TypeScript)
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── lib/          # Utilities
│   │   ├── types/        # TypeScript types
│   │   └── test/         # Client tests
│   └── package.json
├── .cursor/              # Cursor rules
├── step_todo/           # Development steps
└── package.json         # Root package.json
```

## 🔧 Konfigürasyon

### Environment Variables
```bash
# Server
PORT=3001
NODE_ENV=development

# Client
VITE_API_URL=http://localhost:3001/api
```

### Mapping Configuration
`server/src/mapping/mapping.json` dosyasında vendor kolon adlarının normalize edilmesi için mapping kuralları tanımlanmıştır.

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 👥 Takım

- **Teklifbul Development Team**
- **Proje Yöneticisi**: Faruk
- **Geliştirici**: AI Assistant

## 📞 İletişim

- **Email**: info@teklifbul.com
- **Website**: https://teklifbul.com
- **GitHub**: https://github.com/teklifbul

---

**Son Güncelleme**: 2025-01-21  
**Versiyon**: 1.0.0  
**Durum**: ✅ Production Ready
