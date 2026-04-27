/**
 * Stok Sayım Modülü
 * Teklifbul Rule v1.0 - Yıl sonu sayımı ve stok düzeltme işlemleri
 */

import { db, auth, requireAuth } from '/firebase.js';
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, doc, getDoc, serverTimestamp, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { updateStockBalance } from '/scripts/inventory-balances.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import { logger } from '../src/shared/log/logger.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, requirePerm, getStockPerms } from '../assets/js/state/permissions.js';

const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

const state = {
  currentTab: 'active',
  companyId: null,
  locations: [],
  activeCounts: [],
  historyCounts: [],
  currentCount: null,
  countItems: []
};

const STOCK_PERMS = getStockPerms();

// Teklifbul Rule v1.0 - Sayım izinleri (stock.movements.adjust kullanılabilir)
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

    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.error('Stock count: company context alınamadı');
      toast.error(MESSAGES.ERROR_STOCK_COUNT_COMPANY_VERIFY);
      return;
    }

    state.companyId = companyContext.companyId;

    // Permission check
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      return;
    }

    if (COUNT_PERMS.view && !can(COUNT_PERMS.view)) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_VIEW_PERMISSION);
      window.location.href = '/inventory-index.html';
      return;
    }

    await loadLocations();
    setupEventListeners();
    await loadActiveCounts();
    await loadHistoryCounts();
    await loadStats();
  } catch (error) {
    logger.error('Stock count initialization error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_DETAIL_LOAD.replace('{message}', error.message));
  }
})();

// Load locations
async function loadLocations() {
  try {
    const locationsRef = collection(db, 'stock_locations');
    const locationsQuery = query(
      locationsRef,
      where('companyId', '==', state.companyId),
      orderBy('name'),
      limit(1000) // Teklifbul Rule v1.0 - Limit eklendi
    );
    const snap = await getDocs(locationsQuery);

    state.locations = [];
    snap.forEach(doc => {
      state.locations.push({ id: doc.id, ...doc.data() });
    });

    const select = qs('#countLocation');
    if (select) {
      select.innerHTML = '<option value="">Lokasyon seçin...</option>';
      state.locations.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.id;
        option.textContent = `${loc.name} (${loc.type === 'SITE' ? 'Şantiye' : 'Depo'})`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    logger.error('Locations load error', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  const tabs = qsa('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Create count button
  const btnCreate = qs('#btnCreateCount');
  if (btnCreate) {
    btnCreate.addEventListener('click', handleCreateCount);
  }

  // Cancel button
  const btnCancel = qs('#btnCancelCreate');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      qs('#countTitle').value = '';
      qs('#countDescription').value = '';
      qs('#countLocation').value = '';
      switchTab('active');
    });
  }
}

// Switch tab
function switchTab(tabName) {
  state.currentTab = tabName;

  // Update tab UI
  const tabs = qsa('.tab');
  tabs.forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    }
  });

  // Show/hide content
  const tabContents = qsa('.tab-content');
  tabContents.forEach(content => {
    content.classList.add('hidden');
  });

  const contentId = `tab-${tabName}`;
  const content = qs(`#${contentId}`);
  if (content) {
    content.classList.remove('hidden');
  }

  // Load data for tab
  if (tabName === 'active') {
    loadActiveCounts();
  } else if (tabName === 'history') {
    loadHistoryCounts();
  } else if (tabName === 'reports') {
    loadStats();
  }
}

// Handle create count
async function handleCreateCount() {
  try {
    const title = qs('#countTitle').value.trim();
    const locationId = qs('#countLocation').value;
    const description = qs('#countDescription').value.trim();

    if (!title) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_TITLE_REQUIRED);
      return;
    }

    if (!locationId) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_LOCATION_REQUIRED);
      return;
    }

    // Permission check
    if (COUNT_PERMS.create) {
      const ok = await requirePerm(COUNT_PERMS.create, {
        toastMessage: 'Sayım oluşturma yetkiniz yok.'
      });
      if (!ok) return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast.error(MESSAGES.ERROR_STOCK_COUNT_SESSION_NOT_FOUND);
      return;
    }

    const btn = qs('#btnCreateCount');
    btn.disabled = true;
    btn.textContent = 'Oluşturuluyor...';

    // Create count document
    const countRef = await addDoc(collection(db, 'stock_counts'), {
      companyId: state.companyId,
      locationId: locationId,
      title: title,
      description: description || '',
      status: 'DRAFT',
      createdBy: user.uid, // Teklifbul Rule v1.0 - Standart sahiplik alanı
      startedBy: user.uid,
      startedAt: null,
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.info('Sayım oturumu oluşturuldu', { countId: countRef.id });
    toast.success(MESSAGES.SUCCESS_STOCK_COUNT_STARTED);

    // Reset form
    qs('#countTitle').value = '';
    qs('#countDescription').value = '';
    qs('#countLocation').value = '';

    // Switch to count detail page (will be created)
    window.location.href = `/pages/stock-count-detail.html?id=${countRef.id}`;

  } catch (error) {
    logger.error('Create count error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_CREATE.replace('{message}', error.message));
    const btn = qs('#btnCreateCount');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sayım Oluştur';
    }
  }
}

