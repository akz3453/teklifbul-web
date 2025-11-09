# ✅ Türkçe Normalizasyon Güncellendi

## 🎯 Yapılan Değişiklikler

### `scripts/lib/tr-utils.js`

**Önceki Kod:**
- Basit karakter mapping
- Küçük harf döndürüyordu
- Manuel eşleştirme

**Yeni Kod:**
- ✅ Unicode NFD normalize
- ✅ Diacritic temizleme (`\p{Diacritic}`)
- ✅ Türkçe locale-aware uppercase (`toLocaleUpperCase('tr-TR')`)
- ✅ Özel Türkçe harf eşlemeleri
- ✅ Regex tabanlı wildcard eşleştirme

### Yeni Fonksiyonlar

1. **`normalizeTR(s)`** - Büyük harf normalize (wildcard eşleştirme için)
2. **`normalizeTRLower(s)`** - Küçük harf normalize (indexleme için)
3. **`wildcardMatch(text, pattern)`** - Regex tabanlı wildcard eşleştirme
4. **`matchesWildcard(name, query)`** - Geriye uyumluluk için (wildcardMatch kullanır)

### Güncellenen Dosyalar

1. ✅ `scripts/lib/tr-utils.js` - Yeni normalize fonksiyonları
2. ✅ `scripts/stock-import.js` - normalizeTRLower kullanımı
3. ✅ `scripts/init-stock-data.js` - normalizeTRLower + tokenizeForIndex
4. ✅ `scripts/request-site.js` - normalizeTRLower kullanımı
5. ✅ `scripts/stock-movements.js` - normalizeTRLower kullanımı

---

## 🔍 Yeni Normalizasyon Mantığı

```javascript
normalizeTR("ÇİMENTO 32 KG")
// → "CIMENTO 32 KG" (büyük harf, diacritic yok)

normalizeTRLower("ÇİMENTO 32 KG")
// → "cimento 32 kg" (küçük harf, indexleme için)
```

### Wildcard Eşleştirme

```javascript
wildcardMatch("ÇİMENTO 32 KG", "*ÇİM*32*KG*")
// → true (regex: /^.*CIM.*32.*KG.*$/.test("CIMENTO 32 KG"))
```

---

## ✅ Avantajlar

1. **Daha Doğru:** Unicode normalization ile daha güvenilir
2. **Locale-Aware:** Türkçe karakter kurallarına uygun
3. **Performanslı:** Regex tabanlı wildcard eşleştirme
4. **Geriye Uyumlu:** Eski `matchesWildcard` fonksiyonu çalışmaya devam ediyor
5. **Temiz Kod:** Özel eşlemeler açık ve net

---

## 🧪 Test Senaryoları

### Test 1: Basit Normalizasyon
```javascript
normalizeTR("Şöğüçİ") 
// → "SOGUCI"
```

### Test 2: Wildcard Eşleştirme
```javascript
wildcardMatch("ÇİMENTO 32 KG", "*ÇİM*32*KG*")
// → true
```

### Test 3: Indexleme
```javascript
normalizeTRLower("ÇİMENTO 32 KG")
// → "cimento 32 kg" (indexleme için)
```

---

## 📝 Kullanım

### Indexleme İçin (name_norm)
```javascript
import { normalizeTRLower } from '/scripts/lib/tr-utils.js';
name_norm: normalizeTRLower(stock.name)
```

### Wildcard Arama İçin
```javascript
import { matchesWildcard } from '/scripts/lib/tr-utils.js';
if (matchesWildcard(stock.name, '*ÇİM*32*KG*')) {
  // eşleşti
}
```

### Doğrudan Wildcard Match
```javascript
import { wildcardMatch } from '/scripts/lib/tr-utils.js';
if (wildcardMatch(text, pattern)) {
  // eşleşti
}
```

---

## ✅ Durum

- ✅ Tüm dosyalar güncellendi
- ✅ Linter hataları yok
- ✅ Geriye uyumluluk korundu
- ✅ Test edilmeye hazır

---

**Güncelleme Tarihi:** 2025  
**Versiyon:** 2.0 (Improved Turkish Normalization)

