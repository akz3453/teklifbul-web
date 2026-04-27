/**
 * REFACTORED: ŞMTF Form - Yeni Veri Modeli
 * 
 * - Şantiyeler: /companies/{companyId}/sites
 * - Stok Kartları: /companies/{companyId}/inventory
 * - Searchable dropdown, otomatik adres doldurma, SKU autocomplete
 */

import { db, auth, requireAuth } from '/firebase.js';
import { normalizeTR, normalizeTRLower } from '/scripts/lib/tr-utils.js';
import { createNotification } from '/scripts/inventory-notifications.js';
import { 
  collection, getDocs, query, where, addDoc, doc, getDoc, 
  orderBy, serverTimestamp, limit, startAfter 
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { pageGuard, UIState, renderUIState } from './lib/page-guard.js';
import { initPermissions, can, getStockPerms } from '../assets/js/state/permissions.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { debounce } from '../assets/js/utils/debounce.js';

const qs = s => document.querySelector(s);

// State
const state = {
  sites: [],           // /companies/{companyId}/sites
  inventory: [],       // /companies/{companyId}/inventory (cache)
  inventoryPageSize: 50, // Teklifbul Rule v1.0 - Pagination: Sayfa başına kayıt sayısı
  inventoryLastDoc: null, // Teklifbul Rule v1.0 - Pagination: Son document snapshot
  inventoryHasMore: false, // Teklifbul Rule v1.0 - Pagination: Daha fazla kayıt var mı?
  inventoryTotal: 0,   // Teklifbul Rule v1.0 - Pagination: Toplam kayıt sayısı (opsiyonel)
  selectedSite: null,  // Seçili şantiye objesi
  selectedAddress: null, // Seçili adres (defaultAddress veya addresses[i])
  lines: [],           // Malzeme satırları
  companyId: null,     // Kullanıcının companyId'si
  userId: null,        // Kullanıcı ID
  // Teklifbul Rule v1.0 - Workflow state
  requestStatus: 'draft' // draft | sent | waiting_approval | approved | rejected | partially_fulfilled | completed | cancelled
};

// Teklifbul Rule v1.0 - UI State Machine
const uiState = new UIState('idle');

// Teklifbul Rule v1.0 - Request permissions (stock permissions kullanıyoruz)
const STOCK_PERMS = getStockPerms();
const REQUEST_PERMS = {
  create: STOCK_PERMS.view, // ŞMTF oluşturma için stok görme yetkisi yeterli
  edit: STOCK_PERMS.edit,
  send: STOCK_PERMS.view,
  export: STOCK_PERMS.reports,
  view: STOCK_PERMS.view
};

let lineCounter = 1;

// ====================
// Yardımcı Fonksiyonlar
// ====================

/**
 * Adres objesini string formatına çevir
 */
function formatAddress(addr) {
  if (!addr) return '';
  const parts = [
    addr.line1,
    addr.line2,
    addr.district ? `${addr.district}/${addr.city}` : addr.city,
    addr.postalCode,
    addr.country
  ].filter(Boolean);
  return parts.join(' - ');
}

/**
 * Şantiyeleri listele: /companies/{companyId}/sites
 */
async function listSites(companyId) {
  try {
    const q = query(
      collection(db, 'companies', companyId, 'sites'),
      where('isActive', '==', true),
      orderBy('siteName', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    logger.error('Sites load error', error);
    return [];
  }
}

/**
 * Stok kartlarını listele: /companies/{companyId}/inventory
 * Teklifbul Rule v1.0 - Pagination desteği eklendi
 * 
 * @param {string} companyId - Company ID
 * @param {boolean} reset - İlk sayfa için true, sonraki sayfa için false
 */
async function loadInventory(companyId, reset = true) {
  try {
    // Teklifbul Rule v1.0 - Pagination: İlk sayfa için state'i sıfırla
    if (reset) {
      state.inventory = [];
      state.inventoryLastDoc = null;
      state.inventoryHasMore = false;
    }

    // Teklifbul Rule v1.0 - Pagination: Firestore query oluştur
    // Not: SKU document ID olduğu için orderBy gerekmez, ancak tutarlılık için eklenebilir
    // Eğer 'name' field'ı yoksa, orderBy olmadan da çalışır (document ID sıralaması)
    let q = query(
      collection(db, 'companies', companyId, 'inventory'),
      limit(state.inventoryPageSize + 1) // +1 to check if there's more
    );
    
    // Teklifbul Rule v1.0 - Pagination: Eğer 'name' field'ı varsa sıralama yap (opsiyonel)
    // Not: Firestore index gerekebilir: companies/{companyId}/inventory: name ASC
    // Şimdilik orderBy olmadan çalışıyor (document ID sıralaması)

    // Teklifbul Rule v1.0 - Pagination: Cursor-based pagination
    if (state.inventoryLastDoc && !reset) {
      q = query(q, startAfter(state.inventoryLastDoc));
    }

    const snap = await getDocs(q);
    const docs = snap.docs;
    
    // Teklifbul Rule v1.0 - Pagination: Daha fazla kayıt var mı kontrol et
    state.inventoryHasMore = docs.length > state.inventoryPageSize;
    const results = state.inventoryHasMore ? docs.slice(0, state.inventoryPageSize) : docs;

    // Teklifbul Rule v1.0 - Pagination: Son document snapshot'ı kaydet
    if (results.length > 0) {
      state.inventoryLastDoc = results[results.length - 1];
    }

    // Teklifbul Rule v1.0 - Pagination: Yeni kayıtları state'e ekle
    const newItems = results.map(d => ({ sku: d.id, ...d.data() }));
    state.inventory = reset ? newItems : [...state.inventory, ...newItems];

    logger.info(`Loaded ${newItems.length} inventory items`, { 
      total: state.inventory.length, 
      hasMore: state.inventoryHasMore 
    });
    
    return {
      items: newItems,
      hasMore: state.inventoryHasMore,
      total: state.inventory.length
    };
  } catch (error) {
    logger.error('Inventory load error', error);
    // Teklifbul Rule v1.0 - Hata durumunda state'i koru (kısmi yükleme)
    if (reset) {
      state.inventory = [];
      state.inventoryLastDoc = null;
      state.inventoryHasMore = false;
    }
    return {
      items: [],
      hasMore: false,
      total: state.inventory.length
    };
  }
}

/**
 * Teklifbul Rule v1.0 - Pagination: Sonraki sayfayı yükle
 */
async function loadInventoryNextPage(companyId) {
  if (!state.inventoryHasMore) {
    logger.info('No more inventory items to load');
    return { items: [], hasMore: false, total: state.inventory.length };
  }
  return await loadInventory(companyId, false);
}

/**
 * SKU'ya göre stok kartı getir
 */
async function getInventoryItem(companyId, sku) {
  try {
    // Önce cache'den bak
    const cached = state.inventory.find(inv => inv.sku === sku || inv.sku?.toUpperCase() === sku.toUpperCase());
    if (cached) return cached;
    
    // Cache'de yoksa Firestore'dan çek
    const ref = doc(db, 'companies', companyId, 'inventory', sku);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = { sku: snap.id, ...snap.data() };
      state.inventory.push(data); // Cache'e ekle
      return data;
    }
    return null;
  } catch (error) {
    logger.error('Inventory item load error', error);
    return null;
  }
}

// ====================
// Şantiye Dropdown (Searchable)
// ====================

let locationInput = null;
let locationDropdown = null;

function initSiteDropdown() {
  locationInput = qs('#reqLocation');
  locationDropdown = qs('#locationDropdown');
  
  if (!locationInput || !locationDropdown) return;
  
  // Input'a yazarken filtrele (debounced - Teklifbul Rule v1.0)
  const debouncedFilterSites = debounce((query) => {
    filterAndShowSites(query);
  }, 300);
  
  locationInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    debouncedFilterSites(query);
  });
  
  // Focus'ta dropdown göster
  locationInput.addEventListener('focus', () => {
    if (state.sites.length > 0) {
      filterAndShowSites('');
    }
  });
  
  // Click outside to close
  document.addEventListener('click', (e) => {
    if (locationInput && locationDropdown && 
        !locationInput.parentElement.contains(e.target) && 
        !locationDropdown.contains(e.target)) {
      locationDropdown.style.display = 'none';
    }
  });
}

