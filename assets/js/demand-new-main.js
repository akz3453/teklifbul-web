// Demand New Page - Main Script
import { initGlobalHeader } from './ui/header.js';
import { initAutoResize, reinitAutoResize } from './ui/auto-resize.js';
import { requireAuth, db, auth } from "/firebase.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '/src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Toast Notification System
import { toast } from '/src/shared/ui/toast.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '/src/shared/constants/messages.js';
// Teklifbul Rule v1.0 - Yetki sistemi (createBtn.onclick için gerekli)
import { requirePerm, getDemandPerms } from './state/permissions.js';
import { slugifyTr } from "/utils/slugify-tr.js";
import { normalizeTRLower } from "/scripts/lib/tr-utils.js";
// Teklifbul Rule v1.0 - Debounce utility
import { debounce } from './utils/debounce.js';
// CRITICAL: Import new ID-based category system
import {
  normalizeToIds,
  getNameById,
  getAllCategories,
  getIdByName,
  getIdBySlug
} from "/src/categories/category-service.js";
import {
  buildMaterialProfileFromItems as buildMaterialProfile,
  evaluateCategoryCompatibility as evaluateCategoryRule,
  summarizeGroupCompatibility,
  suggestCategoriesForProfile
} from "/category-rules.js";

// Legacy imports (for backward compatibility during transition)
import { CATEGORIES, getCategoryIdByName, getCategoryNameById, getAllCategoryIds } from "/categories.js";
import { addDoc, collection, serverTimestamp, updateDoc, doc, query, where, getDocs, getDoc, deleteDoc, setDoc, orderBy, arrayUnion } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { listGroupsForUser, createGroup, updateGroup, deleteGroup } from "./services/category-groups.js";
// Modal artık otomatik olarak yükleniyor - import gerekmiyor
// SATFK generation moved to Cloud Functions

// Initialize global header
initGlobalHeader({ mount: '#app-header', activeRoute: 'new' });

// CRITICAL: New ID-based category system
// Use normalizeToIds from category-service.js for all conversions
function nameToCategoryId(name) {
  if (!name) return null;
  // Use new normalizeToIds function which handles all formats (ID/name/slug)
  const ids = normalizeToIds([name]);
  return ids.length > 0 ? ids[0] : null;
}

// Convert category ID to display name (using new system)
function categoryIdToName(id) {
  if (!id) return id;
  // Try new system first
  const name = getNameById(id);
  if (name && name !== id) return name;
  // Fallback to legacy system
  const legacyName = getCategoryNameById(id);
  return legacyName || id;
}

// Use unified slugifyTr function from utils
// Alias for backward compatibility with existing code
function toSlug(name) {
  return slugifyTr(name);
}

const user = await requireAuth();

// Teklifbul Rule v1.0 - Premium plan kontrolü ve listing limit hesaplama
let userPlanLimit = 0; // Free = 0, Premium = 1, Premium Plus = 3
let userPlanId = 'free';

async function loadUserPlanLimit() {
  try {
    const { authFetch } = await import('./utils/api-helpers.js');
    const response = await authFetch('/api/account/subscription');
    if (response.ok) {
      const summary = await response.json();
      userPlanId = summary?.plan?.planId || summary?.planId || 'free';

      // Limit hesaplama: Free=0, Premium=1, Premium Plus=3
      if (userPlanId === 'premium_plus_monthly' || userPlanId === 'premium_plus_yearly') {
        userPlanLimit = 3;
      } else if (userPlanId === 'premium_monthly' || userPlanId === 'premium_yearly') {
        userPlanLimit = 1;
      } else {
        userPlanLimit = 0;
      }

      logger.info('User plan limit loaded', { planId: userPlanId, limit: userPlanLimit });
    } else {
      logger.warn('Failed to load subscription summary, defaulting to free', { status: response.status });
      userPlanLimit = 0;
      userPlanId = 'free';
    }
  } catch (error) {
    logger.error('Error loading user plan limit', error);
    userPlanLimit = 0;
    userPlanId = 'free';
  }
}