// Load active counts
async function loadActiveCounts() {
  try {
    const countsRef = collection(db, 'stock_counts');
    let countsQuery;

    try {
      // Try with status 'in' query (requires composite index)
      countsQuery = query(
        countsRef,
        where('companyId', '==', state.companyId),
        where('status', 'in', ['DRAFT', 'IN_PROGRESS']),
        orderBy('createdAt', 'desc')
      );
    } catch (queryError) {
      // Fallback: Load all and filter client-side
      logger.warn('Active counts query with status in failed, using fallback', queryError);
      countsQuery = query(
        countsRef,
        where('companyId', '==', state.companyId),
        orderBy('createdAt', 'desc'),
        limit(100) // Teklifbul Rule v1.0 - Limit eklendi
      );
    }

    const snap = await getDocs(countsQuery);

    state.activeCounts = [];
    snap.forEach(doc => {
      const data = doc.data();
      // Filter by status if not in query
      if (data.status === 'DRAFT' || data.status === 'IN_PROGRESS') {
        state.activeCounts.push({ id: doc.id, ...data });
      }
    }); await renderActiveCounts();
  } catch (error) {
    logger.error('Load active counts error', error);
    const container = qs('#activeCountsList');
    if (container) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Sayımlar yüklenirken hata oluştu.</div>';
    }
  }
}

// Render active counts
async function renderActiveCounts() {
  const container = qs('#activeCountsList'); if (!container) return;

  if (state.activeCounts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280">Aktif sayım bulunamadı.</div>';
    return;
  }

  // Calculate progress for each count
  const countsWithProgress = await Promise.all(state.activeCounts.map(async (count) => {
    const progress = await calculateProgress(count.id);
    return { ...count, progress };
  }));

  container.innerHTML = countsWithProgress.map(count => {
    const location = state.locations.find(l => l.id === count.locationId);
    const locationName = location ? location.name : 'Bilinmeyen';
    const statusBadge = getStatusBadge(count.status);
    const createdAt = count.createdAt?.toDate ? count.createdAt.toDate().toLocaleDateString('tr-TR') : '-';

    return `
      <div class="count-card" data-count-id="${count.id}">
        <div class="count-card-header">
          <div style="flex:1">
            <div class="count-card-title">${count.title}</div>
            <div class="count-card-meta">
              📍 ${locationName} | ${statusBadge} | 📅 ${createdAt}
            </div>
            ${count.progress !== undefined ? `
              <div style="margin-top:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:4px">
                  <span>İlerleme</span>
                  <span>${count.progress}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${count.progress}%"></div>
                </div>
              </div>
            ` : ''}
          </div>
          <div>
            <button class="btn btn-primary btn-sm btn-continue-count" data-count-id="${count.id}" style="padding:8px 16px;font-size:13px">Devam Et</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Teklifbul Rule v1.0 - CSP uyumlu event listener'lar
  qsa('.btn-continue-count').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const countId = btn.dataset.countId;
      if (countId) {
        window.location.href = `/pages/stock-count-detail.html?id=${countId}`;
      }
    });
  });
}

// Load history counts
async function loadHistoryCounts() {
  try {
    const countsRef = collection(db, 'stock_counts');
    let countsQuery;

    try {
      // Try with status 'in' query (requires composite index)
      countsQuery = query(
        countsRef,
        where('companyId', '==', state.companyId),
        where('status', 'in', ['COMPLETED', 'APPROVED']),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } catch (queryError) {
      // Fallback: Load all and filter client-side
      logger.warn('History counts query with status in failed, using fallback', queryError);
      countsQuery = query(
        countsRef,
        where('companyId', '==', state.companyId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    const snap = await getDocs(countsQuery);

    state.historyCounts = [];
    snap.forEach(doc => {
      const data = doc.data();
      // Filter by status if not in query
      if (data.status === 'COMPLETED' || data.status === 'APPROVED') {
        state.historyCounts.push({ id: doc.id, ...data });
      }
    });

    renderHistoryCounts();
  } catch (error) {
    logger.error('Load history counts error', error);
    const container = qs('#historyCountsList');
    if (container) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444">Geçmiş sayımlar yüklenirken hata oluştu.</div>';
    }
  }
}

// Render history counts
function renderHistoryCounts() {
  const container = qs('#historyCountsList');
  if (!container) return;

  if (state.historyCounts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280">Geçmiş sayım bulunamadı.</div>';
    return;
  }

  container.innerHTML = state.historyCounts.map(count => {
    const location = state.locations.find(l => l.id === count.locationId);
    const locationName = location ? location.name : 'Bilinmeyen';
    const statusBadge = getStatusBadge(count.status);
    const createdAt = count.createdAt?.toDate ? count.createdAt.toDate().toLocaleDateString('tr-TR') : '-';

    return `
      <div class="count-card" data-count-id="${count.id}">
        <div class="count-card-header">
          <div>
            <div class="count-card-title">${count.title}</div>
            <div class="count-card-meta">
              📍 ${locationName} | ${statusBadge} | 📅 ${createdAt}
            </div>
          </div>
          <div>
            <button class="btn btn-secondary btn-sm btn-view-count-detail" data-count-id="${count.id}">Detay</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Teklifbul Rule v1.0 - CSP uyumlu event listener'lar
  qsa('.btn-view-count-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const countId = btn.dataset.countId;
      if (countId) {
        window.location.href = `/pages/stock-count-detail.html?id=${countId}`;
      }
    });
  });
}