function filterAndShowSites(query) {
  if (!locationDropdown) return;
  
  const filtered = state.sites.filter(site => {
    if (!query) return true;
    const searchText = (site.siteName || '').toLowerCase();
    return searchText.includes(query);
  }).slice(0, 20); // İlk 20 sonuç
  
  if (filtered.length === 0) {
    locationDropdown.innerHTML = '<div style="padding:8px;color:#6b7280">Şantiye bulunamadı</div>';
    locationDropdown.style.display = 'block';
    return;
  }
  
  locationDropdown.innerHTML = filtered.map(site => `
    <div class="site-option" data-site-id="${site.id}" style="padding:8px;cursor:pointer;border-bottom:1px solid #e5e7eb">
      <strong>${site.siteName || 'İsimsiz Şantiye'}</strong>
    </div>
  `).join('');
  
  // Click handler
  locationDropdown.querySelectorAll('.site-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const siteId = opt.getAttribute('data-site-id');
      const site = state.sites.find(s => s.id === siteId);
      if (site) {
        selectSite(site);
      }
    });
  });
  
  locationDropdown.style.display = 'block';
}

function selectSite(site) {
  state.selectedSite = site;
  locationInput.value = site.siteName || '';
  locationDropdown.style.display = 'none';
  
  // Default adresi doldur
  if (site.defaultAddress) {
    fillAddress(site.defaultAddress);
    state.selectedAddress = site.defaultAddress;
  }
  
  // İlave adres butonunu aktif et
  const btnSelectAddress = qs('#btnSelectAddress');
  if (btnSelectAddress) {
    btnSelectAddress.disabled = !site.addresses || site.addresses.length === 0;
  }
  
  // Validation kontrolü
  updateActions();
}

