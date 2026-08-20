import { db, auth } from '../firebase.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';
import { initDashboardExcelImport } from './dashboard-excel-utils.js';
import { hasPremiumAccess } from './auth/userHelpers.js';
import { getCompanyPlan, isPremium as isPremiumPlan } from './state/company-plan.js';
import { resolveSharedCompanyId } from './utils/api-helpers.js';
import { getCachedUserSnap } from './utils/user-doc-cache.js';

const ALL_SHORTCUTS = [
  { id: 'excel-import', icon: '📄', title: 'Excel\'den Talep Oluştur', desc: 'Excel içeri aktar; form açıldığında alanlar dolu gelsin.', url: '#', isSpecial: 'excel-import' },
  { id: 'import-template', icon: '📥', title: 'Örnek Teklif Formu Aktar', desc: 'SATFK numarasına göre talebi bul, teklif taslağını doldur.', url: './bids.html?import=template' },
  { id: 'internal-demand', icon: '🏢', title: 'Şirket İçi Talep Kısayolu', desc: 'Şirket içi talebi hızlıca aç, gerekirse hazır şablonla başla.', url: './internal-demand-new.html' },
  { id: 'stock-list', icon: '📦', title: 'Stok Listesi', desc: 'Stokları hızlıca görüntüle ve yönet.', url: './pages/stock-list.html', restricted: 'premium-only' },
  { id: 'sales', icon: '💼', title: 'Satışlar', desc: 'Satış siparişlerini görüntüle ve yönet.', url: './pages/sales.html', restricted: 'premium-only' },
  { id: 'customers', icon: '👥', title: 'Müşteriler', desc: 'Müşteri bilgilerini yönet.', url: './pages/customers.html', restricted: 'premium-only' },
  { id: 'addresses', icon: '📍', title: 'Adres Yönetimi', desc: 'Firma adreslerini ekle, düzenle ve yönet.', url: './settings.html#addresses' },
  { id: 'new-hakedis-plus', icon: '➕', title: 'Yeni Hakediş Oluştur', desc: 'Yeni hakedişinizi hızlıca başlatın.', url: './interim-payment-edit.html', restricted: 'admin-only' },
  { id: 'new-hakedis-cash', icon: '💵', title: '+ Yeni Hakediş', desc: 'Hakediş oluşturma ekranını aç.', url: './interim-payment-edit.html' },
  { id: 'premium-control', icon: '⭐', title: 'Premium Kontrol', desc: 'Premium özellikleri yönet.', url: '/pages/admin/subscription-monitor.html', restricted: 'admin-only' },
  { id: 'new-sale', icon: '💰', title: 'Yeni Satış', desc: 'Hızlıca yeni satış kaydı oluştur.', url: './pages/sale-new.html', restricted: 'premium-only' },
  { id: 'new-retail-sale', icon: '🛍️', title: 'Yeni Perakende Satış', desc: 'Müşteri seçmeden hızlı satış yap.', url: './pages/sale-new.html?retail=true', restricted: 'premium-only' },
  { id: 'stock-movements', icon: '🔄', title: 'Stok Hareketleri', desc: 'Depo giriş-çıkışlarını takip et.', url: './pages/stock-movements.html', restricted: 'premium-only' },
  { id: 'reports', icon: '📈', title: 'Raporlar', desc: 'Şirket verilerini analiz et.', url: './pages/reports.html' },
  { id: 'my-demands', icon: '📝', title: 'Taleplerim', desc: 'Açtığım tüm talepleri gör.', url: './demands.html?filter=sent' },
  { id: 'incoming-bids', icon: '📨', title: 'Gelen Teklifler', desc: 'Taleplerime gelen yanıtlar.', url: './bids.html?tab=incoming' },
  { id: 'settings', icon: '⚙️', title: 'Ayarlar', desc: 'Profil ve şirket ayarları.', url: './settings.html' },
  { id: 'my-offers', icon: '📤', title: 'Tekliflerim', desc: 'Girdiğim teklifleri yönet.', url: './bids.html?tab=outgoing' },
  { id: 'notifications', icon: '🔔', title: 'Bildirimler', desc: 'Gelen tüm bildirimleri gör.', url: './pages/notifications.html' }
];

const DEFAULT_SHORTCUT_IDS = [
  'excel-import', 'new-sale', 'new-retail-sale', 'stock-list', 'sales', 'customers', 'reports'
];

