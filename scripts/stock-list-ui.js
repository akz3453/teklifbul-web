/**
 * Stok Listesi UI
 * Teklifbul Rule v1.0 - Tüm stokları listeleyen sayfa
 */

// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, doc as docFn, getDoc, orderBy, updateDoc, setDoc, serverTimestamp, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getStockPerms } from '../assets/js/state/permissions.js';
import { debounce } from '../assets/js/utils/debounce.js';

const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

const state = {
  allStocks: [],
  filteredStocks: [],
  displayedStocks: [],
  currentPage: 1,
  pageSize: 50,
  searchQuery: '',
  locations: [], // Teklifbul Rule v1.0 - Lokasyon listesi
  balances: [], // Teklifbul Rule v1.0 - Tüm balance'lar (lokasyon bazlı filtreleme için)
  filters: {
    locationId: '', // Teklifbul Rule v1.0 - Lokasyon filtresi
    brand: '',
    unit: '',
    archived: 'active'
  }
};

let companyContext = null;

const STOCK_PERMS = getStockPerms();

// Initialize
(async () => {
  try {
    companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.warn('Stock list: company context alınamadı, sayfa başlatılmıyor', { companyContext });
      toast.error(
        (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. Stok listesi yüklenemedi.'
      );
      return;
    }

    // Teklifbul Rule v1.0 - Permission Pilot: Stok Listesi
    // URL guard: stok.view yetkisi yoksa sayfayı kapat
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Stock list: initPermissions sonuç vermedi, sayfa başlatılmıyor');
      return;
    }

    if (STOCK_PERMS.view && !can(STOCK_PERMS.view)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_VIEW ||
        MESSAGES.ERROR_PERMISSION_DENIED ||
        'Stok modülünü görüntüleme yetkiniz yok.';
      toast.error(msg);
      logger.warn('Stock list: view yetkisi yok, URL guard tetiklendi', {
        permKey: STOCK_PERMS.view,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });
      window.location.href = '/dashboard.html';
      return;
    }

    await loadLocations(companyContext);
    await loadStocks(companyContext);
    setupEventListeners();
    applyFilters();
  } catch (error) {
    logger.error('Initialization error', error);
    toast.error(`${MESSAGES.ERROR_STOCK_LIST_LOAD}: ${error.message}`);
  }
})();

