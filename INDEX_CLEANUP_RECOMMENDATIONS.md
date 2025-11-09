# Firestore Index Temizlik Önerileri

## Analiz Tarihi: 2025-11-03

Kod tabanında yapılan analize göre, aşağıdaki index'ler **gereksiz** veya **artık kullanılmıyor**:

### ❌ Silinebilir Index'ler

1. **`demands` - `published` + `createdAt` + `demandCode`**
   - **Neden:** `published` field'ı artık kullanılmıyor (yeni sistem `isPublished` kullanıyor)
   - **Durum:** Legacy sistemden kalan, yeni kodlarda hiç kullanılmıyor
   - **Güvenli silme:** ✅ Evet

2. **`demands` - `createdBy` + `published` + `createdAt`**
   - **Neden:** `published` field'ı artık kullanılmıyor
   - **Durum:** Legacy sistemden kalan
   - **Güvenli silme:** ✅ Evet

3. **`demands` - `status` + `supplierCategoryKeys` + `createdAt`**
   - **Neden:** Kod tabanında `status` + `supplierCategoryKeys` kombinasyonu kullanılmıyor
   - **Kullanılan:** Sadece `isPublished` + `supplierCategoryKeys` + `createdAt`
   - **Güvenli silme:** ✅ Evet (ama önce kodda kullanılıp kullanılmadığını kontrol edin)

4. **`demands` - `createdBy` + `status` + `createdAt`**
   - **Neden:** Kod tabanında bu kombinasyon kullanılmıyor
   - **Kullanılan:** `createdBy` sadece JavaScript'te kontrol ediliyor, query'de kullanılmıyor
   - **Güvenli silme:** ⚠️ Dikkatli (eğer ileride kullanılacaksa tutulabilir)

### ✅ Kullanılan Index'ler (SİLMEYİN)

1. **`demands` - `isPublished` + `createdAt`**
   - **Kullanım: ✅** Dashboard ve demands sayfalarında kullanılıyor
   - **Durum:** Aktif kullanımda

2. **`demands` - `isPublished` + `supplierCategoryKeys` + `createdAt`**
   - **Kullanım: ✅** Legacy kategori sistemi için fallback olarak kullanılıyor
   - **Durum:** Aktif kullanımda (geçici)

3. **`demands` - `isPublished` + `supplierCategoryIds` + `createdAt`** (Building...)
   - **Kullanım: ✅** Yeni ID-based kategori sistemi için
   - **Durum:** Yeni eklenen, build ediliyor

4. **`demands` - `isPublished` + `categoryIds` + `createdAt`** (Eklendi ama henüz build edilmedi)
   - **Kullanım: ✅** Yeni ID-based kategori sistemi için
   - **Durum:** Yeni eklenen

5. **`demands` - `isPublished` + `categoryTags` + `createdAt`**
   - **Kullanım: ✅** Legacy kategori sistemi için fallback
   - **Durum:** Aktif kullanımda (geçici)

6. **`demands` - `creatorCompanyId` + `isPublished` + `createdAt`**
   - **Kullanım: ✅** Şirket bazlı talepler için
   - **Durum:** Aktif kullanımda

7. **`demands` - `creatorCompanyId` + `status` + `updatedAt`**
   - **Kullanım: ✅** Şirket bazlı durum filtreleme için
   - **Durum:** Aktif kullanımda

8. **`sites` - `isActive` + `siteName`**
   - **Kullanım: ✅** Sites koleksiyonu için (farklı modül)
   - **Durum:** Aktif kullanımda

### 🔄 Öneriler

1. **Önce kodda `published` field'ı kullanan yerleri kontrol edin:**
   ```bash
   grep -r "published" --include="*.html" --include="*.js" | grep -v "isPublished"
   ```

2. **Index'leri silmeden önce:**
   - Firebase Console'da "Indexes" sekmesine gidin
   - Her index için "Query usage" bilgisini kontrol edin (eğer varsa)
   - 1-2 hafta bekleyin, hiç kullanılmadığını doğrulayın

3. **Güvenli silme sırası:**
   - Önce `published` field'ını içeren index'leri silin
   - Sonra `status` + `supplierCategoryKeys` index'ini kontrol edin
   - En son `createdBy` + `status` index'ini kontrol edin

### 📊 Beklenen Tasarruf

Silinebilir index'ler:
- 3-4 index (yaklaşık)
- Her index ~50-200 MB depolama alanı (koleksiyon boyutuna göre)
- Toplam tasarruf: ~200-800 MB (tahmini)

### ⚠️ Dikkat

- Index'ler silinmeden önce **mutlaka backup alın**
- Index silme işlemi **geri alınamaz**
- Index'ler tekrar oluşturulursa **yeniden build** edilmesi gerekir (2-30 dakika)

