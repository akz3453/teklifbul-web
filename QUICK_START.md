# 🚀 Hızlı Başlangıç - Kategori Sistemi

## 📝 Özet

Yeni kategori sistemi **ID tabanlı** çalışıyor. Eşleşme artık sadece ID üzerinden yapılıyor, slug/name sadece UI için kullanılıyor.

## ✅ Hazır Olanlar

1. **Kategori Sözlüğü:** `src/categories/CATEGORY_DICTIONARY.json` (27 kategori)
2. **Servisler:** `category-service.js`, `match-service.js`
3. **Migrasyon Scripti:** `scripts/migrate-categories-to-ids.js`

## 🔧 Şimdi Ne Yapmalıyız?

### Seçenek 1: Önce Migrasyon (Önerilen)
Eski verileri yeni ID sistemine çevir:

```bash
# 1. Önce dry-run (test et, değişiklik yapmaz)
node scripts/migrate-categories-to-ids.js --dry-run

# 2. Sonuçları kontrol et, sonra commit et
node scripts/migrate-categories-to-ids.js --commit
```

### Seçenek 2: Önce UI Entegrasyonu
UI dosyalarını güncelleyip test et, sonra migrasyonu çalıştır.

**Hangi dosyaları güncellemeliyiz?**
- `demand-new.html` → Talep oluşturma ekranı
- `settings.html` → Tedarikçi kategori seçimi
- `demand-detail.html` → Kategori gösterimi

## ⚠️ Önemli Not

**Şu an sistem eski haliyle çalışıyor.** Yeni sisteme geçmeden önce:
1. Yedek alın
2. Test ortamında deneyin
3. Production'a geçmeden önce migrasyonu test edin

## 🤔 Ne Yapmak İstersiniz?

**A)** UI dosyalarını şimdi güncelleyelim (önerilen)  
**B)** Önce migrasyon script'ini test edelim  
**C)** Her ikisini de yapalım (önce UI, sonra migrasyon)

Hangi seçeneği tercih edersiniz?