async function loadStocks(context) {
  try {
    // Query guard - view yetkisi yoksa Firestore sorgularını hiç çalıştırma
    if (STOCK_PERMS.view && !can(STOCK_PERMS.view)) {
      logger.warn('Stock list: view yetkisi olmadan loadStocks çağrıldı, sorgular iptal edildi');
      return;
    }

    toast.info(MESSAGES.INFO_STOCK_LOADING);
    const ctx = context || companyContext;
    const companyId = ctx?.companyId || null;
    
    if (!companyId) {
      logger.error('Stock list: companyId bulunamadı, stoklar yüklenemiyor');
      toast.error('Şirket bilgisi bulunamadı. Stoklar yüklenemedi.');
      return;
    }
    
    // Teklifbul Rule v1.0 - Firestore limit() zorunlu + companyId filtresi
    const stocksQuery = query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      limit(10000) // Stok listesi için makul limit
    );
    const snap = await getDocs(stocksQuery);
    state.allStocks = [];
    
    logger.info('Firestore\'dan stoklar yükleniyor');
    let count = 0;
    snap.forEach(doc => {
      const data = doc.data();
      state.allStocks.push({ id: doc.id, ...data, totalQuantity: 0 }); // Miktar başlangıçta 0
      count++;
    });
    
    logger.info(`${count} stok yüklendi`, state.allStocks.slice(0, 3)); // İlk 3 örnek
    
    // Teklifbul Rule v1.0 - Her stok için miktarı hesapla (stock_balances'den)
    // Lokasyon bazlı filtreleme için tüm balance'ları sakla
    if (companyId && state.allStocks.length > 0) {
      logger.info('Stok miktarları yükleniyor...');
      // Teklifbul Rule v1.0 - Firestore limit() zorunlu + companyId filtresi
      const balancesQuery = query(
        collection(db, 'stock_balances'),
        where('companyId', '==', companyId),
        limit(10000) // Stok bakiyeleri için makul limit
      );
      const balancesSnap = await getDocs(balancesQuery);
      state.balances = [];
      const balancesBySku = new Map(); // Tüm lokasyonların toplamı için
      
      balancesSnap.forEach(balanceDoc => {
        const balanceData = balanceDoc.data();
        if (balanceData.companyId === companyId && balanceData.sku) {
          // Tüm balance'ları sakla (lokasyon bazlı filtreleme için)
          // Teklifbul Rule v1.0 - Min/Max stok seviyeleri de saklanıyor
          state.balances.push({
            sku: balanceData.sku,
            locationId: balanceData.locationId,
            quantity: balanceData.quantity || 0,
            minStockLevel: balanceData.minStockLevel || null,
            maxStockLevel: balanceData.maxStockLevel || null
          });
          
          // Toplam miktar hesaplama (tüm lokasyonlar)
          const currentQty = balancesBySku.get(balanceData.sku) || 0;
          balancesBySku.set(balanceData.sku, currentQty + (balanceData.quantity || 0));
        }
      });
      
      // Stoklara toplam miktar bilgisini ekle (tüm lokasyonlar)
      state.allStocks.forEach(stock => {
        stock.totalQuantity = balancesBySku.get(stock.sku) || 0;
      });
      
      // Teklifbul Rule v1.0 - Şirket ayarını kontrol et ve görüntüleme miktarlarını düzenle
      const companyDoc = await getDoc(docFn(db, 'companies', companyId));
      let allowNegativeStock = false;
      if (companyDoc.exists()) {
        const companyData = companyDoc.data();
        allowNegativeStock = companyData.allowNegativeStock === true;
        // companyContext'e kaydet (updateQuantitiesByLocation için)
        if (companyContext) {
          companyContext.allowNegativeStock = allowNegativeStock;
        }
      }
      
      state.allStocks.forEach(stock => {
        // Ham değer (işlemler için)
        const rawQuantity = stock.totalQuantity || 0;
        // Görüntüleme için (ayara göre düzenlenmiş)
        if (!allowNegativeStock && rawQuantity < 0) {
          stock.displayQuantity = 0;
        } else {
          stock.displayQuantity = rawQuantity;
        }
      });
      
      logger.info('Stok miktarları yüklendi', { 
        totalStocks: state.allStocks.length,
        stocksWithQuantity: Array.from(balancesBySku.keys()).length,
        totalBalances: state.balances.length
      });
      
      // Lokasyon filtresi varsa miktarları güncelle (varsayılan: tüm lokasyonlar)
      updateQuantitiesByLocation();
    } else {
      // CompanyId yoksa, tüm stoklar için displayQuantity = totalQuantity
      state.allStocks.forEach(stock => {
        stock.displayQuantity = stock.totalQuantity || 0;
      });
    }
    
    // Lokasyon filtresi varsa miktarları güncelle (varsayılan: tüm lokasyonlar)
    await updateQuantitiesByLocation();
    
    if (state.allStocks.length === 0) {
      toast.warn(MESSAGES.WARN_STOCK_EMPTY);
    } else {
      toast.success(`${state.allStocks.length} stok yüklendi`);
    }
    
    applyFilters();
  } catch (error) {
    logger.error('Stocks load error', error);
    toast.error(`${MESSAGES.ERROR_STOCK_EXPORT}: ${error.message}`);
  }
}

