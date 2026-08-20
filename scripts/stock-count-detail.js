/**
 * Stok Sayım Detay Modülü
 * Teklifbul Rule v1.0 - Sayım listesi hazırlama, sayım girişi ve onaylama
 */

// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, doc, getDoc, serverTimestamp, deleteDoc, limit, startAfter } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { searchStocks } from '/scripts/lib/stock-search.js';
import { toast } from '../src/shared/ui/toast.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '../src/shared/constants/messages.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, requirePerm, getStockPerms } from '../assets/js/state/permissions.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { STOCK_LIST_PAGE_SIZE, STOCK_CATALOG_MAX_PAGES, STOCK_COUNT_ITEMS_QUERY_LIMIT } from '../src/shared/constants/timing.js';

// ExcelJS global (CDN'den yükleniyor)
const ExcelJS = window.ExcelJS;

const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

// Teklifbul Rule v1.0 - HTML escape helper
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const state = {
  countId: null,
  companyId: null,
  countData: null,
  location: null,
  countItems: [],
  filteredItems: [],
  stocks: [],
  allStocks: []
};

const STOCK_PERMS = getStockPerms();
const COUNT_PERMS = {
  create: STOCK_PERMS?.movements?.adjust || null,
  enter: STOCK_PERMS?.movements?.adjust || null,
  approve: STOCK_PERMS?.movements?.adjust || null,
  view: STOCK_PERMS?.view || null
};

// Initialize
(async () => {
  try {
    await requireAuth();

    // Get count ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const countId = urlParams.get('id');
    if (!countId) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_ID_NOT_FOUND);
      window.location.href = '/pages/stock-count.html';
      return;
    }

    state.countId = countId;

    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.error('Stock count detail: company context alınamadı');
      toast.error(MESSAGES.ERROR_STOCK_COUNT_COMPANY_VERIFY);
      return;
    }

    state.companyId = companyContext.companyId;

    // Permission check
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) return;

    if (COUNT_PERMS.view && !can(COUNT_PERMS.view)) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_VIEW_PERMISSION);
      window.location.href = '/pages/stock-count.html';
      return;
    }

    await loadCountData();
    await loadStocks();
    setupEventListeners();
    // Teklifbul Rule v1.0 - loadCountItems içinde otomatik stok ekleme yapılıyor
    await loadCountItems();
    updateUI();
  } catch (error) {
    logger.error('Stock count detail initialization error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_DETAIL_LOAD.replace('{message}', error.message));
  }
})();

// Load count data
async function loadCountData() {
  try {
    const countDoc = await getDoc(doc(db, 'stock_counts', state.countId));
    if (!countDoc.exists()) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_NOT_FOUND);
      window.location.href = '/pages/stock-count.html';
      return;
    }

    state.countData = { id: countDoc.id, ...countDoc.data() };

    // Load location
    if (state.countData.locationId) {
      const locationDoc = await getDoc(doc(db, 'stock_locations', state.countData.locationId));
      if (locationDoc.exists()) {
        state.location = { id: locationDoc.id, ...locationDoc.data() };
      }
    }

    // Update page title
    qs('#countTitle').textContent = state.countData.title || 'Sayım Detayı';
    const locationName = state.location ? state.location.name : 'Bilinmeyen';
    const statusBadge = getStatusBadge(state.countData.status);
    // Teklifbul Rule v1.0 - XSS Protection
    const safeLocationName = DOMPurify.sanitize(locationName || '', { ALLOWED_TAGS: [] });
    const safeStatusBadge = DOMPurify.sanitize(statusBadge || '', {
      ALLOWED_TAGS: ['span'],
      ALLOWED_ATTR: ['class']
    });
    qs('#countMeta').innerHTML = DOMPurify.sanitize(`📍 ${safeLocationName} | ${safeStatusBadge}`, {
      ALLOWED_TAGS: ['span'],
      ALLOWED_ATTR: ['class']
    });

  } catch (error) {
    logger.error('Load count data error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_INFO_LOAD);
  }
}

// Load stocks
async function loadStocks() {
  try {
    const stocksRef = collection(db, 'stocks');
    state.allStocks = [];
    let lastDoc = null;
    let capped = false;
    for (let page = 0; page < STOCK_CATALOG_MAX_PAGES; page++) {
      const pageQuery = lastDoc
        ? query(
          stocksRef,
          where('companyId', '==', state.companyId),
          orderBy('sku'),
          startAfter(lastDoc),
          limit(STOCK_LIST_PAGE_SIZE)
        )
        : query(
          stocksRef,
          where('companyId', '==', state.companyId),
          orderBy('sku'),
          limit(STOCK_LIST_PAGE_SIZE)
        );
      const snap = await getDocs(pageQuery);
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.companyId || data.companyId === state.companyId) {
          state.allStocks.push({ id: docSnap.id, ...data });
        }
      });
      if (snap.empty || snap.size < STOCK_LIST_PAGE_SIZE) {
        capped = false;
        break;
      }
      lastDoc = snap.docs[snap.docs.length - 1];
      if (page === STOCK_CATALOG_MAX_PAGES - 1) capped = true;
    }
    if (capped) {
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(STOCK_LIST_PAGE_SIZE * STOCK_CATALOG_MAX_PAGES)));
    }
    state.stocks = state.allStocks;
  } catch (error) {
    logger.error('Load stocks error', error);
    try {
      const snap = await getDocs(query(
        collection(db, 'stocks'),
        where('companyId', '==', state.companyId),
        limit(STOCK_LIST_PAGE_SIZE)
      ));
      state.allStocks = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.companyId || data.companyId === state.companyId) {
          state.allStocks.push({ id: docSnap.id, ...data });
        }
      });
      state.stocks = state.allStocks;
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(STOCK_LIST_PAGE_SIZE)));
    } catch (fallbackError) {
      logger.error('Stocks load fallback error', fallbackError);
    }
  }
}

