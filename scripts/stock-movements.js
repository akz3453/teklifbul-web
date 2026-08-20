import { db, auth, requireAuth } from '/firebase.js';
import { normalizeTRLower, matchesWildcard, normalizeTR } from '/scripts/lib/tr-utils.js';
import { allocateExtras } from '/scripts/inventory-cost.js';
import { collection, getDocs, query, where, doc, getDoc, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, requirePerm, getStockPerms } from '../assets/js/state/permissions.js';
import { fetchStockMovementsPage, iterateStockMovementsForExport } from '../assets/js/services/stock-movements-service.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { ensureXlsxLoaded } from '../assets/js/utils/xlsx-loader.js';
import { STOCK_LIST_QUERY_LIMIT } from '../src/shared/constants/timing.js';

/** Teklifbul Rule v1.0 — XSS escape */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const qs = s => document.querySelector(s);

const state = {
  currentType: 'IN',
  selectedStock: null,
  historySelectedStock: null,
  locations: [],
  stocks: [],
  movements: [],
  history: {
    pageSize: 50,
    cursorDoc: null,
    hasNext: false,
    isLoading: false,
    currentStockTotalQty: undefined,
  },
  export: {
    cancelled: false,
    inFlight: false,
  }
};

const STOCK_PERMS = getStockPerms();

// Teklifbul Rule v1.0 - Cache helpers
const userNameCache = new Map();

function shouldRequireExpiryFields(stock) {
  if (!stock) return false;
  return stock.hasExpiry === true || stock.stockTrackingType === 'lot';
}

function updateExpiryFieldsVisibility() {
  const wrap = qs('#expiryFieldsWrap');
  if (!wrap) return;
  const isInTab = state.currentType === 'IN';
  const required = shouldRequireExpiryFields(state.selectedStock);
  wrap.style.display = isInTab && required ? 'grid' : 'none';
}

function formatMovementTypeTR(type) {
  return (
    {
      IN: '📥 Giriş',
      OUT: '📤 Çıkış',
      TRANSFER: '🔄 Transfer',
      ADJUST: '⚖️ Düzeltme',
    }[type] || type || '-'
  );
}

function formatRefTR(ref) {
  if (!ref || !ref.kind) return '-';
  const kind = ref.kind;
  const map = {
    INVOICE: 'Fatura/İrsaliye',
    DELIVERY: 'Teslimat',
    MANUAL: 'Manuel',
    INTERNAL_REQUEST: 'ŞMTF',
  };
  const label = map[kind] || kind;
  const id = ref.id ? String(ref.id) : '';
  return id ? `${label} (${id})` : label;
}

async function resolveActorName(uid) {
  if (!uid) return '-';
  if (userNameCache.has(uid)) return userNameCache.get(uid);

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const name =
      data.fullName ||
      data.displayName ||
      data.name ||
      (data.firstName || data.lastName ? `${data.firstName || ''} ${data.lastName || ''}`.trim() : '') ||
      data.email ||
      '-';
    userNameCache.set(uid, name);
    return name;
  } catch (e) {
    logger.warn('Actor name lookup failed', { uid, error: e?.message || e });
    const fallback = uid ? `${String(uid).slice(0, 8)}…` : '-';
    userNameCache.set(uid, fallback);
    return fallback;
  }
}

/**
 * Teklifbul Rule v1.0 - Hareket tipi formunu göster
 */
function showMovementTypeForm(type) {
  const inForm = qs('#inForm');
  const outForm = qs('#outForm');
  const transferForm = qs('#transferForm');
  if (inForm) inForm.classList.add('hidden');
  if (outForm) outForm.classList.add('hidden');
  if (transferForm) transferForm.classList.add('hidden');

  const formTitle = qs('#formTitle');
  if (type === 'IN') {
    if (inForm) inForm.classList.remove('hidden');
    if (formTitle) formTitle.textContent = '📥 Giriş Hareketi';
  } else if (type === 'OUT') {
    if (outForm) outForm.classList.remove('hidden');
    if (formTitle) formTitle.textContent = '📤 Çıkış Hareketi';
  } else if (type === 'TRANSFER') {
    if (transferForm) transferForm.classList.remove('hidden');
    if (formTitle) formTitle.textContent = '🔄 Transfer Hareketi';
  } else if (type === 'ADJUST') {
    if (formTitle) formTitle.textContent = '⚖️ Düzeltme Hareketi';
  }

  const formCard = qs('#formCard');
  if (formCard) formCard.classList.remove('hidden');
  updateExpiryFieldsVisibility();
}

function resetMovementFormFields() {
  const ids = ['#mvStockSKU', '#mvUnit', '#mvQty', '#mvUnitCost', '#mvExtras', '#mvLocation', '#mvToLocation', '#mvLotNo', '#mvExpiryDate', '#mvReason'];
  ids.forEach((id) => {
    const el = qs(id);
    if (el) el.value = '';
  });
  state.selectedStock = null;
  updateExpiryFieldsVisibility();
}