// Load user plan limit on page load
await loadUserPlanLimit();

// Ana form elementleri ve state
const createBtn = document.getElementById('createBtn');
const titleInput = document.getElementById('title');
// demand-new.html uses "spec" + dynamic descriptions; keep optional reference
const descriptionTextarea = document.getElementById('spec');
const itemsTable = document.getElementById('itemsTable');
const itemsBody = document.getElementById('itemsBody');
const addLineBtn = document.getElementById('addLineBtn');
// Teklifbul Rule v1.0 - Category ve group select elementleri kaldırıldı (artık chip/buton sistemi kullanılıyor)
const categorySelect = null; // Eski sistem kaldırıldı
const groupSelect = null; // Eski sistem kaldırıldı
const prioritySelect = null;
const biddingModeSelect = null;
const dueDateInput = document.getElementById('dueDate');
const siteInput = document.getElementById('siteName');
const requesterInput = document.getElementById('requester');
const purchaseManagerInput = document.getElementById('purchaseManager');
const generalManagerInput = document.getElementById('generalManager');
const approverInput = document.getElementById('approver');
const purchaseLocationInput = document.getElementById('purchaseLocation');
const deliveryAddressTextarea = document.getElementById('deliveryAddress');
const notesTextarea = null;
const contactPersonInput = null;
const contactPhoneInput = null;
const contactEmailInput = null;

// State management
let items = [];
let categoryGroups = [];
let currentGroupId = null;
let currentEditIndex = -1;
let isDraftMode = false;

// Initialize page
async function initDemandNewPage() {
  try {
    logger.info('Demand new page initialization started');

    initHeaderDefaults();
    initDeliveryMethodUI();
    initUnloadingMethodUI();
    initBiddingModeUI();
    // Teklifbul Rule v1.0 - Grup Hub modal wiring legacy HTML içinde yönetiliyor

    // Load initial data
    await Promise.all([
      loadCategories(),
      loadGroups(),
      loadSites()
    ]);

    // Setup event listeners
    setupEventListeners();

    // Initialize auto-resize for textareas
    initAutoResize();

    // Check if editing existing draft
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    const draftId = urlParams.get('draft');

    if (editId) {
      await loadDraftForEditing(editId);
    } else if (draftId) {
      await loadDraftForEditing(draftId);
    }

    logger.info('Demand new page initialized successfully');
  } catch (err) {
    logger.error('Failed to initialize demand new page', err);
    toast.error('Sayfa yüklenirken hata oluştu');
  }
}

// Load categories
// Teklifbul Rule v1.0 - Category select elementi kaldırıldı (artık chip/buton sistemi kullanılıyor)
async function loadCategories() {
  try {
    // Eski select elementi kaldırıldı, artık kategori chip'leri kullanılıyor
    // Bu fonksiyon artık sadece log için çağrılıyor
    const categories = getAllCategories();
    logger.info('Categories available', { count: categories.length });
  } catch (err) {
    logger.error('Failed to load categories', err);
  }
}

// Load groups
async function loadGroups() {
  try {
    categoryGroups = await listGroupsForUser(user.uid);
    renderGroups();

    logger.info('Groups loaded', { count: categoryGroups.length });
  } catch (err) {
    logger.error('Failed to load groups', err);
  }
}

// Render groups in select
// Teklifbul Rule v1.0 - Group select elementi kaldırıldı (artık buton sistemi kullanılıyor)
function renderGroups() {
  // Eski select elementi kaldırıldı, artık grup butonları kullanılıyor
  // Bu fonksiyon artık sadece log için çağrılıyor
  logger.info('Groups rendered', { count: categoryGroups.length });

  const groupButtons = document.getElementById('groupButtons');
  if (!groupButtons) return;

  groupButtons.innerHTML = '';
  categoryGroups.forEach((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'group-btn';
    const count = Array.isArray(g?.categories) ? g.categories.length : 0;
    btn.textContent = `${g?.name || 'Grup'} (${count})`;
    btn.title = g?.name || 'Grup';
    btn.setAttribute('aria-label', g?.name || 'Grup');
    btn.addEventListener('click', () => {
      currentGroupId = g?.id || null;
      // Visual active state
      groupButtons.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      toast.info(`Grup seçildi: ${btn.textContent}`);
      logger.info('Group selected', { groupId: currentGroupId });
    });
    groupButtons.appendChild(btn);
  });
}