// Load count items
async function loadCountItems() {
  try {
    const itemsRef = collection(db, 'stock_counts', state.countId, 'count_items');
    const itemsQuery = query(itemsRef, orderBy('sku'), limit(STOCK_COUNT_ITEMS_QUERY_LIMIT));
    const snap = await getDocs(itemsQuery);

    state.countItems = [];
    snap.forEach(doc => {
      const data = doc.data();
      state.countItems.push({ id: doc.id, ...data });
    });// Teklifbul Rule v1.0 - Otomatik stok ekleme: Eğer sayım listesi boşsa veya yeni stoklar varsa ekle
    if (state.countData && state.countData.locationId && state.allStocks && state.allStocks.length > 0) {
      await autoAddMissingStocks();
    }

    // Load system quantities from stock_balances
    await loadSystemQuantities();

    state.filteredItems = [...state.countItems]; renderCountItems();
    updateStats();
  } catch (error) {
    logger.error('Load count items error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_ITEMS_LOAD);
  }
}

// Auto-add missing stocks to count
async function autoAddMissingStocks() {
  try {
    if (!state.countData || !state.countData.locationId || !state.allStocks || state.allStocks.length === 0) {
      return;
    }

    // Get existing SKUs in count
    const existingSkus = new Set(state.countItems.map(item => item.sku?.toLowerCase()));

    // Find missing stocks
    const missingStocks = state.allStocks.filter(stock =>
      stock.sku && !existingSkus.has(stock.sku.toLowerCase())
    );

    if (missingStocks.length === 0) {
      return; // No missing stocks
    }

    logger.info('Otomatik stok ekleme', { missingCount: missingStocks.length });

    const itemsRef = collection(db, 'stock_counts', state.countId, 'count_items');
    let added = 0;

    for (const stock of missingStocks) {
      try {
        // Get system quantity for this location
        let systemQuantity = 0;
        const balanceDocId = `${state.companyId}_${stock.sku}_${state.countData.locationId}`;
        const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceDocId));

        if (balanceDoc.exists()) {
          systemQuantity = balanceDoc.data().quantity || 0;
        }

        await addDoc(itemsRef, {
          stockId: stock.id,
          sku: stock.sku,
          stockName: stock.name || '',
          barcode: stock.barcode || '',
          unit: stock.unit || 'ADT',
          systemQuantity: systemQuantity,
          countedQuantity: null,
          difference: null,
          countedBy: null,
          countedAt: null,
          notes: ''
        });

        // Add to local state
        state.countItems.push({
          id: null, // Will be set after reload
          stockId: stock.id,
          sku: stock.sku,
          stockName: stock.name,
          barcode: stock.barcode || null,
          unit: stock.unit || 'ADT',
          systemQuantity: systemQuantity,
          countedQuantity: null,
          difference: null,
          notes: ''
        });

        added++;
      } catch (error) {
        logger.warn('Auto-add stock error', { stock: stock.sku, error });
      }
    }

    if (added > 0) {
      logger.info(`${added} stok otomatik olarak eklendi`);
      // Reload to get document IDs
      const itemsRef = collection(db, 'stock_counts', state.countId, 'count_items');
      const itemsQuery = query(itemsRef, orderBy('sku'));
      const snap = await getDocs(itemsQuery);

      state.countItems = [];
      snap.forEach(doc => {
        state.countItems.push({ id: doc.id, ...doc.data() });
      });
    }
  } catch (error) {
    logger.error('Auto-add missing stocks error', error);
  }
}

// Load system quantities from stock_balances
async function loadSystemQuantities() {
  try {
    for (const item of state.countItems) {
      if (!item.sku || !state.countData.locationId) continue;

      const balanceDocId = `${state.companyId}_${item.sku}_${state.countData.locationId}`;
      const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceDocId));

      if (balanceDoc.exists()) {
        const balanceData = balanceDoc.data();
        item.systemQuantity = balanceData.quantity || 0;
        item.systemAvgCost = balanceData.avgCost || 0;
      } else {
        item.systemQuantity = 0;
        item.systemAvgCost = 0;
      }

      // Calculate difference
      if (item.countedQuantity !== null && item.countedQuantity !== undefined) {
        item.difference = item.countedQuantity - item.systemQuantity;
      }
    }
  } catch (error) {
    logger.error('Load system quantities error', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Back button
  const btnBack = qs('#btnBackToCountList');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.href = '/pages/stock-count.html';
    });
  }

  // Start count button
  const btnStart = qs('#btnStartCount');
  if (btnStart) {
    btnStart.addEventListener('click', handleStartCount);
  }

  // Teklifbul Rule v1.0 - "Ürün Ekle" ve "Tüm Stokları Ekle" butonları kaldırıldı
  // Stoklar otomatik olarak ekleniyor

  // Complete count button
  const btnComplete = qs('#btnCompleteCount');
  if (btnComplete) {
    btnComplete.addEventListener('click', handleCompleteCount);
  }

  // Approve count button
  const btnApprove = qs('#btnApproveCount');
  if (btnApprove) {
    btnApprove.addEventListener('click', handleApproveCount);
  }

  // Excel import
  const btnImport = qs('#btnImportExcel');
  if (btnImport) {
    btnImport.addEventListener('click', handleImportExcel);
  }

  // Excel export
  const btnExport = qs('#btnExportExcel');
  if (btnExport) {
    btnExport.addEventListener('click', handleExportExcel);
  }

  // Search filter
  const searchInput = qs('#searchItems');
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // Difference filter
  const diffFilter = qs('#filterDifference');
  if (diffFilter) {
    diffFilter.addEventListener('change', applyFilters);
  }

  // Counted filter
  const countedFilter = qs('#filterCounted');
  if (countedFilter) {
    countedFilter.addEventListener('change', applyFilters);
  }

  // Barcode scanner
  const barcodeInput = qs('#barcodeInput');
  const btnScanBarcode = qs('#btnScanBarcode');
  if (barcodeInput) {
    let barcodeTimeout = null;

    // Teklifbul Rule v1.0 - Barkod tabancası ile otomatik arama
    // Barkod tabancası genellikle Enter tuşu gönderir
    barcodeInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Timeout'u iptal et
        if (barcodeTimeout) {
          clearTimeout(barcodeTimeout);
          barcodeTimeout = null;
        }
        const barcode = barcodeInput.value.trim();
        if (barcode) {
          await handleBarcodeScan(barcode);
          barcodeInput.value = '';
          barcodeInput.focus();
        }
      }
    });

    // Teklifbul Rule v1.0 - Otomatik arama: Barkod girildikten 300ms sonra otomatik ara
    // (Barkod tabancası hızlı okur, bu yüzden debounce kullanıyoruz)
    barcodeInput.addEventListener('input', async (e) => {
      const barcode = e.target.value.trim();

      // Önceki timeout'u iptal et
      if (barcodeTimeout) {
        clearTimeout(barcodeTimeout);
      }

      // Eğer barkod yeterince uzunsa (genellikle barkodlar 8+ karakterdir)
      if (barcode.length >= 3) {
        barcodeTimeout = setTimeout(async () => {
          // Enter tuşu ile tetiklenmediyse otomatik ara
          await handleBarcodeScan(barcode);
          barcodeInput.value = '';
          barcodeInput.focus();
          barcodeTimeout = null;
        }, 300); // 300ms debounce (barkod tabancası hızlı okur)
      }
    });

    // Manuel arama butonu
    if (btnScanBarcode) {
      btnScanBarcode.addEventListener('click', async () => {
        // Timeout'u iptal et
        if (barcodeTimeout) {
          clearTimeout(barcodeTimeout);
          barcodeTimeout = null;
        }
        const barcode = barcodeInput.value.trim();
        if (barcode) {
          await handleBarcodeScan(barcode);
          barcodeInput.value = '';
          barcodeInput.focus();
        }
      });
    }

    // Sayfa yüklendiğinde focus (APPROVED durumu hariç)
    if (state.countData && state.countData.status !== 'APPROVED') {
      setTimeout(() => barcodeInput.focus(), 500);
    }
  }
}