// Initialize event listeners after DOM is ready
function setupEventListeners() {
  // Tab switching
  const tabsElement = qs('.tabs');
  if (!tabsElement) {
    logger.error('Tabs element not found');
    return;
  }
  
  tabsElement.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  
  qs('.tab.active').classList.remove('active');
  tab.classList.add('active');
  
  state.currentType = tab.dataset.tab;

  // Sections
  const formCard = qs('#formCard');
  const historyCard = qs('#historyCard');
  if (state.currentType === 'HISTORY') {
    if (formCard) formCard.classList.add('hidden');
    if (historyCard) historyCard.classList.remove('hidden');
    return;
  } else {
    if (historyCard) historyCard.classList.add('hidden');
    if (formCard) formCard.classList.remove('hidden');
  }

  showMovementTypeForm(state.currentType);
  });

  // Save button
  const btnSave = qs('#btnSave');
  if (!btnSave) {
    logger.error('Save button not found');
    return;
  }
  btnSave.addEventListener('click', handleSave);

  // Cancel button (CSP-safe)
  const btnCancel = qs('#btnCancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      // Teklifbul Rule v1.0 - Formu gizleme; alanları temizle
      resetMovementFormFields();
      toast.info('Form temizlendi');
    });
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
            <div style="font-weight:600;color:#111827">${escapeHtml(stock.sku)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">${escapeHtml(stock.name)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Birim: ${escapeHtml(stock.unit || 'ADT')}</div>
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
            updateExpiryFieldsVisibility();
          });
          
          results.appendChild(div);
        });
      }, 300);
    });
    
    // Teklifbul Rule v1.0 - Browser davranışı nedeniyle F6 ile arama kaldırıldı.
  }

  // History filter events
  const btnHistorySearch = qs('#btnHistorySearch');
  const btnHistoryClear = qs('#btnHistoryClear');
  const btnHistoryLoadMore = qs('#btnHistoryLoadMore');
  const btnHistoryExport = qs('#btnHistoryExport');

  if (btnHistorySearch) {
    btnHistorySearch.addEventListener('click', () => loadHistoryWithFilters({ reset: true }));
  }

  if (btnHistoryClear) {
    btnHistoryClear.addEventListener('click', () => clearHistoryFilters());
  }

  if (btnHistoryLoadMore) {
    btnHistoryLoadMore.addEventListener('click', () => loadHistoryWithFilters({ reset: false }));
  }

  if (btnHistoryExport) {
    btnHistoryExport.addEventListener('click', () => exportHistoryToExcel());
  }
  
  // ESC tuşu ile dropdown kapat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const results = qs('#stockSearchResults');
      if (results) results.style.display = 'none';
      const historyResults = qs('#historyStockSearchResults');
      if (historyResults) historyResults.style.display = 'none';
    }
  });
  
}

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
        logger.warn('Şirket depo adresleri yüklenemedi', sitesError);
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
    logger.error('Location load error', error);
  }
}

// Load all stocks for search
async function loadStocks() {
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: false });
    const companyId = ctx?.companyId;
    
    if (!companyId) {
      logger.warn('Stocks load skipped: companyId yok');
      state.stocks = [];
      toast.error(MESSAGES.ERROR_COMPANY_INFO_NOT_FOUND);
      return;
    }

    const q = query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      limit(STOCK_LIST_QUERY_LIMIT)
    );
    const snap = await getDocs(q);
    state.stocks = [];
    snap.forEach(docSnap => {
      state.stocks.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (snap.size >= STOCK_LIST_QUERY_LIMIT) {
      toast.warn(MESSAGES.WARN_STOCK_LIMIT_REACHED.replace('{count}', String(STOCK_LIST_QUERY_LIMIT)));
    }
  } catch (error) {
    logger.error('Stocks load error', error);
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
    // Teklifbul Rule v1.0 - Yeni mimari: History artık ürün + tarih filtresi ile paginated yüklenir.
    state.movements = [];
    await renderHistory(); // empty state
  } catch (error) {
    logger.error('History load error', error);
  }
}

// Teklifbul Rule v1.0 - Lokasyon adını bul (site_ prefix ve siteId kontrolü ile)
async function findLocationName(locationId) {
  if (!locationId) return '-';
  
  // Önce state.locations içinde ara
  let loc = state.locations.find(l => l.id === locationId);
  if (loc) return loc.name;
  
  // site_ prefix'li ID kontrolü
  if (locationId.startsWith('site_')) {
    const siteId = locationId.replace('site_', '');
    loc = state.locations.find(l => l.siteId === siteId || l.id === siteId);
    if (loc) return loc.name;
  }
  
  // siteId ile eşleşme (locationId siteId olabilir)
  loc = state.locations.find(l => l.siteId === locationId);
  if (loc) return loc.name;
  
  // Eşleşme bulunamadı, Firestore'dan direkt çek
  try {
    const { getDoc, doc: docFn } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    const locationDoc = await getDoc(docFn(db, 'stock_locations', locationId));
    if (locationDoc.exists()) {
      const locationData = locationDoc.data();
      // Bulunan lokasyonu state'e ekle (sonraki aramalar için)
      if (!state.locations.find(l => l.id === locationId)) {
        state.locations.push({ id: locationId, ...locationData });
      }
      return locationData.name || locationId;
    }
  } catch (error) {
    logger.warn('Lokasyon bilgisi Firestore\'dan alınamadı', { locationId, error });
  }
  
  // Hiçbir yerde bulunamadı, ID'yi göster
  return locationId;
}

