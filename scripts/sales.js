/**
 * Sales Management - Satış Modülü Faz 2
 * Satış CRUD, hesaplama, state machine validation, düzenleme kuralları
 * Teklifbul Rule v1.0 - Modüler, DRY, async/await, toast notifications
 */

import { db, requireAuth } from '/firebase.js';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  orderBy,
  serverTimestamp,
  limit,
  startAfter
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// Teklifbul Rule v1.0 - Base64 encode/decode helper (browser için)
function base64Encode(str) {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(str)));
  }
  // Fallback
  return Buffer.from(str, 'utf8').toString('base64');
}

function base64Decode(str) {
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(str)));
  }
  // Fallback
  return Buffer.from(str, 'base64').toString('utf8');
}
// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { setTableEmpty } from '../assets/js/utils/safe-table.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '../src/shared/constants/messages.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getSalesPerms, getEinvoicePerms } from '../assets/js/state/permissions.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { pageGuard, UIState, renderUIState } from './lib/page-guard.js';
import { debounce } from '../assets/js/utils/debounce.js';
import { loadCompanyStocksPaged } from '../assets/js/utils/stock-catalog-query.js';
import { STOCK_LOCATIONS_QUERY_LIMIT, CUSTOMERS_QUERY_LIMIT } from '../src/shared/constants/timing.js';

const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

// State machine - Frontend validation (Basitleştirilmiş)
const VALID_TRANSITIONS = {
  saved: ['invoiced', 'cancelled', 'archived'],
  invoiced: ['cancelled', 'archived'],
  cancelled: [],
  archived: []
};

export const state = {
  sales: [],
  filteredSales: [],
  customers: [],
  stocks: [],
  locations: [],
  companyId: null,
  userId: null,
  currentSale: null,
  // Teklifbul Rule v1.0 - Pagination state
  pagination: {
    pageSize: 25,
    currentPage: 1,
    hasMore: false,
    lastDoc: null,
    nextCursor: null,
    cursorHistory: []
  },
  efaturaStatus: null, // 'einvoice', 'earchive', or null
  filters: {
    searchSaleNo: '',
    searchCustomer: '',
    searchAmount: null,
    search: '',
    status: 'all',
    startDate: null,
    endDate: null,
    customerId: 'all',
    minAmount: null,
    maxAmount: null,
    showArchived: false
  },
  // Teklifbul Rule v1.0 - Sorting default
  sort: { field: 'createdAt', direction: 'desc' },
  // Teklifbul Rule v1.0 - Bulk selection
  selectedSales: new Set()
};

// Teklifbul Rule v1.0 - UI State Machine
const uiState = new UIState('idle');

const SALES_PERMS = getSalesPerms();

// Initialize (global scope - tüm sayfalar için)
(async () => {
  try {
    // Teklifbul Rule v1.0 - Page guard (auth + company + permission + plan)
    // redirectOnFail: false yaparak önce hata mesajını göster, sonra yönlendir
    const guardResult = await pageGuard({
      requiredPerms: SALES_PERMS.view,
      requiredPlans: 'premium.salesModule',
      redirectOnFail: false, // Önce hata mesajını göster, sonra yönlendir
      redirectTo: '/dashboard.html'
    });

    if (!guardResult.success) {
      // Teklifbul Rule v1.0 - Sayfa bazlı hata render elementi seçimi
      let errorContainer = null;
      if (window.location.pathname.includes('sales.html')) {
        errorContainer = qs('#salesTableBody');
      } else if (window.location.pathname.includes('sale-detail.html')) {
        errorContainer = qs('#saleItemsTableBody');
      } else if (window.location.pathname.includes('sale-new.html')) {
        errorContainer = qs('#itemsTableBody');
      }

      // Page guard başarısız oldu, hata mesajını göster ve sonra yönlendir
      if (guardResult.errorType === 'permission') {
        if (errorContainer) {
          renderUIState('permissionDenied', errorContainer, {
            permissionDeniedMessage: 'Satış modülünü görüntüleme yetkiniz yok'
          });
        }
        // Kısa bir gecikme sonrası yönlendir (kullanıcı mesajı görebilsin)
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 2000);
      } else if (guardResult.errorType === 'plan') {
        if (errorContainer) {
          renderUIState('premiumDenied', errorContainer, {
            premiumDeniedMessage: 'Satış modülü için Premium plan gereklidir'
          });
        }
        // Teklifbul Rule v1.7 - Redirect to premium with reason
        setTimeout(() => {
          window.location.href = '/settings.html?reason=sales#premium';
        }, 2000);
      } else {
        // Diğer hatalar için de yönlendir
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 2000);
      }
      return;
    }

    state.userId = guardResult.userId;
    state.companyId = guardResult.companyId;

    // Teklifbul Rule v1.0 - Company ID set edildiğinde event tetikle
    // sale-new-form.js ve sale-detail inline script bu event'i dinleyecek
    if (state.companyId && (window.location.pathname.includes('sale-new.html') || window.location.pathname.includes('sale-detail.html'))) {
      window.dispatchEvent(new CustomEvent('companyIdReady', {
        detail: { companyId: state.companyId }
      }));
    }

    // Sayfa bazlı initialization
    if (window.location.pathname.includes('sales.html')) {
      uiState.setState('loading');
      await loadCustomers();
      populateCustomerFilter();
      await loadSales(true);
      setupSalesListListeners();
      uiState.setState('ready');
    } else if (window.location.pathname.includes('sale-new.html')) {
      await loadCustomers();
      await loadStocks();
      await loadLocations();
      setupSaleFormListeners();
    } else if (window.location.pathname.includes('sale-detail.html')) {
      // loadSaleDetail sale-detail.html inline script tarafından çağrılıyor
      // Teklifbul Rule v1.0 - State ve temel veriler hazır olmalı
      await loadCustomers();
      await loadStocks();
      await loadLocations();
      // loadSaleDetail() ve setupSaleDetailListeners() inline script'te çağrılıyor
    }
  } catch (error) {
    logger.error('Sales initialization error', error);

    if (error.message === 'AUTH_REQUIRED' || error.message?.includes('AUTH_REQUIRED')) {
      window.location.href = '/index.html';
      return;
    }

    uiState.setState('error');
    // Teklifbul Rule v1.0 - Sayfa bazlı hata render elementi
    let errorContainer = null;
    if (window.location.pathname.includes('sales.html')) {
      errorContainer = qs('#salesTableBody');
    } else if (window.location.pathname.includes('sale-detail.html')) {
      errorContainer = qs('#saleItemsTableBody');
    } else if (window.location.pathname.includes('sale-new.html')) {
      errorContainer = qs('#itemsTableBody');
    }

    if (errorContainer) {
      renderUIState('error', errorContainer, {
        errorMessage: `Başlatma hatası: ${error.message}`,
        onRetry: 'window.location.reload()'
      });
    }
    toast.error(`Başlatma hatası: ${error.message}`);
  }
})();

/**
 * State machine validation
 */
export function validateStatusTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * Düzenleme kuralları (Basitleştirilmiş)
 */
export function canEditSale(sale, field) {
  if (!sale) return false;

  // Kaydedilmiş veya arşivlenmiş (fiş ile kapatılmış) satışlar düzenlenebilir (saleNumber hariç)
  if (sale.status === 'saved' || sale.status === 'archived') {
    return field !== 'saleNumber';
  }

  // Faturalanan veya iptal edilen satışlar düzenlenemez
  if (sale.status === 'invoiced' || sale.status === 'cancelled') {
    return false;
  }

  // Diğer durumlar: Sadece notlar
  const editableFields = ['notes'];
  return editableFields.includes(field);
}

