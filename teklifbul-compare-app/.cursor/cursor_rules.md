# Cursor Kurallar Manifestosu (Teklifbul Compare App)

Bu manifesto, Teklifbul ürün-teklif karşılaştırma uygulamasında **Cursor** ile geliştirilen web uygulamalarında uyulması gereken **UI/UX**, **mimari**, **programlama**, **test**, ve **değişiklik yönetimi** standartlarını tek yerde toplar.

---

## 1) Kullanım ve Entegrasyon

**Proje kökünde** aşağıdaki yapı kullanılır:

```
.cursor/
  cursor_rules.md
  cursor.json
package.json
server/
client/
tests/
step_todo/
```

---

## 2) Web UI/UX Standartları

- **Tutarlılık**: Uygulama boyutları, renk paleti, font ailesi/boyutları, ikon–etiket konumları tüm sayfalarda aynıdır.
- **Responsive Tasarım**: Mobil, tablet ve masaüstü uyumlu tasarım.
- **Evrensel kullanılabilirlik**: Yeni başlayan için sade görünüm; ileri kullanıcı için klavye kısayolları.
- **Anında geri bildirim**: Kaydet/düzenle/sil gibi her eylemde görsel/mesaj; uzun süreçlerde progress bar.
- **Diyalog kapanışı**: Çok adımlı işlemler sonunda net başarı mesajı.
- **Hata önleme ve geri alma**: Onay diyalogları, form validation, undo/redo özellikleri.
- **Kullanıcı kontrolü**: Modal işlemlerde iptal, `Esc` ile kapanma, iptal butonu.
- **Bilişsel yükü azaltma**: Placeholder, tooltip, sembol; maks. karakter bilgisi.
- **Sistem durumu görünürlüğü**: Loading states, success/error messages.
- **Minimal tasarım**: Gereksiz metin/grafikten kaçın; iş odaklı içerik.
- **Yardım ve dokümantasyon**: `?` ikon, Tooltip, F1-yardım; ilk kullanımda kısa tur.
- **Erişilebilirlik**: ARIA labels, keyboard navigation, screen reader uyumluluğu.
- **Performans**: Her sayfa ~2 sn içinde yüklenmeli; uzun süreçte loading indicators.

---

## 3) Mimari ve Programlama Standartları

- **DRY ve modülerlik**: Tekrardan kaçın; fonksiyonlar/servisler modüler olmalı.
- **Bulk işlemler**: API işlemleri mümkün olduğunca toplu yapılmalı.
- **Bağımlılıklar**: Kullanılan her paket `package.json` içinde listelenmeli.
- **API istemcisi**: Tek bir client katmanı.
- **Rate limit farkındalığı**: API quotas dokümantasyondan teyit edilir.
- **Error Handling**: Try-catch blokları, fallback stratejileri, user-friendly error messages.
- **Security**: Input validation, XSS koruması, CSRF koruması.
- **Performance**: Lazy loading, code splitting, image optimization.

---

## 4) React ve TypeScript Standartları

- **Type Safety**: Tüm props ve state'ler için TypeScript tipleri.
- **Component Structure**: Functional components, hooks kullanımı.
- **State Management**: useState, useReducer, Context API.
- **Side Effects**: useEffect, custom hooks.
- **Performance**: useMemo, useCallback, React.memo.
- **Testing**: Jest, React Testing Library, Vitest.
- **Code Splitting**: Dynamic imports, lazy loading.

---

## 5) Backend Standartları

- **Express.js**: RESTful API design.
- **TypeScript**: Type-safe backend development.
- **Error Handling**: Centralized error handling middleware.
- **Validation**: Request/response validation.
- **Logging**: Structured logging.
- **Testing**: Jest, Supertest.
- **Security**: Helmet, CORS, rate limiting.

---

## 6) Test, Hata Ayıklama ve Değişiklik Yönetimi

- **Debug çıktıları**: Geliştirme esnasında anlamlı console.log.
- **Test konumu**: `tests/` klasörü; birim ve entegrasyon testleri.
- **Impact analizi**: Değişiklik öncesi ve sonrası etkiler test edilir.
- **Adım adım iş takibi**: Her değişiklik için `step_todo/STEP-XXXX.md` oluşturulur.
- **Böl ve yönet**: Çözüm tıkanırsa problemi küçük parçalara böl.
- **API ile test**: Gerçek API kullanımı PR aşamasında onayla yapılır.

---

## 7) Definition of Done

1. Testler başarılı (unit + integration).
2. UI/UX kuralları uygulanmış.
3. Performans hedefleri karşılanmış (~2sn yükleme).
4. Erişilebilirlik ve responsive tasarım tamamlanmış.
5. Loglama ve hata mesajları kullanıcı-dostu.
6. step_todo ve PR dokümantasyonu güncel.
7. package.json güncel.
8. TypeScript tipleri eksiksiz.
9. Cross-browser compatibility test edilmiş.

---

## 8) Web-Specific Best Practices

- **SEO**: Meta tags, semantic HTML, structured data.
- **Performance**: Lighthouse score >90, Core Web Vitals optimization.
- **Security**: HTTPS, secure headers, input sanitization.
- **Accessibility**: WCAG 2.1 AA compliance.
- **Progressive Web App**: Service worker, offline functionality.
- **Analytics**: User behavior tracking, performance monitoring.

---

## 9) Export ve Karşılaştırma Özellikleri

- **Excel Export**: Çok sayfalı XLSX dosyası (okunan_veri, gelen_teklifler_sablon, mukayese).
- **CSV Export**: UTF-8 BOM ile CSV dosyası.
- **Dosya Adlandırma**: `mukayese_YYYY-MM-DD_HHMM.xlsx` formatı.
- **Karşılaştırma**: `urun_kodu` bazlı eşleştirme.
- **En İyi Teklif**: En düşük fiyatlı teklif vurgulaması.
- **Fark Hesaplama**: Kaynak fiyat - teklif fiyatı, yüzde hesaplama.

---

## 10) Sürümleme

- Manifesto sürümlenir (`v1.0`, `v1.1`).
- 3 ayda bir ekip geri bildirimiyle gözden geçirilir.
- Büyük değişiklikler RFC açılarak eklenir.

---

## 11) Sorumluluklar

- **Kod sahibi**: PR'da kural ihlallerini belirtir.
- **Reviewer**: PR checklist'e göre doğrular.
- **Ürün sahibi**: API configuration değişikliklerini onaylar.