async function renderHistory(movements = state.movements) {
  const tbody = qs('#historyTable');
  tbody.innerHTML = '';
  
  if (!movements.length) {
    tbody.innerHTML = '<tr><td colspan="11">Ürün seçip tarih aralığı ile listeleyin.</td></tr>';
    return;
  }
  
  // Teklifbul Rule v1.0 - Tüm lokasyon isimlerini önceden yükle (async)
  const locationPromises = movements.map(async (mv) => {
    const sourceLocation = await findLocationName(mv.locationId);
    let targetLocation = '-';
    if (mv.type === 'TRANSFER') {
      if (mv.toSiteName) {
        targetLocation = `🏗️ ${mv.toSiteName}`;
      } else if (mv.toLocationId) {
        targetLocation = await findLocationName(mv.toLocationId);
      } else if (mv.ref && mv.ref.kind === 'INTERNAL_REQUEST') {
        targetLocation = 'Şantiye (ŞMTF)';
      }
    }
    const actorName =
      mv.createdByName ||
      (mv.createdBy ? await resolveActorName(mv.createdBy) : '-');
    return { mv, sourceLocation, targetLocation, actorName };
  });
  
  const movementsWithLocations = await Promise.all(locationPromises);
  
  movementsWithLocations.forEach(({ mv, sourceLocation, targetLocation, actorName }) => {
    const tr = document.createElement('tr');
    const date = mv.createdAt ? new Date(mv.createdAt.toDate()).toLocaleDateString('tr-TR') : '-';
    const typeBadge = `b-${mv.type}`;
    const typeText = formatMovementTypeTR(mv.type);
    
    // Referans bilgisi (ŞMTF için)
    let refInfo = '-';
    if (mv.ref && mv.ref.kind === 'INTERNAL_REQUEST') {
      refInfo = `📋 ŞMTF (${mv.ref.id ? String(mv.ref.id).slice(0, 8) : '-'})`;
    } else {
      refInfo = formatRefTR(mv.ref);
    }
    
    tr.innerHTML = `
      <td>${escapeHtml(date)}</td>
      <td><span class="badge ${escapeHtml(typeBadge)}">${escapeHtml(typeText)}</span></td>
      <td>${escapeHtml(mv.sku)}</td>
      <td>${escapeHtml(mv.stockName || '')}</td>
      <td>${escapeHtml(sourceLocation)}</td>
      ${mv.type === 'TRANSFER' ? `<td>${escapeHtml(targetLocation)}</td>` : '<td>-</td>'}
      <td>${escapeHtml(mv.qty)}</td>
      <td>${escapeHtml((mv.unitCost || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ₺</td>
      <td>${escapeHtml((mv.totalCost || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ₺</td>
      <td>${escapeHtml(refInfo)}</td>
      <td>${escapeHtml(actorName || '-')}</td>
    `;
    tbody.appendChild(tr);
  });

  // Teklifbul Rule v1.0 - Güncel stok satırı (seçili ürüne göre)
  if (state.historySelectedStock && state.historySelectedStock.sku) {
    const qty = state.history?.currentStockTotalQty;
    const unit = state.historySelectedStock.unit || 'ADT';
    if (typeof qty === 'number') {
      const tr = document.createElement('tr');
      tr.style.background = '#f8fafc';
      tr.innerHTML = `
        <td colspan="6"><strong>📦 Güncel Stok (Toplam)</strong> <span class="muted">(liste filtresinden bağımsız)</span></td>
        <td><strong>${qty.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ${unit}</td>
        <td colspan="4" class="muted">Bu satır, seçilen ürünün tüm lokasyonlardaki güncel toplam miktarını gösterir.</td>
      `;
      tbody.appendChild(tr);
    }
  }
}

function setHistoryStatus(text) {
  const el = qs('#historyStatusText');
  if (el) el.textContent = text || '';
}

function setHistoryProgress({ visible, text, indeterminate }) {
  const wrap = qs('#historyProgressWrap');
  const bar = qs('#historyProgressBar');
  const t = qs('#historyProgressText');
  if (!wrap || !bar || !t) return;
  if (visible) wrap.classList.remove('hidden');
  else wrap.classList.add('hidden');
  if (indeterminate) {
    bar.removeAttribute('max');
    bar.removeAttribute('value');
  } else {
    bar.max = 100;
    bar.value = 0;
  }
  t.textContent = text || '';
}

