# Tech Debt Tracker
**Teklifbul Web - Standartlaşma Durumu**

Bu dosya, projedeki standartlaşma çalışmalarının durumunu takip eder.

---

## Standartlaşma Durumu

### ✅ Tamamlananlar

- [x] **Firestore rules deploy kontrolü** - `chore/firestore-rules-check`
  - Kontrol scriptleri eklendi
  - Rules dosyası mevcut ve güncel

- [x] **Alert → Toast dönüşümü** - Tamamlandı
  - `src/pages/Login.tsx`
  - `src/pages/demands/[id]/OfferTab.tsx`
  - `src/features/demand/DemandForm.tsx`
  - `src/common-company.js`

- [x] **Console → Logger dönüşümü (Batch 1)** - `chore/logger-refactor-batch-1`
  - 15 dosya güncellendi
  - Tüm `console.log/error/warn` kullanımları `logger`'a dönüştürüldü
  - Kalan: Sadece `src/shared/log/logger.ts` içinde (normal, logger modülünün kendisi)

- [x] **Performans optimizasyonları** - `perf/firestore-query-fixes-1`
  - `getCategories()` - Search yoksa Firestore pagination kullanıyor
  - Cache mekanizması mevcut

- [x] **Progress bar + Cancel** - `feat/progress-and-cancel` → `feat/export-progress-cancel`
  - `ProgressBar` component oluşturuldu
  - `useCancellableTask` hook oluşturuldu
  - `async-utils.ts` - AbortController wrapper
  - Excel export entegrasyonu tamamlandı (`OfferTab.tsx`)
  - `exportSupplierOffer` ve `exportSupplierOfferBrowser` progress desteği eklendi

---

## Kalan İşler

### 🟡 Orta Öncelik

- [ ] **Console → Logger dönüşümü (Batch 2)** - Gerekirse
  - Şu an `src/` klasöründe sadece `logger.ts` içinde console kullanımı var (normal)
  - Test/debug dosyalarına dokunulmuyor (kasıtlı)

- [x] **Performans: getTaxOffices optimizasyonu** - `perf/tax-offices-index-optimization`
  - ✅ Lowercase alanlar eklendi (province_name_lower, district_name_lower, office_name_lower)
  - ✅ Migration script oluşturuldu
  - ✅ Index'li sorgu implementasyonu (fallback ile)
  - ✅ Firestore index'leri tanımlandı
  - ⚠️  Migration çalıştırılmalı: `tsx scripts/migrate-tax-offices-add-lower-fields.ts`

- [ ] **Progress bar entegrasyonu (kalan)**
  - ✅ Excel export (`OfferTab.tsx`) - Tamamlandı
  - ✅ Excel import (`OfferTab.tsx`) - Tamamlandı
  - ✅ Büyük veri yükleme işlemleri (`ChunkedUpload` component) - Tamamlandı
  - ✅ Migration script'leri (`migration-runner.ts`) - Tamamlandı

### 🟢 Düşük Öncelik

- [x] **ESLint sıkılaştırma** ✅
  - ✅ `no-console` kuralı aktif (logger.ts hariç)
  - ✅ ESLint konfigürasyonu güncellendi

- [x] **Kalite Kapıları (Husky + lint-staged)** ✅
  - ✅ Pre-commit hook: lint + type-check
  - ✅ Pre-push hook: smoke test (opsiyonel)
  - ✅ lint-staged konfigürasyonu
  - ✅ Dokümantasyon (README-DEV.md)
  - ✅ Husky v10'a yükseltildi (deprecated kod kaldırıldı)

- [x] **System Cleanup + Husky v10 Upgrade** ✅
  - ✅ assets/ klasörü temizlendi
  - ✅ Husky v9 → v10 yükseltildi
  - ✅ Hook dosyaları v10 formatına güncellendi
  - ✅ Sistem tarama raporu güncellendi

- [ ] **Kod dokümantasyonu iyileştirme**
  - JSDoc comment'leri
  - Type definitions

---

## İstatistikler

### Console Kullanımı
- **src/ klasöründe:** 2 adet (sadece `logger.ts` içinde - normal)
- **Test/debug dosyalarında:** Kasıtlı olarak bırakıldı

### Alert Kullanımı
- **src/ klasöründe:** 0 adet ✅

### Progress Bar Entegrasyonu
- **Oluşturulan component'ler:** 3 (ProgressBar, useCancellableTask, ChunkedUpload)
- **Oluşturulan utility'ler:** 1 (migration-runner.ts)
- **Entegre edilen akışlar:** 4 (Excel export + import - `OfferTab.tsx`, Chunked upload - `ChunkedUpload.tsx`, Migration scripts - `migration-runner.ts`)

---

## Notlar

- Tüm değişiklikler küçük ve atomik commit'lerle yapıldı
- Her adım için ayrı branch açıldı
- `npm run lint -- --max-warnings=0` kontrolü yapıldı
- Sadece `src/` kapsamındaki uygulama kodunda dönüşüm yapıldı
- Test/debug dosyalarına dokunulmadı

---

**Son Güncelleme:** 2025-01-20  
**Güncelleyen:** Auto (Cursor AI)

