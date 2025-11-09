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

- [ ] **Performans: getTaxOffices optimizasyonu**
  - Şu an tüm koleksiyonu çekip client-side filter yapıyor
  - Case-insensitive search için normalize edilmiş alan gerekir
  - Cache mevcut (24 saat), bu yüzden düşük öncelik

- [ ] **Progress bar entegrasyonu (kalan)**
  - ✅ Excel export (`OfferTab.tsx`) - Tamamlandı
  - [ ] Excel import
  - [ ] Büyük veri yükleme işlemleri
  - [ ] Migration script'leri

### 🟢 Düşük Öncelik

- [ ] **ESLint sıkılaştırma**
  - `.eslintrc` içinde `no-console` kuralı eklenebilir
  - `logger.ts` için exception

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
- **Oluşturulan component'ler:** 2 (ProgressBar, useCancellableTask)
- **Entegre edilen akışlar:** 1 (Excel export - `OfferTab.tsx`)

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