function getHistoryFilter() {
  const startEl = qs('#historyStartDate');
  const endEl = qs('#historyEndDate');
  const locEl = qs('#historyLocationFilter');

  const startVal = startEl?.value ? new Date(startEl.value) : null;
  const endVal = endEl?.value ? new Date(endEl.value) : null;
  const locValRaw = locEl?.value || 'ALL';

  return {
    stock: state.historySelectedStock,
    startDate: startVal,
    endDate: endVal,
    locationId: locValRaw && locValRaw !== 'ALL' ? locValRaw : null,
  };
}

async function resolveActualLocationIdForQuery(rawLocationId, companyId) {
  if (!rawLocationId) return null;
  if (!rawLocationId.startsWith('site_')) return rawLocationId;
  try {
    const siteId = rawLocationId.replace('site_', '');
    const q = query(
      collection(db, 'stock_locations'),
      where('siteId', '==', siteId),
      where('companyId', '==', companyId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].id;
    return rawLocationId; // site_* olarak kalabilir (eski veri / yeni depo)
  } catch (e) {
    logger.warn('resolveActualLocationIdForQuery failed', { rawLocationId, error: e?.message || e });
    return rawLocationId;
  }
}

function clearHistoryFilters() {
  state.historySelectedStock = null;
  const input = qs('#historyStockSearch');
  const startEl = qs('#historyStartDate');
  const endEl = qs('#historyEndDate');
  const locEl = qs('#historyLocationFilter');
  const results = qs('#historyStockSearchResults');
  if (input) input.value = '';
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  if (locEl) locEl.value = 'ALL';
  if (results) results.style.display = 'none';

  state.history.cursorDoc = null;
  state.history.hasNext = false;
  state.movements = [];
  renderHistory();
  setHistoryStatus('');

  const btnMore = qs('#btnHistoryLoadMore');
  if (btnMore) btnMore.disabled = true;
}

async function loadHistoryWithFilters({ reset }) {
  if (state.history.isLoading) return;
  const { stock, startDate, endDate, locationId } = getHistoryFilter();

  if (!stock) {
    toast.error(MESSAGES.ERROR_PRODUCT_SELECT_REQUIRED || 'Ürün seçmeniz gerekiyor');
    return;
  }

  // Listele için tarih opsiyonel: ürünün tüm hareketlerini görebilsin.
  if ((startDate && !endDate) || (!startDate && endDate)) {
    toast.error(MESSAGES.ERROR_DATE_RANGE_REQUIRED || 'Başlangıç ve bitiş tarihini birlikte seçin.');
    return;
  }

  try {
    state.history.isLoading = true;
    const btnMore = qs('#btnHistoryLoadMore');
    const btnSearch = qs('#btnHistorySearch');
    if (btnSearch) btnSearch.disabled = true;
    if (btnMore) btnMore.disabled = true;

    toast.info(MESSAGES.INFO_PLEASE_WAIT || 'Lütfen bekleyin...');
    setHistoryProgress({ visible: true, text: 'Yükleniyor...', indeterminate: true });
    setHistoryStatus('');

    if (reset) {
      state.movements = [];
      state.history.cursorDoc = null;
      state.history.hasNext = false;
      await renderHistory();
    }

    const ctx = await requireCompanyContext({ redirectOnPending: false });
    const companyId = ctx?.companyId;
    const actualLocationId = companyId ? await resolveActualLocationIdForQuery(locationId, companyId) : locationId;

    const { items, nextCursorDoc } = await fetchStockMovementsPage({
      stockId: stock.id,
      startDate,
      endDate,
      locationId: actualLocationId,
      pageSize: state.history.pageSize,
      cursorDoc: reset ? null : state.history.cursorDoc,
    });

    state.history.cursorDoc = nextCursorDoc;
    state.history.hasNext = !!nextCursorDoc && items.length === state.history.pageSize;
    state.movements = reset ? items : state.movements.concat(items);

    // Teklifbul Rule v1.0 - Güncel stok toplamını hesapla (stock_balances üzerinden)
    try {
      if (companyId && stock?.sku) {
        const { getStockBalancesBySku } = await import('/scripts/inventory-balances.js');
        const balances = await getStockBalancesBySku(companyId, stock.sku);
        const totalQty = balances.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0);
        state.history.currentStockTotalQty = totalQty;
      } else {
        state.history.currentStockTotalQty = undefined;
      }
    } catch (e) {
      logger.warn('Current stock total calculation failed', { error: e?.message || e });
      state.history.currentStockTotalQty = undefined;
    }

    await renderHistory();

    if (btnMore) btnMore.disabled = !state.history.hasNext;
    setHistoryStatus(`${state.movements.length} kayıt gösteriliyor.`);
    toast.success('İşlem tamamlandı');
  } catch (err) {
    logger.error('History filtered load error', err);
    toast.error(`Hata: ${err?.message || err}`);
    setHistoryStatus('Yükleme hatası.');
  } finally {
    state.history.isLoading = false;
    const btnSearch = qs('#btnHistorySearch');
    const btnMore = qs('#btnHistoryLoadMore');
    if (btnSearch) btnSearch.disabled = false;
    if (btnMore) btnMore.disabled = !state.history.hasNext;
    setHistoryProgress({ visible: false, text: '', indeterminate: true });
  }
}