// Update UI based on count status
function updateUI() {
  if (!state.countData) return;

  const status = state.countData.status;
  const btnStart = qs('#btnStartCount');
  const btnComplete = qs('#btnCompleteCount');
  const btnApprove = qs('#btnApproveCount');
  const barcodeInput = qs('#barcodeInput');
  const barcodeSection = barcodeInput ? barcodeInput.closest('div[style*="border-top"]') : null;

  if (status === 'DRAFT') {
    if (btnStart) btnStart.style.display = 'inline-block';
    if (btnComplete) btnComplete.style.display = 'none';
    if (btnApprove) btnApprove.style.display = 'none';
    if (barcodeSection) barcodeSection.style.display = 'none';
  } else if (status === 'IN_PROGRESS') {
    if (btnStart) btnStart.style.display = 'none';
    if (btnComplete) btnComplete.style.display = 'inline-block';
    if (btnApprove) btnApprove.style.display = 'none';
    if (barcodeSection) barcodeSection.style.display = 'block';
    // Focus barcode input when count starts
    if (barcodeInput) {
      setTimeout(() => barcodeInput.focus(), 300);
    }
  } else if (status === 'COMPLETED') {
    // Teklifbul Rule v1.0 - COMPLETED durumunda düzenleme yapılabilir (hatalı kayıt düzeltme için)
    if (btnStart) btnStart.style.display = 'none';
    if (btnComplete) btnComplete.style.display = 'none';
    if (btnApprove) btnApprove.style.display = 'inline-block';
    if (barcodeSection) barcodeSection.style.display = 'block'; // Barkod okuma aktif (düzenleme için)
  } else if (status === 'APPROVED') {
    if (btnStart) btnStart.style.display = 'none';
    if (btnComplete) btnComplete.style.display = 'none';
    if (btnApprove) btnApprove.style.display = 'none';
    if (barcodeSection) barcodeSection.style.display = 'none';
  }
}

// Handle start count
async function handleStartCount() {
  try {
    if (state.countItems.length === 0) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_EMPTY);
      return;
    }

    // Permission check
    if (COUNT_PERMS.enter) {
      const ok = await requirePerm(COUNT_PERMS.enter, {
        toastMessage: 'Sayım başlatma yetkiniz yok.'
      });
      if (!ok) return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_SESSION_NOT_FOUND);
      return;
    }

    await updateDoc(doc(db, 'stock_counts', state.countId), {
      status: 'IN_PROGRESS',
      startedAt: serverTimestamp(),
      startedBy: user.uid,
      updatedAt: serverTimestamp()
    });

    state.countData.status = 'IN_PROGRESS';
    state.countData.startedAt = new Date();
    state.countData.startedBy = user.uid;

    toast.success(MESSAGES.SUCCESS_STOCK_COUNT_STARTED);
    updateUI();

  } catch (error) {
    logger.error('Start count error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_START.replace('{message}', error.message));
  }
}

// Show add items modal
function showAddItemsModal() {
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'addItemsModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;';

  // Teklifbul Rule v1.0 - XSS Protection
  modal.innerHTML = DOMPurify.sanitize(`
    <div style="background:#fff;border-radius:8px;padding:24px;max-width:800px;width:90%;max-height:90vh;overflow-y:auto;">
      <h3 style="margin:0 0 16px 0">Ürün Ekle</h3>
      <div style="margin-bottom:16px">
        <input type="text" id="modalStockSearch" placeholder="SKU veya ürün adı ara..." style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px" />
        <div id="modalStockResults" style="margin-top:8px;max-height:400px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;display:none"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" id="modalCancelBtn">İptal</button>
        <button class="btn btn-primary" id="modalAddAllBtn" style="display:none">Tümünü Ekle</button>
      </div>
    </div>
  `, {
    ALLOWED_TAGS: ['div', 'h3', 'input', 'button'],
    ALLOWED_ATTR: ['style', 'class', 'id', 'type', 'placeholder']
  });

  document.body.appendChild(modal);

  // Setup search
  const searchInput = qs('#modalStockSearch');
  const resultsDiv = qs('#modalStockResults');
  let searchTimeout = null;
  let selectedStocks = [];

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);

    if (!query || query.length < 1) {
      resultsDiv.style.display = 'none';
      selectedStocks = [];
      return;
    }

    searchTimeout = setTimeout(() => {
      const matches = searchStocks(state.allStocks, query, 100);

      // Filter out already added items
      const availableMatches = matches.filter(stock =>
        !state.countItems.find(item => item.sku === stock.sku)
      );

      if (availableMatches.length === 0) {
        // Teklifbul Rule v1.0 - XSS Protection
        resultsDiv.innerHTML = DOMPurify.sanitize('<div style="padding:12px;text-align:center;color:#6b7280">Sonuç bulunamadı</div>', {
          ALLOWED_TAGS: ['div'],
          ALLOWED_ATTR: ['style']
        });
        resultsDiv.style.display = 'block';
        selectedStocks = [];
        qs('#modalAddAllBtn').style.display = 'none';
        return;
      }

      resultsDiv.innerHTML = '';
      selectedStocks = [];

      availableMatches.forEach((stock, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:10px;border-bottom:1px solid #e5e7eb;cursor:pointer;display:flex;align-items:center;gap:12px;';
        div.style.background = idx % 2 === 0 ? '#fff' : '#f9fafb';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = stock.id;
        checkbox.style.width = '18px';
        checkbox.style.height = '18px';
        checkbox.addEventListener('change', () => {
          updateSelectedStocks();
        });

        // Teklifbul Rule v1.0 - XSS Protection
        const safeSku = DOMPurify.sanitize(stock.sku || '', { ALLOWED_TAGS: [] });
        const safeName = DOMPurify.sanitize(stock.name || '', { ALLOWED_TAGS: [] });
        const safeUnit = DOMPurify.sanitize(stock.unit || 'ADT', { ALLOWED_TAGS: [] });
        div.innerHTML = DOMPurify.sanitize(`
          <div style="flex:1">
            <div style="font-weight:600;color:#111827">${safeSku}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">${safeName}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Birim: ${safeUnit}</div>
          </div>
        `, {
          ALLOWED_TAGS: ['div'],
          ALLOWED_ATTR: ['style']
        });
        div.insertBefore(checkbox, div.firstChild);

        div.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            updateSelectedStocks();
          }
        });

        resultsDiv.appendChild(div);
      });

      resultsDiv.style.display = 'block';
      updateSelectedStocks();
    }, 300);
  });

  function updateSelectedStocks() {
    const checkboxes = resultsDiv.querySelectorAll('input[type="checkbox"]:checked');
    selectedStocks = Array.from(checkboxes).map(cb => {
      return state.allStocks.find(s => s.id === cb.value);
    }).filter(Boolean);

    const addAllBtn = qs('#modalAddAllBtn');
    if (selectedStocks.length > 0) {
      addAllBtn.style.display = 'inline-block';
      addAllBtn.textContent = `${selectedStocks.length} Ürün Ekle`;
    } else {
      addAllBtn.style.display = 'none';
    }
  }

  // Add all button
  qs('#modalAddAllBtn').addEventListener('click', async () => {
    if (selectedStocks.length === 0) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_PRODUCT_SELECT_REQUIRED);
      return;
    }

    const btn = qs('#modalAddAllBtn');
    btn.disabled = true;
    btn.textContent = 'Ekleniyor...';

    let added = 0;
    for (const stock of selectedStocks) {
      try {
        await addItemToCount(stock);
        added++;
      } catch (error) {
        logger.error('Add item error', { stock, error });
      }
    }

    toast.success(`${added} ürün eklendi`);
    document.body.removeChild(modal);
    await loadCountItems();
  });

  // Cancel button
  qs('#modalCancelBtn').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  searchInput.focus();
}

