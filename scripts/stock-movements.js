import { db, auth, requireAuth } from '/firebase.js';
import { normalizeTRLower, matchesWildcard } from '/scripts/lib/tr-utils.js';
import { weightedAvgCost, allocateExtras } from '/scripts/inventory-cost.js';
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const qs = s => document.querySelector(s);

const state = {
  currentType: 'IN',
  selectedStock: null,
  locations: [],
  stocks: [],
  movements: []
};

// Tab switching
qs('.tabs').addEventListener('click', (e) => {
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

// Load locations
async function loadLocations() {
  try {
    const snap = await getDocs(collection(db, 'stock_locations'));
    state.locations = [];
    snap.forEach(doc => {
      state.locations.push({ id: doc.id, ...doc.data() });
    });
    
    const select = qs('#mvLocation');
    const toSelect = qs('#mvToLocation');
    select.innerHTML = '<option value="">Seçin...</option>';
    toSelect.innerHTML = '<option value="">Seçin...</option>';
    
    state.locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = `${loc.name} (${loc.type})`;
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

// Stock search
qs('#mvStockSKU').addEventListener('input', (e) => {
  const query = e.target.value.trim();
  const results = qs('#stockSearchResults');
  
  if (!query || query.length < 2) {
    results.style.display = 'none';
    return;
  }
  
  const matches = state.stocks.filter(s => {
    return matchesWildcard(s.name, query) || normalizeTRLower(s.sku).includes(normalizeTRLower(query));
  }).slice(0, 5);
  
  if (matches.length === 0) {
    results.style.display = 'none';
    state.selectedStock = null;
    return;
  }
  
  results.style.display = 'block';
  results.innerHTML = '';
  matches.forEach(stock => {
    const div = document.createElement('div');
    div.style.padding = '4px 8px';
    div.style.cursor = 'pointer';
    div.style.borderBottom = '1px solid #e5e7eb';
    div.textContent = `${stock.sku} - ${stock.name} (${stock.unit})`;
    div.addEventListener('click', () => {
      state.selectedStock = stock;
      qs('#mvStockSKU').value = stock.sku;
      qs('#mvUnit').value = stock.unit || 'ADT';
      results.style.display = 'none';
    });
    results.appendChild(div);
  });
});

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
  
  if (!state.selectedStock) {
    alert('Lütfen bir ürün seçin!');
    return;
  }
  
  const locationId = qs('#mvLocation').value;
  if (!locationId) {
    alert('Lütfen bir lokasyon seçin!');
    return;
  }
  
  const qty = parseFloat(qs('#mvQty').value);
  if (!qty || qty <= 0) {
    alert('Geçerli bir miktar girin!');
    return;
  }
  
  try {
    if (state.currentType === 'IN') {
      const unitCost = parseFloat(qs('#mvUnitCost').value) || 0;
      const extras = parseFloat(qs('#mvExtras').value) || 0;
      const allocatedExtras = allocateExtras(extras, qty);
      const finalUnitCost = unitCost + allocatedExtras;
      
      // Create movement
      await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId,
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
      
      // Update stock avgCost
      const stockDoc = await getDoc(doc(db, 'stocks', state.selectedStock.id));
      const stockData = stockDoc.data();
      const oldQty = 0; // TODO: implement stock_balances
      const oldAvg = stockData.avgCost || 0;
      const newAvg = weightedAvgCost(oldQty, oldAvg, qty, finalUnitCost);
      
      await updateDoc(doc(db, 'stocks', state.selectedStock.id), {
        avgCost: newAvg,
        lastPurchasePrice: unitCost,
        updatedAt: serverTimestamp()
      });
      
    } else if (state.currentType === 'OUT') {
      const refKind = qs('#mvRefKind').value;
      const refId = qs('#mvRefId').value;
      
      await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId,
        type: 'OUT',
        qty,
        unit: state.selectedStock.unit || 'ADT',
        unitCost: state.selectedStock.avgCost || 0,
        totalCost: (state.selectedStock.avgCost || 0) * qty,
        ref: { kind: refKind, id: refId },
        stockName: state.selectedStock.name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
    } else if (state.currentType === 'TRANSFER') {
      const toLocationId = qs('#mvToLocation').value;
      if (!toLocationId) {
        alert('Hedef lokasyon seçin!');
        return;
      }
      
      // OUT movement
      await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId,
        type: 'TRANSFER',
        qty,
        unit: state.selectedStock.unit || 'ADT',
        unitCost: state.selectedStock.avgCost || 0,
        totalCost: (state.selectedStock.avgCost || 0) * qty,
        ref: { kind: 'MANUAL', id: toLocationId },
        stockName: state.selectedStock.name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
    } else if (state.currentType === 'ADJUST') {
      await addDoc(collection(db, 'stock_movements'), {
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        locationId,
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
    }
    
    alert('Hareket kaydedildi!');
    
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
    alert('Hareket kaydedilemedi: ' + error.message);
  }
});

// Initialize
loadLocations();
loadStocks();
loadHistory();