function fillAddress(addr) {
  const textarea = qs('#reqDelivery');
  if (textarea && addr) {
    textarea.value = formatAddress(addr);
    textarea.readOnly = true;
    // Teklifbul Rule v1.0 - Koyu mod kontrolü
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || 
                      document.documentElement.classList.contains('force-dark');
    textarea.style.background = isDarkMode ? '#111827' : '#f9fafb';
    textarea.style.color = isDarkMode ? '#ffffff' : '';
  }
}

// ====================
// İlave Adres Modal
// ====================

function initAddressModal() {
  const modal = qs('#addressModal');
  const btnSelectAddress = qs('#btnSelectAddress');
  const btnCancelAddress = qs('#btnCancelAddress');
  const addressList = qs('#addressList');
  
  if (!modal || !btnSelectAddress) return;
  
  btnSelectAddress.addEventListener('click', () => {
    if (!state.selectedSite) return;
    
    // Default adresi de ekle
    const allAddresses = [];
    if (state.selectedSite.defaultAddress) {
      allAddresses.push({
        id: 'default',
        label: 'Varsayılan Adres',
        ...state.selectedSite.defaultAddress
      });
    }
    
    if (state.selectedSite.addresses && state.selectedSite.addresses.length > 0) {
      allAddresses.push(...state.selectedSite.addresses);
    }
    
    addressList.innerHTML = allAddresses.map((addr, idx) => `
      <div class="address-option" data-addr-idx="${idx}" style="padding:12px;margin:8px 0;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer">
        <strong>${addr.label || 'Varsayılan Adres'}</strong>
        <div style="margin-top:4px;font-size:12px;color:#6b7280">${formatAddress(addr)}</div>
      </div>
    `).join('');
    
    addressList.querySelectorAll('.address-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const idx = parseInt(opt.getAttribute('data-addr-idx'));
        const selectedAddr = allAddresses[idx];
        if (selectedAddr) {
          fillAddress(selectedAddr);
          state.selectedAddress = selectedAddr;
          modal.style.display = 'none';
          updateActions();
        }
      });
      opt.addEventListener('mouseenter', () => {
        opt.style.background = '#f3f4f6';
      });
      opt.addEventListener('mouseleave', () => {
        opt.style.background = '#fff';
      });
    });
    
    modal.style.display = 'flex';
  });
  
  if (btnCancelAddress) {
    btnCancelAddress.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
  
  // Modal dışına tıklayınca kapat
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

// ====================
// SKU Autocomplete
// ====================

function initSkuAutocomplete() {
  // Tabloya satır eklendiğinde SKU input'larına autocomplete ekle
  // Bu, renderLines içinde çağrılacak
}

function attachSkuAutocomplete(input, rowIndex) {
  if (!input || !state.companyId) return;
  
  // Her input için kendi dropdown'unu sakla
  let dropdown = null;
  
  // Teklifbul Rule v1.0 - Akıllı debounce: Her input için ayrı timer
  let skuSearchDebounceTimer = null;
  
  // Eski dropdown'u temizle
  function removeDropdown() {
    if (dropdown && dropdown.parentNode) {
      dropdown.remove();
      dropdown = null;
    }
  }
  
  input.addEventListener('input', (e) => {
    // Önceki timer'ı iptal et
    if (skuSearchDebounceTimer) {
      clearTimeout(skuSearchDebounceTimer);
      skuSearchDebounceTimer = null;
    }
    
    const query = e.target.value.trim().toUpperCase();
    
    // Eski dropdown'u temizle
    removeDropdown();
    
    // Boş ise hemen çık
    if (query.length < 1) {
      return;
    }
    
    // Kelime uzunluğuna göre debounce süresi
    // 1-2 karakter: 600ms (kullanıcı yazmaya devam ediyor olabilir)
    // 3+ karakter: 300ms (kullanıcı muhtemelen yazmayı bitirdi)
    const debounceTime = query.length <= 2 ? 600 : 300;
    
    skuSearchDebounceTimer = setTimeout(async () => {
      // Timer içinde güncel query'yi al (kullanıcı yazmaya devam etmiş olabilir)
      const currentQuery = e.target.value.trim().toUpperCase();
      
      // Boş ise çık
      if (currentQuery.length < 1) {
        return;
      }
      
      // Teklifbul Rule v1.0 - Pagination: İlk 20 sonuç (startsWith + contains)
      let startsWith = state.inventory.filter(inv => 
        inv.sku?.startsWith(currentQuery)
      ).slice(0, 10);
      
      let contains = state.inventory.filter(inv => 
        !inv.sku?.startsWith(currentQuery) && 
        (inv.sku?.includes(currentQuery) || inv.productName?.toUpperCase().includes(currentQuery))
      ).slice(0, 10);
      
      // Teklifbul Rule v1.0 - Pagination: Eğer yeterli sonuç yoksa ve daha fazla kayıt varsa, lazy load yap
      if ((startsWith.length + contains.length) < 10 && state.inventoryHasMore && state.companyId) {
        // Sonraki sayfayı yükle
        const nextPage = await loadInventoryNextPage(state.companyId);
        if (nextPage.items.length > 0) {
          // Yeni kayıtlarla tekrar filtrele
          startsWith = state.inventory.filter(inv => 
            inv.sku?.startsWith(currentQuery)
          ).slice(0, 10);
          
          contains = state.inventory.filter(inv => 
            !inv.sku?.startsWith(currentQuery) && 
            (inv.sku?.includes(currentQuery) || inv.productName?.toUpperCase().includes(currentQuery))
          ).slice(0, 10);
        }
      }
      
      const results = [...startsWith, ...contains].slice(0, 20);
      
      if (results.length === 0) {
        return;
      }
      
      // Dropdown oluştur
      dropdown = document.createElement('div');
      dropdown.className = 'sku-dropdown';
      dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #d1d5db;border-radius:4px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 6px rgba(0,0,0,0.1)';
      dropdown.innerHTML = results.map(inv => `
        <div class="sku-option" data-sku="${inv.sku}" style="padding:8px;cursor:pointer;border-bottom:1px solid #e5e7eb">
          <strong>${inv.sku || ''}</strong> - ${inv.productName || ''}
        </div>
      `).join('');
      
      // Position relative için input'un parent'ını bul
      const wrapper = input.parentElement; // <td>
      if (wrapper && wrapper.tagName === 'TD') {
        // TD için position:relative ayarla
        if (!wrapper.style.position || wrapper.style.position === 'static') {
          wrapper.style.position = 'relative';
        }
        wrapper.appendChild(dropdown);
      } else {
        // Fallback: body'ye ekle
        document.body.appendChild(dropdown);
      }
      
      // Click handler
      dropdown.querySelectorAll('.sku-option').forEach(opt => {
        opt.addEventListener('click', async () => {
          const sku = opt.getAttribute('data-sku');
          input.value = sku;
          removeDropdown();
          
          // Stok kartı bilgilerini doldur
          const invItem = await getInventoryItem(state.companyId, sku);
          if (invItem && state.lines[rowIndex]) {
            state.lines[rowIndex].sku = sku;
            state.lines[rowIndex].name = invItem.productName || state.lines[rowIndex].name || '';
            state.lines[rowIndex].brandModel = invItem.brandModel || state.lines[rowIndex].brandModel || '';
            state.lines[rowIndex].unit = invItem.unit || state.lines[rowIndex].unit || 'ADT';
            renderLines();
            updateActions();
          }
        });
        opt.addEventListener('mouseenter', () => {
          opt.style.background = '#f3f4f6';
        });
        opt.addEventListener('mouseleave', () => {
          opt.style.background = '#fff';
        });
      });
      
      // Timer'ı temizle
      skuSearchDebounceTimer = null;
    }, debounceTime);
  });
  
  // Blur event: input'tan çıkınca dropdown'u kapat
  input.addEventListener('blur', (e) => {
    // Click event'ten önce blur çalışmasın diye timeout
    setTimeout(() => {
      if (dropdown && !dropdown.contains(document.activeElement)) {
        removeDropdown();
      }
    }, 200);
  });
  
  // Click outside to close (sadece bir kez ekle)
  if (!window.__skuDropdownCloseListener) {
    window.__skuDropdownCloseListener = true;
    document.addEventListener('click', (e) => {
      // Açık olan tüm SKU dropdown'larını kontrol et
      document.querySelectorAll('.sku-dropdown').forEach(dd => {
        if (!dd.contains(e.target) && !e.target.closest('.sku-input')) {
          dd.remove();
        }
      });
    });
  }
}

// ====================
// Satır Yönetimi
// ====================

function renderLines() {
  const tbody = qs('#linesTable tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  state.lines.forEach((line, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = idx;
    
    const badge = line.matchStatus === 'FOUND' ? 'b-found' : 
                  line.matchStatus === 'MULTI' ? 'b-multi' : 'b-new';
    const badgeText = line.matchStatus === 'FOUND' ? '✅' : 
                     line.matchStatus === 'MULTI' ? '⚠️' : '🆕';
    
    tr.innerHTML = `
      <td>
        <input type="text" class="sku-input" value="${line.sku || ''}" 
               placeholder="SKU ara..." style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px" />
      </td>
      <td>
        <input type="text" class="product-name-input" value="${line.name || ''}" 
               placeholder="Ürün adı" required style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px" />
      </td>
      <td>
        <input type="text" class="brand-input" value="${line.brandModel || ''}" 
               placeholder="Marka/Model" style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px" />
      </td>
      <td>
        <input type="number" class="qty-input" value="${line.qty || ''}" 
               placeholder="Miktar" step="0.01" min="0" required style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px" />
      </td>
      <td>
        <input type="text" class="unit-input" value="${line.unit || ''}" 
               placeholder="Birim" required style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px" />
      </td>
      <td>
        <input type="date" class="date-input" value="${line.requestedDate || ''}" 
               style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px" />
      </td>
      <td><span class="badge ${badge}">${badgeText}</span></td>
      <td>
        <button type="button" class="btn btn-small btn-secondary" onclick="removeLine(${idx})">Sil</button>
      </td>
    `;
    
    tbody.appendChild(tr);
    
    // SKU autocomplete ekle
    const skuInput = tr.querySelector('.sku-input');
    if (skuInput) {
      attachSkuAutocomplete(skuInput, idx);
    }
    
    // Input change handlers
    tr.querySelector('.product-name-input')?.addEventListener('input', (e) => {
      state.lines[idx].name = e.target.value;
      updateActions();
    });
    tr.querySelector('.brand-input')?.addEventListener('input', (e) => {
      state.lines[idx].brandModel = e.target.value;
    });
    tr.querySelector('.qty-input')?.addEventListener('input', (e) => {
      state.lines[idx].qty = parseFloat(e.target.value) || 0;
      updateActions();
    });
    tr.querySelector('.unit-input')?.addEventListener('input', (e) => {
      state.lines[idx].unit = e.target.value;
      updateActions();
    });
    tr.querySelector('.date-input')?.addEventListener('input', (e) => {
      state.lines[idx].requestedDate = e.target.value;
    });
  });
  
  if (state.lines.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:20px">Henüz satır eklenmedi.</td></tr>';
  }
}

