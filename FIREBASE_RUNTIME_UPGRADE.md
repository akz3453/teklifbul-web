# 🔧 Firebase Functions Node.js Runtime Upgrade

## ✅ Sorun Çözüldü

**Hata:** `Runtime Node.js 18 was decommissioned on 2025-10-30`

**Çözüm:** Node.js runtime versiyonu 18'den 22'ye güncellendi.

---

## 📝 Yapılan Değişiklikler

### `functions/package.json`

**Önceki:**
```json
{
  "engines": {
    "node": "18"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.8.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0"
  }
}
```

**Güncellenen:**
```json
{
  "engines": {
    "node": "22"
  },
  "dependencies": {
    "firebase-admin": "^12.6.0",
    "firebase-functions": "^6.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  }
}
```

---

## 🚀 Deployment Adımları

### 1. Dependencies Güncelle
```bash
cd functions
npm install
```

### 2. Build Test Et (TypeScript kullanıyorsanız)
```bash
npm run build
```

### 3. Deploy Et
```bash
# Sadece functions deploy
firebase deploy --only functions

# Veya tüm proje
firebase deploy
```

---

## ✅ Kontrol

Deploy sonrası:
```bash
firebase functions:log
```

Başarılı deploy mesajı:
```
✅ functions[default]: Successful update operation.
✅ Runtime: nodejs22
```

---

## 📌 Notlar

- **Node.js 22** Firebase'in desteklediği en güncel runtime versiyonu
- **firebase-functions v6.x** Node.js 22 ile uyumlu
- **firebase-admin v12.6.0** Node.js 22 ile uyumlu
- Eğer TypeScript kullanıyorsanız, build'in başarılı olduğundan emin olun

---

## 🔄 Geri Dönüş (Rollback)

Eğer sorun yaşarsanız, Node.js 20'ye geri dönebilirsiniz:

```json
{
  "engines": {
    "node": "20"
  }
}
```

Ancak Node.js 18 artık desteklenmiyor, bu yüzden 20 veya 22 kullanmalısınız.

---

**Tarih:** 2025-10-31  
**Versiyon:** Node.js 18 → 22  
**Durum:** ✅ Güncellendi

