# 🗺️ Kategori Sistemi Refactoring - Yol Haritası

## 📋 Mevcut Durum

✅ **Tamamlanan:**
1. Yeni kategori sözlüğü (`CATEGORY_DICTIONARY.json`) - 27 kategori
2. Kategori servisi (`category-service.js`) - ID normalizasyonu
3. Eşleştirme servisi (`match-service.js`) - Firestore sorguları
4. Utility dosyaları güncellendi (slugifyTr, buildAddress)
5. Migrasyon scripti hazır
6. Index dokümantasyonu hazır

⚠️ **Yapılması Gerekenler:**
1. Migration script'i Firebase config ile uyumlu hale getir
2. UI dosyalarını yeni sisteme entegre et (demand-new.html, settings.html, demand-detail.html)
3. Test et ve migrasyonu çalıştır

---

## 🎯 Yapılacaklar (Sırayla)

### Adım 1: Migration Script'i Düzelt ✅
- [x] Firebase config'i import et
- [x] Script'i test edilebilir hale getir

### Adım 2: UI Entegrasyonu (En Önemli!)
#### 2.1 demand-new.html
- [ ] `normalizeToIds()` ile kategori seçimlerini ID'ye çevir
- [ ] `categoryIds` alanını kullan (eski categoryTags yerine)
- [ ] `matchSuppliers()` fonksiyonunu kullan

#### 2.2 settings.html
- [ ] Tedarikçi kategori seçimlerini `normalizeToIds()` ile ID'ye çevir
- [ ] `supplierCategoryIds` alanını kaydet
- [ ] UI'da kategori isimlerini göster (ID değil)

#### 2.3 demand-detail.html
- [ ] `categoryIds` alanını öncelikle kullan
- [ ] ID'leri isimlere çevirip göster (`getNameById()`)

### Adım 3: Test ve Migrasyon
- [ ] Dry-run migrasyonu çalıştır
- [ ] Sonuçları kontrol et
- [ ] Commit modunda migrasyonu çalıştır
- [ ] Firestore index'lerini oluştur (hata mesajındaki linklerden)

---

## 🔧 Nasıl Çalışır?

### Kategori Sistemi Akışı:

```
1. Kullanıcı kategorileri seçer (UI'da isim görür)
   ↓
2. normalizeToIds(['Sac/Metal', 'Elektrik']) çağrılır
   ↓
3. ['CAT.SACMETAL', 'CAT.ELEKTRIK'] ID'leri döner
   ↓
4. Firestore'a ID'ler kaydedilir (categoryIds veya supplierCategoryIds)
   ↓
5. Eşleştirme yapılırken matchSuppliers(db, {categoryIds: [...]}) kullanılır
   ↓
6. UI'da gösterim için getNameById('CAT.SACMETAL') → 'Sac/Metal' döner
```

### Avantajlar:
- ✅ Eşleşme sadece ID üzerinden → hatalı slug'lar sorun yaratmaz
- ✅ "Sac/Metal", "saç-metal", "sac/metal" → Hepsi aynı ID'ye çevrilir
- ✅ Yeni kategori eklemek kolay (otomatik ID üretilir)
- ✅ Geriye dönük uyumluluk (eski slug/name'ler de çalışır)

---

## ⚠️ Kritik Notlar

1. **Slug/Name SADECE UI için:** Eşleşmede asla kullanılmamalı!
2. **ID Formatı:** `CAT.XXXXXX` (örn: `CAT.SACMETAL`, `CAT.ELEKTRIK`)
3. **Migrasyon:** Önce dry-run, sonra commit!
4. **Index'ler:** Firestore hata verirse linkten index oluştur

---

## 🚀 Hızlı Başlangıç

### 1. Migration Script'i Test Et:
```bash
# Önce dry-run (değişiklik yapmaz)
node scripts/migrate-categories-to-ids.js --dry-run

# Sonra commit (değişiklikleri uygular)
node scripts/migrate-categories-to-ids.js --commit
```

### 2. UI Dosyalarını Güncelle:
- `demand-new.html` → Kategori seçiminde `normalizeToIds()` kullan
- `settings.html` → Tedarikçi kategorilerinde `normalizeToIds()` kullan
- `demand-detail.html` → Kategori gösteriminde `getNameById()` kullan

### 3. Test Et:
- Yeni talep oluştur → Kategoriler ID olarak kaydedilmeli
- Tedarikçi kaydet → Kategoriler ID olarak kaydedilmeli
- Talep detayı → Kategoriler isim olarak gösterilmeli
- Eşleştirme → ID bazlı çalışmalı

---

**Son Güncelleme:** 2025-11-02

