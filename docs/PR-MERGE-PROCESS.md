# PR / Merge Süreci
## Teklifbul Web - Standartlaştırma ve Optimizasyon

**Teklifbul Rule v1.0** - PR ve merge rehberi

---

## 📋 Açık Branch'ler

Aşağıdaki branch'ler için PR açılmalı ve merge edilmelidir:

1. **`feat/large-upload-progress-cancel`**
   - Büyük veri yükleme işlemlerine progress bar + iptal
   - Chunked upload component ve utility'ler

2. **`feat/migrations-progress-cancel`**
   - Migration script'lerine progress bar + iptal
   - Migration runner utility

3. **`perf/tax-offices-index-optimization`**
   - Tax offices index optimizasyonu
   - Migration script'i
   - Firestore index'leri

4. **`feat/migration-hardening`**
   - Migration hardening (credentials, dry-run, backoff)
   - Backoff-retry utility

5. **`docs/tech-debt-update`** (varsa)
   - TECH-DEBT-TRACK güncellemeleri

---

## 🔀 PR Açma Süreci

### 1. Branch'i Push Et

```bash
# Her branch için
git checkout feat/large-upload-progress-cancel
git push -u origin feat/large-upload-progress-cancel

# Diğer branch'ler için de aynı
git checkout feat/migrations-progress-cancel
git push -u origin feat/migrations-progress-cancel

# ... vb.
```

### 2. PR Oluştur

**GitHub CLI ile (önerilen):**

```bash
gh pr create --fill \
  --title "feat: büyük veri yükleme – progress bar + iptal (chunked)" \
  --body "Automated PR: indexes deploy ✅, migration run ✅, smoke tests ✅. Loglar /logs altında."
```

**Manuel (GitHub Web UI):**
- GitHub'da "New Pull Request" tıklayın
- Base: `main` (veya `master`)
- Compare: `feat/large-upload-progress-cancel`
- Başlık ve açıklama ekleyin

### 3. PR Başlıkları (Önerilen)

- `feat: büyük veri yükleme – progress bar + iptal (chunked)`
- `feat: migrations — batch progress + cancel (CLI output & SIGINT)`
- `perf: tax offices index optimization (case-insensitive, indexed queries)`
- `feat: migration hardening (credentials flag, dry-run, backoff)`
- `docs: mark migrations + tax offices optimization as completed`

---

## ✅ PR Kontrol Listesi

Her PR için şunları kontrol edin:

- [ ] Kod lint'ten geçiyor (`npm run lint -- --max-warnings=0`)
- [ ] TypeScript type check geçiyor (`npm run type-check` - varsa)
- [ ] Test'ler geçiyor (`npm test` - varsa)
- [ ] Commit mesajları açıklayıcı
- [ ] Değişiklikler küçük ve atomik
- [ ] Dokümantasyon güncellendi (varsa)
- [ ] Release notes'a eklendi (varsa)

---

## 🔍 Code Review Kriterleri

### Genel
- ✅ Kod modüler ve DRY prensiplerine uygun
- ✅ Async/await yapısı kullanılıyor
- ✅ Hata yönetimi var (try/catch + toast/logger)
- ✅ Sihirli sayı, hard-coded metin yok
- ✅ Dosya adları kebab-case, fonksiyon adları camelCase

### Özel (Bu PR'lar için)
- ✅ Progress bar entegrasyonu var
- ✅ İptal desteği var (AbortController)
- ✅ Logger kullanılıyor (console.* yok)
- ✅ Toast kullanılıyor (alert() yok)
- ✅ Firestore sorguları optimize (index'li veya koşullu)
- ✅ Batch processing kullanılıyor (büyük işlemler için)

---

## 🚀 Merge Süreci

### 1. Code Review

- En az 1 kişi review yapmalı
- Tüm yorumlar çözülmeli
- Approval alınmalı

### 2. CI/CD Kontrolleri (varsa)

- ✅ Lint geçiyor
- ✅ Type check geçiyor
- ✅ Test'ler geçiyor
- ✅ Build başarılı

### 3. Merge

**Squash and Merge (önerilen):**
- Tüm commit'ler tek commit'e squash edilir
- Commit mesajı PR başlığı ile aynı olmalı

**Merge Commit:**
- Tüm commit'ler korunur
- Daha detaylı geçmiş

**Rebase and Merge:**
- Linear history
- Daha temiz geçmiş

### 4. Post-Merge

- [ ] Branch silindi (opsiyonel)
- [ ] Release notes güncellendi
- [ ] Dokümantasyon güncellendi
- [ ] Production deployment planlandı

---

## 🛡️ Kalite Kapıları (Önerilen)

### Pre-Commit Hook (Husky + lint-staged)

**Kurulum:**

```bash
npm install --save-dev husky lint-staged

# Husky initialize
npx husky install

# Pre-commit hook ekle
npx husky add .husky/pre-commit "npx lint-staged"
```

**`package.json` ekle:**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

**`.husky/pre-commit` dosyası:**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### Pre-Push Hook (Opsiyonel)

**`.husky/pre-push` dosyası:**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run lint -- --max-warnings=0
npm run type-check  # varsa
npm test  # varsa
```

### ESLint Konfigürasyonu

**Mevcut:** ✅ `no-console` kuralı aktif (logger.ts hariç)

**Kontrol:**

```bash
npm run lint -- --max-warnings=0
```

---

## 📝 PR Template (Önerilen)

**`.github/pull_request_template.md`:**

```markdown
## Açıklama

[PR'nin amacını açıklayın]

## Değişiklikler

- [ ] Yeni özellik
- [ ] Bug fix
- [ ] Performans iyileştirmesi
- [ ] Dokümantasyon
- [ ] Refactoring

## Test

- [ ] Lint geçiyor (`npm run lint -- --max-warnings=0`)
- [ ] Type check geçiyor (varsa)
- [ ] Test'ler geçiyor (varsa)
- [ ] Manuel test yapıldı

## Checklist

- [ ] Kod modüler ve DRY
- [ ] Async/await kullanılıyor
- [ ] Hata yönetimi var (try/catch + toast/logger)
- [ ] Logger kullanılıyor (console.* yok)
- [ ] Toast kullanılıyor (alert() yok)
- [ ] Dokümantasyon güncellendi (varsa)

## İlgili Issue

[Issue numarası veya link]

## Screenshots (varsa)

[Ekran görüntüleri]
```

---

## 🔗 İlgili Dokümantasyon

- [Production Deployment Guide](PRODUCTION-DEPLOYMENT.md)
- [Release Notes](RELEASE-NOTES.md)
- [Tech Debt Tracker](../TECH-DEBT-TRACK.md)

---

**Son Güncelleme:** 2025-01-20  
**Güncelleyen:** Auto (Cursor AI)