window.removeLine = function(idx) {
  state.lines.splice(idx, 1);
  renderLines();
  updateActions();
};

// ====================
// Satır Ekleme
// ====================

qs('#btnAddLine')?.addEventListener('click', () => {
  state.lines.push({
    lineNo: lineCounter++,
    sku: '',
    name: '',
    brandModel: '',
    qty: 0,
    unit: 'ADT',
    requestedDate: '',
    matchStatus: 'NEW'
  });
  renderLines();
  updateActions();
});

// ====================
// Zorunlu Alan Kontrolü
// ====================

function isRowValid(row) {
  const hasSkuOrName = (row.sku?.trim() || row.name?.trim());
  return hasSkuOrName && row.qty > 0 && !!row.unit?.trim();
}

function canSubmit() {
  const titleOk = qs('#reqTitle')?.value.trim().length > 0;
  const siteOk = !!state.selectedSite;
  const addressOk = qs('#reqDelivery')?.value.trim().length > 0;
  const atLeastOneRow = state.lines.length > 0 && state.lines.every(isRowValid);
  
  return titleOk && siteOk && addressOk && atLeastOneRow;
}

function updateActions() {
  const can = canSubmit();
  const btnSaveDraft = qs('#btnSaveDraft');
  const btnSend = qs('#btnSend');
  const btnExportPDF = qs('#btnExportPDF');
  const btnExportExcel = qs('#btnExportExcel');
  
  if (btnSaveDraft) btnSaveDraft.disabled = !can;
  if (btnSend) btnSend.disabled = !can;
  if (btnExportPDF) btnExportPDF.disabled = !can;
  if (btnExportExcel) btnExportExcel.disabled = !can;
}