// Load stats
async function loadStats() {
  try {
    const countsRef = collection(db, 'stock_counts');
    const allCountsQuery = query(
      countsRef,
      where('companyId', '==', state.companyId),
      limit(1000) // Teklifbul Rule v1.0 - Limit eklendi
    );
    const snap = await getDocs(allCountsQuery);

    let totalCounts = 0;
    let completedCounts = 0;
    let approvedCounts = 0;
    let totalDifference = 0;

    // Load all approved counts and calculate total difference
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      totalCounts++;

      if (data.status === 'COMPLETED' || data.status === 'APPROVED') {
        completedCounts++;
      }
      if (data.status === 'APPROVED') {
        approvedCounts++;

        // Calculate total difference for approved counts
        try {
          const itemsRef = collection(db, 'stock_counts', docSnap.id, 'count_items');
          const itemsSnap = await getDocs(query(itemsRef, limit(10000))); // Teklifbul Rule v1.0 - Limit eklendi

          itemsSnap.forEach(itemDoc => {
            const itemData = itemDoc.data();
            if (itemData.difference !== null && itemData.difference !== undefined) {
              totalDifference += Math.abs(itemData.difference);
            }
          });
        } catch (itemsError) {
          logger.warn('Load count items for stats error', { countId: docSnap.id, error: itemsError });
        }
      }
    }

    qs('#statTotalCounts').textContent = totalCounts;
    qs('#statCompletedCounts').textContent = completedCounts;
    qs('#statApprovedCounts').textContent = approvedCounts;
    qs('#statTotalDifference').textContent = totalDifference.toLocaleString('tr-TR');
  } catch (error) {
    logger.error('Load stats error', error);
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

async function calculateProgress(countId) {
  try {
    const itemsRef = collection(db, 'stock_counts', countId, 'count_items');
    const itemsSnap = await getDocs(query(itemsRef, limit(10000))); // Teklifbul Rule v1.0 - Limit eklendi

    let total = 0;
    let counted = 0;

    itemsSnap.forEach(doc => {
      total++;
      const data = doc.data();
      if (data.countedQuantity !== null && data.countedQuantity !== undefined) {
        counted++;
      }
    });

    return total > 0 ? Math.round((counted / total) * 100) : 0;
  } catch (error) {
    logger.error('Calculate progress error', error);
    return 0;
  }
}

// Add "Tümünü Ekle" functionality to create count
async function addAllStocksToCount() {
  if (state.countItems.length > 0) {
    if (!confirm('Sayım listesinde zaten ürünler var. Tüm stokları eklemek istediğinizden emin misiniz?')) {
      return;
    }
  }

  try {
    toast.info(`${state.allStocks.length} ürün ekleniyor...`);

    const itemsRef = collection(db, 'stock_counts', state.countId, 'count_items');
    let added = 0;

    for (const stock of state.allStocks) {
      // Check if already added
      if (state.countItems.find(item => item.sku === stock.sku)) {
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

    toast.success(`${added} ürün eklendi`);
    await loadCountItems();
  } catch (error) {
    logger.error('Add all stocks error', error);
    toast.error(MESSAGES.ERROR_STOCK_COUNT_PRODUCTS_ADD.replace('{message}', error.message));
  }
}