// Load sites
async function loadSites() {
  try {
    // Implementation for loading sites
    logger.info('Sites loading placeholder');
  } catch (err) {
    logger.error('Failed to load sites', err);
  }
}

// Setup event listeners
function setupEventListeners() {
  createBtn?.addEventListener('click', handleCreateDemand);
  addLineBtn?.addEventListener('click', () => addNewItem());

  // Auto-resize textareas
  [descriptionTextarea, deliveryAddressTextarea, notesTextarea].forEach(textarea => {
    if (textarea) {
      textarea.addEventListener('input', () => reinitAutoResize(textarea));
    }
  });
}

// Add new item
function addNewItem() {
  const newItem = {
    sku: '',
    name: '',
    brandModel: '',
    quantity: 1,
    unit: 'Adet',
    description: '',
    ambar: '',
    targetPrice: '',
    dueDate: '',
    showInMainAd: true
  };

  items.push(newItem);
  renderItemsTable();
}

// Render items table
function renderItemsTable() {
  if (!itemsBody) return;
  itemsBody.innerHTML = '';

  items.forEach((item, index) => {
    const row = createItemRow(item, index);
    itemsBody.appendChild(row);
  });
}

// Create item row
// Teklifbul Rule v1.0 - XSS koruma: input value'lar DOM API ile set edilir, innerHTML kullanilmaz
function createItemRow(item, index) {
  const tr = document.createElement('tr');

  const mkInput = (type, cls, placeholder, value, extra = {}) => {
    const input = document.createElement('input');
    input.type = type;
    input.className = cls;
    if (placeholder) input.placeholder = placeholder;
    if (value !== undefined && value !== null) input.value = String(value);
    Object.entries(extra).forEach(([k, v]) => { input.setAttribute(k, String(v)); });
    return input;
  };

  const mkTd = (child) => {
    const td = document.createElement('td');
    if (child instanceof Node) td.appendChild(child);
    else if (child !== undefined) td.textContent = String(child);
    return td;
  };

  tr.appendChild(mkTd(index + 1));
  tr.appendChild(mkTd(mkInput('text', 'item-sku', 'Stok Kodu', item.sku || '')));
  tr.appendChild(mkTd(mkInput('text', 'item-name', 'Malzeme Tanımı', item.name || '')));
  tr.appendChild(mkTd(mkInput('text', 'item-brand-model', 'Marka/Model', item.brandModel || '')));
  tr.appendChild(mkTd(mkInput('number', 'item-quantity', '', item.quantity || 1, { min: '1' })));

  const unitSelect = document.createElement('select');
  unitSelect.className = 'item-unit';
  ['Adet', 'Kg', 'Lt', 'Mt', 'Paket'].forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    if (item.unit === u) opt.selected = true;
    unitSelect.appendChild(opt);
  });
  tr.appendChild(mkTd(unitSelect));

  tr.appendChild(mkTd(mkInput('text', 'item-ambar', 'Ambar', item.ambar || '')));
  tr.appendChild(mkTd(mkInput('number', 'item-target-price', 'Hedef Fiyat', item.targetPrice || '', { step: '0.01' })));
  tr.appendChild(mkTd(mkInput('date', 'item-due-date', '', item.dueDate || '')));

  const checkboxTd = document.createElement('td');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'item-show-in-main-ad';
  checkbox.checked = !!item.showInMainAd;
  checkboxTd.appendChild(checkbox);
  tr.appendChild(checkboxTd);

  const btnTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-danger btn-sm';
  delBtn.setAttribute('aria-label', 'Satırı sil');
  delBtn.title = 'Sil';
  delBtn.textContent = 'Sil';
  delBtn.addEventListener('click', () => removeItem(index));
  btnTd.appendChild(delBtn);
  tr.appendChild(btnTd);

  return tr;
}