// Input'lara change listener ekle (async init'ten sonra çalışacak şekilde)
// Bu, async init içinde çağrılacak
function attachInputListeners() {
  qs('#reqTitle')?.addEventListener('input', updateActions);
  qs('#reqDelivery')?.addEventListener('input', updateActions);
}

// ====================
// Kaydetme
// ====================

async function saveRequest(status) {
  const user = await requireAuth();
  
  if (!canSubmit()) {
    alert('Lütfen zorunlu alanları doldurun!');
    return;
  }
  
  try {
    const requestData = {
      type: 'ŞMTF',
      title: qs('#reqTitle').value.trim(),
      requesterUserId: user.uid,
      requesterName: user.displayName || user.email,
      siteId: state.selectedSite.id,
      siteName: state.selectedSite.siteName,
      selectedAddressId: state.selectedAddress?.id || 'default',
      deliveryAddress: qs('#reqDelivery').value.trim(),
      deliveryIsFreightIncluded: qs('#reqFreightIncluded')?.checked || false,
      description: qs('#reqDescription')?.value.trim() || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status
    };
    
    const requestRef = await addDoc(collection(db, 'internal_requests'), requestData);
    
    // Add material_lines subcollection
    for (const line of state.lines) {
      await addDoc(collection(db, 'internal_requests', requestRef.id, 'material_lines'), {
        lineNo: line.lineNo,
        sku: line.sku || '',
        name: line.name || '',
        brandModel: line.brandModel || '',
        qty: line.qty,
        unit: line.unit,
        requestedDate: line.requestedDate || '',
        matchStatus: line.matchStatus || 'NEW',
        createdAt: serverTimestamp()
      });
    }
    
    // Teklifbul Rule v1.0 - ŞMTF gönderildiğinde bildirim gönder
    if (status === 'SENT') {
      await sendSmtfNotifications(requestRef.id, requestData);
    }
    
    alert('✅ Talep kaydedildi!');
    location.href = '/pages/request-detail.html?id=' + requestRef.id;
    
  } catch (error) {
    logger.error('Save error', error);
    alert('❌ Talep kaydedilemedi: ' + error.message);
  }
}

