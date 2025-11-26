import { db, auth, requireAuth } from '/firebase.js';
import { normalizeTRLower, matchesWildcard, normalizeTR } from '/scripts/lib/tr-utils.js';
import { weightedAvgCost, allocateExtras } from '/scripts/inventory-cost.js';
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';

const qs = s => document.querySelector(s);

const state = {
  currentType: 'IN',
  selectedStock: null,
  locations: [],
  stocks: [],
  movements: []
};

// Initialize event listeners after DOM is ready
function setupEventListeners() {
  // Tab switching
  const tabsElement = qs('.tabs');
  if (!tabsElement) {
    console.error('Tabs element not found');
    return;
  }
  
  tabsElement.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  
  qs('.tab.active').classList.remove('active');
  tab.classList.add('active');
  
  state.currentType = tab.dataset.tab;
  
  // Hide all forms
  qs('#inForm').classList.add('hidden');
  qs('#outForm').classList.add('hidden');
  qs('#transferForm').classList.add('hidden');
  
  // Show relevant form
  if (state.currentType === 'IN') {
    qs('#inForm').classList.remove('hidden');
    qs('#formTitle').textContent = '📥 Giriş Hareketi';
  } else if (state.currentType === 'OUT') {
    qs('#outForm').classList.remove('hidden');
    qs('#formTitle').textContent = '📤 Çıkış Hareketi';
  } else if (state.currentType === 'TRANSFER') {
    qs('#transferForm').classList.remove('hidden');
    qs('#formTitle').textContent = '🔄 Transfer Hareketi';
  } else if (state.currentType === 'ADJUST') {
    qs('#formTitle').textContent = '⚖️ Düzeltme Hareketi';
  }
  
  qs('#formCard').classList.remove('hidden');
  });

  // Save button
  const btnSave = qs('#btnSave');
  if (!btnSave) {
    console.error('Save button not found');
    return;
  }
  
  // Stock search input
  const stockInput = qs('#mvStockSKU');
  if (stockInput) {
    let searchTimeout = null;
    stockInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      const results = qs('#stockSearchResults');
      
      clearTimeout(searchTimeout);
      
      if (!query || query.length < 1) {
        if (results) results.style.display = 'none';
        state.selectedStock = null;
        return;
      }
      
      // Debounce arama
      searchTimeout = setTimeout(() => {
        const matches = searchStocks(query, 50);
        
        if (!results) return;
        
        if (matches.length === 0) {
          results.style.display = 'block';
          results.innerHTML = '<div style="padding:12px;text-align:center;color:#6b7280">Sonuç bulunamadı</div>';
          state.selectedStock = null;
          return;
        }
        
        results.style.display = 'block';
        results.innerHTML = '';
        
        // Sonuç sayısı göster
        const header = document.createElement('div');
        header.style.padding = '8px 12px';
        header.style.background = '#f3f4f6';
        header.style.borderBottom = '1px solid #e5e7eb';
        header.style.fontSize = '12px';
        header.style.fontWeight = '600';
        header.style.color = '#374151';
        header.textContent = `${matches.length} sonuç bulundu (İlk 50 gösteriliyor)`;
        results.appendChild(header);
        
        matches.forEach((stock, idx) => {
          const div = document.createElement('div');
          div.style.padding = '8px 12px';
          div.style.cursor = 'pointer';
          div.style.borderBottom = '1px solid #e5e7eb';
          div.style.transition = 'background 0.2s';
          div.className = 'stock-result-item';
          
          if (idx % 2 === 0) {
            div.style.background = '#fff';
          } else {
            div.style.background = '#f9fafb';
          }
          
          div.innerHTML = `
            <div style="font-weight:600;color:#111827">${stock.sku}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">${stock.name}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Birim: ${stock.unit || 'ADT'}</div>
          `;
          
          div.addEventListener('mouseenter', () => {
            div.style.background = '#eff6ff';
          });
          div.addEventListener('mouseleave', () => {
            div.style.background = idx % 2 === 0 ? '#fff' : '#f9fafb';
          });
          
          div.addEventListener('click', () => {
            state.selectedStock = stock;
            qs('#mvStockSKU').value = stock.sku;
            qs('#mvUnit').value = stock.unit || 'ADT';
            results.style.display = 'none';
          });
          
          results.appendChild(div);
        });
      }, 300);
    });
    
    // F6 tuşu ile arama
    stockInput.addEventListener('keydown', (e) => {
      if (e.key === 'F6') {
        e.preventDefault();
        const results = qs('#stockSearchResults');
        if (results) {
          if (stockInput.value.trim().length === 0) {
            // Tüm stokları göster
            const matches = state.stocks.slice(0, 50);
            if (matches.length > 0) {
              results.style.display = 'block';
              results.innerHTML = '';
              const header = document.createElement('div');
              header.style.padding = '8px 12px';
              header.style.background = '#f3f4f6';
              header.style.borderBottom = '1px solid #e5e7eb';
              header.style.fontSize = '12px';
              header.style.fontWeight = '600';
              header.style.color = '#374151';
              header.textContent = `${state.stocks.length} stok bulundu (İlk 50 gösteriliyor)`;
              results.appendChild(header);
              
              matches.forEach((stock, idx) => {
                const div = document.createElement('div');
                div.style.padding = '8px 12px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #e5e7eb';
                div.className = 'stock-result-item';
                div.style.background = idx % 2 === 0 ? '#fff' : '#f9fafb';
                div.innerHTML = `
                  <div style="font-weight:600;color:#111827">${stock.sku}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:2px">${stock.name}</div>
                `;
                div.addEventListener('click', () => {
                  state.selectedStock = stock;
                  stockInput.value = stock.sku;
                  qs('#mvUnit').value = stock.unit || 'ADT';
                  results.style.display = 'none';
                });
                results.appendChild(div);
              });
            }
          } else {
            // Mevcut aramayı göster
            stockInput.dispatchEvent(new Event('input'));
          }
        }
      }
    });
  }
  
  // ESC tuşu ile dropdown kapat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const results = qs('#stockSearchResults');
      if (results) results.style.display = 'none';
    }
  });
  
  btnSave.addEventListener('click', async () => {
async function loadLocations() {
  try {
    // Teklifbul Rule v1.0 - Şirketin depo adreslerini göster
    const user = await requireAuth();
    const { getDoc, doc, query, where } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    
    // Kullanıcının şirket bilgisini al
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    const companyId = userData?.companyId;
    
    let locations = [];
    
    // Önce şirketin depo adreslerini yükle (companies/{companyId}/sites koleksiyonundan)
    if (companyId) {
      try {
        const { getDocs, collection: getCollection } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
        const sitesSnap = await getDocs(getCollection(db, 'companies', companyId, 'sites'));
        sitesSnap.forEach(siteDoc => {
          const siteData = siteDoc.data();
          // Sadece depo türündeki adresleri ekle
          if (siteData.type === 'warehouse' || siteData.type === 'Depo') {
            locations.push({
              id: `site_${siteDoc.id}`,
              name: siteData.siteName || siteData.title || 'Depo',
              type: 'warehouse',
              siteId: siteDoc.id,
              companyId: companyId,
              address: siteData.content || siteData.fullAddress || ''
            });
          }
        });
      } catch (sitesError) {
        console.warn('Şirket depo adresleri yüklenemedi', sitesError);
      }
    }
    
    // Sonra stock_locations koleksiyonundan da yükle (şirket filtresi ile)
    const stockLocationsQuery = companyId 
      ? query(collection(db, 'stock_locations'), where('companyId', '==', companyId))
      : collection(db, 'stock_locations');
    
    const snap = await getDocs(stockLocationsQuery);
    snap.forEach(doc => {
      const locData = doc.data();
      // Eğer siteId ile eşleşen bir depo zaten eklenmişse atla
      if (!locData.siteId || !locations.find(l => l.siteId === locData.siteId)) {
        locations.push({ id: doc.id, ...locData });
      }
    });
    
    state.locations = locations;
    
    const select = qs('#mvLocation');
    const toSelect = qs('#mvToLocation');
    select.innerHTML = '<option value="">Seçin...</option>';
    toSelect.innerHTML = '<option value="">Seçin...</option>';
    
    state.locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      const typeLabel = loc.type === 'warehouse' ? 'Depo' : (loc.type || 'Lokasyon');
      opt.textContent = `${loc.name} (${typeLabel})`;
      select.appendChild(opt.cloneNode(true));
      toSelect.appendChild(opt);
    });
    
  } catch (error) {
    console.error('Location load error:', error);
  }
}