// Remove item
function removeItem(index) {
  items.splice(index, 1);
  renderItemsTable();
}

// Handle create demand
async function handleCreateDemand() {
  try {
    // Validation
    if (!titleInput.value.trim()) {
      toast.error('Talep başlığı zorunludur');
      return;
    }

    if (items.length === 0) {
      toast.error('En az bir kalem eklemelisiniz');
      return;
    }

    // Check plan limits
    if (userPlanLimit > 0 && items.length > userPlanLimit) {
      toast.error(`Premium planınız ile maksimum ${userPlanLimit} kalem ekleyebilirsiniz`);
      return;
    }

    // Collect form data
    // NOTE: demand-new.html has a legacy form model; keep create flow disabled here
    toast.warn('Bu sayfa akışı henüz yeni modüle taşınmadı. (Legacy form)');
    return;

    // Create demand
    const docRef = await addDoc(collection(db, 'demands'), demandData);

    toast.success(isDraftMode ? 'Taslak kaydedildi' : 'Talep oluşturuldu');

    // Redirect to demands list
    window.location.href = './demands.html';

  } catch (err) {
    logger.error('Failed to create demand', err);
    toast.error('Talep oluşturulurken hata oluştu');
  }
}

// ---------- UI wiring for demand-new.html (lightweight) ----------
function initHeaderDefaults() {
  // Teklifbul Rule v1.0 - Magic number yok: constants
  const DEFAULT_DUE_DAYS = 7;
  try {
    const today = new Date();
    if (dueDateInput && !dueDateInput.value) {
      const d = new Date(today);
      d.setDate(d.getDate() + DEFAULT_DUE_DAYS);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dueDateInput.value = `${yyyy}-${mm}-${dd}`;
      dueDateInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (err) {
    logger.warn('initHeaderDefaults failed', err);
  }
}

function initDeliveryMethodUI() {
  try {
    const radios = Array.from(document.querySelectorAll('input[name="deliveryMethod"]'));
    const customContainer = document.getElementById('customDeliveryContainer');
    const customInput = document.getElementById('customDelivery');
    const customTextInput = document.getElementById('deliveryMethodCustom');

    const apply = () => {
      const selected = document.querySelector('input[name="deliveryMethod"]:checked');
      if (!selected) return;

      if (selected.value === 'custom') {
        if (customContainer) customContainer.style.display = 'block';
        if (customInput) customInput.required = true;
        if (customTextInput) customTextInput.value = '';
      } else {
        if (customContainer) customContainer.style.display = 'none';
        if (customInput) {
          customInput.required = false;
          customInput.value = '';
        }
        if (customTextInput) {
          customTextInput.value = selected.value === 'nakliye_dahil' ? 'Nakliye Dahil' : 'Nakliye Hariç';
        }
      }
    };

    radios.forEach(r => r.addEventListener('change', apply));
    customTextInput?.addEventListener('input', () => {
      if (customTextInput.value.trim()) radios.forEach(r => (r.checked = false));
    });
    apply();
  } catch (err) {
    logger.warn('initDeliveryMethodUI failed', err);
  }
}

function initUnloadingMethodUI() {
  try {
    // Currently purely UI; keep for future validation hooks
    const radios = Array.from(document.querySelectorAll('input[name="unloadingMethod"]'));
    radios.forEach(r => r.addEventListener('change', () => {
      logger.info('Unloading method selected', { value: r.value });
    }));
  } catch (err) {
    logger.warn('initUnloadingMethodUI failed', err);
  }
}

function initBiddingModeUI() {
  try {
    const radios = Array.from(document.querySelectorAll('input[name="biddingMode"]'));
    const hybridSettings = document.getElementById('hybridSettings');
    const isTimeBound = document.getElementById('isTimeBound');
    const timeBoundFields = document.getElementById('timeBoundFields');
    const singlePhaseTime = document.getElementById('singlePhaseTime');
    const hybridPhaseTime = document.getElementById('hybridPhaseTime');

    const apply = () => {
      const mode = document.querySelector('input[name="biddingMode"]:checked')?.value || 'secret';
      if (hybridSettings) hybridSettings.style.display = mode === 'hybrid' ? 'block' : 'none';
      const timeOn = !!isTimeBound?.checked;
      if (timeBoundFields) timeBoundFields.hidden = !timeOn;
      if (singlePhaseTime) singlePhaseTime.style.display = mode === 'hybrid' ? 'none' : 'block';
      if (hybridPhaseTime) hybridPhaseTime.style.display = mode === 'hybrid' ? 'block' : 'none';
    };

    radios.forEach(r => r.addEventListener('change', apply));
    isTimeBound?.addEventListener('change', apply);
    apply();
  } catch (err) {
    logger.warn('initBiddingModeUI failed', err);
  }
}

// Load draft for editing
async function loadDraftForEditing(draftId) {
  try {
    const docSnap = await getDoc(doc(db, 'demands', draftId));
    if (!docSnap.exists()) {
      toast.error('Taslak bulunamadı');
      return;
    }

    const draftData = docSnap.data();

    // Check ownership
    if (draftData.createdBy !== user.uid) {
      toast.error('Bu taslağı düzenleme yetkiniz yok');
      return;
    }

    // Populate form
    titleInput.value = draftData.title || '';
    descriptionTextarea.value = draftData.description || '';

    if (draftData.categoryIds && draftData.categoryIds.length > 0) {
      categorySelect.value = draftData.categoryIds[0];
    }

    if (draftData.groupIds && draftData.groupIds.length > 0) {
      groupSelect.value = draftData.groupIds[0];
    }

    prioritySelect.value = draftData.priority || 'normal';
    biddingModeSelect.value = draftData.biddingMode || 'secret';

    if (draftData.dueDate) {
      const dueDate = draftData.dueDate.toDate ? draftData.dueDate.toDate() : new Date(draftData.dueDate);
      dueDateInput.value = dueDate.toISOString().split('T')[0];
    }

    siteSelect.value = draftData.siteId || '';
    requesterInput.value = draftData.requester || '';
    purchaseManagerInput.value = draftData.purchaseManager || '';
    generalManagerInput.value = draftData.generalManager || '';
    approverInput.value = draftData.approver || '';
    purchaseLocationInput.value = draftData.purchaseLocation || '';
    deliveryAddressTextarea.value = draftData.deliveryAddress || '';
    notesTextarea.value = draftData.notes || '';
    contactPersonInput.value = draftData.contactPerson || '';
    contactPhoneInput.value = draftData.contactPhone || '';
    contactEmailInput.value = draftData.contactEmail || '';

    // Load items
    if (draftData.items && Array.isArray(draftData.items)) {
      items = draftData.items.map(item => ({
        sku: item.sku || '',
        name: item.name || '',
        brandModel: item.brandModel || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'Adet',
        description: item.description || '',
        ambar: item.ambar || '',
        targetPrice: item.targetPrice || '',
        dueDate: item.dueDate ? (item.dueDate.toDate ? item.dueDate.toDate().toISOString().split('T')[0] : item.dueDate.split('T')[0]) : '',
        showInMainAd: item.showInMainAd !== false
      }));
    }

    isDraftMode = true;
    renderItemsTable();

    // Change button text
    if (createBtn) {
      createBtn.textContent = 'Taslağı Güncelle';
    }

    logger.info('Draft loaded for editing', { draftId });

  } catch (err) {
    logger.error('Failed to load draft', err);
    toast.error('Taslak yüklenirken hata oluştu');
  }
}

// Global functions for HTML onclick handlers
window.addNewItem = addNewItem;
window.removeItem = removeItem;

// Initialize page
initDemandNewPage().catch(err => {
  logger.error('Failed to initialize demand new page', err);
});