/**
 * KDV hesaplama
 */
export function calculateVat(amount, vatRate) {
  return Math.round(amount * (vatRate / 100) * 100) / 100; // 2 ondalık
}

/**
 * İndirim hesaplama
 */
export function calculateDiscount(amount, discountPercent) {
  return Math.round(amount * (discountPercent / 100) * 100) / 100;
}

/**
 * Toplam hesaplama (yuvarlama)
 */
export function calculateTotal(items) {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalVat = 0;

  items.forEach((item) => {
    const itemSubtotal = item.quantity * item.unitPrice;
    const discount = item.discount ? calculateDiscount(itemSubtotal, item.discount) : 0;
    const afterDiscount = itemSubtotal - discount;
    const vat = calculateVat(afterDiscount, item.vatRate);

    subtotal += afterDiscount;
    totalDiscount += discount;
    totalVat += vat;
  });

  // Yuvarlama (2 ondalık)
  subtotal = Math.round(subtotal * 100) / 100;
  totalDiscount = Math.round(totalDiscount * 100) / 100;
  totalVat = Math.round(totalVat * 100) / 100;
  const totalAmount = Math.round((subtotal + totalVat) * 100) / 100;

  return { subtotal, totalDiscount, totalVat, totalAmount };
}

/**
 * Satışları yükle (sales.html için)
 * Teklifbul Rule v1.0 - API pagination desteği
 */
async function loadSales(reset = true) {
  try {
    logger.group('Satışlar Yükleniyor');

    if (SALES_PERMS.view && !can(SALES_PERMS.view)) {
      logger.warn('Sales: view yetkisi olmadan loadSales çağrıldı');
      return;
    }

    uiState.setState('loading');

    // Teklifbul Rule v1.0 - Pagination: İlk sayfa için state'i sıfırla
    if (reset) {
      state.sales = [];
      state.pagination.currentPage = 1;
      state.pagination.lastDoc = null;
      state.pagination.nextCursor = null;
      state.pagination.cursorHistory = [];
      state.pagination.hasMore = false;
    }

    // Teklifbul Rule v1.0 - API'den veri çek
    const params = new URLSearchParams({
      pageSize: String(state.pagination.pageSize),
      status: state.filters.status || 'all',
      showArchived: String(state.filters.showArchived || false)
    });

    // Teklifbul Rule v1.0 - Sunucu tarafı arama desteği
    if (state.filters.search && state.filters.search.length >= 2) {
      params.append('q', state.filters.search);
    }

    if (state.pagination.nextCursor && !reset) {
      params.append('cursor', state.pagination.nextCursor);
    }

    const response = await authFetch(`/api/sales?${params.toString()}`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Satışlar yüklenemedi');
    }

    const data = await response.json();
    const newSales = data.sales || [];
    state.pagination.hasMore = data.pagination?.hasMore || false;

    // Teklifbul Rule v1.0 - Yeni kayıtları state'e ekle
    state.sales = reset ? newSales : [...state.sales, ...newSales];

    // Teklifbul Rule v1.0 - Cursor'ı kaydet (sonraki sayfa için)
    if (data.pagination?.nextCursor) {
      // Cursor'ı sakla (API'ye gönderilecek)
      state.pagination.nextCursor = data.pagination.nextCursor;
    } else {
      state.pagination.nextCursor = null;
    }

    // Teklifbul Rule v1.0 - Cursor history'yi güncelle
    if (reset) {
      state.pagination.cursorHistory = [];
    } else if (state.pagination.nextCursor) {
      // Cursor history'ye ekle (previous page için)
      if (!state.pagination.cursorHistory.includes(state.pagination.nextCursor)) {
        // History'ye ekleme - sadece current cursor'ı sakla
      }
    }

    logger.info('Satışlar yüklendi', {
      count: newSales.length,
      total: state.sales.length,
      hasMore: state.pagination.hasMore
    });
    logger.end();

    // Teklifbul Rule v1.0 - State'i önce güncelle, sonra render et
    uiState.setState(state.sales.length === 0 ? 'empty' : 'ready');
    applySalesFilters();
    updatePaginationUI();
  } catch (error) {
    logger.error('Satışlar yüklenirken hata', error);

    // 403 Forbidden hatası için özel mesaj
    if (error.message?.includes('yetkiniz yok') || error.message?.includes('yetki')) {
      uiState.setState('permissionDenied');
      renderUIState('permissionDenied', qs('#salesTableBody'), {
        permissionDeniedMessage: error.message || 'Satış modülünü görüntüleme yetkiniz yok. Lütfen yöneticinizle iletişime geçin.'
      });
      toast.error(error.message || 'Bu işlem için yetkiniz yok');
    } else {
      uiState.setState('error');
      renderUIState('error', qs('#salesTableBody'), {
        errorMessage: `Satışlar yüklenirken hata: ${error.message}`,
        onRetry: 'loadSales(true)'
      });
      toast.error(`Satışlar yüklenirken hata: ${error.message}`);
    }
  }
}

/**
 * Müşterileri yükle
 */
export async function loadCustomers() {
  try {
    // Teklifbul Rule v1.0 - Firestore limit() zorunlu
    const q = query(
      collection(db, 'customers'),
      where('companyId', '==', state.companyId),
      where('isArchived', '!=', true),
      orderBy('name'),
      limit(CUSTOMERS_QUERY_LIMIT)
    );

    const snapshot = await getDocs(q);
    state.customers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    if (snapshot.size >= CUSTOMERS_QUERY_LIMIT) {
      toast.warn(MESSAGES.WARN_QUERY_LIMIT_REACHED.replace('{count}', String(CUSTOMERS_QUERY_LIMIT)));
    }

    logger.info('Müşteriler yüklendi', { count: state.customers.length });
  } catch (error) {
    logger.error('Müşteriler yüklenirken hata', error);
    // Müşteri yoksa da devam et
  }
}

/**
 * Müşteri filtresini doldur
 */
function populateCustomerFilter() {
  const select = qs('#customerFilter');
  if (!select) return;

  // Teklifbul Rule v1.0 - XSS Protection
  select.innerHTML = DOMPurify.sanitize('<option value="all">Tümü</option>', {
    ALLOWED_TAGS: ['option'],
    ALLOWED_ATTR: ['value']
  });
  state.customers.forEach(customer => {
    const option = document.createElement('option');
    option.value = customer.id;
    // Teklifbul Rule v1.0 - XSS Protection
    const safeName = DOMPurify.sanitize(customer.name || '', { ALLOWED_TAGS: [] });
    const safeCode = DOMPurify.sanitize(customer.code || '', { ALLOWED_TAGS: [] });
    option.textContent = `${safeName} (${safeCode})`;
    select.appendChild(option);
  });
}

/**
 * Stokları yükle
 */
export async function loadStocks() {
  try {
    if (!state.companyId) {
      logger.warn('loadStocks: companyId bulunamadı');
      state.stocks = [];
      return;
    }

    const { rows, capped } = await loadCompanyStocksPaged(db, state.companyId);
    state.stocks = rows;
    if (capped) {
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(rows.length)));
    }

    logger.info('Stoklar yüklendi', { count: state.stocks.length });
  } catch (error) {
    logger.error('Stoklar yüklenirken hata', error);
    toast.error(`Stoklar yüklenirken hata: ${error.message}`);
  }
}

/**
 * Lokasyonları yükle
 */