// Load locations
async function loadLocations(context) {
  try {
    const ctx = context || companyContext;
    const companyId = ctx?.companyId || null;
    if (!companyId) return;
    
    const locationsRef = collection(db, 'stock_locations');
    const locationsQuery = query(
      locationsRef,
      where('companyId', '==', companyId),
      orderBy('name'),
      limit(1000) // Teklifbul Rule v1.0 - Limit eklendi
    );
    const snap = await getDocs(locationsQuery);
    
    state.locations = [];
    snap.forEach(doc => {
      state.locations.push({ id: doc.id, ...doc.data() });
    });
    
    // Populate location filter dropdown
    const locationSelect = qs('#filterLocation');
    if (locationSelect) {
      // Keep "Tümü" option
      const allOption = locationSelect.querySelector('option[value=""]');
      locationSelect.innerHTML = '';
      if (allOption) {
        locationSelect.appendChild(allOption);
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Tümü (Tüm Lokasyonlar)';
        locationSelect.appendChild(opt);
      }
      
      // Add locations
      state.locations.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc.id;
        const typeLabel = loc.type === 'SITE' ? 'Şantiye' : loc.type === 'DEPOT' ? 'Depo' : 'Lokasyon';
        opt.textContent = `${loc.name} (${typeLabel})`;
        locationSelect.appendChild(opt);
      });
    }
    
    logger.info('Lokasyonlar yüklendi', { count: state.locations.length });
  } catch (error) {
    logger.error('Locations load error', error);
  }
}

// Update quantities based on selected location
async function updateQuantitiesByLocation() {
  const locationId = state.filters.locationId;
  const companyId = companyContext?.companyId;
  
  if (!companyId) return;
  
  // Şirket ayarını kontrol et
  let allowNegativeStock = false;
  try {
    const companyDoc = await getDoc(docFn(db, 'companies', companyId));
    if (companyDoc.exists()) {
      allowNegativeStock = companyDoc.data().allowNegativeStock === true;
      if (companyContext) {
        companyContext.allowNegativeStock = allowNegativeStock;
      }
    }
  } catch (error) {
    logger.warn('Company doc read error in updateQuantitiesByLocation', error);
  }
  
  if (!locationId) {
    // Tüm lokasyonlar - toplam miktar (mevcut davranış)
    // Teklifbul Rule v1.0 - Tüm lokasyonlar seçiliyse min/max gösterilmez (lokasyon bazlı olduğu için)
    state.allStocks.forEach(stock => {
      const rawQuantity = stock.totalQuantity || 0;
      if (!allowNegativeStock && rawQuantity < 0) {
        stock.displayQuantity = 0;
      } else {
        stock.displayQuantity = rawQuantity;
      }
      stock.displayMinStock = null;
      stock.displayMaxStock = null;
      stock.currentLocationId = null;
    });
    return;
  }
  
  // Seçili lokasyon - sadece o lokasyondaki miktar ve min/max seviyeleri
  const balancesBySku = new Map();
  state.balances.forEach(balance => {
    if (balance.locationId === locationId && balance.sku) {
      const current = balancesBySku.get(balance.sku) || { quantity: 0, minStockLevel: null, maxStockLevel: null };
      balancesBySku.set(balance.sku, {
        quantity: current.quantity + (balance.quantity || 0),
        minStockLevel: balance.minStockLevel !== null && balance.minStockLevel !== undefined ? balance.minStockLevel : current.minStockLevel,
        maxStockLevel: balance.maxStockLevel !== null && balance.maxStockLevel !== undefined ? balance.maxStockLevel : current.maxStockLevel
      });
    }
  });
  
  state.allStocks.forEach(stock => {
    const locationData = balancesBySku.get(stock.sku) || { quantity: 0, minStockLevel: null, maxStockLevel: null };
    const rawQuantity = locationData.quantity;
    
    if (!allowNegativeStock && rawQuantity < 0) {
      stock.displayQuantity = 0;
    } else {
      stock.displayQuantity = rawQuantity;
    }
    
    // Teklifbul Rule v1.0 - Lokasyon bazlı min/max seviyeleri, yoksa global stok kartındaki değerler
    stock.displayMinStock = (locationData.minStockLevel !== null && locationData.minStockLevel !== undefined) ? locationData.minStockLevel : (stock.minStockLevel || null);
    stock.displayMaxStock = (locationData.maxStockLevel !== null && locationData.maxStockLevel !== undefined) ? locationData.maxStockLevel : (stock.maxCapacity || null);
    stock.currentLocationId = locationId; // Düzenleme için lokasyon ID'sini sakla
  });
}