// Add item to count
async function addItemToCount(stock) {
  try {
    const itemsRef = collection(db, 'stock_counts', state.countId, 'count_items');

    // Get system quantity
    let systemQuantity = 0;
    if (state.countData.locationId) {
      const balanceDocId = `${state.companyId}_${stock.sku}_${state.countData.locationId}`;
      const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceDocId));
      if (balanceDoc.exists()) {
        systemQuantity = balanceDoc.data().quantity || 0;
      }
    }

    await addDoc(itemsRef, {
      stockId: stock.id,
      sku: stock.sku,
      stockName: stock.name || '',
      barcode: stock.barcode || '', // Teklifbul Rule v1.0 - Barkod bilgisi
      unit: stock.unit || 'ADT',
      systemQuantity: systemQuantity,
      countedQuantity: null,
      difference: null,
      countedBy: null,
      countedAt: null,
      notes: ''
    });

    toast.success(MESSAGES.SUCCESS_STOCK_COUNT_PRODUCT_ADDED);
    await loadCountItems();

  } catch (error) {
    logger.error('Add item error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_PRODUCT_ADD.replace('{message}', error.message));
  }
}

// Render count items
function renderCountItems() {
  const tbody = qs('#countItemsBody'); if (!tbody) return;

  if (state.filteredItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#6b7280">Sayım kalemi bulunamadı.</td></tr>';
    return;
  }
  // Teklifbul Rule v1.0 - XSS Protection
  const itemsHTML = state.filteredItems.map(item => {
    // Teklifbul Rule v1.0 - Fark hesaplama: Sayılan miktar girilmediyse fark gösterilmez
    // Sayılan miktar girilmediyse (null/undefined), fark null olmalı ve görüntülenmemeli
    let difference = null;
    if (item.countedQuantity !== null && item.countedQuantity !== undefined) {
      // Sayılan miktar girilmişse fark hesapla
      const systemQty = item.systemQuantity || 0;
      difference = item.countedQuantity - systemQty;
    }

    const differenceClass = difference === null ? 'difference-zero' :
      difference > 0 ? 'difference-positive' :
        difference < 0 ? 'difference-negative' : 'difference-zero';
    // Teklifbul Rule v1.0 - Sayılan miktar girilmediyse fark gösterilmez, sistem miktarı gösterilir
    const differenceText = difference === null ? '-' : difference.toString();

    // Teklifbul Rule v1.0 - Sadece APPROVED durumunda düzenleme kapalı
    // COMPLETED durumunda düzenleme yapılabilir (hatalı kayıt düzeltme için)
    const isReadOnly = state.countData.status === 'APPROVED';

    // Find stock to get barcode - Teklifbul Rule v1.0
    const stock = state.allStocks && state.allStocks.length > 0
      ? state.allStocks.find(s => s.sku === item.sku)
      : null;
    const barcode = stock?.barcode || '-';

    // Teklifbul Rule v1.0 - Sütun sırası: SKU, Ürün Adı, Barkod, Birim, Sistem Miktarı, Sayılan Miktar, Fark, Not, İşlem
    return `
      <tr data-item-id="${item.id}">
        <td><strong>${escapeHtml(item.sku)}</strong></td>
        <td>${escapeHtml(item.stockName || '-')}</td>
        <td style="font-family:monospace;font-size:12px;color:#6b7280">${escapeHtml(barcode)}</td>
        <td>${escapeHtml(item.unit || 'ADT')}</td>
        <td class="col-number" style="text-align:center">${item.systemQuantity || 0}</td>
        <td style="text-align:center">
          <input type="number" 
                 class="count-input" 
                 data-item-id="${item.id}"
                 value="${item.countedQuantity !== null && item.countedQuantity !== undefined ? item.countedQuantity : ''}"
                 placeholder="Sayılan miktar"
                 ${isReadOnly ? 'readonly' : ''}
                 step="0.01"
                 style="width:100%;max-width:120px;text-align:right;margin:0 auto;display:block" />
        </td>
        <td class="col-number ${differenceClass}" style="font-weight:600;text-align:center">${differenceText}</td>
        <td>
          <input type="text" 
                 class="count-notes" 
                 data-item-id="${item.id}"
                 value="${escapeHtml(item.notes || '')}"
                 placeholder="Not..."
                 ${isReadOnly ? 'readonly' : ''}
                 style="width:100%;padding:4px 8px;font-size:12px" />
        </td>
        <td style="text-align:center">
          ${!isReadOnly ? `<button class="btn btn-secondary btn-sm" data-action="save-item" data-item-id="${item.id}">Kaydet</button>` : ''}
          ${state.countData.status === 'DRAFT' ? `<button class="btn btn-danger btn-sm" data-action="remove-item" data-item-id="${item.id}">Kaldır</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
  // Teklifbul Rule v1.0 - XSS Protection
  // All user data is already escaped via escapeHtml(), so we can safely set innerHTML directly.
  // DOMPurify was stripping table structure tags (tr/td) and breaking the layout.
  tbody.innerHTML = itemsHTML;
  // Add event listeners
  qsa('.count-input').forEach(input => {
    input.addEventListener('change', handleCountInputChange);
    input.addEventListener('blur', handleCountInputBlur);
  });

  qsa('[data-action="save-item"]').forEach(btn => {
    btn.addEventListener('click', handleSaveItem);
  });

  qsa('[data-action="remove-item"]').forEach(btn => {
    btn.addEventListener('click', handleRemoveItem);
  });
}

// Handle count input change
function handleCountInputChange(e) {
  const itemId = e.target.dataset.itemId;
  const item = state.countItems.find(i => i.id === itemId);
  if (!item) return;

  // Teklifbul Rule v1.0 - Boş değer null olmalı
  const inputValue = e.target.value.trim();
  const countedQuantity = inputValue === '' ? null : parseFloat(inputValue);
  const systemQuantity = item.systemQuantity || 0;

  // Sayılan miktar girilmediyse fark null
  let difference = null;
  if (countedQuantity !== null && !isNaN(countedQuantity)) {
    difference = countedQuantity - systemQuantity;
  }

  // Update row difference
  const row = e.target.closest('tr');
  const diffCell = row.querySelector('td:nth-child(7)'); // Fark kolonu artık 7. sırada (barkod eklendi)
  if (diffCell) {
    diffCell.textContent = difference !== null ? difference.toString() : '-';
    diffCell.className = difference === null ? 'difference-zero' :
      difference > 0 ? 'difference-positive' :
        difference < 0 ? 'difference-negative' : 'difference-zero';
  }
}

// Handle count input blur - auto save
async function handleCountInputBlur(e) {
  const itemId = e.target.dataset.itemId;
  const inputValue = e.target.value.trim();

  // Teklifbul Rule v1.0 - Boş değer null olarak kaydedilmeli (0 değil)
  let countedQuantity = null;
  if (inputValue !== '') {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      countedQuantity = parsed;
    }
  }

  // Boş veya geçersiz değer olsa bile kaydet (null olarak)
  await saveCountItem(itemId, countedQuantity);
}

// Handle save item button
async function handleSaveItem(e) {
  const itemId = e.target.dataset.itemId;
  const row = e.target.closest('tr');
  const input = row.querySelector('.count-input');
  const inputValue = input.value.trim();

  // Teklifbul Rule v1.0 - Boş değer null olarak kaydedilebilir
  let countedQuantity = null;
  if (inputValue !== '') {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_QUANTITY_INVALID);
      return;
    }
    countedQuantity = parsed;
  }

  await saveCountItem(itemId, countedQuantity);
  toast.success(MESSAGES.SUCCESS_STOCK_COUNT_SAVED);
}