/**
 * ŞMTF gönderildiğinde depo/stok ve şantiye yetkililerine bildirim gönder
 * Teklifbul Rule v1.0 - Bildirim sistemi
 */
async function sendSmtfNotifications(requestId, requestData) {
  try {
    logger.group('ŞMTF Bildirim Gönderimi');
    
    if (!state.companyId) {
      logger.warn('Company ID bulunamadı, bildirim gönderilemedi');
      logger.end();
      return;
    }
    
    // Şirket kullanıcılarını al
    const usersQuery = query(
      collection(db, 'users'),
      where('companyId', '==', state.companyId)
    );
    const usersSnapshot = await getDocs(usersQuery);
    
    // Depo/stok ve şantiye yetkililerini bul
    const targetRoles = ['buyer:stok_depo', 'buyer:santiye_yetkilisi'];
    const notifiedUsers = [];
    
    usersSnapshot.docs.forEach(userDoc => {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      // Kullanıcı aktif ve kabul edilmiş olmalı
      if (userData.isActive === false || 
          (userData.companyJoinStatus !== 'accepted' && userData.companyJoinStatus !== 'approved')) {
        return;
      }
      
      // Rol kontrolü: companyRoleKey veya companyRole
      const userRole = userData.companyRoleKey || userData.companyRole || '';
      
      if (targetRoles.includes(userRole)) {
        notifiedUsers.push({
          userId,
          role: userRole,
          displayName: userData.displayName || userData.email || 'Kullanıcı'
        });
      }
    });
    
    // Bildirim gönder
    const notificationPromises = notifiedUsers.map(async (user) => {
      try {
        await createNotification({
          userId: user.userId,
          type: 'request_created',
          title: 'Yeni ŞMTF Talebi',
          message: `${requestData.title} başlıklı yeni bir şantiye malzeme talep formu oluşturuldu.`,
          data: {
            requestId,
            requestType: 'ŞMTF',
            requestTitle: requestData.title,
            siteId: requestData.siteId,
            siteName: requestData.siteName,
            requesterName: requestData.requesterName,
            actionUrl: `/pages/request-detail.html?id=${requestId}`
          },
          actionUrl: `/pages/request-detail.html?id=${requestId}`
        });
        logger.info('Bildirim gönderildi', { 
          displayName: user.displayName, 
          role: user.role 
        });
      } catch (error) {
        logger.error(`Bildirim gönderme hatası: ${user.displayName}`, error);
      }
    });
    
    await Promise.all(notificationPromises);
    
    logger.info(`Toplam ${notifiedUsers.length} yetkiliye bildirim gönderildi`);
    logger.end();
    
  } catch (error) {
    logger.error('ŞMTF bildirim gönderme hatası', error);
    logger.end();
  }
}

