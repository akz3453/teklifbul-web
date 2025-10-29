# Cursor Kurallar Manifestosu (Teklifbul Web)

Bu manifesto, Teklifbul web projesinde **Cursor** ile geliştirilen web uygulamalarında uyulması gereken **UI/UX**, **mimari**, **programlama**, **test**, ve **değişiklik yönetimi** standartlarını tek yerde toplar.

---

## 1) Kullanım ve Entegrasyon

**Proje kökünde** aşağıdaki yapı kullanılır:

```
.cursor/
  cursor_rules.md
  cursor.json
package.json
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
- **Bulk işlemler**: Firebase ve API işlemleri mümkün olduğunca toplu yapılmalı.
- **Bağımlılıklar**: Kullanılan her paket `package.json` içinde listelenmeli.
- **API istemcisi**: Firebase için tek bir client katmanı.
- **Rate limit farkındalığı**: Firebase quotas dokümantasyondan teyit edilir.
- **Error Handling**: Try-catch blokları, fallback stratejileri, user-friendly error messages.
- **Security**: Input validation, XSS koruması, CSRF koruması.
- **Performance**: Lazy loading, code splitting, image optimization.

---

## 4) Firebase ve Web Teknolojileri

- **Firebase Rules**: Güvenlik kuralları düzenli olarak güncellenmeli.
- **Authentication**: Secure authentication flow, proper session management.
- **Firestore**: Optimized queries, proper indexing, offline support.
- **Storage**: File upload/download güvenliği, size limits.
- **Hosting**: CDN kullanımı, caching strategies.
- **Functions**: Serverless functions için proper error handling.

---

## 5) Test, Hata Ayıklama ve Değişiklik Yönetimi

- **Debug çıktıları**: Geliştirme esnasında anlamlı console.log.
- **Test konumu**: `tests/` klasörü; birim ve entegrasyon testleri.
- **Impact analizi**: Değişiklik öncesi ve sonrası etkiler test edilir.
- **Adım adım iş takibi**: Her değişiklik için `step_todo/STEP-XXXX.md` oluşturulur.
- **Böl ve yönet**: Çözüm tıkanırsa problemi küçük parçalara böl.
- **Browser testing**: Chrome, Firefox, Safari, Edge testleri.

---

## 6) Definition of Done

1. Testler başarılı (unit + integration).
2. UI/UX kuralları uygulanmış.
3. Performans hedefleri karşılanmış (~2sn yükleme).
4. Erişilebilirlik ve responsive tasarım tamamlanmış.
5. Loglama ve hata mesajları kullanıcı-dostu.
6. step_todo ve PR dokümantasyonu güncel.
7. package.json güncel.
8. Firebase rules güncel.
9. Cross-browser compatibility test edilmiş.

---

## 7) Web-Specific Best Practices

- **SEO**: Meta tags, semantic HTML, structured data.
- **Performance**: Lighthouse score >90, Core Web Vitals optimization.
- **Security**: HTTPS, secure headers, input sanitization.
- **Accessibility**: WCAG 2.1 AA compliance.
- **Progressive Web App**: Service worker, offline functionality.
- **Analytics**: User behavior tracking, performance monitoring.

---

## 8) Sürümleme

- Manifesto sürümlenir (`v1.0`, `v1.1`).
- 3 ayda bir ekip geri bildirimiyle gözden geçirilir.
- Büyük değişiklikler RFC açılarak eklenir.

---

## 9) Sorumluluklar

- **Kod sahibi**: PR'da kural ihlallerini belirtir.
- **Reviewer**: PR checklist'e göre doğrular.
- **Ürün sahibi**: Firebase configuration değişikliklerini onaylar.