async function exportHistoryToExcel() {
  if (state.export.inFlight) return;
  const { stock, startDate, endDate, locationId } = getHistoryFilter();

  if (!stock) {
    toast.error(MESSAGES.ERROR_PRODUCT_SELECT_REQUIRED || 'Ürün seçmeniz gerekiyor');
    return;
  }
  // Tarih aralığı opsiyonel:
  // - ikisi de boşsa: tüm hareketleri export et
  // - sadece biri doluysa: kullanıcıya net uyarı ver
  if ((startDate && !endDate) || (!startDate && endDate)) {
    toast.error(MESSAGES.ERROR_DATE_RANGE_REQUIRED || 'Başlangıç ve bitiş tarihini birlikte seçin.');
    return;
  }

  state.export.cancelled = false;
  state.export.inFlight = true;

  const btnExport = qs('#btnHistoryExport');
  if (btnExport) btnExport.disabled = true;

  try {
    toast.info(MESSAGES.INFO_PLEASE_WAIT || 'Lütfen bekleyin...');
    setHistoryProgress({
      visible: true,
      text: 'Excel hazırlanıyor... (Yükleniyor...)',
      indeterminate: true,
    });

    const all = [];
    const ctx = await requireCompanyContext({ redirectOnPending: false });
    const companyId = ctx?.companyId;
    const actualLocationId = companyId ? await resolveActualLocationIdForQuery(locationId, companyId) : locationId;

    for await (const { items, total } of iterateStockMovementsForExport({
      stockId: stock.id,
      startDate,
      endDate,
      batchSize: 500,
      isCancelled: () => state.export.cancelled,
    })) {
      // Lokasyon filtresi seçiliyse sadece o lokasyondaki hareketleri export et
      const filtered = actualLocationId
        ? items.filter((mv) => mv.locationId === actualLocationId)
        : items;
      all.push(...filtered);
      setHistoryProgress({
        visible: true,
        text: `Excel hazırlanıyor... ${total} kayıt yüklendi`,
        indeterminate: true,
      });
      if (state.export.cancelled) break;
    }

    if (state.export.cancelled) {
      toast.info('İşlem iptal edildi.');
      return;
    }

    if (!all.length) {
      toast.warn('Seçilen aralıkta kayıt bulunamadı.');
      return;
    }

    const XLSX = await ensureXlsxLoaded();

    // Teklifbul Rule v1.0 - Lokasyon adlarını export için cache'le (async)
    const locationIds = new Set();
    all.forEach((mv) => {
      if (mv.locationId) locationIds.add(mv.locationId);
      const targetId =
        mv.toLocationId || (mv.type === 'TRANSFER' ? (mv.ref?.id || null) : null);
      if (targetId) locationIds.add(targetId);
    });
    const locationNameMap = new Map();
    await Promise.all(
      Array.from(locationIds).map(async (id) => {
        try {
          const name = await findLocationName(id);
          locationNameMap.set(id, name);
        } catch {
          locationNameMap.set(id, id);
        }
      })
    );

    const toDateStr = (ts) => {
      try {
        const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
        return d ? d.toLocaleString('tr-TR') : '';
      } catch {
        return '';
      }
    };

    const rows = all.map((mv) => ({
      Tarih: toDateStr(mv.createdAt),
      Tür: formatMovementTypeTR(mv.type),
      SKU: mv.sku || '',
      Ürün: mv.stockName || '',
      KaynakLokasyon: mv.locationId ? (locationNameMap.get(mv.locationId) || mv.locationId) : '',
      HedefLokasyon: (() => {
        const targetId =
          mv.toLocationId || (mv.type === 'TRANSFER' ? (mv.ref?.id || null) : null);
        if (!targetId) return '';
        return locationNameMap.get(targetId) || targetId;
      })(),
      Miktar: mv.qty ?? '',
      Birim: mv.unit || '',
      BirimMaliyet: mv.unitCost ?? 0,
      Toplam: mv.totalCost ?? 0,
      Referans: formatRefTR(mv.ref),
      IslemiYapan: mv.createdByName || (mv.createdBy ? (userNameCache.get(mv.createdBy) || '') : ''),
    }));

    // Teklifbul Rule v1.0 - Excel en altına "Güncel Stok (Toplam)" satırı
    try {
      if (companyId && stock?.sku) {
        const { getStockBalancesBySku } = await import('/scripts/inventory-balances.js');
        const balances = await getStockBalancesBySku(companyId, stock.sku);
        const totalQty = balances.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0);
        rows.push({
          Tarih: '',
          Tür: '',
          SKU: stock.sku || '',
          Ürün: '📦 Güncel Stok (Toplam)',
          KaynakLokasyon: '',
          HedefLokasyon: '',
          Miktar: Number(totalQty || 0),
          Birim: stock.unit || 'ADT',
          BirimMaliyet: '',
          Toplam: '',
          Referans: '',
          IslemiYapan: '',
        });
      }
    } catch (e) {
      logger.warn('Excel current stock total append failed', { error: e?.message || e });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Hareketler');

    const filename = (() => {
      const sku = stock.sku || stock.id;
      if (!startDate || !endDate) return `stok-hareketleri_${sku}_tum-hareketler.xlsx`;
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);
      return `stok-hareketleri_${sku}_${startStr}_${endStr}.xlsx`;
    })();

    XLSX.writeFile(wb, filename);
    toast.success('İşlem tamamlandı');
  } catch (err) {
    logger.error('Export to Excel error', err);
    toast.error(`Hata: ${err?.message || err}`);
  } finally {
    state.export.inFlight = false;
    const btnExport = qs('#btnHistoryExport');
    if (btnExport) btnExport.disabled = false;
    setHistoryProgress({ visible: false, text: '', indeterminate: true });
  }
}