let currentShortcuts = [];
let isEditMode = false;
let userRoles = [];
let isAdmin = false;

let isPremium = false;

function ensurePremiumDefaults() {
  if (!isPremium) return;
  const mustHavePremium = ['stock-list', 'sales', 'customers', 'new-sale', 'new-retail-sale', 'stock-movements'];
  const currentIds = new Set(currentShortcuts.map((s) => s.id));
  mustHavePremium.forEach((id) => {
    if (!currentIds.has(id)) {
      const item = ALL_SHORTCUTS.find((s) => s.id === id);
      if (item) currentShortcuts.push(item);
    }
  });
}

async function initShortcuts() {
  const user = auth.currentUser;
  if (!user) {
    // Wait for auth
    auth.onAuthStateChanged(u => {
      if (u) initShortcuts();
    });
    return;
  }

  try {
    const userDoc = await getCachedUserSnap(db, user.uid);
    const userData = userDoc.data() || {};
    userRoles = userData.roles || [];
    
    // Admin check logic similar to dashboard.html
    const adminEmailList = `${window.ADMIN_EMAILS || ''}`.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    // Hardcoded default e-posta yok — ADMIN_EMAILS / custom claim ile admin olunur
    let claimAdmin = false;
    try {
      const tokenResult = await user.getIdTokenResult();
      const claims = tokenResult?.claims || {};
      claimAdmin = claims.superAdmin === true || claims.admin === true || claims.isAdmin === true || claims.role === 'admin';
    } catch (claimError) {
      logger.warn('Admin claim bilgisi alınamadı', claimError);
    }
    isAdmin = claimAdmin || (user.email && adminEmailList.includes(user.email.toLowerCase()));

    // Get premium info (company plan first, then profile/user fallback)
    isPremium = isAdmin;
    try {
      if (!isPremium) {
        const sharedCompanyId = resolveSharedCompanyId(userData);
        if (sharedCompanyId) {
          const companyPlan = await getCompanyPlan(sharedCompanyId);
          if (companyPlan?.planId) {
            isPremium = isPremiumPlan(companyPlan.planId);
          }
        }

        const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
        const plan = profileSnap.exists() ? (profileSnap.data().plan || profileSnap.data().planId || profileSnap.data().companyPlan) : null;
        const userPlan = userData?.planId || userData?.plan || userData?.companyPlan || null;
        if (!isPremium && plan) {
           isPremium = hasPremiumAccess({ plan });
        }
        if (!isPremium && userPlan) {
          isPremium = hasPremiumAccess({ plan: userPlan });
        }
      }
    } catch (e) {
      logger.warn('Premium bilgisi çekilemedi', e);
    }

    const preferences = userData || {};
    
    const shortcutIds = preferences.dashboardShortcuts || DEFAULT_SHORTCUT_IDS;
    currentShortcuts = shortcutIds
      .map(id => ALL_SHORTCUTS.find(s => s.id === id))
      .filter(Boolean);
    ensurePremiumDefaults();

    renderShortcuts();
    setupEventListeners();
  } catch (err) {
    logger.error('Kısayollar yüklenirken hata oluştu', err);
    currentShortcuts = DEFAULT_SHORTCUT_IDS.map(id => ALL_SHORTCUTS.find(s => s.id === id)).filter(Boolean);
    renderShortcuts();
  }
}