function setupEventListeners() {
  // Arama input
  const searchInput = qs('#searchInput');
  
  // Teklifbul Rule v1.0 - Debounce ile arama optimizasyonu
  const debouncedSearch = debounce((query) => {
    state.searchQuery = query.trim();
    applyFilters();
  }, 300);
  
  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
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
  qs('#filterLocation').addEventListener('change', async (e) => {
    state.filters.locationId = e.target.value;
    await updateQuantitiesByLocation();
    applyFilters();
  });
  
  // Teklifbul Rule v1.0 - Debounce ile marka filtresi optimizasyonu
  const debouncedBrandFilter = debounce((brand) => {
    state.filters.brand = brand.trim().toLowerCase();
    applyFilters();
  }, 300);
  
  qs('#filterBrand').addEventListener('input', (e) => {
    debouncedBrandFilter(e.target.value);
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
  
  // Teklifbul Rule v1.0 - Min/Max stok düzenleme event listener'larını başlat
  setupMinMaxStockEditors();
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
  
  if (!tbody) {
    logger.error('stocksTableBody bulunamadı, render edilemiyor');
    return;
  }
  
  if (!pagination) {
    logger.warn('pagination bulunamadı');
  }
  
  if (state.filteredStocks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;padding:40px;color:#6b7280">
          ${state.searchQuery || Object.values(state.filters).some(f => f) ? 'Sonuç bulunamadı' : 'Henüz stok yok'}
        </td>
      </tr>
    `;
    if (pagination) {
      pagination.style.display = 'none';
    }
    return;
  }

  // Pagination
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = startIndex + state.pageSize;
  state.displayedStocks = state.filteredStocks.slice(startIndex, endIndex);

  // Teklifbul Rule v1.0 - XSS Protection
  const stocksHTML = state.displayedStocks.map(stock => {
    const isArchived = stock.archived || stock.merged;
    // Teklifbul Rule v1.0 - Görüntüleme miktarını kullan (ayara göre düzenlenmiş)
    const quantity = stock.displayQuantity !== undefined ? stock.displayQuantity : (stock.totalQuantity || 0);
    const unit = stock.unit || 'ADT';
    const locationId = stock.currentLocationId || state.filters.locationId;
    const minStock = stock.displayMinStock !== null && stock.displayMinStock !== undefined ? stock.displayMinStock : null;
    const maxStock = stock.displayMaxStock !== null && stock.displayMaxStock !== undefined ? stock.displayMaxStock : null;
    
    // Teklifbul Rule v1.0 - Min/Max stok seviyeleri sadece lokasyon seçiliyse gösterilir
    const showMinMax = !!locationId;
    
    // Miktar durumuna göre renk
    let quantityColor = '#2563eb';
    let minStockBadge = '';
    if (showMinMax && minStock !== null) {
      if (quantity < minStock) {
        quantityColor = '#ef4444';
        minStockBadge = '<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:10px;margin-left:4px">⚠️ Min Altı</span>';
      } else if (maxStock !== null && quantity > maxStock) {
        quantityColor = '#f59e0b';
        minStockBadge = '<span class="badge" style="background:#fef3c7;color:#92400e;font-size:10px;margin-left:4px">⚠️ Max Üstü</span>';
      }
    }
    
    return `
      <tr data-sku="${escapeHtml(stock.sku || '')}" data-location-id="${locationId || ''}">
        <td class="stock-sku">${escapeHtml(stock.sku || '-')}</td>
        <td class="stock-name">${escapeHtml(stock.name || '-')}</td>
        <td style="font-family:monospace;font-size:12px;color:#6b7280">${escapeHtml(stock.barcode || '-')}</td>
        <td>${escapeHtml(stock.brand || '-')}</td>
        <td>${escapeHtml(stock.model || '-')}</td>
        <td>${escapeHtml(unit)}</td>
        <td class="editable-vat-rate" data-stock-id="${escapeHtml(stock.id || '')}" contenteditable="true" style="cursor:pointer;padding:4px 8px;border:1px dashed transparent;border-radius:4px;min-width:50px;text-align:center" title="Düzenlemek için tıklayın">
          ${stock.vatRate !== null && stock.vatRate !== undefined ? stock.vatRate : '20'}%
        </td>
        <td style="font-weight:600;color:${quantityColor}">
          ${formatNumber(quantity)} ${unit}
          ${minStockBadge}
        </td>
        <td class="editable-min-stock" data-sku="${escapeHtml(stock.sku || '')}" data-location-id="${locationId || ''}" ${showMinMax ? 'contenteditable="true"' : ''} style="${showMinMax ? 'cursor:pointer;padding:4px 8px;border:1px dashed transparent;border-radius:4px;min-width:60px;text-align:center' : ''}" title="${showMinMax ? 'Düzenlemek için tıklayın. Silmek için boş bırakın.' : 'Lokasyon seçin'}">
          ${showMinMax ? (minStock !== null && minStock !== undefined ? formatNumber(minStock) : '-') : '-'}
        </td>
        <td class="editable-max-stock" data-sku="${escapeHtml(stock.sku || '')}" data-location-id="${locationId || ''}" ${showMinMax ? 'contenteditable="true"' : ''} style="${showMinMax ? 'cursor:pointer;padding:4px 8px;border:1px dashed transparent;border-radius:4px;min-width:60px;text-align:center' : ''}" title="${showMinMax ? 'Düzenlemek için tıklayın. Silmek için boş bırakın.' : 'Lokasyon seçin'}">
          ${showMinMax ? (maxStock !== null && maxStock !== undefined ? formatNumber(maxStock) : '-') : '-'}
        </td>
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
  
  // Teklifbul Rule v1.0 - Render stocks to table
  if (tbody) {
    tbody.innerHTML = stocksHTML;
  } else {
    logger.error('stocksTableBody bulunamadı');
  }
  
  // Teklifbul Rule v1.0 - Min/Max stok düzenleme event listener'ları
  // setupMinMaxStockEditors() artık setupEventListeners() içinde çağrılıyor
  // Event delegation kullanıldığı için her render'da çağrılmasına gerek yok

  // Pagination controls
  if (pagination) {
    const maxPage = Math.ceil(state.filteredStocks.length / state.pageSize);
    if (maxPage > 1) {
      pagination.style.display = 'flex';
      const paginationInfo = qs('#paginationInfo');
      const btnPrev = qs('#btnPrev');
      const btnNext = qs('#btnNext');
      if (paginationInfo) {
        paginationInfo.innerHTML = `<span>Sayfa ${state.currentPage}</span><span style="color:#cbd5e1">|</span><span style="font-weight:400;color:#64748b;font-size:12px">Toplam: ${state.filteredStocks.length}</span>`;
      }
      if (btnPrev) {
        btnPrev.disabled = state.currentPage === 1;
      }
      if (btnNext) {
        btnNext.disabled = state.currentPage === maxPage;
      }
    } else {
      pagination.style.display = 'none';
    }
  }
}

function updateStats() {
  const total = state.allStocks.length;
  const shown = state.filteredStocks.length;
  const active = state.allStocks.filter(s => !s.archived && !s.merged).length;
  
  // Teklifbul Rule v1.0 - Lokasyon filtresi varsa bilgi göster
  const locationId = state.filters.locationId;
  const location = locationId ? state.locations.find(l => l.id === locationId) : null;
  const locationName = location ? location.name : null;

  qs('#statTotal').textContent = total.toLocaleString('tr-TR');
  qs('#statShown').textContent = shown.toLocaleString('tr-TR');
  qs('#statActive').textContent = active.toLocaleString('tr-TR');
  
  // Lokasyon bilgisi göster (eğer filtre aktifse)
  const statsDiv = qs('#stats');
  if (statsDiv && locationName) {
    let locationInfo = statsDiv.querySelector('.location-info');
    if (!locationInfo) {
      locationInfo = document.createElement('div');
      locationInfo.className = 'location-info';
      locationInfo.style.cssText = 'grid-column:1/-1;padding:8px;background:#f0f9ff;border-radius:4px;font-size:12px;color:#0369a1;margin-top:8px';
      statsDiv.appendChild(locationInfo);
    }
    locationInfo.textContent = `📍 Filtre: ${locationName} - Sadece bu lokasyondaki miktarlar gösteriliyor`;
  } else if (statsDiv) {
    const locationInfo = statsDiv.querySelector('.location-info');
    if (locationInfo) {
      locationInfo.remove();
    }
  }
}

function exportToExcel() {
  if (state.filteredStocks.length === 0) {
    toast.error(MESSAGES.ERROR_STOCK_EXPORT_EMPTY);
    return;
  }

  try {
    // CSV formatında export
    // Teklifbul Rule v1.0 - Min/Max stok alanları export'a eklendi
    const locationId = state.filters.locationId;
    const showMinMax = !!locationId;
    const headers = showMinMax 
      ? ['SKU', 'Ürün Adı', 'Barkod', 'Marka', 'Model', 'Birim', 'KDV %', 'Miktar', 'Min Stok', 'Max Stok', 'Ort. Maliyet', 'Satış Fiyatı', 'Durum']
      : ['SKU', 'Ürün Adı', 'Barkod', 'Marka', 'Model', 'Birim', 'KDV %', 'Miktar', 'Ort. Maliyet', 'Satış Fiyatı', 'Durum'];
    const rows = state.filteredStocks.map(stock => {
      const isArchived = stock.archived || stock.merged;
      // Teklifbul Rule v1.0 - Görüntüleme miktarını kullan (ayara göre düzenlenmiş)
      const quantity = stock.displayQuantity !== undefined ? stock.displayQuantity : (stock.totalQuantity || 0);
      const baseRow = [
        stock.sku || '',
        stock.name || '',
        stock.barcode || '',
        stock.brand || '',
        stock.model || '',
        stock.unit || 'ADT',
        stock.vatRate !== null && stock.vatRate !== undefined ? stock.vatRate : 20,
        quantity
      ];
      
      if (showMinMax) {
        baseRow.push(
          stock.displayMinStock !== null && stock.displayMinStock !== undefined ? stock.displayMinStock : '',
          stock.displayMaxStock !== null && stock.displayMaxStock !== undefined ? stock.displayMaxStock : ''
        );
      }
      
      baseRow.push(
        stock.avgCost || 0,
        stock.salePrice || 0,
        isArchived ? 'Arşivlenmiş' : 'Aktif'
      );
      
      return baseRow;
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
    logger.error('Export error', error);
    toast.error(`${MESSAGES.ERROR_STOCK_EXPORT}: ${error.message}`);
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

function formatNumber(value) {
  if (!value && value !== 0) return '0';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Teklifbul Rule v1.0 - Min/Max stok düzenleme fonksiyonları
// Event delegation kullanarak daha güvenli hale getiriyoruz
let minMaxEditorsInitialized = false;

function setupMinMaxStockEditors() {
  // Event listener'ları sadece bir kez ekle
  if (minMaxEditorsInitialized) return;
  
  const table = qs('#stocksTable');
  if (!table) return;
  
  minMaxEditorsInitialized = true;
  
  // Focus event
  table.addEventListener('focus', function(e) {
    const el = e.target;
    if (el.classList.contains('editable-min-stock') || el.classList.contains('editable-max-stock') || el.classList.contains('editable-vat-rate')) {
      if (el.getAttribute('contenteditable') === 'true') {
        el.style.border = '1px dashed #3b82f6';
        el.style.background = '#f0f9ff';
        const text = el.textContent.trim();
        if (text === '-' || (el.classList.contains('editable-vat-rate') && text.endsWith('%'))) {
          el.textContent = text.replace('%', '').trim();
        }
      }
    }
  }, true);
  
  // Blur event - Min stock
  table.addEventListener('blur', async function(e) {
    const el = e.target;
    if (!el.classList.contains('editable-min-stock')) return;
    if (el.getAttribute('contenteditable') !== 'true') return;
    
    el.style.border = '1px dashed transparent';
    el.style.background = '';
    const sku = el.dataset.sku;
    // Teklifbul Rule v1.0 - data-location-id attribute'una doğru erişim (kebab-case)
    const locationId = el.getAttribute('data-location-id') || el.dataset.locationId;
    const newValue = el.textContent.trim();
    
    if (!sku || !locationId) {
      logger.warn('Min stock edit: Missing sku or locationId', { sku, locationId, element: el });
      toast.error('Stok veya lokasyon bilgisi bulunamadı');
      renderTable();
      return;
    }
    
    // Değeri parse et
    let minStockValue = null;
    if (newValue && newValue !== '-' && newValue !== '') {
      const parsed = parseFloat(newValue.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 0) {
        minStockValue = parsed;
      } else {
        toast.error('Geçersiz değer. Lütfen sayısal bir değer girin veya silmek için boş bırakın.');
        renderTable();
        return;
      }
    }
    // Boş değer veya '-' ise null yap (silme işlemi)
    
    // Firestore'a kaydet
    try {
      const companyId = companyContext?.companyId;
      if (!companyId) {
        toast.error('Şirket bilgisi bulunamadı');
        renderTable();
        return;
      }
      
      const balanceDocId = `${companyId}_${sku}_${locationId}`;
      const balanceRef = docFn(db, 'stock_balances', balanceDocId);
      const balanceDoc = await getDoc(balanceRef);
      
      if (balanceDoc.exists()) {
        await updateDoc(balanceRef, {
          minStockLevel: minStockValue,
          lastUpdated: serverTimestamp()
        });
      } else {
        // Balance yoksa oluştur
        await setDoc(balanceRef, {
          companyId,
          sku,
          locationId,
          quantity: 0,
          minStockLevel: minStockValue,
          maxStockLevel: null,
          lastUpdated: serverTimestamp()
        });
      }
      
      // State'i güncelle
      const balance = state.balances.find(b => b.sku === sku && b.locationId === locationId);
      if (balance) {
        balance.minStockLevel = minStockValue;
      } else {
        state.balances.push({
          sku,
          locationId,
          quantity: 0,
          minStockLevel: minStockValue,
          maxStockLevel: null
        });
      }
      
      toast.success('Minimum stok seviyesi güncellendi');
      await updateQuantitiesByLocation();
      renderTable();
    } catch (error) {
      logger.error('Min stock update error', error);
      toast.error('Minimum stok seviyesi güncellenemedi: ' + error.message);
      renderTable();
    }
  }, true);
  
  // Blur event - Max stock
  table.addEventListener('blur', async function(e) {
    const el = e.target;
    if (!el.classList.contains('editable-max-stock')) return;
    if (el.getAttribute('contenteditable') !== 'true') return;
    
    el.style.border = '1px dashed transparent';
    el.style.background = '';
    const sku = el.dataset.sku;
    // Teklifbul Rule v1.0 - data-location-id attribute'una doğru erişim (kebab-case)
    const locationId = el.getAttribute('data-location-id') || el.dataset.locationId;
    const newValue = el.textContent.trim();
    
    if (!sku || !locationId) {
      logger.warn('Max stock edit: Missing sku or locationId', { sku, locationId, element: el });
      toast.error('Stok veya lokasyon bilgisi bulunamadı');
      renderTable();
      return;
    }
    
    // Değeri parse et
    let maxStockValue = null;
    if (newValue && newValue !== '-' && newValue !== '') {
      const parsed = parseFloat(newValue.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 0) {
        maxStockValue = parsed;
      } else {
        toast.error('Geçersiz değer. Lütfen sayısal bir değer girin veya silmek için boş bırakın.');
        renderTable();
        return;
      }
    }
    // Boş değer veya '-' ise null yap (silme işlemi)
    
    // Firestore'a kaydet
    try {
      const companyId = companyContext?.companyId;
      if (!companyId) {
        toast.error('Şirket bilgisi bulunamadı');
        renderTable();
        return;
      }
      
      const balanceDocId = `${companyId}_${sku}_${locationId}`;
      const balanceRef = docFn(db, 'stock_balances', balanceDocId);
      const balanceDoc = await getDoc(balanceRef);
      
      if (balanceDoc.exists()) {
        await updateDoc(balanceRef, {
          maxStockLevel: maxStockValue,
          lastUpdated: serverTimestamp()
        });
      } else {
        // Balance yoksa oluştur
        await setDoc(balanceRef, {
          companyId,
          sku,
          locationId,
          quantity: 0,
          minStockLevel: null,
          maxStockLevel: maxStockValue,
          lastUpdated: serverTimestamp()
        });
      }
      
      // State'i güncelle
      const balance = state.balances.find(b => b.sku === sku && b.locationId === locationId);
      if (balance) {
        balance.maxStockLevel = maxStockValue;
      } else {
        state.balances.push({
          sku,
          locationId,
          quantity: 0,
          minStockLevel: null,
          maxStockLevel: maxStockValue
        });
      }
      
      toast.success('Maximum stok seviyesi güncellendi');
      await updateQuantitiesByLocation();
      renderTable();
    } catch (error) {
      logger.error('Max stock update error', error);
      toast.error('Maximum stok seviyesi güncellenemedi: ' + error.message);
      renderTable();
    }
  }, true);
  
  // Blur event - KDV Rate
  table.addEventListener('blur', async function(e) {
    const el = e.target;
    if (!el.classList.contains('editable-vat-rate')) return;
    if (el.getAttribute('contenteditable') !== 'true') return;
    
    el.style.border = '1px dashed transparent';
    el.style.background = '';
    const stockId = el.dataset.stockId;
    const newValue = el.textContent.trim().replace('%', '').trim();
    
    if (!stockId) {
      logger.warn('VAT rate edit: Missing stockId', { stockId, element: el });
      toast.error('Stok bilgisi bulunamadı');
      renderTable();
      return;
    }
    
    // Değeri parse et
    let vatRateValue = 20; // Varsayılan %20
    if (newValue && newValue !== '-' && newValue !== '') {
      const parsed = parseFloat(newValue.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        vatRateValue = parsed;
      } else {
        toast.error('Geçersiz KDV oranı. Lütfen 0-100 arası bir değer girin.');
        renderTable();
        return;
      }
    }
    
    // Firestore'a kaydet
    try {
      const stockRef = docFn(db, 'stocks', stockId);
      await updateDoc(stockRef, {
        vatRate: vatRateValue,
        updatedAt: serverTimestamp()
      });
      
      // State'i güncelle
      const stock = state.allStocks.find(s => s.id === stockId);
      if (stock) {
        stock.vatRate = vatRateValue;
      }
      
      toast.success(`KDV oranı güncellendi: %${vatRateValue}`);
      logger.info('VAT rate updated', { stockId, vatRate: vatRateValue });
      renderTable();
    } catch (error) {
      logger.error('VAT rate update error', error);
      toast.error(`KDV oranı güncellenirken hata: ${error.message}`);
      renderTable();
    }
  }, true);
  
  // Keydown event - Enter ve Escape
  table.addEventListener('keydown', function(e) {
    const el = e.target;
    if (el.classList.contains('editable-min-stock') || el.classList.contains('editable-max-stock') || el.classList.contains('editable-vat-rate')) {
      if (el.getAttribute('contenteditable') === 'true') {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          renderTable();
        }
      }
    }
  }, true);
  
}