export async function loadLocations() {
  try {
    const q = query(
      collection(db, 'stock_locations'),
      where('companyId', '==', state.companyId),
      orderBy('name'),
      limit(STOCK_LOCATIONS_QUERY_LIMIT)
    );

    const snapshot = await getDocs(q);
    state.locations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    logger.info('Lokasyonlar yüklendi', { count: state.locations.length });
  } catch (error) {
    logger.error('Lokasyonlar yüklenirken hata', error);
    toast.error(`Lokasyonlar yüklenirken hata: ${error.message}`);
  }
}

/**
 * Satış detayını yükle (sale-detail.html için)
 */
export async function loadSaleDetail() {
  try {
    logger.info('loadSaleDetail: Başlatılıyor...');
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('id');

    if (!saleId) {
      logger.warn('loadSaleDetail: Sale ID bulunamadı');
      toast.error(MESSAGES.ERROR_SALE_ID_NOT_FOUND);
      window.location.href = '/pages/sales.html';
      return;
    }

    logger.info('loadSaleDetail: Firestore sorgulanıyor...', { saleId });
    const saleDoc = await getDoc(doc(db, 'sales', saleId));
    if (!saleDoc.exists()) {
      logger.warn('loadSaleDetail: Satış bulunamadı');
      toast.error(MESSAGES.ERROR_SALE_NOT_FOUND);
      window.location.href = '/pages/sales.html';
      return;
    }

    const data = saleDoc.data();
    logger.info('loadSaleDetail: Satış yüklendi', { status: data.status, itemsCount: data.items?.length });

    state.currentSale = { id: saleDoc.id, ...data };

    // Company kontrolü
    if (state.currentSale.companyId !== state.companyId) {
      logger.warn('loadSaleDetail: Yetkisiz erişim', { saleCompany: state.currentSale.companyId, userCompany: state.companyId });
      toast.error(MESSAGES.ERROR_SALE_UNAUTHORIZED);
      window.location.href = '/pages/sales.html';
      return;
    }

    renderSaleDetail();
    logger.info('loadSaleDetail: Render tamamlandı');
  } catch (error) {
    logger.error('Satış detayı yüklenirken hata', error);
    toast.error(`Satış detayı yüklenirken hata: ${error.message}`);
  }
}

/**
 * Satış listesi filtreleme
 * Teklifbul Rule v1.0 - Gelişmiş filtreler
 */
