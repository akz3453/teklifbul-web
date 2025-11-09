import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, updateDoc, doc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const qs = s => document.querySelector(s);

const state = {
  stocks: [],
  filteredStocks: []
};

function renderTable() {
  const tbody = qs('#updateTable tbody');
  const table = qs('#updateTable');
  
  tbody.innerHTML = '';
  
  if (!state.filteredStocks.length) {
    table.style.display = 'none';
    qs('#updateInfo').textContent = 'Stok bulunamadı.';
    qs('#btnApply').disabled = true;
    return;
  }
  
  table.style.display = 'table';
  state.filteredStocks.forEach(stock => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${stock.sku}</td>
      <td>${stock.name}</td>
      <td>${stock.unit || 'ADT'}</td>
      <td>${stock.lastPurchasePrice || 0}</td>
      <td><input type="number" step="0.01" data-sku="${stock.sku}" data-field="lastPurchasePrice" value="${stock.lastPurchasePrice || 0}" /></td>
      <td>${stock.salePrice || 0}</td>
      <td><input type="number" step="0.01" data-sku="${stock.sku}" data-field="salePrice" value="${stock.salePrice || 0}" /></td>
    `;
    tbody.appendChild(tr);
  });
  
  qs('#updateInfo').textContent = `${state.filteredStocks.length} ürün yüklendi.`;
  qs('#btnApply').disabled = false;
}

async function loadStocks() {
  const user = await requireAuth();
  
  try {
    const code1 = qs('#filterCode').value.trim();
    const brand = qs('#filterBrand').value.trim();
    const unit = qs('#filterUnit').value;
    
    let q = collection(db, 'stocks');
    let constraints = [];
    
    if (code1) {
      constraints.push(where('customCodes.code1', '==', code1));
    }
    
    const snap = await getDocs(constraints.length ? query(q, ...constraints) : q);
    state.stocks = [];
    
    snap.forEach(doc => {
      const data = doc.data();
      if (brand && data.brand !== brand) return;
      if (unit && data.unit !== unit) return;
      
      state.stocks.push({ id: doc.id, ...data });
    });
    
    state.filteredStocks = [...state.stocks];
    renderTable();
    
    // Download Excel
    if (state.filteredStocks.length > 0) {
      downloadExcel();
    }
    
  } catch (error) {
    console.error('Load error:', error);
    alert('Stoklar yüklenemedi: ' + error.message);
  }
}

function downloadExcel() {
  const rows = state.filteredStocks.map(s => ({
    'Stok Kodu': s.sku,
    'Ürün Adı': s.name,
    'Birim': s.unit || 'ADT',
    'Eski Alım Fiyatı': s.lastPurchasePrice || 0,
    'Yeni Alım Fiyatı': s.lastPurchasePrice || 0,
    'Eski Satış Fiyatı': s.salePrice || 0,
    'Yeni Satış Fiyatı': s.salePrice || 0
  }));
  
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fiyatlar');
  XLSX.writeFile(wb, `fiyat-guncelleme-${Date.now()}.xlsx`);
}

async function applyUpdates() {
  const user = await requireAuth();
  
  const inputs = qs('#updateTable tbody').querySelectorAll('input[type=number]');
  const updates = {};
  
  inputs.forEach(input => {
    const sku = input.dataset.sku;
    const field = input.dataset.field;
    const newValue = parseFloat(input.value) || 0;
    
    if (!updates[sku]) {
      updates[sku] = {};
    }
    updates[sku][field] = newValue;
  });
  
  if (!Object.keys(updates).length) {
    alert('Güncelleme yapılacak değişiklik yok!');
    return;
  }
  
  if (!confirm(`${Object.keys(updates).length} ürün güncellenecek. Devam edilsin mi?`)) {
    return;
  }
  
  qs('#btnApply').disabled = true;
  qs('#btnApply').textContent = 'Güncelleniyor...';
  
  let success = 0;
  let errors = 0;
  
  for (const sku in updates) {
    try {
      const stock = state.stocks.find(s => s.sku === sku);
      if (!stock) continue;
      
      await updateDoc(doc(db, 'stocks', stock.id), {
        ...updates[sku],
        updatedAt: serverTimestamp()
      });
      success++;
    } catch (error) {
      console.error('Update error:', sku, error);
      errors++;
    }
  }
  
  // Log price update
  await addDoc(collection(db, 'price_updates'), {
    fileName: `fiyat-guncelleme-${Date.now()}.xlsx`,
    appliedBy: user.uid,
    appliedAt: serverTimestamp(),
    totalUpdated: success,
    rules: { code: qs('#filterCode').value, brand: qs('#filterBrand').value, unit: qs('#filterUnit').value }
  });
  
  alert(`Güncelleme tamamlandı!\nBaşarılı: ${success}\nHata: ${errors}`);
  
  qs('#btnApply').textContent = 'Güncelle';
  qs('#btnApply').disabled = false;
  
  await loadStocks();
}

qs('#btnLoad').addEventListener('click', loadStocks);
qs('#btnApply').addEventListener('click', applyUpdates);

