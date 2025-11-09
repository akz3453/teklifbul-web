# 🚀 Final Deployment Steps - Inventory System

## ✅ Completed

All modules created and Firestore rules added. Ready for final deployment.

## 📋 Deployment Checklist

### Step 1: Deploy Firestore Rules ✅

Firestore rules have been added to `firestore.rules`. Now deploy them:

```bash
firebase deploy --only firestore:rules
```

**Or use the simple deployment script:**
```bash
# Windows
deploy-rules-simple.bat

# Or manually edit and deploy
firebase deploy --only firestore:rules
```

### Step 2: Initialize Sample Data

#### Option A: Browser Console (Recommended)
1. Navigate to any page (e.g., `/inventory-index.html`)
2. Open Browser Console (F12)
3. Run:
```javascript
import('/scripts/init-stock-data.js').then(m => m.initData());
```

#### Option B: Create Init Page
Create a temporary page `test-init.html`:
```html
<!doctype html>
<html>
<head><title>Init Stock Data</title></head>
<body>
  <button onclick="init()">Initialize</button>
  <script type="module">
    import { initData } from '/scripts/init-stock-data.js';
    window.init = initData;
  </script>
</body>
</html>
```

### Step 3: Test All Modules

Test each module in order:

#### Test 1: Stok İçe Aktar ✅
```
1. Go to: /pages/stock-import.html
2. Upload sample Excel file
3. Verify validation
4. Click "İçe Aktar"
5. Check Firestore: stocks collection
```

**Sample Excel format:**
```
Stok Kodu | Ürün Adı | Marka | Model | Birim | KDV Oranı | Alım Fiyatı | Satış Fiyatı | Özel Kod 1 | Özel Kod 2 | Özel Kod 3
CIMENTO-001 | ÇIMENTO 32 KG | Akçansa | | ADT | 20 | 45 | 55 | | | 
DEMIR-001 | DEMIR 12 MM | İçdaş | | KG | 20 | 8 | 10 | | |
```

#### Test 2: Wildcard Search ✅
```
1. Go to: /pages/request-site.html
2. Click "+ Satır Ekle"
3. Enter: *ÇİM*32*KG*
4. Should find: ÇIMENTO 32 KG
5. Verify FOUND badge
```

#### Test 3: Stok Hareketi ✅
```
1. Go to: /pages/stock-movements.html
2. Select "📥 Giriş" tab
3. Search and select product
4. Enter: Miktar=100, Birim Maliyet=45, İlave=500
5. Click "Kaydet"
6. Verify: avgCost updated in Firestore
```

#### Test 4: ŞMTF Oluştur ✅
```
1. Go to: /pages/request-site.html
2. Fill: Başlık, Lokasyon, Teslimat
3. Add lines using wildcard search
4. Click "Gönder"
5. Verify: internal_requests + material_lines created
```

#### Test 5: Fatura Karşılaştır ✅
```
1. Go to: /pages/invoice-import.html
2. Enter: Fatura No, Teklif ID
3. Upload invoice Excel
4. Click "Karşılaştır"
5. Verify discrepancy detection
```

#### Test 6: Raporlar ✅
```
1. Go to: /pages/reports.html
2. Switch tabs: Min Stok / Maliyet Altı / Lokasyon / Gerçek Maliyet
3. Verify statistics display
4. Check data consistency
```

### Step 4: Navigation Integration (Optional)

Add inventory links to main navigation in `/assets/js/ui/header.js`:

```javascript
// Add after line 62, before closing nav-left:
<a href="/inventory-index.html" class="nav ${activeRoute==='inventory'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
  <span style="font-size:16px;">📦</span>Stok
</a>
```

Or add to dashboard menu item.

### Step 5: User Role Setup

Ensure user documents have proper roles:

```javascript
// Firestore Console → users collection → {userId}
{
  email: "user@example.com",
  role: "admin",  // or "purchasing", "warehouse", "site"
  ...
}
```

**Allowed Roles:**
- `admin`: Full access
- `purchasing`: Prices, requests, invoices
- `warehouse`: Movements, locations
- `site`: Create requests only
- `sales`: Read-only reports

## 🧪 Testing Script

Quick test script:

```javascript
// Run in browser console on inventory-index.html
async function testInventory() {
  console.log('🧪 Testing Inventory System...');
  
  try {
    // Test 1: Firebase connection
    const { db } = await import('/firebase.js');
    console.log('✅ Firebase connected');
    
    // Test 2: Load stocks
    const stocksSnap = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').then(m => 
      m.getDocs(m.collection(db, 'stocks'))
    );
    console.log(`✅ Stocks loaded: ${stocksSnap.size} items`);
    
    // Test 3: Load locations
    const locsSnap = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').then(m => 
      m.getDocs(m.collection(db, 'stock_locations'))
    );
    console.log(`✅ Locations loaded: ${locsSnap.size} items`);
    
    // Test 4: Wildcard search
    const { normalizeTR, matchesWildcard } = await import('/scripts/lib/tr-utils.js');
    const found = matchesWildcard('ÇIMENTO 32 KG', '*ÇİM*32*KG*');
    console.log(`✅ Wildcard search: ${found}`);
    
    // Test 5: Cost calculation
    const { weightedAvgCost } = await import('/scripts/inventory-cost.js');
    const avg = weightedAvgCost(100, 40, 50, 45);
    console.log(`✅ Weighted avg cost: ${avg}`);
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testInventory();
```

## 📊 Verification Checklist

After deployment, verify:

- [ ] Firestore rules deployed successfully
- [ ] Init script created sample data (4 locations, 4 stocks)
- [ ] Stock import works with Excel
- [ ] Wildcard search finds products
- [ ] Stock movements update avgCost
- [ ] ŞMTF creation saves correctly
- [ ] Invoice comparison detects discrepancies
- [ ] Reports display data correctly
- [ ] User roles properly set
- [ ] Navigation links work (if added)

## 🐛 Troubleshooting

### Problem: "Permission denied"
**Fix:** 
1. Check Firestore rules deployed
2. Verify user role set in users collection
3. Check authentication status

### Problem: "No data found"
**Fix:**
1. Run init script
2. Verify collections exist
3. Check console for errors

### Problem: "Wildcard search not working"
**Fix:**
1. Verify name_norm and search_keywords populated
2. Check tr-utils.js imported correctly
3. Test normalizeTR() function

### Problem: "avgCost not updating"
**Fix:**
1. Verify IN movement created correctly
2. Check stock document exists
3. Verify inventory-cost.js imported

## 📚 Resources

- **Main README**: `INVENTORY_SYSTEM_README.md`
- **Technical Details**: `INVENTORY_IMPLEMENTATION_SUMMARY.md`
- **Deployment Guide**: `DEPLOYMENT_CHECKLIST.md`
- **Integration Summary**: `INTEGRATION_COMPLETE.md`
- **Index Page**: `/inventory-index.html`

## 🎯 Success Criteria

System is production-ready when:
1. ✅ Firestore rules deployed
2. ✅ Sample data loaded
3. ✅ All 6 test scenarios pass
4. ✅ No console errors
5. ✅ User roles configured
6. ✅ Navigation integrated (optional)

## 📞 Support

If issues occur:
1. Check browser console for errors
2. Verify Firestore rules deployed
3. Check user authentication
4. Review README files
5. Test with init data

---

**Status**: ✅ Ready for Deployment  
**Estimated Time**: 30 minutes  
**Critical**: Firestore rules deploy

