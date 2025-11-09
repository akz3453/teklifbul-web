# 🚀 DEPLOY KOMUTLARI - Hızlı Başvuru

## 📋 Sıralı Deploy Adımları

### 1. Firestore Rules Deploy
```bash
firebase deploy --only firestore:rules
```

**Beklenen Çıktı:**
```
✔  firestore: rules deployed successfully
```

### 2. Firestore Indexes Deploy
```bash
firebase deploy --only firestore:indexes
```

**Beklenen Çıktı:**
```
✔  firestore: indexes deployed successfully
```

**Not:** Index oluşturma birkaç dakika sürebilir. Firebase Console'dan durumu kontrol edebilirsiniz.

### 3. Veri Migration
```bash
# PostgreSQL'in çalıştığından emin olun
tsx scripts/migrate-postgres-to-firestore.ts
```

**Beklenen Çıktı:**
```
📦 Starting PostgreSQL → Firestore migration...

📦 Migrating categories...
📦 Found 25 categories
✅ Migrated 25 categories

📦 Migrating category keywords...
📦 Found 134 keywords
✅ Migrated 134 keywords

📦 Migrating tax offices...
📦 Found 850 tax offices
✅ Migrated 850 tax offices

✅ Migration completed successfully!
```

### 4. Test
```bash
# API server başlat
npm run dev:api

# Test endpoints
curl http://localhost:5174/api/categories
curl http://localhost:5174/api/tax-offices/provinces
```

---

## ⚠️ ÖNEMLİ NOTLAR

### Firestore Rules
- Rules deploy edilmeden Firestore'a yazma işlemleri çalışmaz
- Rules'u deploy ettikten sonra birkaç saniye bekleyin

### Firestore Indexes
- Index oluşturma zaman alabilir (1-5 dakika)
- Index oluşturulana kadar ilgili sorgular çalışmayabilir
- Firebase Console → Firestore → Indexes'den durumu kontrol edin

### Migration
- Migration sırasında PostgreSQL çalışıyor olmalı
- Firestore'a yazma yetkisi olmalı
- Migration sonrası verileri Firebase Console'dan kontrol edin

---

## 🔍 SORUN GİDERME

### Rules Deploy Hatası
```bash
# Rules syntax kontrolü
firebase deploy --only firestore:rules --debug
```

### Index Oluşturma Hatası
- Firebase Console → Firestore → Indexes'den manuel oluşturabilirsiniz
- Index tanımını kontrol edin

### Migration Hatası
- PostgreSQL bağlantısını kontrol edin
- Firestore bağlantısını kontrol edin
- `.env` dosyasını kontrol edin

---

**✅ Tüm adımlar tamamlandıktan sonra sistem %100 ücretsiz çalışacak!**

