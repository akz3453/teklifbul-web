# Test & Debug Dosyaları

// Teklifbul Rule v1.0

Bu klasör **yalnızca geliştirme amaçlı** test ve debug dosyalarını içerir.

## ⚠️ ÖNEMLİ

- Bu klasör **production build'e dahil edilmez**
- Bu dosyalar **canlı ortamda çalıştırılmamalıdır**
- Sadece geliştirme ve test amaçlı kullanılır

## 📁 İçerik

- `test-*.html` - Test sayfaları
- `debug-*.html` - Debug sayfaları
- `backfill-*.html` - Veri doldurma scriptleri
- `*_debug.js` - Debug JavaScript dosyaları

## 🚀 Kullanım

Test dosyalarını çalıştırmak için:

```bash
# Development server'da
npm run dev

# Sonra tarayıcıda test/ klasöründeki dosyalara erişin
# Örnek: http://localhost:5173/test/test-system.html
```

## 📝 Notlar

- Test dosyaları production build'den otomatik olarak hariç tutulur
- Vite config'de `test/` klasörü exclude edilmiştir
- Bu dosyalar Git'e commit edilir ancak production'a deploy edilmez

