# 🚀 Deploy Inventory System - Command Guide

## ✅ Durum: Firestore Rules Hazır

Firestore rules başarıyla `firestore.rules` dosyasına eklendi. Şimdi deploy etmeniz gerekiyor.

## 📝 Adım Adım Deployment

### 1. Firebase Login (Eğer giriş yapmadıysanız)

```bash
firebase login
```

Tarayıcı açılacak, Google hesabınızla giriş yapın.

### 2. Firestore Rules Deploy

```bash
firebase deploy --only firestore:rules
```

**Beklenen Çıktı:**
```
=== Deploying to 'teklifbul'...

✔  firestore: released rules firestore.rules to firestore database.

✔  Deploy complete!
```

### 3. Sample Data İnit (Browser Console)

Firestore rules deploy edildikten sonra, tarayıcıda:

1. Ana sayfaya gidin: `http://localhost:3000/inventory-index.html` (veya hosting URL'iniz)
2. F12 ile Developer Console açın
3. Şu komutu çalıştırın:

```javascript
import('/scripts/init-stock-data.js').then(m => m.initData());
```

**Beklenen Çıktı:**
```
✅ Location added: Ankara Merkez Depo
✅ Location added: İstanbul Depo
✅ Location added: Rize Şantiye
✅ Location added: Trabzon Şantiye
✅ Stock added: CIMENTO-001
✅ Stock added: DEMIR-001
✅ Stock added: CIMENTO-002
✅ Stock added: KUM-001
🎉 Initialization complete!
```

### 4. Alternative: Init HTML Page

Eğer console kullanmak istemiyorsanız, geçici bir sayfa oluşturun:

**`test-init-stock.html`** (root dizinde):
```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Init Stock Data</title>
</head>
<body>
  <h1>Initialize Stock Data</h1>
  <button id="btnInit" style="padding:15px 30px;font-size:16px;cursor:pointer;background:#3b82f6;color:white;border:none;border-radius:6px;">
    Initialize Sample Data
  </button>
  <div id="status" style="margin-top:20px;"></div>

  <script type="module">
    import { auth, requireAuth } from '/firebase.js';
    import { db } from '/firebase.js';
    import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

    const sampleLocations = [
      { name: 'Ankara Merkez Depo', type: 'DEPOT', addressSummary: 'Ankara', province: 'Ankara', district: 'Çankaya', neighborhood: 'Çukurambar' },
      { name: 'İstanbul Depo', type: 'DEPOT', addressSummary: 'İstanbul', province: 'İstanbul', district: 'Kartal', neighborhood: '' },
      { name: 'Rize Şantiye', type: 'SITE', addressSummary: 'Rize', province: 'Rize', district: 'Merkez', neighborhood: '' },
      { name: 'Trabzon Şantiye', type: 'SITE', addressSummary: 'Trabzon', province: 'Trabzon', district: 'Merkez', neighborhood: '' },
    ];

    const sampleStocks = [
      { sku: 'CIMENTO-001', name: 'ÇIMENTO 32 KG', brand: 'Akçansa', model: '', unit: 'ADT', vatRate: 20, lastPurchasePrice: 45, avgCost: 0, salePrice: 55 },
      { sku: 'DEMIR-001', name: 'DEMIR 12 MM', brand: 'İçdaş', model: '', unit: 'KG', vatRate: 20, lastPurchasePrice: 8, avgCost: 0, salePrice: 10 },
      { sku: 'CIMENTO-002', name: 'ÇIMENTO 50 KG', brand: 'Akçansa', model: '', unit: 'ADT', vatRate: 20, lastPurchasePrice: 70, avgCost: 0, salePrice: 85 },
      { sku: 'KUM-001', name: 'YAPMA KUM', brand: '', model: '', unit: 'M3', vatRate: 20, lastPurchasePrice: 150, avgCost: 0, salePrice: 180 },
    ];

    async function initData() {
      const statusDiv = document.getElementById('status');
      statusDiv.innerHTML = '🔧 Initializing...';
      
      await requireAuth();

      // Add locations
      for (const loc of sampleLocations) {
        try {
          await addDoc(collection(db, 'stock_locations'), {
            ...loc,
            createdAt: serverTimestamp()
          });
          statusDiv.innerHTML += `<br>✅ ${loc.name}`;
        } catch (error) {
          statusDiv.innerHTML += `<br>❌ ${loc.name}: ${error.message}`;
        }
      }

      // Add stocks
      for (const stock of sampleStocks) {
        try {
          const nameNorm = stock.name.toLowerCase()
            .replace(/ı/g, 'i').replace(/İ/g, 'i')
            .replace(/ş/g, 's').replace(/Ş/g, 's')
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
            .replace(/ü/g, 'u').replace(/Ü/g, 'u')
            .replace(/ö/g, 'o').replace(/Ö/g, 'o')
            .replace(/ç/g, 'c').replace(/Ç/g, 'c');
          
          const searchKeywords = [];
          const words = nameNorm.split(/\s+/).filter(Boolean);
          words.forEach(w => {
            for (let i = 1; i <= Math.min(8, w.length); i++) {
              searchKeywords.push(w.slice(0, i));
            }
          });

          await addDoc(collection(db, 'stocks'), {
            ...stock,
            customCodes: { code1: '', code2: '', code3: '' },
            name_norm: nameNorm,
            search_keywords: searchKeywords,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          statusDiv.innerHTML += `<br>✅ ${stock.sku}`;
        } catch (error) {
          statusDiv.innerHTML += `<br>❌ ${stock.sku}: ${error.message}`;
        }
      }

      statusDiv.innerHTML += '<br><br>🎉 Initialization complete!';
      document.getElementById('btnInit').disabled = true;
    }

    document.getElementById('btnInit').onclick = initData;
  </script>
</body>
</html>
```

Sonra bu sayfaya gidip butona tıklayın.

## 🧪 Quick Test

Firestore rules deploy ve init sonrası, bu testi çalıştırın:

```javascript
// Browser Console on inventory-index.html
async function quickTest() {
  console.log('Testing...');
  const { db } = await import('/firebase.js');
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
  
  const stocks = await getDocs(collection(db, 'stocks'));
  console.log('✅ Stocks:', stocks.size);
  
  const locs = await getDocs(collection(db, 'stock_locations'));
  console.log('✅ Locations:', locs.size);
  
  console.log('🎉 Test passed!');
}
quickTest();
```

## 🎯 Production Checklist

- [x] Firestore rules added to firestore.rules
- [ ] Firebase login completed
- [ ] Firestore rules deployed
- [ ] Sample data initialized
- [ ] Quick test passed
- [ ] Full module tests completed
- [ ] Navigation integrated (optional)

## 🐛 Troubleshooting

### "Permission denied"
**Çözüm:** Firestore rules deploy edilmemiş. Adım 2'yi tekrarlayın.

### "initData is not a function"
**Çözüm:** Module import hatası. test-init-stock.html kullanın.

### "Failed to authenticate"
**Çözüm:** `firebase login` çalıştırın.

### "No data found"
**Çözüm:** Init script çalıştırılmamış. Browser console veya test-init-stock.html kullanın.

## 📞 Sonraki Adımlar

Deployment tamamlandıktan sonra:
1. `FINAL_DEPLOYMENT_STEPS.md` dosyasına bakın
2. Tüm test senaryolarını çalıştırın
3. Navigation entegrasyonunu ekleyin (opsiyonel)
4. Kullanıcı rolleri yapılandırın

---

**Deployment Time:** ~30 minutes  
**Critical:** Adım 2 (rules deploy) zorunlu