qs('#btnSaveDraft')?.addEventListener('click', () => saveRequest('DRAFT'));
qs('#btnSend')?.addEventListener('click', () => saveRequest('SENT'));

// ====================
// PDF/Excel Export
// ====================

function exportPDF() {
  if (!canSubmit()) {
    alert('Lütfen zorunlu alanları doldurun!');
    return;
  }
  
  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      alert('PDF kütüphanesi yüklenemedi');
      return;
    }
    
    const pdf = new jsPDF();
    let y = 20;
    
    // Başlık - Şantiye Adı
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text(state.selectedSite?.siteName || 'ŞMTF Formu', 14, y);
    y += 10;
    
    // Adres (seçili adres)
    if (state.selectedAddress) {
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      const addressLines = formatAddress(state.selectedAddress).split(' - ');
      addressLines.forEach(line => {
        if (line.trim()) {
          pdf.text(line.trim(), 14, y);
          y += 6;
        }
      });
      y += 4;
    }
    
    // Talep Bilgileri
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.text('Talep Bilgileri', 14, y);
    y += 8;
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(`Başlık: ${qs('#reqTitle')?.value || '-'}`, 14, y); y += 6;
    pdf.text(`Şantiye: ${state.selectedSite?.siteName || '-'}`, 14, y); y += 6;
    pdf.text(`Teslimat Adresi: ${qs('#reqDelivery')?.value || '-'}`, 14, y); y += 6;
    if (qs('#reqDescription')?.value) {
      pdf.text(`Açıklama: ${qs('#reqDescription').value}`, 14, y); y += 6;
    }
    pdf.text(`Nakliye Dahil: ${qs('#reqFreightIncluded')?.checked ? 'Evet' : 'Hayır'}`, 14, y); y += 10;
    
    // Malzeme Satırları
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.text('Malzeme Satırları', 14, y);
    y += 8;
    
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');
    
    // Tablo başlıkları
    pdf.setFont(undefined, 'bold');
    pdf.text('Sıra', 14, y);
    pdf.text('SKU', 30, y);
    pdf.text('Ürün Adı', 60, y);
    pdf.text('Marka/Model', 110, y);
    pdf.text('Miktar', 145, y);
    pdf.text('Birim', 160, y);
    pdf.text('Teslim Tarihi', 175, y);
    y += 6;
    
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, y, 190, y);
    y += 4;
    
    // Satırlar
    pdf.setFont(undefined, 'normal');
    state.lines.forEach((line, idx) => {
      if (y > 280) {
        pdf.addPage();
        y = 20;
      }
      
      pdf.text(String(line.lineNo || idx + 1), 14, y);
      pdf.text(line.sku || '-', 30, y);
      
      // Ürün adı uzunsa kısalt
      const productName = (line.name || '').substring(0, 25);
      pdf.text(productName, 60, y);
      
      pdf.text((line.brandModel || '').substring(0, 15), 110, y);
      pdf.text(String(line.qty || 0), 145, y);
      pdf.text(line.unit || '-', 160, y);
      pdf.text(line.requestedDate || '-', 175, y);
      
      y += 6;
    });
    
    // Dosya adı
    const filename = `${qs('#reqTitle')?.value || 'smtf'}-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    
    logger.info('PDF exported', { filename });
    
  } catch (error) {
    logger.error('PDF export error', error);
    alert('❌ PDF oluşturulamadı: ' + error.message);
  }
}

function exportExcel() {
  if (!canSubmit()) {
    alert('Lütfen zorunlu alanları doldurun!');
    return;
  }
  
  try {
    if (!window.XLSX) {
      alert('Excel kütüphanesi yüklenemedi');
      return;
    }
    
    const wb = XLSX.utils.book_new();
    
    // Özet sayfası
    const summary = [
      ['ŞMTF - Şantiye Malzeme Talep Formu'],
      [],
      ['Şantiye:', state.selectedSite?.siteName || '-'],
      ['Adres:', formatAddress(state.selectedAddress)],
      [],
      ['Talep Bilgileri'],
      ['Başlık:', qs('#reqTitle')?.value || '-'],
      ['Açıklama:', qs('#reqDescription')?.value || '-'],
      ['Nakliye Dahil:', qs('#reqFreightIncluded')?.checked ? 'Evet' : 'Hayır'],
      ['Oluşturulma Tarihi:', new Date().toLocaleDateString('tr-TR')],
      []
    ];
    
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    
    // Sütun genişlikleri
    ws1['!cols'] = [
      { wch: 20 },
      { wch: 50 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws1, 'Özet');
    
    // Malzeme satırları sayfası
    const itemsData = state.lines.map((line, idx) => ({
      'Sıra No': line.lineNo || idx + 1,
      'SKU': line.sku || '',
      'Ürün Adı': line.name || '',
      'Marka/Model': line.brandModel || '',
      'Miktar': line.qty || 0,
      'Birim': line.unit || '',
      'Teslim Tarihi': line.requestedDate || ''
    }));
    
    const ws2 = XLSX.utils.json_to_sheet(itemsData);
    
    // Sütun genişlikleri
    ws2['!cols'] = [
      { wch: 10 },
      { wch: 15 },
      { wch: 40 },
      { wch: 20 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws2, 'Malzeme Satırları');
    
    // Dosya adı
    const filename = `${qs('#reqTitle')?.value || 'smtf'}-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    
    logger.info('Excel exported', { filename });
    
  } catch (error) {
    logger.error('Excel export error', error);
    alert('❌ Excel oluşturulamadı: ' + error.message);
  }
}