// Load all stocks for search
async function loadStocks() {
  try {
    const snap = await getDocs(collection(db, 'stocks'));
    state.stocks = [];
    snap.forEach(doc => {
      state.stocks.push({ id: doc.id, ...doc.data() });
    });
  } catch (error) {
    console.error('Stocks load error:', error);
  }
}

// Teklifbul Rule v1.0 - Gelişmiş stok arama sistemi (ETA programı gibi)
function searchStocks(query, limit = 50) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  const normalizedQuery = normalizeTRLower(query.trim());
  const hasWildcard = query.includes('*');
  
  // Wildcard arama (* * kullanarak)
  if (hasWildcard) {
    return state.stocks.filter(s => {
      return matchesWildcard(s.name, query) || matchesWildcard(s.sku, query);
    });
  }
  
  // Normal arama - ilgili sıralama
  const scored = state.stocks.map(stock => {
    const nameNorm = normalizeTRLower(stock.name || '');
    const skuNorm = normalizeTRLower(stock.sku || '');
    
    let score = 0;
    
    // Tam eşleşme (en yüksek öncelik)
    if (nameNorm === normalizedQuery) score += 1000;
    if (skuNorm === normalizedQuery) score += 1000;
    
    // Başlangıç eşleşmesi
    if (nameNorm.startsWith(normalizedQuery)) score += 500;
    if (skuNorm.startsWith(normalizedQuery)) score += 500;
    
    // İçeriyor mu
    if (nameNorm.includes(normalizedQuery)) {
      const index = nameNorm.indexOf(normalizedQuery);
      score += 300 - (index * 2); // Erken bulunanlar daha yüksek skor
    }
    if (skuNorm.includes(normalizedQuery)) {
      const index = skuNorm.indexOf(normalizedQuery);
      score += 200 - (index * 2);
    }
    
    // Kelime bazlı eşleşme
    const queryWords = normalizedQuery.split(/\s+/);
    const nameWords = nameNorm.split(/\s+/);
    queryWords.forEach(qw => {
      nameWords.forEach(nw => {
        if (nw.startsWith(qw)) score += 100;
        if (nw.includes(qw)) score += 50;
      });
    });
    
    return { stock, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit)
  .map(item => item.stock);
  
  return scored;
}

// Stock search event listeners moved to setupEventListeners function

// Load movement history
async function loadHistory() {
  try {
    const snap = await getDocs(query(
      collection(db, 'stock_movements'),
      orderBy('createdAt', 'desc')
    ));
    
    state.movements = [];
    snap.forEach(doc => {
      state.movements.push({ id: doc.id, ...doc.data() });
    });
    
    renderHistory();
  } catch (error) {
    console.error('History load error:', error);
  }
}

function renderHistory() {
  const tbody = qs('#historyTable');
  tbody.innerHTML = '';
  
  if (!state.movements.length) {
    tbody.innerHTML = '<tr><td colspan="8">Henüz hareket yok.</td></tr>';
    return;
  }
  
  state.movements.forEach(mv => {
    const tr = document.createElement('tr');
    const date = mv.createdAt ? new Date(mv.createdAt.toDate()).toLocaleDateString('tr-TR') : '-';
    const typeBadge = `b-${mv.type}`;
    const typeText = {
      'IN': '📥 Giriş',
      'OUT': '📤 Çıkış',
      'TRANSFER': '🔄 Transfer',
      'ADJUST': '⚖️ Düzelt'
    }[mv.type] || mv.type;
    
    tr.innerHTML = `
      <td>${date}</td>
      <td><span class="badge ${typeBadge}">${typeText}</span></td>
      <td>${mv.sku}</td>
      <td>${mv.stockName || ''}</td>
      <td>${state.locations.find(l => l.id === mv.locationId)?.name || '-'}</td>
      <td>${mv.qty}</td>
      <td>${mv.unitCost || 0}</td>
      <td>${mv.totalCost || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Save movement
qs('#btnSave').addEventListener('click', async () => {
  const user = await requireAuth();
  
  // Teklifbul Rule v1.0 - Company ID'yi al
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userData = userDoc.exists() ? userDoc.data() : {};
  const companyId = userData.companyId;
  
  if (!companyId) {
    toast.error('Kullanıcı company ID bulunamadı!');
    return;
  }
  
  if (!state.selectedStock) {
    toast.error('Lütfen bir ürün seçin!');
    return;
  }
  
  const locationId = qs('#mvLocation').value;
  if (!locationId) {
    toast.error('Lütfen bir lokasyon seçin!');
    return;
  }
  
  // Teklifbul Rule v1.0 - locationId siteId formatında ise gerçek locationId'yi bul
  let actualLocationId = locationId;
  if (locationId && locationId.startsWith('site_')) {
    const siteId = locationId.replace('site_', '');
    const locationQuery = query(
      collection(db, 'stock_locations'),
      where('siteId', '==', siteId),
      where('companyId', '==', companyId)
    );
    const locationSnap = await getDocs(locationQuery);
    if (!locationSnap.empty) {
      actualLocationId = locationSnap.docs[0].id;
    }
  }
  
  const qty = parseFloat(qs('#mvQty').value);
  if (!qty || qty <= 0) {
    toast.error('Geçerli bir miktar girin!');
    return;
  }
  
  try {
    if (state.currentType === 'IN') {
      const unitCost = parseFloat(qs('#mvUnitCost').value) || 0;
      const extras = parseFloat(qs('#mvExtras').value) || 0;
      const allocatedExtras = allocateExtras(extras, qty);
      const finalUnitCost = unitCost + allocatedExtras;
      
      // Teklifbul Rule v1.0 - locationId siteId formatında ise gerçek locationId'yi bul
      let actualLocationId = locationId;
      if (locationId && locationId.startsWith('site_')) {
        // siteId'den gerçek locationId'yi bul
        const siteId = locationId.replace('site_', '');
        const locationQuery = query(
          collection(db, 'stock_locations'),
          where('siteId', '==', siteId),
          where('companyId', '==', companyId)
        );
        const locationSnap = await getDocs(locationQuery);
        if (!locationSnap.empty) {
          actualLocationId = locationSnap.docs[0].id;
        } else {
          // Eğer stock_locations'ta yoksa, siteId'yi kullan (yeni depo olabilir)
          actualLocationId = locationId;
        }
      }
      
      // Create movement
      const movementRef = await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        siteId: locationId && locationId.startsWith('site_') ? locationId.replace('site_', '') : null,
        type: 'IN',
        qty,
        unit: state.selectedStock.unit || 'ADT',
        unitCost: finalUnitCost,
        totalCost: finalUnitCost * qty,
        extras: [{ name: 'İlave', amount: extras }],
        ref: { kind: 'MANUAL', id: '' },
        stockName: state.selectedStock.name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
      // Teklifbul Rule v1.0 - Stock balance'ı güncelle
      await updateStockBalance({
        id: movementRef.id,
        companyId: companyId,
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        type: 'IN',
        qty: qty,
        unitCost: finalUnitCost
      });
      
      // Update stock avgCost (stock_balances'den al)
      const stockDoc1 = await getDoc(doc(db, 'stocks', state.selectedStock.id));
      const stockData1 = stockDoc1.data();
      
      // Teklifbul Rule v1.0 - Stock balance'dan avgCost al
      const { getStockBalance } = await import('/scripts/inventory-balances.js');
      const balance = await getStockBalance(companyId, state.selectedStock.sku, actualLocationId);
      const newAvg = balance?.avgCost || stockData1.avgCost || 0;
      
      await updateDoc(doc(db, 'stocks', state.selectedStock.id), {
        avgCost: newAvg,
        lastPurchasePrice: unitCost,
        updatedAt: serverTimestamp()
      });
      
      // Teklifbul Rule v1.0 - Düşük stok kontrolü ve bildirim
      const { getStockBalance: getStockBalanceForLowCheck } = await import('/scripts/inventory-balances.js');
      const { checkAndNotifyStockLow } = await import('/scripts/inventory-notifications.js');
      const balanceForLowCheck = await getStockBalanceForLowCheck(companyId, state.selectedStock.sku, actualLocationId);
      const stockDoc2 = await getDoc(doc(db, 'stocks', state.selectedStock.id));
      const stockData2 = stockDoc2.data();
      const location = state.locations.find(l => l.id === locationId || l.id === actualLocationId);
      await checkAndNotifyStockLow({
        companyId: companyId,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        currentQty: balanceForLowCheck?.quantity || 0,
        minQty: stockData2.minQty || stockData2.minimumQty || 0,
        stockName: state.selectedStock.name,
        locationName: location?.name || null,
        userId: user.uid
      });
      
    } else if (state.currentType === 'OUT') {
      const refKind = qs('#mvRefKind').value;
      const refId = qs('#mvRefId').value;
      
      // Teklifbul Rule v1.0 - Stock balance'dan avgCost al
      const { getStockBalance: getStockBalanceForOut } = await import('/scripts/inventory-balances.js');
      const balanceForOut = await getStockBalanceForOut(companyId, state.selectedStock.sku, actualLocationId);
      const avgCost = balanceForOut?.avgCost || state.selectedStock.avgCost || 0;
      
      const movementRef = await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        siteId: locationId && locationId.startsWith('site_') ? locationId.replace('site_', '') : null,
        type: 'OUT',
        qty,
        unit: state.selectedStock.unit || 'ADT',
        unitCost: avgCost,
        totalCost: avgCost * qty,
        ref: { kind: refKind, id: refId },
        stockName: state.selectedStock.name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
      // Teklifbul Rule v1.0 - Stock balance'ı güncelle
      await updateStockBalance({
        id: movementRef.id,
        companyId: companyId,
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        type: 'OUT',
        qty: qty,
        unitCost: avgCost
      });
      
      // Teklifbul Rule v1.0 - Düşük stok kontrolü ve bildirim
      const { getStockBalance: getStockBalanceForOutLowCheck } = await import('/scripts/inventory-balances.js');
      const { checkAndNotifyStockLow } = await import('/scripts/inventory-notifications.js');
      const balanceForOutLowCheck = await getStockBalanceForOutLowCheck(companyId, state.selectedStock.sku, actualLocationId);
      const stockDocForOut = await getDoc(doc(db, 'stocks', state.selectedStock.id));
      const stockDataForOut = stockDocForOut.data();
      const location = state.locations.find(l => l.id === locationId || l.id === actualLocationId);
      await checkAndNotifyStockLow({
        companyId: companyId,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        currentQty: balanceForOutLowCheck?.quantity || 0,
        minQty: stockDataForOut.minQty || stockDataForOut.minimumQty || 0,
        stockName: state.selectedStock.name,
        locationName: location?.name || null,
        userId: user.uid
      });
      
    } else if (state.currentType === 'TRANSFER') {
      const toLocationIdRaw = qs('#mvToLocation').value;
      if (!toLocationIdRaw) {
        toast.error('Hedef lokasyon seçin!');
        return;
      }
      
      // Teklifbul Rule v1.0 - Hedef locationId'yi de düzelt
      let actualToLocationId = toLocationIdRaw;
      if (toLocationIdRaw && toLocationIdRaw.startsWith('site_')) {
        const toSiteId = toLocationIdRaw.replace('site_', '');
        const toLocationQuery = query(
          collection(db, 'stock_locations'),
          where('siteId', '==', toSiteId),
          where('companyId', '==', companyId)
        );
        const toLocationSnap = await getDocs(toLocationQuery);
        if (!toLocationSnap.empty) {
          actualToLocationId = toLocationSnap.docs[0].id;
        }
      }
      
      // Teklifbul Rule v1.0 - Stock balance'dan avgCost al
      const { getStockBalance: getStockBalanceForTransfer } = await import('/scripts/inventory-balances.js');
      const balanceForTransfer = await getStockBalanceForTransfer(companyId, state.selectedStock.sku, actualLocationId);
      const avgCost = balanceForTransfer?.avgCost || state.selectedStock.avgCost || 0;
      
      // OUT movement (kaynak lokasyondan)
      const movementRef = await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        siteId: locationId && locationId.startsWith('site_') ? locationId.replace('site_', '') : null,
        type: 'TRANSFER',
        qty,
        unit: state.selectedStock.unit || 'ADT',
        unitCost: avgCost,
        totalCost: avgCost * qty,
        ref: { kind: 'MANUAL', id: actualToLocationId },
        stockName: state.selectedStock.name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
      // Teklifbul Rule v1.0 - Stock balance'ı güncelle (kaynak ve hedef)
      await updateStockBalance({
        id: movementRef.id,
        companyId: companyId,
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        type: 'TRANSFER',
        qty: qty,
        unitCost: avgCost,
        toLocationId: actualToLocationId
      });
      
    } else if (state.currentType === 'ADJUST') {
      const movementRef = await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        siteId: locationId && locationId.startsWith('site_') ? locationId.replace('site_', '') : null,
        type: 'ADJUST',
        qty,
        unit: state.selectedStock.unit || 'ADT',
        unitCost: 0,
        totalCost: 0,
        ref: { kind: 'MANUAL', id: '' },
        stockName: state.selectedStock.name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
      // Teklifbul Rule v1.0 - Stock balance'ı güncelle
      await updateStockBalance({
        id: movementRef.id,
        companyId: companyId,
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId: actualLocationId,
        type: 'ADJUST',
        qty: qty,
        unitCost: 0
      });
    }
    
    toast.success('Hareket kaydedildi!');
    
    // Reset form
    qs('#mvStockSKU').value = '';
    qs('#mvUnit').value = '';
    qs('#mvQty').value = '';
    qs('#mvUnitCost').value = '';
    qs('#mvExtras').value = '';
    qs('#mvLocation').value = '';
    qs('#mvToLocation').value = '';
    state.selectedStock = null;
    qs('#formCard').classList.add('hidden');
    
    await loadHistory();
    
  } catch (error) {
    console.error('Save error:', error);
    toast.error('Hareket kaydedilemedi: ' + error.message);
  }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadLocations();
    loadStocks();
    loadHistory();
  });
} else {
  // DOM already loaded
  setupEventListeners();
  loadLocations();
  loadStocks();
  loadHistory();
}