// Save count item
async function saveCountItem(itemId, countedQuantity) {
  try {
    const item = state.countItems.find(i => i.id === itemId);
    if (!item) return;

    const user = auth.currentUser;
    if (!user) return;

    const systemQuantity = item.systemQuantity || 0;
    const difference = countedQuantity - systemQuantity;
    const notesInput = document.querySelector(`.count-notes[data-item-id="${itemId}"]`);
    const notes = notesInput ? notesInput.value.trim() : '';

    await updateDoc(doc(db, 'stock_counts', state.countId, 'count_items', itemId), {
      countedQuantity: countedQuantity,
      difference: difference,
      countedBy: user.uid,
      countedAt: serverTimestamp(),
      notes: notes,
      updatedAt: serverTimestamp()
    });

    // Update local state
    item.countedQuantity = countedQuantity;
    item.difference = difference;
    item.countedBy = user.uid;
    item.countedAt = new Date();
    item.notes = notes;

    toast.success(MESSAGES.SUCCESS_STOCK_COUNT_SAVED);
    updateStats();

  } catch (error) {
    logger.error('Save count item error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_SAVE.replace('{message}', error.message));
  }
}

// Handle remove item
async function handleRemoveItem(e) {
  const itemId = e.target.dataset.itemId;
  const item = state.countItems.find(i => i.id === itemId);

  if (!item) {
    toast.error(MESSAGES.ERROR_STOCK_COUNT_PRODUCT_NOT_FOUND);
    return;
  }

  // Teklifbul Rule v1.0 - Kaldırma onayı: Ürün bilgisi göster
  const confirmMsg = `"${item.stockName || item.sku}" ürününü sayım listesinden kaldırmak istediğinizden emin misiniz?\n\nNot: Sayfa yenilendiğinde bu ürün otomatik olarak tekrar eklenecektir.`;

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    await deleteDoc(doc(db, 'stock_counts', state.countId, 'count_items', itemId));

    // Local state'ten kaldır
    state.countItems = state.countItems.filter(i => i.id !== itemId);
    state.filteredItems = state.filteredItems.filter(i => i.id !== itemId);

    // Teklifbul Rule v1.0 - Kaldırılan ürün otomatik olarak tekrar eklenecek
    toast.success(MESSAGES.SUCCESS_STOCK_COUNT_PRODUCT_REMOVED);

    renderCountItems();
    updateStats();

    // Otomatik geri ekleme (sayfa yenilemeden)
    await autoAddMissingStocks();
    // Yeni ürün eklendiyse listeyi yenile
    await loadCountItems();
  } catch (error) {
    logger.error('Remove item error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_PRODUCT_REMOVE.replace('{message}', error.message));
  }
}

// Apply filters
function applyFilters() {
  const searchQuery = qs('#searchItems').value.toLowerCase().trim();
  const diffFilter = qs('#filterDifference').value;
  const countedFilter = qs('#filterCounted').value;

  state.filteredItems = state.countItems.filter(item => {
    // Search filter - Teklifbul Rule v1.0 - SKU, ürün adı veya barkod ile arama
    if (searchQuery) {
      const sku = (item.sku || '').toLowerCase();
      const name = (item.stockName || '').toLowerCase();
      const barcode = (item.barcode || '').toString().toLowerCase();
      
      const matchesSku = sku.includes(searchQuery);
      const matchesName = name.includes(searchQuery);
      let matchesBarcode = barcode.includes(searchQuery);
      
      // Fallback: If barcode not in item, check allStocks
      if (!matchesBarcode && state.allStocks) {
        const stock = state.allStocks.find(s => s.sku === item.sku);
        if (stock && stock.barcode) {
          matchesBarcode = stock.barcode.toString().toLowerCase().includes(searchQuery);
        }
      }
      
      if (!matchesSku && !matchesName && !matchesBarcode) return false;
    }

    // Difference filter
    if (diffFilter) {
      const diff = item.difference;
      if (diffFilter === 'has-difference' && (diff === null || diff === 0)) return false;
      if (diffFilter === 'no-difference' && diff !== 0) return false;
      if (diffFilter === 'positive' && (!diff || diff <= 0)) return false;
      if (diffFilter === 'negative' && (!diff || diff >= 0)) return false;
    }

    // Counted filter
    if (countedFilter) {
      const isCounted = item.countedQuantity !== null && item.countedQuantity !== undefined;
      if (countedFilter === 'counted' && !isCounted) return false;
      if (countedFilter === 'not-counted' && isCounted) return false;
    }

    return true;
  });

  renderCountItems();
}

// Update stats
function updateStats() {
  const totalItems = state.countItems.length;
  const countedItems = state.countItems.filter(item =>
    item.countedQuantity !== null && item.countedQuantity !== undefined
  ).length;
  const progress = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;

  qs('#statTotalItems').textContent = totalItems;
  qs('#statCountedItems').textContent = countedItems;
  qs('#statProgress').textContent = `${progress}%`;
  qs('#progressBar').style.width = `${progress}%`;
  qs('#statStatus').textContent = getStatusText(state.countData.status);
}

// Handle complete count
async function handleCompleteCount() {
  try {
    const countedItems = state.countItems.filter(item =>
      item.countedQuantity !== null && item.countedQuantity !== undefined
    );

    if (countedItems.length === 0) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_NO_PRODUCTS_COUNTED);
      return;
    }

    // Teklifbul Rule v1.0 - COMPLETED durumunda düzenleme yapılabilir, bu yüzden "geri alınamaz" uyarısı kaldırıldı
    if (!confirm('Sayımı tamamlamak istediğinizden emin misiniz? Tamamlandıktan sonra düzenleme yapabilirsiniz, ancak onaylandıktan sonra düzenleme yapılamaz.')) {
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_SESSION_NOT_FOUND);
      return;
    }

    await updateDoc(doc(db, 'stock_counts', state.countId), {
      status: 'COMPLETED',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    state.countData.status = 'COMPLETED';
    state.countData.completedAt = new Date();

    toast.success(MESSAGES.SUCCESS_STOCK_COUNT_COMPLETED);
    updateUI();

  } catch (error) {
    logger.error('Complete count error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_COMPLETE.replace('{message}', error.message));
  }
}

// Handle approve count
async function handleApproveCount() {
  try {
    // Permission check
    if (COUNT_PERMS.approve) {
      const ok = await requirePerm(COUNT_PERMS.approve, {
        toastMessage: 'Sayım onaylama yetkiniz yok.'
      });
      if (!ok) return;
    }

    if (!confirm('Sayımı onaylamak istediğinizden emin misiniz? Onaylandıktan sonra ADJUST hareketleri oluşturulacak ve stok bakiyeleri güncellenecek.')) {
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_SESSION_NOT_FOUND);
      return;
    }

    const btn = qs('#btnApproveCount');
    btn.disabled = true;
    btn.textContent = 'Onaylanıyor...';

    // Create ADJUST movements for items with differences
    const itemsWithDifference = state.countItems.filter(item =>
      item.difference !== null && item.difference !== 0
    );

    // Teklifbul Rule v1.0 - Progress göstergesi
    const totalItems = itemsWithDifference.length;
    let createdMovements = 0;

    for (let i = 0; i < itemsWithDifference.length; i++) {
      const item = itemsWithDifference[i];

      // Progress güncelle
      if (totalItems > 10) {
        const progress = Math.round(((i + 1) / totalItems) * 100);
        btn.textContent = `Onaylanıyor... ${i + 1}/${totalItems} (${progress}%)`;
      }
      try {
        // Get stock document
        const stockDoc = await getDoc(doc(db, 'stocks', item.stockId));
        if (!stockDoc.exists()) continue;

        const newQuantity = item.countedQuantity;
        const siteId = state.countData.locationId?.startsWith('site_')
          ? state.countData.locationId.replace('site_', '')
          : null;

        const response = await authFetch('/api/stock-movements', {
          method: 'POST',
          body: JSON.stringify({
            type: 'ADJUST',
            stockId: item.stockId,
            sku: item.sku,
            stockName: item.stockName,
            unit: item.unit || 'ADT',
            locationId: state.countData.locationId,
            siteId,
            qty: newQuantity,
            unitCost: 0,
            ref: { kind: 'STOCK_COUNT', id: state.countId },
            createdByName: user.displayName || user.email || null,
          }),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || result.message || 'ADJUST kaydı başarısız');
        }

        createdMovements++;
      } catch (itemError) {
        logger.error('Create ADJUST movement error for item', { item, error: itemError });
      }
    }

    // Update count status
    await updateDoc(doc(db, 'stock_counts', state.countId), {
      status: 'APPROVED',
      approvedBy: user.uid,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    btn.textContent = 'Sayım durumu güncelleniyor...';

    state.countData.status = 'APPROVED';
    state.countData.approvedBy = user.uid;
    state.countData.approvedAt = new Date();

    btn.disabled = false;
    btn.textContent = 'Sayımı Onayla';

    toast.success(`${createdMovements} ADJUST hareketi oluşturuldu ve sayım onaylandı`);
    updateUI();

  } catch (error) {
    logger.error('Approve count error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_APPROVE.replace('{message}', error.message));
    const btn = qs('#btnApproveCount');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sayımı Onayla';
    }
  }
}

// Handle Excel import
async function handleImportExcel() {
  try {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        toast.info('Excel dosyası yükleniyor...');// Read Excel file
        const workbook = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
          toast.error('Excel dosyasında veri bulunamadı');
          return;
        }

        // Parse rows (skip header row)
        // Teklifbul Rule v1.0 - Kolon sırası: SKU (1), Ürün Adı (2), Barkod (3), Birim (4), Sistem Miktarı (5), Sayılan Miktar (6), Fark (7), Not (8)
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header

          const sku = row.getCell(1).value?.toString()?.trim();
          const countedQtyCell = row.getCell(6); // Sayılan Miktar 6. kolonda
          let countedQty = null;

          // Sayısal değer kontrolü - Teklifbul Rule v1.0
          if (countedQtyCell && countedQtyCell.value !== null && countedQtyCell.value !== undefined) {
            // Excel'de sayı olarak saklanmış olabilir veya string olabilir
            const cellValue = countedQtyCell.value;
            if (typeof cellValue === 'number') {
              countedQty = cellValue;
            } else if (typeof cellValue === 'string' && cellValue.trim() !== '') {
              const parsed = parseFloat(cellValue.trim());
              if (!isNaN(parsed)) {
                countedQty = parsed;
              }
            } else if (cellValue !== '' && cellValue !== null) {
              // Diğer durumlar için parseFloat dene
              const parsed = parseFloat(cellValue);
              if (!isNaN(parsed)) {
                countedQty = parsed;
              }
            }
          }

          const notes = row.getCell(8).value?.toString()?.trim() || ''; // Not 8. kolonda

          if (sku) {
            rows.push({ sku, countedQty, notes });
          }
        }); if (rows.length === 0) {
          toast.error('Excel dosyasında geçerli veri bulunamadı');
          return;
        }

        // Update count items
        let updated = 0;
        const user = auth.currentUser;
        if (!user) {
          toast.error(MESSAGES.ERROR_STOCK_COUNT_SESSION_NOT_FOUND);
          return;
        } for (const row of rows) {
          const item = state.countItems.find(i => i.sku && i.sku.toLowerCase() === row.sku.toLowerCase()); if (!item) {
            logger.warn('Excel import: SKU bulunamadı', { sku: row.sku });
            continue;
          }

          // Teklifbul Rule v1.0 - Fark hesaplama: Sadece sayılan miktar girilmişse fark hesapla
          const systemQuantity = item.systemQuantity || 0;
          let difference = null;
          if (row.countedQty !== null && !isNaN(row.countedQty)) {
            difference = row.countedQty - systemQuantity;
          }

          // Update count item
          const updateData = {
            updatedAt: serverTimestamp()
          };

          if (row.countedQty !== null && !isNaN(row.countedQty)) {
            updateData.countedQuantity = row.countedQty;
            updateData.difference = difference;
            updateData.countedBy = user.uid;
            updateData.countedAt = serverTimestamp();
          } else {
            // Sayılan miktar boşsa, null yap (0 değil)
            updateData.countedQuantity = null;
            updateData.difference = null;
            updateData.countedBy = null;
            updateData.countedAt = null;
          }

          if (row.notes !== undefined && row.notes !== null) {
            updateData.notes = row.notes;
          } await updateDoc(doc(db, 'stock_counts', state.countId, 'count_items', item.id), updateData);// Update local state
          if (row.countedQty !== null && !isNaN(row.countedQty)) {
            item.countedQuantity = row.countedQty;
            item.difference = difference;
            item.countedBy = user.uid;
            item.countedAt = new Date();
          } else {
            // Sayılan miktar boşsa null yap
            item.countedQuantity = null;
            item.difference = null;
            item.countedBy = null;
            item.countedAt = null;
          }
          if (row.notes !== undefined && row.notes !== null) {
            item.notes = row.notes;
          }

          updated++;
        } toast.success(`${updated} ürün güncellendi`);
        // Teklifbul Rule v1.0 - Excel import sonrası sayılan miktarları göstermek için yeniden yükleawait loadCountItems();} catch (error) {
        logger.error('Excel import error', error);
        toast.error('Excel import hatası: ' + error.message);
      } finally {
        document.body.removeChild(input);
      }
    });

    document.body.appendChild(input);
    input.click();

  } catch (error) {
    logger.error('Excel import setup error', error);
    toast.error('Excel import başlatılamadı: ' + error.message);
  }
}