// Save movement
async function handleSave() {
  const user = await requireAuth();
  
  // Teklifbul Rule v1.0 - Company ID'yi al
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userData = userDoc.exists() ? userDoc.data() : {};
  const companyId = userData.companyId;
  const createdByName =
    userData.fullName ||
    userData.displayName ||
    userData.name ||
    user.displayName ||
    user.email ||
    null;
  
  if (!companyId) {
    toast.error(MESSAGES.ERROR_COMPANY_ID_NOT_FOUND);
    return;
  }
  
  if (!state.selectedStock) {
    toast.error(MESSAGES.ERROR_PRODUCT_SELECT_REQUIRED);
    return;
  }

  const savedStockId = state.selectedStock.id;
  
  const locationId = qs('#mvLocation').value;
  if (!locationId) {
    toast.error(MESSAGES.ERROR_LOCATION_SELECT_REQUIRED);
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
  // Teklifbul Rule v1.0 - ADJUST için 0 (sıfırlama) geçerli
  if (Number.isNaN(qty) || qty < 0 || (state.currentType !== 'ADJUST' && qty <= 0)) {
    toast.error(state.currentType === 'ADJUST' ? 'Miktar 0 veya pozitif olmalıdır' : 'Miktar pozitif olmalıdır');
    return;
  }

  try {
    // Permission Write Guard - Teklifbul Rule v1.0
    // Önce genel movement use yetkisi, sonra mevcut hareket türü için spesifik key (varsa)
    const mvPerms = STOCK_PERMS.movements || {};
    const baseKey = mvPerms.use;
    let specificKey = null;
    if (state.currentType === 'IN') specificKey = mvPerms.in;
    else if (state.currentType === 'OUT') specificKey = mvPerms.out;
    else if (state.currentType === 'TRANSFER') specificKey = mvPerms.transfer;
    else if (state.currentType === 'ADJUST') specificKey = mvPerms.adjust;

    if (baseKey) {
      const okUse = await requirePerm(baseKey, {
        toastMessage:
          MESSAGES.ERROR_PERMISSION_STOCK_MOVEMENTS ||
          'Stok hareketi kaydetme yetkiniz yok.'
      });
      if (!okUse) {
        logger.warn('Stock movements: movements.use yetkisi yok, kayıt engellendi', {
          permKey: baseKey,
          type: state.currentType,
          companyId,
          uid: user.uid
        });
        return;
      }
    }

    if (specificKey) {
      const okSpecific = await requirePerm(specificKey, {
        toastMessage:
          MESSAGES.ERROR_PERMISSION_STOCK_MOVEMENTS ||
          'Bu tip stok hareketini kaydetme yetkiniz yok.'
      });
      if (!okSpecific) {
        logger.warn('Stock movements: spesifik movement yetkisi yok, kayıt engellendi', {
          permKey: specificKey,
          type: state.currentType,
          companyId,
          uid: user.uid
        });
        return;
      }
    }

    const siteId = locationId && locationId.startsWith('site_') ? locationId.replace('site_', '') : null;
    let confirmNegative = false;
    let toLocationId = null;
    let unitCost = 0;
    let extras = [];
    let ref = { kind: 'MANUAL', id: '' };
    let lotNo = null;
    let expiryDateIso = null;

    if (state.currentType === 'IN') {
      const rawUnitCost = parseFloat(qs('#mvUnitCost').value) || 0;
      const extrasAmount = parseFloat(qs('#mvExtras').value) || 0;
      const allocatedExtras = allocateExtras(extrasAmount, qty);
      unitCost = rawUnitCost + allocatedExtras;
      extras = extrasAmount ? [{ name: 'İlave', amount: extrasAmount }] : [];
      lotNo = (qs('#mvLotNo')?.value || '').trim() || null;
      const expiryDateRaw = (qs('#mvExpiryDate')?.value || '').trim();
      const expiryRequired = shouldRequireExpiryFields(state.selectedStock);

      if (expiryRequired) {
        if (!lotNo) {
          toast.error('Lot takibi yapılan ürünlerde Lot No zorunludur.');
          qs('#mvLotNo')?.focus();
          return;
        }
        if (!expiryDateRaw) {
          toast.error('SKT takibi yapılan ürünlerde Son Kullanım Tarihi zorunludur.');
          qs('#mvExpiryDate')?.focus();
          return;
        }
      }

      if (expiryDateRaw) {
        const parsed = new Date(`${expiryDateRaw}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) {
          toast.error('Son Kullanım Tarihi geçersiz.');
          qs('#mvExpiryDate')?.focus();
          return;
        }
        expiryDateIso = parsed.toISOString();
      }
    } else if (state.currentType === 'OUT' || state.currentType === 'TRANSFER') {
      const { getStockBalance: getBal } = await import('/scripts/inventory-balances.js');
      const bal = await getBal(companyId, state.selectedStock.sku, actualLocationId);
      const currentQty = bal?.quantity || 0;
      const companyDoc = await getDoc(doc(db, 'companies', companyId));
      const allowNegativeStock = companyDoc.exists() ? companyDoc.data()?.allowNegativeStock === true : false;

      if (currentQty <= 0) {
        toast.error(
          `Bu lokasyonda stok miktarı ${currentQty.toFixed(2)} ${state.selectedStock.unit || 'ADT'}. Olmayan stoğun ${state.currentType === 'TRANSFER' ? 'transferi' : 'çıkışı'} yapılamaz.`
        );
        return;
      }
      if (!allowNegativeStock && currentQty < qty) {
        toast.error(
          `Yetersiz stok! Mevcut: ${currentQty.toFixed(2)} ${state.selectedStock.unit || 'ADT'}, İstenen: ${qty.toFixed(2)} ${state.selectedStock.unit || 'ADT'}.`
        );
        return;
      }
      if (allowNegativeStock && currentQty < qty) {
        const willBeNegative = currentQty - qty;
        if (
          !confirm(
            `⚠️ Uyarı: Bu işlem stok miktarını ${willBeNegative.toFixed(2)} ${state.selectedStock.unit || 'ADT'}'ye düşürecek (eksi). Devam etmek istiyor musunuz?`
          )
        ) {
          return;
        }
        confirmNegative = true;
      }

      if (state.currentType === 'OUT') {
        ref = { kind: qs('#mvRefKind').value || 'MANUAL', id: qs('#mvRefId').value || '' };
      } else {
        const toLocationIdRaw = qs('#mvToLocation').value;
        if (!toLocationIdRaw) {
          toast.error(MESSAGES.ERROR_TARGET_LOCATION_REQUIRED);
          return;
        }
        toLocationId = toLocationIdRaw;
        if (toLocationIdRaw.startsWith('site_')) {
          const toSiteId = toLocationIdRaw.replace('site_', '');
          const toLocationQuery = query(
            collection(db, 'stock_locations'),
            where('siteId', '==', toSiteId),
            where('companyId', '==', companyId)
          );
          const toLocationSnap = await getDocs(toLocationQuery);
          if (!toLocationSnap.empty) {
            toLocationId = toLocationSnap.docs[0].id;
          }
        }
        ref = { kind: 'MANUAL', id: toLocationId };
      }
    }

    toast.info('Yükleniyor...');
    const response = await authFetch('/api/stock-movements', {
      method: 'POST',
      body: JSON.stringify({
        type: state.currentType,
        stockId: state.selectedStock.id,
        sku: state.selectedStock.sku,
        stockName: state.selectedStock.name,
        unit: state.selectedStock.unit || 'ADT',
        locationId: actualLocationId,
        siteId,
        toLocationId,
        qty,
        unitCost,
        extras,
        ref,
        lotNo,
        expiryDate: expiryDateIso,
        createdByName,
        confirmNegative,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || result.message || 'Stok hareketi kaydedilemedi');
    }

    // Düşük stok bildirimi (IN/OUT sonrası)
    if (state.currentType === 'IN' || state.currentType === 'OUT') {
      try {
        const { getStockBalance: getBalLow } = await import('/scripts/inventory-balances.js');
        const { checkAndNotifyStockLow } = await import('/scripts/inventory-notifications.js');
        const balLow = await getBalLow(companyId, state.selectedStock.sku, actualLocationId);
        const stockSnap = await getDoc(doc(db, 'stocks', state.selectedStock.id));
        const stockData = stockSnap.data() || {};
        const location = state.locations.find((l) => l.id === locationId || l.id === actualLocationId);
        await checkAndNotifyStockLow({
          companyId,
          sku: state.selectedStock.sku,
          locationId: actualLocationId,
          currentQty: result.quantity ?? balLow?.quantity ?? 0,
          minQty: stockData.minQty || stockData.minimumQty || 0,
          stockName: state.selectedStock.name,
          locationName: location?.name || null,
          userId: user.uid,
        });
      } catch (notifyErr) {
        logger.warn('Düşük stok bildirimi atlandı', notifyErr);
      }
    }
    
    toast.success(MESSAGES.SUCCESS_MOVEMENT_SAVED);

    // Teklifbul Rule v1.0 - Formu gizleme; alanları temizle (kullanıcı yeni hareket girebilsin)
    resetMovementFormFields();

    // Teklifbul Rule v1.0 - Eğer filtre aktifse history'yi yenile
    if (state.historySelectedStock && state.historySelectedStock.id === savedStockId) {
      await loadHistoryWithFilters({ reset: true });
    }
    
  } catch (error) {
    logger.error('Save error', error);
    toast.error(`${MESSAGES.ERROR_MOVEMENT_SAVE}: ${error.message}`);
  }
}

// Initialize when DOM is ready
// Teklifbul Rule v1.0 - Lokasyonlar yüklendikten sonra history'yi yükle
// Permission Pilot: Stok Hareketleri (URL guard + UI guard + query guard)
async function initialize() {
  try {
    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('Stock movements: company context alınamadı, sayfa başlatılmıyor', { ctx });
      toast.error(
        (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. Stok hareketleri yüklenemedi.'
      );
      return;
    }

    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Stock movements: initPermissions sonuç vermedi, sayfa başlatılmıyor');
      return;
    }

    if (STOCK_PERMS.view && !can(STOCK_PERMS.view)) {
      const msg =
        MESSAGES.ERROR_PERMISSION_STOCK_VIEW ||
        MESSAGES.ERROR_PERMISSION_DENIED ||
        'Stok modülünü görüntüleme yetkiniz yok.';
      toast.error(msg);
      logger.warn('Stock movements: view yetkisi yok, URL guard tetiklendi', {
        permKey: STOCK_PERMS.view,
        companyId: permState.companyId,
        roleKey: permState.roleKey
      });
      window.location.href = '/inventory-index.html';
      return;
    }

    setupEventListeners();
    // Default: hareket formu açık, geçmiş sekmesi kapalı + Giriş formu görünür
    const historyCard = qs('#historyCard');
    if (historyCard) historyCard.classList.add('hidden');
    const formCard = qs('#formCard');
    if (formCard) formCard.classList.remove('hidden');
    showMovementTypeForm(state.currentType || 'IN');

    // UI guard - hareket kaydetme butonu
    const btnSave = qs('#btnSave');
    if (btnSave && STOCK_PERMS.movements.use && !can(STOCK_PERMS.movements.use)) {
      btnSave.disabled = true;
      btnSave.title =
        MESSAGES.ERROR_PERMISSION_STOCK_MOVEMENTS ||
        'Stok hareketi kaydetme yetkiniz yok.';
    }

    await loadLocations(); // Önce lokasyonları yükle
    setupHistoryLocationFilter();
    await loadStocks();
    await setupHistoryStockSearch(); // Ürün arama UI
    await loadHistory(); // empty state
  } catch (error) {
    logger.error('Stock movements initialize error', error);
    toast.error(
      (MESSAGES.ERROR_STOCK_MOVEMENTS_LOAD || 'Stok hareketleri yüklenirken hata oluştu') +
        ': ' +
        (error.message || error)
    );
  }
}

function setupHistoryLocationFilter() {
  const sel = qs('#historyLocationFilter');
  if (!sel) return;
  sel.innerHTML = '';

  const optAll = document.createElement('option');
  optAll.value = 'ALL';
  optAll.textContent = 'Tüm Lokasyonlar';
  sel.appendChild(optAll);

  // state.locations doluysa ekle
  (state.locations || []).forEach((loc) => {
    const o = document.createElement('option');
    o.value = loc.id;
    o.textContent = loc.name || loc.id;
    sel.appendChild(o);
  });
}

async function setupHistoryStockSearch() {
  const input = qs('#historyStockSearch');
  const results = qs('#historyStockSearchResults');
  if (!input || !results) return;

  let searchTimeout = null;

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimeout);

    if (!q || q.length < 1) {
      results.style.display = 'none';
      state.historySelectedStock = null;
      return;
    }

    searchTimeout = setTimeout(() => {
      const matches = searchStocks(q, 50);
      results.style.display = 'block';
      results.innerHTML = '';

      if (!matches.length) {
        results.innerHTML = '<div style="padding:12px;text-align:center;color:#6b7280">Sonuç bulunamadı</div>';
        state.historySelectedStock = null;
        return;
      }

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
        div.style.background = idx % 2 === 0 ? '#fff' : '#f9fafb';
        div.innerHTML = `
          <div style="font-weight:600;color:#111827">${escapeHtml(stock.sku)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">${escapeHtml(stock.name)}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">Birim: ${escapeHtml(stock.unit || 'ADT')}</div>
        `;
        div.addEventListener('mouseenter', () => (div.style.background = '#eff6ff'));
        div.addEventListener('mouseleave', () => (div.style.background = idx % 2 === 0 ? '#fff' : '#f9fafb'));
        div.addEventListener('click', () => {
          state.historySelectedStock = stock;
          input.value = stock.sku;
          results.style.display = 'none';
        });
        results.appendChild(div);
      });
    }, 250);
  });

  // Teklifbul Rule v1.0 - Browser davranışı nedeniyle F6 ile arama kaldırıldı.
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
  });
} else {
  // DOM already loaded
  initialize();
}