qs('#btnExportPDF')?.addEventListener('click', exportPDF);
qs('#btnExportExcel')?.addEventListener('click', exportExcel);

// ====================
// Initialize
// Teklifbul Rule v1.0 - Page guard, state machine
// ====================

(async () => {
  try {
    logger.group('ŞMTF Sayfası Başlatılıyor');

    // Teklifbul Rule v1.0 - Page guard (auth + company + permission + plan)
    const guardResult = await pageGuard({
      requiredPerms: REQUEST_PERMS.view, // ŞMTF için stok görme yetkisi yeterli
      requiredPlans: 'premium.inventoryModule',
      redirectOnFail: true,
      redirectTo: '/dashboard.html'
    });

    if (!guardResult.success) {
      if (guardResult.errorType === 'permission') {
        renderUIState('permissionDenied', qs('#requestForm'), {
          permissionDeniedMessage: 'ŞMTF oluşturma yetkiniz yok'
        });
      } else if (guardResult.errorType === 'plan') {
        renderUIState('premiumDenied', qs('#requestForm'), {
          premiumDeniedMessage: 'ŞMTF için Premium plan gereklidir'
        });
      }
      logger.end();
      return;
    }

    state.userId = guardResult.userId;
    state.companyId = guardResult.companyId;

    uiState.setState('loading');

    // Load sites
    state.sites = await listSites(state.companyId);
    logger.info(`Şantiyeler yüklendi`, { count: state.sites.length });
    
    // Load inventory
    await loadInventory(state.companyId);
    
    // Initialize UI
    initSiteDropdown();
    initAddressModal();
    attachInputListeners();
    updateActions();
    
    uiState.setState('ready');
    logger.info('ŞMTF form başlatıldı');
    logger.end();
    
  } catch (error) {
    logger.error('ŞMTF initialization error', error);
    uiState.setState('error');
    
    if (error.message === 'AUTH_REQUIRED' || error.message?.includes('AUTH_REQUIRED')) {
      window.location.href = '/index.html';
      return;
    }
    
    toast.error(`Form yüklenemedi: ${error.message}`);
  }
})();