function renderShortcuts() {
  const grid = document.getElementById('shortcuts-grid');
  if (!grid) return;

  grid.innerHTML = '';

  currentShortcuts.forEach((s, index) => {
    // Restricted check
    if (s.restricted === 'admin-only' && !isAdmin) return;
    if (s.restricted === 'premium-only' && !isPremium) return;

    const card = document.createElement('a');
    card.href = s.url;
    card.className = 'nav-card';
    card.dataset.id = s.id;
    card.dataset.index = index;

    if (s.isSpecial === 'excel-import') {
      card.id = 'excel-import-shortcut';
    }

    card.innerHTML = `
      <div class="remove-shortcut-btn" data-id="${s.id}">&times;</div>
      <div class="nav-icon">${s.icon}</div>
      <div class="nav-content">
        <h4>${s.title}</h4>
        <p>${s.desc}</p>
      </div>
    `;

    if (isEditMode) {
      card.onclick = (e) => e.preventDefault();
      card.draggable = true;
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);
    }

    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'add-shortcut-card';
  addCard.id = 'btn-open-shortcut-modal';
  addCard.innerHTML = '<span>➕ Kısayol Ekle</span>';
  addCard.onclick = openModal;
  grid.appendChild(addCard);

  // Re-setup any special event listeners (like Excel import)
  if (!isEditMode) {
    initDashboardExcelImport();
  }
}

function setupEventListeners() {
  const editBtn = document.getElementById('btn-edit-shortcuts');
  if (editBtn) {
    editBtn.onclick = toggleEditMode;
  }

  const grid = document.getElementById('shortcuts-grid');
  if (grid) {
    grid.onclick = (e) => {
      if (e.target.classList.contains('remove-shortcut-btn')) {
        const id = e.target.dataset.id;
        removeShortcut(id);
      }
    };
  }

  document.getElementById('close-shortcut-modal').onclick = closeModal;
  document.getElementById('btn-cancel-shortcut').onclick = closeModal;
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  const container = document.getElementById('shortcuts-container');
  const btnText = document.getElementById('edit-btn-text');
  
  if (isEditMode) {
    container.classList.add('edit-mode');
    btnText.textContent = '✅ Düzenlemeyi Kaydet';
    toast.info('Sürükleyerek yer değiştirebilir, çarpıya basarak kaldırabilirsiniz.');
  } else {
    container.classList.remove('edit-mode');
    btnText.textContent = '⚙️ Kısayolları Düzenle';
    savePreferences();
  }
  renderShortcuts();
}

async function savePreferences() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const ids = currentShortcuts.map(s => s.id);
    await setDoc(doc(db, 'users', user.uid), {
      dashboardShortcuts: ids
    }, { merge: true });
    toast.success('Kısayol tercihleriniz kaydedildi.');
  } catch (err) {
    logger.error('Tercihler kaydedilemedi', err);
    toast.error('Kaydedilirken bir hata oluştu: ' + err.message);
  }
}

function removeShortcut(id) {
  currentShortcuts = currentShortcuts.filter(s => s.id !== id);
  renderShortcuts();
}

function openModal() {
  const modal = document.getElementById('shortcut-modal');
  const list = document.getElementById('available-shortcuts-list');
  
  list.innerHTML = '';
  
  const availableShortcuts = ALL_SHORTCUTS.filter(s => {
    if (s.restricted === 'admin-only' && !isAdmin) return false;
    if (s.restricted === 'premium-only' && !isPremium) return false;
    return !currentShortcuts.find(cs => cs.id === s.id);
  });

  if (availableShortcuts.length === 0) {
    list.innerHTML = '<p style="text-align:center; padding:20px; color:#6b7280;">Eklenecek yeni kısayol kalmadı.</p>';
  }

  availableShortcuts.forEach(s => {
    const item = document.createElement('div');
    item.className = 'shortcut-item';
    item.innerHTML = `
      <div style="font-size:24px;">${s.icon}</div>
      <div>
        <div style="font-weight:600;">${s.title}</div>
        <div style="font-size:12px; color:#6b7280;">${s.desc}</div>
      </div>
    `;
    item.onclick = () => {
      addShortcut(s);
      closeModal();
    };
    list.appendChild(item);
  });

  modal.style.display = 'block';
}

function addShortcut(shortcut) {
  currentShortcuts.push(shortcut);
  renderShortcuts();
}

function closeModal() {
  document.getElementById('shortcut-modal').style.display = 'none';
}

// Drag and Drop handlers
let dragSrcEl = null;

function handleDragStart(e) {
  this.style.opacity = '0.4';
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  
  if (dragSrcEl !== this) {
    const fromIndex = parseInt(dragSrcEl.dataset.index);
    const toIndex = parseInt(this.dataset.index);
    
    const movedItem = currentShortcuts.splice(fromIndex, 1)[0];
    currentShortcuts.splice(toIndex, 0, movedItem);
    
    renderShortcuts();
  }
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
}

// Reuse Excel Import logic from dashboard.html
function setupExcelImport() {
  const excelShortcut = document.getElementById('excel-import-shortcut');
  const excelInput = document.getElementById('dashboard-excel-input');
  
  if (!excelShortcut || !excelInput) return;

  // Re-attach event listeners (these were handled in dashboard.html scripts)
  // Since we emptied the grid and re-rendered, we need to make sure the ID references are correct.
}

initShortcuts();