function applySalesFilters() {
  // Filtreleri state'e kaydet
  state.filters.searchSaleNo = (qs('#searchSaleNo')?.value || '').toLowerCase().trim();
  state.filters.searchCustomer = (qs('#searchCustomer')?.value || '').toLowerCase().trim();
  state.filters.searchAmount = qs('#searchAmount')?.value ? parseFloat(qs('#searchAmount').value) : null;
  state.filters.search = state.filters.searchSaleNo || state.filters.searchCustomer; // for backend API
  
  state.filters.status = qs('#statusFilter')?.value || 'all';
  state.filters.showArchived = qs('#showArchived')?.checked || false;
  state.filters.startDate = qs('#startDateFilter')?.value || null;
  state.filters.endDate = qs('#endDateFilter')?.value || null;
  state.filters.customerId = qs('#customerFilter')?.value || 'all';
  state.filters.minAmount = qs('#minAmountFilter')?.value ? parseFloat(qs('#minAmountFilter').value) : null;
  state.filters.maxAmount = qs('#maxAmountFilter')?.value ? parseFloat(qs('#maxAmountFilter').value) : null;

  state.filteredSales = state.sales.filter((sale) => {
    // Arşiv filtresi
    if (!state.filters.showArchived && (sale.isArchived || sale.status === 'archived')) {
      return false;
    }

    // Durum filtresi
    if (state.filters.status !== 'all' && sale.status !== state.filters.status) {
      return false;
    }

    // Müşteri filtresi
    if (state.filters.customerId !== 'all' && sale.customerId !== state.filters.customerId) {
      return false;
    }

    // Tarih filtresi
    if (state.filters.startDate || state.filters.endDate) {
      const saleDate = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt);

      if (state.filters.startDate) {
        const startDate = new Date(state.filters.startDate);
        startDate.setHours(0, 0, 0, 0);
        if (saleDate < startDate) return false;
      }

      if (state.filters.endDate) {
        const endDate = new Date(state.filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (saleDate > endDate) return false;
      }
    }

    // Global Tutar aralığı filtresi
    const totalAmount = sale.totalAmount || 0;
    if (state.filters.minAmount !== null && totalAmount < state.filters.minAmount) return false;
    if (state.filters.maxAmount !== null && totalAmount > state.filters.maxAmount) return false;

    // Özel Arama Inputları
    if (state.filters.searchSaleNo) {
      const sNo = (sale.saleNumber || '').toLowerCase();
      if (!sNo.includes(state.filters.searchSaleNo)) return false;
    }

    if (state.filters.searchCustomer) {
      const cName = (sale.customerName || '').toLowerCase();
      const cCode = (sale.customerCode || '').toLowerCase();
      if (!cName.includes(state.filters.searchCustomer) && !cCode.includes(state.filters.searchCustomer)) {
        return false;
      }
    }

    if (state.filters.searchAmount !== null) {
      if (Math.abs(totalAmount - state.filters.searchAmount) > 0.01) return false;
    }

    return true;
  });

  // Client-side Sorting
  if (state.sort && state.sort.field) {
    state.filteredSales.sort((a, b) => {
      let valA, valB;
      if (state.sort.field === 'totalAmount') {
        valA = a.totalAmount || 0;
        valB = b.totalAmount || 0;
      } else if (state.sort.field === 'customerName') {
        valA = (a.customerName || '').toLowerCase();
        valB = (b.customerName || '').toLowerCase();
      } else if (state.sort.field === 'saleNumber') {
        valA = (a.saleNumber || '').toLowerCase();
        valB = (b.saleNumber || '').toLowerCase();
      } else {
        valA = a.createdAt?.seconds || 0;
        valB = b.createdAt?.seconds || 0;
      }

      if (valA < valB) return state.sort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return state.sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  renderSalesTable();
  updateBulkActionsUI();
}

/**
 * Satış listesi tablosunu render et
 * Teklifbul Rule v1.0 - Bulk selection, state machine
 */
function renderSalesTable() {
  const tbody = qs('#salesTableBody');
  if (!tbody) return;

  // Teklifbul Rule v1.0 - UI State'e göre render
  if (uiState.is('loading')) {
    renderUIState('loading', tbody, { loadingMessage: 'Satışlar yükleniyor...' });
    return;
  }

  if (uiState.is('error')) {
    // Error state zaten renderUIState ile gösterildi
    return;
  }

  if (state.filteredSales.length === 0) {
    const isEmpty = state.sales.length === 0;
    renderUIState('empty', tbody, {
      emptyMessage: isEmpty ? 'Henüz satış kaydı yok' : 'Filtre kriterlerine uygun satış bulunamadı'
    });
    return;
  }

  // Teklifbul Rule v1.0 - XSS Protection
  const salesHTML = state.filteredSales
    .map(
      (sale) => {
        const isSelected = state.selectedSales.has(sale.id);
        const safeSaleNumber = DOMPurify.sanitize(sale.saleNumber || '', { ALLOWED_TAGS: [] });
        const safeCustomerName = DOMPurify.sanitize(sale.customerName || '', { ALLOWED_TAGS: [] });
        const safeSaleId = DOMPurify.sanitize(sale.id || '', { ALLOWED_TAGS: [] });
        return `
    <tr data-sale-id="${safeSaleId}" style="${isSelected ? 'background:#e0e7ff' : ''}">
      <td>
        <input type="checkbox" class="sale-checkbox" data-sale-id="${safeSaleId}" ${isSelected ? 'checked' : ''} style="cursor:pointer" />
      </td>
      <td><strong>${safeSaleNumber}</strong></td>
      <td>${safeCustomerName}</td>
      <td>${formatCurrency(sale.totalAmount || 0, sale.currency || 'TRY')}</td>
      <td><span class="badge badge-${getStatusBadgeClass(sale.status)}">${getStatusLabel(sale.status)}</span></td>
      <td>${formatDate(sale.createdAt)}</td>
      <td>${sale.items?.length || 0} kalem</td>
      <td style="width:250px;min-width:250px;max-width:250px;padding:4px">
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          <a href="/pages/sale-detail.html?id=${safeSaleId}" class="btn btn-secondary" style="padding:2px 6px;font-size:10px;line-height:1.2;flex:0 0 auto;width:auto;min-width:auto;white-space:nowrap;text-align:center;display:inline-flex;align-items:center;justify-content:center">Detay</a>
          ${canEditSale(sale, 'items') && SALES_PERMS.edit && can(SALES_PERMS.edit) ? `<a href="/pages/sale-new.html?id=${safeSaleId}" class="btn btn-secondary" style="padding:2px 6px;font-size:10px;line-height:1.2;flex:0 0 auto;width:auto;min-width:auto;white-space:nowrap;text-align:center;display:inline-flex;align-items:center;justify-content:center">Düzenle</a>` : ''}
          ${SALES_PERMS.archive && can(SALES_PERMS.archive) && !sale.isArchived ? `<button class="btn btn-danger btn-archive-sale" data-sale-id="${safeSaleId}" style="padding:2px 6px;font-size:10px;line-height:1.2;flex:0 0 auto;width:auto;min-width:auto;white-space:nowrap;text-align:center;display:inline-flex;align-items:center;justify-content:center">Arşivle</button>` : ''}
          ${SALES_PERMS.delete && can(SALES_PERMS.delete) && sale.status === 'draft' ? `<button class="btn btn-danger btn-delete-sale" data-sale-id="${safeSaleId}" style="padding:2px 6px;font-size:10px;line-height:1.2;flex:0 0 auto;width:auto;min-width:auto;white-space:nowrap;text-align:center;display:inline-flex;align-items:center;justify-content:center">Sil</button>` : ''}
        </div>
      </td>
    </tr>
  `;
      }
    )
    .join('');

  // Teklifbul Rule v1.0 - XSS Protection: İçerik zaten sanitize edildi, sadece HTML yapısını ekle
  // DOMPurify tablo yapısını bozabiliyor, bu yüzden direkt innerHTML kullanıyoruz
  // Tüm içerik değerleri (saleNumber, customerName, saleId) zaten DOMPurify.sanitize ile temizlendi
  tbody.innerHTML = salesHTML;

  // Event delegation için listener'ları ekle
  attachTableEventListeners();
}

/**
 * Satış detayını render et
 */
export function renderSaleDetail() {
  const sale = state.currentSale;
  if (!sale) return;

  // Detay sayfası için render logic (sale-detail.html'de kullanılacak)
  if (qs('#saleNumber')) {
    qs('#saleNumber').textContent = sale.saleNumber || '';
  }
  if (qs('#customerName')) {
    qs('#customerName').textContent = sale.customerName || '';
  }
  if (qs('#saleStatus')) {
    // Teklifbul Rule v1.0 - XSS Protection
    const safeStatus = DOMPurify.sanitize(sale.status || '', { ALLOWED_TAGS: [] });
    const statusBadgeClass = getStatusBadgeClass(sale.status);
    const statusLabel = DOMPurify.sanitize(getStatusLabel(sale.status) || '', { ALLOWED_TAGS: [] });
    qs('#saleStatus').innerHTML = DOMPurify.sanitize(`<span class="badge badge-${statusBadgeClass}">${statusLabel}</span>`, {
      ALLOWED_TAGS: ['span'],
      ALLOWED_ATTR: ['class']
    });
  }
  if (qs('#saleTotal')) {
    qs('#saleTotal').textContent = formatCurrency(sale.totalAmount || 0, sale.currency || 'TRY');
  }

  // Items tablosu
  renderSaleItems(sale.items || []);

  // Düzenleme butonları (duruma göre)
  renderSaleActions(sale);

  // Belgeler bölümünü yükle
  if (window.location.pathname.includes('sale-detail.html')) {
    import('./sales-documents.js').then(({ loadSaleDocuments }) => {
      loadSaleDocuments(sale);
    }).catch((error) => {
      logger.warn('sales-documents.js yüklenemedi', error);
    });
  }

  // Teklifbul Rule v1.0 - E-Belge Kilidi Badge
  renderEdocLockBadge(sale);
}

/**
 * Restore deleted sale
 * Teklifbul Rule v1.0 - Restore soft deleted sale
 */
export async function handleRestoreSale(saleId) {
  try {
    logger.group('Satış Geri Yükleniyor');

    // Confirm dialog
    if (!confirm('Bu satışı geri yüklemek istiyor musunuz?')) {
      logger.end();
      return;
    }

    // Company context al
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('Restore sale: company context alınamadı');
      toast.error('Şirket bilgisi bulunamadı');
      logger.end();
      return;
    }

    const companyId = ctx.companyId;

    // Restore endpoint çağrısı
    const response = await authFetch(`/api/sales/${encodeURIComponent(saleId)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });

    const result = await response.json();

    if (!response.ok) {
      // Error catalog uyumlu error handling
      if (result.error === 'CONFLICT') {
        toast.error(result.message || 'E-belgeye bağlı satış geri yüklenemez; iptal/iade süreci gereklidir.');
      } else if (result.error === 'FORBIDDEN') {
        toast.error(result.message || 'Yetkiniz yok');
      } else if (result.error === 'VALIDATION_ERROR' && result.details) {
        toast.error(result.details.join(', ') || 'Geçersiz istek');
      } else {
        toast.error(result.message || 'Satış geri yüklenemedi');
      }
      logger.error('Restore sale error', { saleId, error: result });
      logger.end();
      return;
    }

    // Success
    toast.success(result.message || 'Satış geri yüklendi');
    logger.info('Satış geri yüklendi', { saleId, companyId });

    // Sayfayı yenile
    setTimeout(() => {
      window.location.reload();
    }, 1000);

    logger.end();
  } catch (error) {
    logger.error('Restore sale exception', error);
    toast.error(`Hata: ${error.message || 'Satış geri yüklenemedi'}`);
    logger.end();
  }
}

/**
 * Status formatı helper
 * Teklifbul Rule v1.0 - Belge durumlarını Türkçe'ye çevir
 */
function formatStatus(status) {
  const map = {
    draft: 'Taslak',
    ready: 'Hazır',
    sent: 'Gönderildi',
    accepted: 'Kabul Edildi',
    rejected: 'Reddedildi',
    cancelled: 'İptal Edildi'
  };
  return map[status] || status;
}

/**
 * E-Belge Kilidi Badge'ini render et
 * Teklifbul Rule v1.0 - Sale detail'de e-doc lock uyarısı
 * @param {Object} sale - Sale document
 * @param {Object} meta - Metadata (lastInvoiceStatus, lastDeliveryStatus)
 */
export function renderEdocLockBadge(sale, meta = {}) {
  const badgeEl = qs('#edocLockBadge');
  const textEl = qs('#edocLockText');
  const dateEl = qs('#edocLockDate');
  const linksEl = qs('#edocLockLinks');
  const statusesEl = qs('#edocLockStatuses');

  if (!badgeEl || !textEl || !dateEl || !linksEl || !statusesEl) return;

  // E-doc lock kontrolü
  if (sale.edocLock?.locked) {
    badgeEl.style.display = 'block';

    // Reason'a göre metin
    let lockText = '';
    const reason = sale.edocLock.reason;

    switch (reason) {
      case 'sent_invoice':
        lockText = 'Bu satış, GİB\'e gönderilmiş/onaylanmış <strong>e-Fatura</strong> ile ilişkili. Kalem/tutar/vergi/adres gibi kritik alanlar değiştirilemez.';
        break;
      case 'sent_delivery':
        lockText = 'Bu satış, GİB\'e gönderilmiş/onaylanmış <strong>e-İrsaliye</strong> ile ilişkili. Kritik alanlar değiştirilemez.';
        break;
      case 'sent_both':
        lockText = 'Bu satış, gönderilmiş/onaylanmış <strong>e-Fatura ve e-İrsaliye</strong> ile ilişkili. Kritik alanlar değiştirilemez.';
        break;
      default:
        lockText = 'Bu satış, gönderilmiş/onaylanmış e-belge ile ilişkili. Kritik alanlar değiştirilemez.';
    }

    // Teklifbul Rule v1.0 - XSS Protection
    textEl.innerHTML = DOMPurify.sanitize(lockText, {
      ALLOWED_TAGS: ['strong'],
      ALLOWED_ATTR: []
    });

    // lockedAt tarihi
    if (sale.edocLock.lockedAt) {
      let lockedDate;
      if (sale.edocLock.lockedAt.toDate) {
        // Firestore Timestamp
        lockedDate = sale.edocLock.lockedAt.toDate();
      } else if (sale.edocLock.lockedAt instanceof Date) {
        lockedDate = sale.edocLock.lockedAt;
      } else if (typeof sale.edocLock.lockedAt === 'string') {
        lockedDate = new Date(sale.edocLock.lockedAt);
      } else {
        lockedDate = null;
      }

      if (lockedDate && !isNaN(lockedDate.getTime())) {
        // TR formatında tarih göster
        const formattedDate = lockedDate.toLocaleDateString('tr-TR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        dateEl.textContent = `Kilitlenme Tarihi: ${formattedDate}`;
        dateEl.style.display = 'block';
      } else {
        dateEl.style.display = 'none';
      }
    } else {
      dateEl.style.display = 'none';
    }

    // Teklifbul Rule v1.0 - Son Belge Durumları
    let statusHTML = '';
    if (meta.lastInvoiceStatus) {
      const statusText = formatStatus(meta.lastInvoiceStatus);
      statusHTML += `<div><strong>Son Fatura:</strong> ${DOMPurify.sanitize(statusText, { ALLOWED_TAGS: [] })}</div>`;
    }
    if (meta.lastDeliveryStatus) {
      const statusText = formatStatus(meta.lastDeliveryStatus);
      statusHTML += `<div><strong>Son İrsaliye:</strong> ${DOMPurify.sanitize(statusText, { ALLOWED_TAGS: [] })}</div>`;
    }

    if (statusHTML) {
      statusesEl.innerHTML = DOMPurify.sanitize(statusHTML, {
        ALLOWED_TAGS: ['div', 'strong'],
        ALLOWED_ATTR: []
      });
      statusesEl.style.display = 'block';
    } else {
      statusesEl.style.display = 'none';
    }

    // Teklifbul Rule v1.0 - E-Belge Linkleri
    const invoiceIds = Array.isArray(sale.invoiceIds) ? sale.invoiceIds : [];
    const deliveryIds = Array.isArray(sale.deliveryNoteIds) ? sale.deliveryNoteIds : [];

    const lastInvoiceId = invoiceIds.length > 0 ? invoiceIds[invoiceIds.length - 1] : null;
    const lastDeliveryId = deliveryIds.length > 0 ? deliveryIds[deliveryIds.length - 1] : null;

    // Linkleri oluştur
    let linksHTML = '';
    const links = [];

    if (lastInvoiceId) {
      const invoiceLink = document.createElement('a');
      invoiceLink.href = `/pages/invoice-detail.html?id=${encodeURIComponent(lastInvoiceId)}`;
      invoiceLink.textContent = 'Son Fatura →';
      invoiceLink.style.color = '#2563eb';
      invoiceLink.style.textDecoration = 'none';
      invoiceLink.style.fontWeight = '600';
      invoiceLink.style.marginRight = '12px';
      invoiceLink.addEventListener('mouseenter', () => {
        invoiceLink.style.textDecoration = 'underline';
      });
      invoiceLink.addEventListener('mouseleave', () => {
        invoiceLink.style.textDecoration = 'none';
      });
      links.push(invoiceLink);
    }

    if (lastDeliveryId) {
      const deliveryLink = document.createElement('a');
      deliveryLink.href = `/pages/delivery-note-detail.html?id=${encodeURIComponent(lastDeliveryId)}`;
      deliveryLink.textContent = 'Son İrsaliye →';
      deliveryLink.style.color = '#2563eb';
      deliveryLink.style.textDecoration = 'none';
      deliveryLink.style.fontWeight = '600';
      deliveryLink.addEventListener('mouseenter', () => {
        deliveryLink.style.textDecoration = 'underline';
      });
      deliveryLink.addEventListener('mouseleave', () => {
        deliveryLink.style.textDecoration = 'none';
      });
      links.push(deliveryLink);
    }

    // Linkleri render et
    if (links.length > 0) {
      linksEl.innerHTML = ''; // Temizle
      links.forEach((link, index) => {
        linksEl.appendChild(link);
        // Son link değilse ayraç ekle
        if (index < links.length - 1) {
          const separator = document.createTextNode(' | ');
          separator.style.color = '#6b7280';
          linksEl.appendChild(separator);
        }
      });
      linksEl.style.display = 'block';
    } else {
      linksEl.style.display = 'none';
    }
  } else {
    badgeEl.style.display = 'none';
    if (linksEl) linksEl.style.display = 'none';
  }
}

/**
 * Satış kalemlerini render et
 */
export function renderSaleItems(items) {
  const tbody = qs('#saleItemsTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    // Teklifbul Rule v1.0 — DOMPurify <tr>/<td>'yi table dışında siler; createElement kullan
    setTableEmpty(tbody, 9, 'Kalem bulunamadı');
    return;
  }

  // Teklifbul Rule v1.0 - XSS Protection
  const itemsHTML = items
    .map(
      (item) => {
        const deliveredQty = item.deliveredQuantity || 0;
        const remainingQty = item.remainingQuantity || item.quantity;
        const showDeliveryInfo = deliveredQty > 0 || remainingQty < item.quantity;
        const safeSku = DOMPurify.sanitize(item.sku || '', { ALLOWED_TAGS: [] });
        const safeName = DOMPurify.sanitize(item.name || '', { ALLOWED_TAGS: [] });
        const safeUnit = DOMPurify.sanitize(item.unit || '', { ALLOWED_TAGS: [] });
        const safeLocationName = DOMPurify.sanitize(item.locationName || '', { ALLOWED_TAGS: [] });
        return `
    <tr>
      <td>${safeSku}</td>
      <td>${safeName}</td>
      <td>
        ${item.quantity || 0}
        ${showDeliveryInfo ? `<br><small class="muted">Teslim: ${deliveredQty}, Kalan: ${remainingQty}</small>` : ''}
      </td>
      <td>${safeUnit}</td>
      <td>${safeLocationName}</td>
      <td>${formatCurrency(item.unitPrice || 0, item.currency || 'TRY')}</td>
      <td>%${item.vatRate || 0}</td>
      <td>${item.discount ? `%${item.discount}` : '-'}</td>
      <td>${formatCurrency(item.totalWithVat || 0, item.currency || 'TRY')}</td>
    </tr>
  `;
      }
    )
    .join('');
  tbody.innerHTML = itemsHTML;
}

/**
 * Satış aksiyon butonlarını render et (duruma göre) - Basitleştirilmiş
 */
export function renderSaleActions(sale) {
  const actionsDiv = qs('#saleActions');
  if (!actionsDiv) return;

  let html = '';

  // Kaydedilmiş satış: Düzenle, Fatura Oluştur, İptal
  if (sale.status === 'saved') {
    if (canEditSale(sale, 'items') && SALES_PERMS.edit && can(SALES_PERMS.edit)) {
      html += `<a href="/pages/sale-new.html?id=${sale.id}" class="btn btn-primary" style="display:inline-flex;align-items:center;justify-content:center;text-align:center">✏️ Düzenle</a>`;
    }
    if (SALES_PERMS.createInvoice && can(SALES_PERMS.createInvoice)) {
      html += `<button class="btn btn-primary" id="btnCreateInvoiceAction" data-sale-id="${sale.id}">📄 Fatura Oluştur</button>`;
    }
    // Teklifbul Rule v1.0 - Fiş ile kapama (Arşivle) - Sadece henüz arşivlenmemişse göster
    if (SALES_PERMS.archive && can(SALES_PERMS.archive) && !sale.isArchived && sale.status !== 'archived') {
      html += `<button class="btn btn-secondary" id="btnArchiveSaleReceipt" data-sale-id="${sale.id}" title="Fatura kesilmeden, fiş ile tamamlanan satışları arşivle">🧾 Fiş ile Kapat</button>`;
    }
    if (SALES_PERMS.cancel && can(SALES_PERMS.cancel)) {
      html += `<button class="btn btn-danger" id="btnCancelSale" data-sale-id="${sale.id}">❌ İptal Et</button>`;
    }
  }

  // Faturalandı: Sadece görüntüleme
  if (sale.status === 'invoiced') {
    html += `<span class="badge badge-success" style="padding:8px 16px;font-size:14px">✅ Faturalandı</span>`;
  }

  // İptal edildi: Geri yükle
  if (sale.status === 'cancelled') {
    html += `<span class="badge badge-danger" style="padding:8px 16px;font-size:14px">❌ İptal Edildi</span>`;
  }

  // Arşivlendi (Fiş ile kapatıldı)
  if (sale.status === 'archived' || sale.isArchived === true) {
    html += `<span class="badge badge-secondary" style="padding:8px 16px;font-size:14px">📦 Satış fiş kullanılarak kapatıldı</span>`;
    if (canEditSale(sale, 'items') && SALES_PERMS.edit && can(SALES_PERMS.edit)) {
      html += `<a href="/pages/sale-new.html?id=${sale.id}" class="btn btn-primary" style="margin-left:8px;display:inline-flex;align-items:center;justify-content:center;text-align:center">✏️ Düzenle</a>`;
    }
  }

  // Teklifbul Rule v1.0 - Restore button for deleted sales
  if (sale.isDeleted === true) {
    if (SALES_PERMS.delete && can(SALES_PERMS.delete)) {
      const safeSaleId = DOMPurify.sanitize(sale.id || '', { ALLOWED_TAGS: [] });
      html += `<button class="btn btn-success" id="btnRestoreSale" data-sale-id="${safeSaleId}">🟢 Geri Yükle</button>`;
    }
    html += `<div style="margin-top:8px;padding:8px;background:#fef3c7;border:1px solid #fbbf24;border-radius:4px;color:#92400e;font-size:13px;">⚠️ Bu satış silinmiş durumda. Geri yükleyebilirsiniz.</div>`;
  }

  // Teklifbul Rule v1.0 - XSS Protection
  actionsDiv.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['button', 'a', 'div', 'span'],
    ALLOWED_ATTR: ['class', 'id', 'href', 'data-sale-id', 'style']
  });

  // Restore button click handler
  if (sale.isDeleted === true) {
    const restoreBtn = qs('#btnRestoreSale');
    if (restoreBtn) {
      const newRestoreBtn = restoreBtn.cloneNode(true);
      restoreBtn.parentNode.replaceChild(newRestoreBtn, restoreBtn);

      newRestoreBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleRestoreSale(sale.id);
      });
    }
  }

  // Fiş ile Arşivle click handler
  const archiveReceiptBtn = qs('#btnArchiveSaleReceipt');
  if (archiveReceiptBtn) {
    const newArchiveBtn = archiveReceiptBtn.cloneNode(true);
    archiveReceiptBtn.parentNode.replaceChild(newArchiveBtn, archiveReceiptBtn);

    newArchiveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await archiveSale(sale.id, true);
    });
  }
}

/**
 * Event listener'ları kur (sales.html için)
 * Teklifbul Rule v1.0 - Gelişmiş filtreler, pagination, bulk actions
 */
function setupTableSorting() {
  const headers = qsa('th[data-sort]');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (state.sort && state.sort.field === field) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { field, direction: 'asc' };
      }
      
      // Update icons
      headers.forEach(h => {
        const icon = h.querySelector('.sort-icon');
        if (icon) icon.textContent = '';
      });
      const currentIcon = th.querySelector('.sort-icon');
      if (currentIcon) {
        currentIcon.textContent = state.sort.direction === 'asc' ? ' 🔼' : ' 🔽';
      }
      
      applySalesFilters();
    });
  });
}

function setupSalesListListeners() {
  setupTableSorting();

  // Arama ve filtreler (debounced - Teklifbul Rule v1.0)
  const debouncedSearch = debounce(() => {
    state.filters.searchSaleNo = (qs('#searchSaleNo')?.value || '').toLowerCase().trim();
    state.filters.searchCustomer = (qs('#searchCustomer')?.value || '').toLowerCase().trim();
    state.filters.searchAmount = qs('#searchAmount')?.value ? parseFloat(qs('#searchAmount').value) : null;
    state.filters.search = state.filters.searchSaleNo || state.filters.searchCustomer;
    applySalesFilters(); 
    // loadSales(true); // Call only if backend text search is strictly needed on every keystroke
  }, 300);

  qs('#searchSaleNo')?.addEventListener('input', debouncedSearch);
  qs('#searchCustomer')?.addEventListener('input', debouncedSearch);
  qs('#searchAmount')?.addEventListener('input', debouncedSearch);

  const handleFilterChange = () => {
    applySalesFilters();
    loadSales(true);
  };

  qs('#statusFilter')?.addEventListener('change', handleFilterChange);
  qs('#showArchived')?.addEventListener('change', handleFilterChange);
  qs('#startDateFilter')?.addEventListener('change', handleFilterChange);
  qs('#endDateFilter')?.addEventListener('change', handleFilterChange);
  qs('#customerFilter')?.addEventListener('change', handleFilterChange);
  qs('#minAmountFilter')?.addEventListener('change', handleFilterChange);
  qs('#maxAmountFilter')?.addEventListener('change', handleFilterChange);

  // Filtreleri sıfırla
  qs('#btnResetFilters')?.addEventListener('click', () => {
    const searchSaleNo = qs('#searchSaleNo');
    const searchCustomer = qs('#searchCustomer');
    const searchAmount = qs('#searchAmount');
    const statusFilter = qs('#statusFilter');
    const showArchived = qs('#showArchived');
    const startDateFilter = qs('#startDateFilter');
    const endDateFilter = qs('#endDateFilter');
    const customerFilter = qs('#customerFilter');
    const minAmountFilter = qs('#minAmountFilter');
    const maxAmountFilter = qs('#maxAmountFilter');

    if (searchSaleNo) searchSaleNo.value = '';
    if (searchCustomer) searchCustomer.value = '';
    if (searchAmount) searchAmount.value = '';
    
    if (statusFilter) statusFilter.value = 'all';
    if (showArchived) showArchived.checked = false;
    if (startDateFilter) startDateFilter.value = '';
    if (endDateFilter) endDateFilter.value = '';
    if (customerFilter) customerFilter.value = 'all';
    if (minAmountFilter) minAmountFilter.value = '';
    if (maxAmountFilter) maxAmountFilter.value = '';
    
    applySalesFilters();
  });

  // Yeni Satış butonu
  qs('#btnNewSale')?.addEventListener('click', () => {
    if (SALES_PERMS.create && !can(SALES_PERMS.create)) {
      toast.error(MESSAGES.ERROR_SALE_CREATE_PERMISSION);
      return;
    }
    window.location.href = '/pages/sale-new.html';
  });

  // Pagination
  qs('#btnPrevPage')?.addEventListener('click', () => {
    if (state.pagination.cursorHistory.length > 0) {
      state.pagination.cursorHistory.pop();
      const prevCursor = state.pagination.cursorHistory[state.pagination.cursorHistory.length - 1] || null;
      state.pagination.nextCursor = prevCursor;
      state.pagination.currentPage = Math.max(1, state.pagination.currentPage - 1);
      loadSales(false);
    }
  });

  qs('#btnNextPage')?.addEventListener('click', () => {
    if (state.pagination.hasMore && state.pagination.nextCursor) {
      state.pagination.cursorHistory.push(state.pagination.nextCursor);
      state.pagination.currentPage++;
      loadSales(false);
    }
  });

  qs('#btnLoadMore')?.addEventListener('click', () => {
    if (state.pagination.hasMore) {
      loadSales(false);
    }
  });

  // Select All checkbox
  qs('#selectAllSales')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    state.filteredSales.forEach(sale => {
      if (checked) {
        state.selectedSales.add(sale.id);
      } else {
        state.selectedSales.delete(sale.id);
      }
    });
    renderSalesTable();
    updateBulkActionsUI();
  });

  // Bulk actions
  qs('#btnBulkArchive')?.addEventListener('click', () => {
    bulkArchiveSales();
  });

  qs('#btnBulkDelete')?.addEventListener('click', () => {
    bulkDeleteSales();
  });

  qs('#btnBulkDeselect')?.addEventListener('click', () => {
    state.selectedSales.clear();
    qs('#selectAllSales').checked = false;
    renderSalesTable();
    updateBulkActionsUI();
  });
}

/**
 * Tablo event listener'ları (event delegation)
 * Teklifbul Rule v1.0 - CSP uyumlu
 */
function attachTableEventListeners() {
  const tbody = qs('#salesTableBody');
  if (!tbody) return;

  // Remove existing listener if any
  const existingHandler = tbody._tableHandler;
  if (existingHandler) {
    tbody.removeEventListener('click', existingHandler);
  }

  const handler = (e) => {
    const target = e.target;
    if (!target) return;

    // Checkbox click
    if (target.classList.contains('sale-checkbox')) {
      const saleId = target.getAttribute('data-sale-id');
      if (target.checked) {
        state.selectedSales.add(saleId);
      } else {
        state.selectedSales.delete(saleId);
      }
      updateBulkActionsUI();
      updateSelectAllCheckbox();
      return;
    }

    // Archive button
    if (target.classList.contains('btn-archive-sale')) {
      e.preventDefault();
      e.stopPropagation();
      const saleId = target.getAttribute('data-sale-id');
      archiveSale(saleId);
      return;
    }

    // Delete button
    if (target.classList.contains('btn-delete-sale')) {
      e.preventDefault();
      e.stopPropagation();
      const saleId = target.getAttribute('data-sale-id');
      deleteSale(saleId);
      return;
    }
  };

  tbody.addEventListener('click', handler);
  tbody._tableHandler = handler;
}

/**
 * Bulk actions UI güncelle
 */
function updateBulkActionsUI() {
  const container = qs('#bulkActionsContainer');
  const countSpan = qs('#bulkSelectionCount');

  if (!container || !countSpan) return;

  const count = state.selectedSales.size;
  if (count > 0) {
    container.style.display = 'block';
    countSpan.textContent = `${count} satış seçildi`;
  } else {
    container.style.display = 'none';
  }
}

/**
 * Select All checkbox güncelle
 */
function updateSelectAllCheckbox() {
  const selectAll = qs('#selectAllSales');
  if (!selectAll) return;

  const allSelected = state.filteredSales.length > 0 &&
    state.filteredSales.every(sale => state.selectedSales.has(sale.id));
  selectAll.checked = allSelected;
  selectAll.indeterminate = !allSelected && state.selectedSales.size > 0;
}

/**
 * Pagination UI güncelle
 */
function updatePaginationUI() {
  const container = qs('#paginationContainer');
  const pageInfo = qs('#pageInfo');
  const totalInfo = qs('#totalItemsInfo');
  const btnPrev = qs('#btnPrevPage');
  const btnNext = qs('#btnNextPage');
  const btnLoadMore = qs('#btnLoadMore');

  if (!container) return;

  if (state.sales.length === 0 && state.pagination.currentPage === 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex'; // UI standard uses flex for centering

  if (pageInfo) {
    pageInfo.textContent = `Sayfa ${state.pagination.currentPage}`;
  }
  
  if (totalInfo) {
    // API does not return a "total" count, so we show the loaded count
    totalInfo.textContent = `Toplam: ${state.sales.length}`;
  }

  if (btnPrev) {
    btnPrev.disabled = state.pagination.cursorHistory.length === 0;
  }

  if (btnNext) {
    btnNext.disabled = !state.pagination.hasMore;
  }

  // Infinite scroll için "Daha Fazla Yükle" butonu
  if (btnLoadMore) {
    btnLoadMore.style.display = (state.pagination.hasMore && !btnNext) ? 'inline-block' : 'none';
  }
}

/**
 * Satış arşivle
 * Teklifbul Rule v1.0 - Audit log
 * @param {string} saleId
 * @param {boolean} isReceipt - Fiş ile kapama mı?
 */
async function archiveSale(saleId, isReceipt = false) {
  if (!SALES_PERMS.archive || !can(SALES_PERMS.archive)) {
    toast.error(MESSAGES.ERROR_SALE_ARCHIVE_PERMISSION);
    return;
  }

  const confirmMsg = isReceipt
    ? 'Bu satışı "Fiş Kesildi" olarak kabul edip arşivlemek istediğinize emin misiniz?'
    : 'Bu satışı arşivlemek istediğinize emin misiniz?';

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    logger.group('Satış Arşivleniyor');

    const response = await authFetch(`/api/sales/${saleId}/archive`, {
      method: 'POST',
      body: JSON.stringify({
        companyId: state.companyId,
        userId: state.userId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Satış arşivlenemedi');
    }

    const successMsg = isReceipt ? 'SATIŞ FİŞ KULLANILARAK KAPATILDI' : MESSAGES.SUCCESS_SALE_ARCHIVED;
    toast.success(successMsg);
    logger.info('Satış arşivlendi', { saleId, isReceipt });
    logger.end();

    // Eğer detay sayfasındaysak sayfayı yenile, yoksa tabloyu güncelle
    if (window.location.pathname.includes('sale-detail.html')) {
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      await loadSales(true);
    }
  } catch (error) {
    logger.error('Satış arşivleme hatası', error);
    toast.error(`Hata: ${error.message}`);
  }
}

/**
 * Satış sil
 * Teklifbul Rule v1.0 - Audit log
 */
async function deleteSale(saleId) {
  if (!SALES_PERMS.delete || !can(SALES_PERMS.delete)) {
    toast.error(MESSAGES.ERROR_SALE_DELETE_PERMISSION);
    return;
  }

  if (!confirm('Bu satışı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
    return;
  }

  try {
    logger.group('Satış Siliniyor');

    const response = await authFetch(`/api/sales/${saleId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        companyId: state.companyId,
        userId: state.userId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Satış silinemedi');
    }

    toast.success(MESSAGES.SUCCESS_SALE_DELETED);
    logger.info('Satış silindi', { saleId });
    logger.end();

    await loadSales(true);
  } catch (error) {
    logger.error('Satış silme hatası', error);
    toast.error(`Hata: ${error.message}`);
  }
}

/**
 * Toplu arşivle
 * Teklifbul Rule v1.0 - Audit log
 */
async function bulkArchiveSales() {
  if (!SALES_PERMS.archive || !can(SALES_PERMS.archive)) {
    toast.error(MESSAGES.ERROR_SALE_ARCHIVE_PERMISSION);
    return;
  }

  const selectedIds = Array.from(state.selectedSales);
  if (selectedIds.length === 0) {
    toast.error(MESSAGES.ERROR_SALE_SELECT_REQUIRED_ARCHIVE);
    return;
  }

  if (!confirm(`${selectedIds.length} satışı arşivlemek istediğinize emin misiniz?`)) {
    return;
  }

  try {
    logger.group('Toplu Satış Arşivleme');

    const promises = selectedIds.map(async (saleId) => {
      const response = await authFetch(`/api/sales/${saleId}/archive`, {
        method: 'POST',
        body: JSON.stringify({
          companyId: state.companyId,
          userId: state.userId
        })
      });

      if (!response.ok) {
        let message = 'Satış arşivlenemedi';
        try {
          const body = await response.json();
          message = body?.message || message;
        } catch (_) {
          // Teklifbul Rule v1.0 - JSON parse hatasında varsayılan mesaj kullan
        }
        throw new Error(message);
      }

      return saleId;
    });

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.length - successCount;

    if (failCount > 0) {
      toast.warn(`${successCount} satış arşivlendi, ${failCount} satış arşivlenemedi`);
    } else {
      toast.success(`${successCount} satış arşivlendi`);
    }

    logger.info('Toplu arşivleme tamamlandı', { successCount, failCount });
    logger.end();

    state.selectedSales.clear();
    await loadSales(true);
  } catch (error) {
    logger.error('Toplu arşivleme hatası', error);
    toast.error(`Hata: ${error.message}`);
  }
}

/**
 * Toplu sil
 * Teklifbul Rule v1.0 - Audit log
 */
async function bulkDeleteSales() {
  if (!SALES_PERMS.delete || !can(SALES_PERMS.delete)) {
    toast.error(MESSAGES.ERROR_SALE_DELETE_PERMISSION);
    return;
  }

  const selectedIds = Array.from(state.selectedSales);
  if (selectedIds.length === 0) {
    toast.error(MESSAGES.ERROR_SALE_SELECT_REQUIRED_DELETE);
    return;
  }

  if (!confirm(`${selectedIds.length} satışı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
    return;
  }

  try {
    logger.group('Toplu Satış Silme');

    const promises = selectedIds.map(async (saleId) => {
      const response = await authFetch(`/api/sales/${saleId}`, {
        method: 'DELETE',
        body: JSON.stringify({
          companyId: state.companyId,
          userId: state.userId
        })
      });

      if (!response.ok) {
        let message = 'Satış silinemedi';
        try {
          const body = await response.json();
          message = body?.message || message;
        } catch (_) {
          // Teklifbul Rule v1.0 - JSON parse hatasında varsayılan mesaj kullan
        }
        throw new Error(message);
      }

      return saleId;
    });

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.length - successCount;

    if (failCount > 0) {
      toast.warn(`${successCount} satış silindi, ${failCount} satış silinemedi`);
    } else {
      toast.success(`${successCount} satış silindi`);
    }

    logger.info('Toplu silme tamamlandı', { successCount, failCount });
    logger.end();

    state.selectedSales.clear();
    await loadSales(true);
  } catch (error) {
    logger.error('Toplu silme hatası', error);
    toast.error(`Hata: ${error.message}`);
  }
}

/**
 * Event listener'ları kur (sale-new.html için)
 */
function setupSaleFormListeners() {
  // Müşteri seçimi, ürün ekleme, hesaplama vb. (sale-new.html'de detaylı)
  logger.info('Sale form listeners kuruldu');
}

/**
 * Event listener'ları kur (sale-detail.html için)
 */
function setupSaleDetailListeners() {
  logger.info('Sale detail listeners kuruldu');

  // Fatura oluştur butonu
  qs('#btnCreateInvoiceFromSale')?.addEventListener('click', async () => {
    if (!state.currentSale) return;
    const { createInvoiceFromSale } = await import('./sales-documents.js');
    await createInvoiceFromSale(state.currentSale.id);
  });

  // İrsaliye oluştur butonu
  qs('#btnCreateDeliveryFromSale')?.addEventListener('click', async () => {
    if (!state.currentSale) return;
    const { createDeliveryNoteFromSale } = await import('./sales-documents.js');
    await createDeliveryNoteFromSale(state.currentSale.id);
  });
}

/**
 * Helper fonksiyonlar
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function formatCurrency(amount, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

export function formatDate(timestamp) {
  if (!timestamp) return '-';
  
  // Eğer Firebase Timestamp objesi ise (SDK tarafından oluşturulmuş)
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleDateString('tr-TR');
  }
  
  // Eğer Plain Object olarak gelmişse (API'den dönen JSON gibi)
  // { _seconds: ..., _nanoseconds: ... } veya { seconds: ..., nanoseconds: ... }
  if (typeof timestamp === 'object') {
    const seconds = timestamp._seconds || timestamp.seconds;
    if (seconds !== undefined) {
      return new Date(seconds * 1000).toLocaleDateString('tr-TR');
    }
  }

  // Diğer durumlar (Date objesi, string, number)
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Geçersiz Tarih';
  return date.toLocaleDateString('tr-TR');
}

export function getStatusLabel(status) {
  const labels = {
    draft: 'Taslak',
    saved: 'Kaydedildi',
    pending_approval: 'Onay Bekliyor',
    approved: 'Onaylandı',
    delivered: 'Teslim Edildi',
    invoiced: 'Faturalandı',
    cancelled: 'İptal Edildi',
    archived: 'Satış fiş kullanılarak kapatıldı'
  };
  return labels[status] || status;
}

export function getStatusBadgeClass(status) {
  const classes = {
    draft: 'secondary',
    saved: 'primary',
    pending_approval: 'warning',
    approved: 'success',
    delivered: 'info',
    invoiced: 'success',
    cancelled: 'danger',
    archived: 'muted'
  };
  return classes[status] || 'secondary';
}

// Global functions (window'a export)
window.validateStatusTransition = validateStatusTransition;
window.canEditSale = canEditSale;
window.calculateVat = calculateVat;
window.calculateDiscount = calculateDiscount;
window.calculateTotal = calculateTotal;
