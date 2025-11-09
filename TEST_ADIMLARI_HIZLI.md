# ⚡ HIZLI TEST ADIMLARI

## 🎯 ÖNCELİK SIRASI

### 1️⃣ Firestore Rules Deploy (2 dk)
```bash
firebase deploy --only firestore:rules
```

### 2️⃣ Firestore Indexes Deploy (2 dk)
```bash
firebase deploy --only firestore:indexes
```

### 3️⃣ API Test (1 dk)
```bash
# Health check (zaten çalışıyor ✅)
curl http://localhost:5174/api/health

# Categories
curl http://localhost:5174/api/categories

# Tax Offices
curl http://localhost:5174/api/tax-offices/provinces
```

### 4️⃣ Harita Test (2 dk)
1. Tarayıcıda `settings.html` aç
2. Adres ayarları → Harita kontrol et

---

## ✅ BAŞARI KRİTERLERİ

- [ ] Rules deploy edildi
- [ ] Indexes deploy edildi
- [ ] API'ler çalışıyor (boş sonuç olsa bile)
- [ ] Harita görünüyor

---

**Toplam Süre: ~7 dakika**

