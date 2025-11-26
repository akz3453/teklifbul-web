/**
 * Stok Listesi UI
 * Teklifbul Rule v1.0 - Tüm stokları listeleyen sayfa
 */

import { db, requireAuth } from '/firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { toast } from '../src/shared/ui/toast.js';

const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

const state = {
  allStocks: [],
  filteredStocks: [],
  displayedStocks: [],
  currentPage: 1,
  pageSize: 50,
  searchQuery: '',
  filters: {
    brand: '',
    unit: '',
    archived: 'active'
  }
};

// Initialize
(async () => {
  try {
    await requireAuth();
    await loadStocks();
    setupEventListeners();
    applyFilters();
  } catch (error) {
    console.error('Initialization error:', error);
    toast.error('Sayfa yüklenemedi: ' + error.message);
  }
})();

async function loadStocks() {
  try {
    toast.info('Stoklar yükleniyor...');
    const snap = await getDocs(collection(db, 'stocks'));
    state.allStocks = [];
    
    console.log('📦 Firestore\'dan stoklar yükleniyor...');
    let count = 0;
    snap.forEach(doc => {
      const data = doc.data();
      state.allStocks.push({ id: doc.id, ...data });
      count++;
    });
    
    console.log(`✅ ${count} stok yüklendi`, state.allStocks.slice(0, 3)); // İlk 3 örnek
    
    if (state.allStocks.length === 0) {
      toast.warn('Hiç stok bulunamadı. Stok içe aktarma sayfasından stok ekleyebilirsiniz.');
    } else {
      toast.success(`${state.allStocks.length} stok yüklendi`);
    }
    
    applyFilters();
  } catch (error) {
    console.error('❌ Stocks load error:', error);
    toast.error('Stoklar yüklenemedi: ' + error.message);
  }
}

function setupEventListeners() {
  // Arama input
  const searchInput = qs('#searchInput');
  let searchTimeout = null;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      applyFilters();
    }, 300); // Debounce
  });

  // F6 ile tüm listeyi göster
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'F6') {
      e.preventDefault();
      // Arama yapmadan tüm listeyi göster
      state.searchQuery = '';
      searchInput.value = '';
      applyFilters();
    }
  });

  // Filtreler
  qs('#filterBrand').addEventListener('input', (e) => {
    state.filters.brand = e.target.value.trim().toLowerCase();
    applyFilters();
  });

  qs('#filterUnit').addEventListener('change', (e) => {
    state.filters.unit = e.target.value;
    applyFilters();
  });

  qs('#filterArchived').addEventListener('change', (e) => {
    state.filters.archived = e.target.value;
    applyFilters();
  });

  // Butonlar
  qs('#btnRefresh').addEventListener('click', async () => {
    await loadStocks();
  });

  qs('#btnExport').addEventListener('click', () => {
    exportToExcel();
  });

  // Pagination
  qs('#btnPrev').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderTable();
    }
  });

  qs('#btnNext').addEventListener('click', () => {
    const maxPage = Math.ceil(state.filteredStocks.length / state.pageSize);
    if (state.currentPage < maxPage) {
      state.currentPage++;
      renderTable();
    }
  });
}

function applyFilters() {
  let filtered = [...state.allStocks];

  // Arşivlenmiş filtreleme
  if (state.filters.archived === 'active') {
    filtered = filtered.filter(s => !s.archived && !s.merged);
  } else if (state.filters.archived === 'archived') {
    filtered = filtered.filter(s => s.archived || s.merged);
  }
  // 'all' için filtreleme yok

  // Marka filtreleme
  if (state.filters.brand) {
    const brandNorm = state.filters.brand.toLowerCase();
    filtered = filtered.filter(s => {
      const stockBrand = (s.brand || '').toLowerCase();
      return stockBrand.includes(brandNorm);
    });
  }

  // Birim filtreleme
  if (state.filters.unit) {
    filtered = filtered.filter(s => s.unit === state.filters.unit);
  }

  // Arama filtreleme
  if (state.searchQuery) {
    filtered = searchStocks(filtered, state.searchQuery, 1000);
  }

  state.filteredStocks = filtered;
  state.currentPage = 1; // Reset to first page
  renderTable();
  updateStats();
}

function renderTable() {
  const tbody = qs('#stocksTableBody');
  const pagination = qs('#pagination');
  
  if (state.filteredStocks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:40px;color:#6b7280">
          ${state.searchQuery || Object.values(state.filters).some(f => f) ? 'Sonuç bulunamadı' : 'Henüz stok yok'}
        </td>
      </tr>
    `;
    pagination.style.display = 'none';
    return;
  }

  // Pagination
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = startIndex + state.pageSize;
  state.displayedStocks = state.filteredStocks.slice(startIndex, endIndex);

  tbody.innerHTML = state.displayedStocks.map(stock => {
    const isArchived = stock.archived || stock.merged;
    return `
      <tr>
        <td class="stock-sku">${escapeHtml(stock.sku || '-')}</td>
        <td class="stock-name">${escapeHtml(stock.name || '-')}</td>
        <td>${escapeHtml(stock.brand || '-')}</td>
        <td>${escapeHtml(stock.model || '-')}</td>
        <td>${escapeHtml(stock.unit || 'ADT')}</td>
        <td>${formatCurrency(stock.avgCost)}</td>
        <td>${formatCurrency(stock.salePrice)}</td>
        <td>
          <span class="badge ${isArchived ? 'badge-archived' : 'badge-active'}">
            ${isArchived ? 'Arşivlenmiş' : 'Aktif'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Pagination controls
  const maxPage = Math.ceil(state.filteredStocks.length / state.pageSize);
  if (maxPage > 1) {
    pagination.style.display = 'flex';
    qs('#paginationInfo').textContent = `Sayfa ${state.currentPage} / ${maxPage} (Toplam ${state.filteredStocks.length} stok)`;
    qs('#btnPrev').disabled = state.currentPage === 1;
    qs('#btnNext').disabled = state.currentPage === maxPage;
  } else {
    pagination.style.display = 'none';
  }
}

function updateStats() {
  const total = state.allStocks.length;
  const shown = state.filteredStocks.length;
  const active = state.allStocks.filter(s => !s.archived && !s.merged).length;

  qs('#statTotal').textContent = total.toLocaleString('tr-TR');
  qs('#statShown').textContent = shown.toLocaleString('tr-TR');
  qs('#statActive').textContent = active.toLocaleString('tr-TR');
}

function exportToExcel() {
  if (state.filteredStocks.length === 0) {
    toast.error('Dışa aktarılacak stok yok');
    return;
  }

  try {
    // CSV formatında export
    const headers = ['SKU', 'Ürün Adı', 'Marka', 'Model', 'Birim', 'Ort. Maliyet', 'Satış Fiyatı', 'Durum'];
    const rows = state.filteredStocks.map(stock => {
      const isArchived = stock.archived || stock.merged;
      return [
        stock.sku || '',
        stock.name || '',
        stock.brand || '',
        stock.model || '',
        stock.unit || 'ADT',
        stock.avgCost || 0,
        stock.salePrice || 0,
        isArchived ? 'Arşivlenmiş' : 'Aktif'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // BOM ekle (Excel için UTF-8 desteği)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `stok-listesi-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`${state.filteredStocks.length} stok Excel'e aktarıldı`);
  } catch (error) {
    console.error('Export error:', error);
    toast.error('Dışa aktarma hatası: ' + error.message);
  }
}

function formatCurrency(value) {
  if (!value && value !== 0) return '-';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

