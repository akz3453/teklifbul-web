import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const qs = s => document.querySelector(s);

const state = {
  stocks: [],
  movements: [],
  locations: []
};

// Tab switching
qs('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  
  qs('.tab.active').classList.remove('active');
  tab.classList.add('active');
  
  const panelName = tab.dataset.tab + 'Panel';
  document.querySelectorAll('[id$="Panel"]').forEach(p => p.classList.add('hidden'));
  qs('#' + panelName).classList.remove('hidden');
  
  // Load report data
  if (tab.dataset.tab === 'minstock') loadMinStockReport();
  else if (tab.dataset.tab === 'costsale') loadCostSaleReport();
  else if (tab.dataset.tab === 'location') loadLocationReport();
  else if (tab.dataset.tab === 'cost') loadCostReport();
});

async function loadInitialData() {
  try {
    const stocksSnap = await getDocs(collection(db, 'stocks'));
    state.stocks = [];
    stocksSnap.forEach(doc => {
      state.stocks.push({ id: doc.id, ...doc.data() });
    });
    
    const movementsSnap = await getDocs(query(
      collection(db, 'stock_movements'),
      orderBy('createdAt', 'desc')
    ));
    state.movements = [];
    movementsSnap.forEach(doc => {
      state.movements.push({ id: doc.id, ...doc.data() });
    });
    
    const locsSnap = await getDocs(collection(db, 'stock_locations'));
    state.locations = [];
    locsSnap.forEach(doc => {
      state.locations.push({ id: doc.id, ...doc.data() });
    });
    
    // Load first report
    loadMinStockReport();
    
  } catch (error) {
    console.error('Initial load error:', error);
  }
}

async function loadMinStockReport() {
  // Filter stocks below minimum threshold
  const minThreshold = 10; // TODO: add to stock data
  const lowStocks = state.stocks.filter(s => {
    const current = 0; // TODO: calculate from movements
    return current < minThreshold;
  });
  
  const stats = qs('#minstockStats');
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${lowStocks.length}</div>
      <div class="stat-label">Düşük Stok</div>
    </div>
  `;
  
  const tbody = qs('#minstockTable tbody');
  tbody.innerHTML = '';
  
  if (!lowStocks.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280">Düşük stok bulunamadı.</td></tr>';
    return;
  }
  
  lowStocks.forEach(stock => {
    const tr = document.createElement('tr');
    const current = 0; // TODO: calculate
    tr.innerHTML = `
      <td>${stock.sku}</td>
      <td>${stock.name}</td>
      <td>${stock.brand || '-'}</td>
      <td>${stock.unit || 'ADT'}</td>
      <td>${current}</td>
      <td>${minThreshold}</td>
      <td><span class="badge b-error">⚠️ Düşük</span></td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadCostSaleReport() {
  const belowCost = state.movements.filter(m => {
    if (m.type !== 'OUT') return false;
    const stock = state.stocks.find(s => s.id === m.stockId);
    if (!stock) return false;
    return stock.avgCost > 0 && m.unitCost > 0 && m.unitCost < stock.avgCost;
  });
  
  const stats = qs('#costsaleStats');
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${belowCost.length}</div>
      <div class="stat-label">Maliyet Altı</div>
    </div>
  `;
  
  const tbody = qs('#costsaleTable tbody');
  tbody.innerHTML = '';
  
  if (!belowCost.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280">Maliyet altı satış bulunamadı.</td></tr>';
    return;
  }
  
  belowCost.forEach(mv => {
    const stock = state.stocks.find(s => s.id === mv.stockId);
    const date = mv.createdAt ? new Date(mv.createdAt.toDate()).toLocaleDateString('tr-TR') : '-';
    const diff = (stock?.avgCost || 0) - (mv.unitCost || 0);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${date}</td>
      <td>${mv.sku}</td>
      <td>${stock?.name || '-'}</td>
      <td>${mv.qty}</td>
      <td>${stock?.avgCost?.toFixed(2) || 0}</td>
      <td>${mv.unitCost?.toFixed(2) || 0}</td>
      <td>${diff.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadLocationReport() {
  const select = qs('#locationFilter');
  select.innerHTML = '<option value="">Tüm Lokasyonlar</option>';
  state.locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = `${loc.name} (${loc.type})`;
    select.appendChild(opt);
  });
  
  select.addEventListener('change', () => {
    const locationId = select.value;
    renderLocationTable(locationId);
  });
  
  renderLocationTable('');
}

function renderLocationTable(locationId) {
  const stats = qs('#locationStats');
  let filteredMovements = state.movements;
  
  if (locationId) {
    filteredMovements = state.movements.filter(m => m.locationId === locationId);
  }
  
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${filteredMovements.length}</div>
      <div class="stat-label">Toplam Hareket</div>
    </div>
  `;
  
  const tbody = qs('#locationTable tbody');
  tbody.innerHTML = '';
  
  // TODO: aggregate by stock and location
  if (!filteredMovements.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7280">Veri bulunamadı.</td></tr>';
    return;
  }
  
  filteredMovements.slice(0, 50).forEach(mv => {
    const stock = state.stocks.find(s => s.id === mv.stockId);
    const loc = state.locations.find(l => l.id === mv.locationId);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${mv.sku}</td>
      <td>${stock?.name || '-'}</td>
      <td>${loc?.name || '-'}</td>
      <td>${mv.qty}</td>
      <td>${mv.unit || 'ADT'}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadCostReport() {
  const inMovements = state.movements.filter(m => m.type === 'IN');
  
  const stats = qs('#costStats');
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${inMovements.length}</div>
      <div class="stat-label">Giriş Hareketi</div>
    </div>
  `;
  
  const tbody = qs('#costTable tbody');
  tbody.innerHTML = '';
  
  if (!inMovements.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#6b7280">Giriş hareketi bulunamadı.</td></tr>';
    return;
  }
  
  inMovements.slice(0, 50).forEach(mv => {
    const stock = state.stocks.find(s => s.id === mv.stockId);
    const date = mv.createdAt ? new Date(mv.createdAt.toDate()).toLocaleDateString('tr-TR') : '-';
    const extras = mv.extras?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${date}</td>
      <td>${mv.sku}</td>
      <td>${stock?.name || '-'}</td>
      <td>📥 Giriş</td>
      <td>${mv.qty}</td>
      <td>${mv.unitCost?.toFixed(2) || 0}</td>
      <td>${extras.toFixed(2)}</td>
      <td>${mv.totalCost?.toFixed(2) || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Initialize
await requireAuth();
loadInitialData();

