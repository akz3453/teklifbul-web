# Teklifbul Web - Developer Guide

**Teklifbul Rule v1.0** - Geliştirici rehberi

---

## 🚀 Hızlı Başlangıç

```bash
# Bağımlılıkları yükle
npm install

# Development server başlat
npm run dev

# API server başlat (ayrı terminal)
npm run dev:api
```

---

## 🛡️ Kalite Kapıları

Proje, kod kalitesini korumak için otomatik kontroller içerir:

### Pre-Commit Hook

Her commit'te otomatik olarak çalışır:
- ✅ **Lint**: ESLint ile kod kontrolü ve otomatik düzeltme
- ✅ **Type Check**: TypeScript type kontrolü

**Çalıştırılan komutlar:**
```bash
npm run lint -- --fix
npm run type-check -w 1
```

**Geçici olarak atlamak için:**
```bash
git commit --no-verify
```
⚠️ **Not:** Sadece istisnai durumlarda kullanın!

### Pre-Push Hook (Opsiyonel)

Push öncesi otomatik olarak çalışır:
- ✅ **Smoke Test**: Tax offices index optimizasyonu testi

**Çalıştırılan komut:**
```bash
npm run smoke
```

**Devre dışı bırakmak için:**
- `.husky/pre-push` dosyasını silin veya içeriğini `exit 0` yapın
- Veya push sırasında: `git push --no-verify`

---

## 📝 Script'ler

### Development
- `npm run dev` - Frontend development server
- `npm run dev:api` - API development server (watch mode)

### Build
- `npm run build` - Production build
- `npm run preview` - Production build preview

### Quality
- `npm run lint` - ESLint kontrolü
- `npm run lint -- --fix` - ESLint otomatik düzeltme
- `npm run type-check` - TypeScript type kontrolü
- `npm run smoke` - Smoke test (tax offices)

### Testing
- `npm test` - Jest testleri
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage raporu

### Deployment
- `npm run deploy:rules` - Firestore rules deploy
- `npm run deploy:indexes` - Firestore indexes deploy

---

## 🔧 Konfigürasyon

### ESLint

ESLint konfigürasyonu `eslint.config.js` dosyasında.

**Önemli kurallar:**
- `no-console`: Aktif (logger.ts hariç)
- TypeScript strict mode uyumluluğu
- React hooks kuralları

### TypeScript

TypeScript konfigürasyonu `tsconfig.json` dosyasında.

### Husky

Git hook'ları `.husky/` klasöründe:
- `pre-commit` - Lint + type-check
- `pre-push` - Smoke test (opsiyonel)

### lint-staged

Sadece staged dosyalar üzerinde çalışır (performans için).

Konfigürasyon `package.json` içinde:
```json
{
  "lint-staged": {
    "src/**/*.{ts,tsx,js,jsx,json}": [
      "npm run lint -- --fix",
      "npm run type-check -w 1"
    ]
  }
}
```

---

## 📚 Kod Standartları

### Dosya Adlandırma
- **Dosyalar**: kebab-case (`my-component.tsx`)
- **Fonksiyonlar**: camelCase (`myFunction`)
- **Değişkenler**: camelCase (`myVariable`)

### Kod Kuralları
- ✅ Modüler ve DRY prensiplerine uygun
- ✅ Async/await yapısı kullanılmalı
- ✅ Hata yönetimi: try/catch + toast/logger
- ✅ Logger kullanılmalı (console.* yok)
- ✅ Toast kullanılmalı (alert() yok)
- ❌ Sihirli sayı, hard-coded metin yok

### Import Sırası
1. External dependencies
2. Internal modules
3. Relative imports
4. Types/interfaces

---

## 🐛 Sorun Giderme

### Hook'lar çalışmıyor

```bash
# Husky'yi yeniden initialize et
npm run prepare

# Hook dosyalarının çalıştırılabilir olduğundan emin ol (Linux/Mac)
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
```

### Type-check çok yavaş

`-w 1` flag'i ile tek iş parçacığı kullanılır (CI'da kaynak tüketimini kısar).

### Lint hataları

```bash
# Otomatik düzeltme
npm run lint -- --fix

# Belirli dosya için
npm run lint -- --fix src/path/to/file.ts
```

---

## 📖 İlgili Dokümantasyon

- [Production Deployment Guide](docs/PRODUCTION-DEPLOYMENT.md)
- [PR/Merge Process](docs/PR-MERGE-PROCESS.md)
- [Release Notes](RELEASE-NOTES.md)
- [Tech Debt Tracker](TECH-DEBT-TRACK.md)

---

**Son Güncelleme:** 2025-01-20  
**Güncelleyen:** Auto (Cursor AI)