// Handle Excel export
async function handleExportExcel() {
  try {
    if (!ExcelJS) {
      toast.error('ExcelJS kütüphanesi yüklenemedi');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sayım Sonuçları');

    // Headers - Teklifbul Rule v1.0 - Sütun sırası: SKU, Ürün Adı, Barkod, Birim, Sistem Miktarı, Sayılan Miktar, Fark, Not
    worksheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Ürün Adı', key: 'name', width: 30 },
      { header: 'Barkod', key: 'barcode', width: 15 },
      { header: 'Birim', key: 'unit', width: 10 },
      { header: 'Sistem Miktarı', key: 'systemQty', width: 15 },
      { header: 'Sayılan Miktar', key: 'countedQty', width: 15 },
      { header: 'Fark', key: 'difference', width: 15 },
      { header: 'Not', key: 'notes', width: 30 }
    ];

    // Add data
    state.countItems.forEach(item => {
      // Find stock to get barcode
      const stock = state.allStocks && state.allStocks.length > 0
        ? state.allStocks.find(s => s.sku === item.sku)
        : null;
      const barcode = stock?.barcode || '';

      worksheet.addRow({
        sku: item.sku,
        name: item.stockName || '',
        barcode: barcode,
        unit: item.unit || 'ADT',
        systemQty: item.systemQuantity || 0,
        countedQty: item.countedQuantity !== null && item.countedQuantity !== undefined ? item.countedQuantity : '',
        difference: item.difference !== null && item.difference !== undefined ? item.difference : '',
        notes: item.notes || ''
      });
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Export
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sayim_${state.countData.title}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success('Excel dosyası indirildi');
  } catch (error) {
    logger.error('Excel export error', error);
    toast.error('Excel export hatası: ' + error.message);
  }
}

// Helper functions
function getStatusBadge(status) {
  const badges = {
    'DRAFT': '<span class="badge badge-draft">Taslak</span>',
    'IN_PROGRESS': '<span class="badge badge-in-progress">Devam Ediyor</span>',
    'COMPLETED': '<span class="badge badge-completed">Tamamlandı</span>',
    'APPROVED': '<span class="badge badge-approved">Onaylandı</span>'
  };
  return badges[status] || status;
}

function getStatusText(status) {
  const texts = {
    'DRAFT': 'Taslak',
    'IN_PROGRESS': 'Devam Ediyor',
    'COMPLETED': 'Tamamlandı',
    'APPROVED': 'Onaylandı'
  };
  return texts[status] || status;
}

// Handle barcode scan
async function handleBarcodeScan(barcode) {
  try {
    if (!barcode || barcode.length === 0) {
      return; // Boş barkod için sessizce çık (otomatik arama için)
    }

    // Teklifbul Rule v1.0 - Barkod arama: Case-insensitive ve trim
    const barcodeNormalized = barcode.trim().toLowerCase();

    // Find stock by barcode (case-insensitive)
    const stock = state.allStocks.find(s => {
      if (!s.barcode) return false;
      const stockBarcode = s.barcode.toString().trim().toLowerCase();
      return stockBarcode === barcodeNormalized;
    });

    if (!stock) {
      const resultDiv = qs('#barcodeResult');
      if (resultDiv) {
        resultDiv.textContent = '';
        const span = document.createElement('span');
        span.style.color = '#ef4444';
        span.textContent = `❌ Barkod bulunamadı: ${barcode}`;
        resultDiv.appendChild(span);
      }
      toast.error(`Barkod bulunamadı: ${barcode}`);
      // Input'u temizle ve tekrar focus ver
      const barcodeInput = qs('#barcodeInput');
      if (barcodeInput) {
        barcodeInput.value = '';
        setTimeout(() => barcodeInput.focus(), 100);
      }
      return;
    }

    // Check if item already in count list
    let countItem = state.countItems.find(item => item.sku === stock.sku);

    if (!countItem) {
      // Add to count list automatically
      toast.info(`${stock.name} sayım listesine ekleniyor...`);
      await addItemToCount(stock);
      // Reload to get the new item with ID
      await loadCountItems();
      countItem = state.countItems.find(item => item.sku === stock.sku);
    }

    if (countItem) {
      // Scroll to item in table (hızlı, smooth olmadan)
      const row = document.querySelector(`tr[data-item-id="${countItem.id}"]`);
      if (row) {
        // Hızlı scroll (smooth olmadan daha hızlı)
        row.scrollIntoView({ behavior: 'auto', block: 'center' });

        // Vurgulama efekti
        row.style.background = '#fef3c7';
        row.style.transition = 'background 0.3s';
        setTimeout(() => {
          row.style.background = '';
        }, 1500);

        // Hemen focus ver (scroll beklemeden)
        const input = row.querySelector('.count-input');
        if (input) {
          // Kısa bir gecikme ile focus (DOM güncellemesi için)
          setTimeout(() => {
            input.focus();
            input.select();
            // Sayılan miktar input'una odaklanıldığında, kullanıcı direkt sayı girebilir
          }, 100);
        }
      }

      // Show result (kısa süreli)
      const resultDiv = qs('#barcodeResult');
      if (resultDiv) {
        // Teklifbul Rule v1.0 - XSS Protection
        const safeStockName = DOMPurify.sanitize(stock.name || '', { ALLOWED_TAGS: [] });
        const safeSku = DOMPurify.sanitize(stock.sku || '', { ALLOWED_TAGS: [] });
        const safeUnit = DOMPurify.sanitize(stock.unit || 'ADT', { ALLOWED_TAGS: [] });
        resultDiv.innerHTML = DOMPurify.sanitize(`<span style="color:#10b981;font-weight:600">✅ ${safeStockName} (SKU: ${safeSku}) - Sistem: ${countItem.systemQuantity || 0} ${safeUnit}</span>`, {
          ALLOWED_TAGS: ['span'],
          ALLOWED_ATTR: ['style']
        });
        // 3 saniye sonra temizle
        setTimeout(() => {
          if (resultDiv.innerHTML.includes(stock.sku)) {
            resultDiv.innerHTML = '';
          }
        }, 3000);
      }

      // Başarı mesajı (kısa)
      toast.success(`${stock.name}`);

      // Input'u temizle ve tekrar focus ver (bir sonraki barkod için hazır)
      const barcodeInput = qs('#barcodeInput');
      if (barcodeInput) {
        barcodeInput.value = '';
        // Sayılan miktar input'una focus verildi, barkod input'u hazır beklesin
        setTimeout(() => {
          barcodeInput.focus();
        }, 2000); // 2 saniye sonra barkod input'una geri dön (kullanıcı sayıyı girmiş olur)
      }
    }

  } catch (error) {
    logger.error('Barcode scan error', error);
    toast.error('Barkod okuma hatası: ' + error.message);
    const resultDiv = qs('#barcodeResult');
    if (resultDiv) {
      // Teklifbul Rule v1.0 - XSS Protection
      const safeErrorMessage = DOMPurify.sanitize(error.message || '', { ALLOWED_TAGS: [] });
      resultDiv.innerHTML = DOMPurify.sanitize(`<span style="color:#ef4444">❌ Hata: ${safeErrorMessage}</span>`, {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['style']
      });
    }
    // Hata durumunda da input'u temizle
    const barcodeInput = qs('#barcodeInput');
    if (barcodeInput) {
      barcodeInput.value = '';
      setTimeout(() => barcodeInput.focus(), 100);
    }
  }
}

// Handle add all stocks
async function handleAddAllStocks() {
  if (state.countItems.length > 0) {
    if (!confirm('Sayım listesinde zaten ürünler var. Tüm stokları eklemek istediğinizden emin misiniz?')) {
      return;
    }
  }

  try {
    const btn = qs('#btnAddAllStocks');
    btn.disabled = true;
    btn.textContent = 'Ekleniyor...';

    toast.info(`${state.allStocks.length} ürün ekleniyor...`);

    const itemsRef = collection(db, 'stock_counts', state.countId, 'count_items');
    let added = 0;
    let skipped = 0;

    for (const stock of state.allStocks) {
      // Check if already added
      if (state.countItems.find(item => item.sku === stock.sku)) {
        skipped++;
        continue;
      }

      // Get system quantity
      let systemQuantity = 0;
      if (state.countData.locationId) {
        const balanceDocId = `${state.companyId}_${stock.sku}_${state.countData.locationId}`;
        const balanceDoc = await getDoc(doc(db, 'stock_balances', balanceDocId));
        if (balanceDoc.exists()) {
          systemQuantity = balanceDoc.data().quantity || 0;
        }
      }

      await addDoc(itemsRef, {
        stockId: stock.id,
        sku: stock.sku,
        stockName: stock.name,
        barcode: stock.barcode || null, // Teklifbul Rule v1.0 - Barkod bilgisi
        unit: stock.unit || 'ADT',
        systemQuantity: systemQuantity,
        countedQuantity: null,
        difference: null,
        countedBy: null,
        countedAt: null,
        notes: ''
      });

      added++;
    }

    toast.success(`${added} ürün eklendi${skipped > 0 ? `, ${skipped} ürün zaten listede` : ''}`);
    await loadCountItems();

    btn.disabled = false;
    btn.textContent = 'Tüm Stokları Ekle';
  } catch (error) {
    logger.error('Add all stocks error', error);
    toast.error('Ürünler eklenemedi: ' + error.message);
    const btn = qs('#btnAddAllStocks');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Tüm Stokları Ekle';
    }
  }
}

