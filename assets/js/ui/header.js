/**
 * Shared Header Component
 * Unified header for all pages with real company name display
 * 
 * Teklifbul Rule v1.0 - Header MUST NOT perform authentication or redirect logic
 * - Header should only display user info IF user is already authenticated
 * - Redirect logic MUST be handled ONLY by auth-guard.js
 * - Header does NOT call requireAuth() or perform any redirects (except logout handler)
 */

import { auth, db } from '../../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
import { hasPremiumPlusAccess, hasPremiumAccess } from '../auth/userHelpers.js';

// Teklifbul Rule v1.0 - Firebase Module Caching (Performance optimization)
const firebaseModuleCache = {
  firestore: null,
  auth: null
};

async function getFirestoreModules() {
  if (!firebaseModuleCache.firestore) {
    firebaseModuleCache.firestore = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
  }
  return firebaseModuleCache.firestore;
}

// Teklifbul Rule v1.0 - Tema standardı: tb_theme key
// Theme management
const THEME_STORAGE_KEY = 'tb_theme';
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

// Teklifbul Rule v1.0 - Header initialization guard (prevents multiple initializations)
let headerInitialized = false;
let globalNotificationInterval = null;
let globalAuthUnsubscribe = null;
const PREMIUM_NAV_CACHE_KEY = 'tb_premium_nav_visible';
const PREMIUM_NAV_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat
const HEADER_PREFS_STORAGE_PREFIX = 'tb_header_prefs_v1';
const NON_HIDEABLE_NAV_KEYS = new Set(['dashboard', 'settings']);
let hiddenNavKeysState = new Set();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    document.documentElement.classList.add('force-dark');
  } else {
    document.documentElement.classList.remove('force-dark');
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  // Update theme toggle button text
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '☀️ Açık' : '🌙 Koyu';
  }
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
}

/**
 * Initialize global header component
 * @param {Object} options - Configuration options
 * @param {string|Element} options.mount - Mount point selector or element
 * @param {string} options.activeRoute - Active route name for highlighting
 */
export async function initGlobalHeader({ mount = '#app-header', activeRoute = '' } = {}) {
  // Teklifbul Rule v1.0 - Header does NOT perform authentication or redirect logic
  // Header only displays UI, auth-guard.js handles all redirects

  // Teklifbul Rule v1.0 - Prevent multiple initializations
  if (headerInitialized) {
    // Sessizce return et - gereksiz log kirliliği yaratma
    return;
  }

  const el = (typeof mount === 'string') ? document.querySelector(mount) : mount;
  if (!el) {
    logger.warn('Header mount point not found', { mount });
    return;
  }

  // Mark as initialized
  headerInitialized = true;

  el.classList.add('global-header');

  // New top navbar with dropdowns
  const navItems = [
    { key: 'dashboard', icon: '📊', label: 'Kontrol Paneli', href: '/dashboard.html', dropdown: [] },
    {
      key: 'demands', icon: '📋', label: 'Talepler', href: '/demands.html', dropdown: [
        { icon: '📥', label: 'Gelen Talepler', href: '/demands.html?filter=inbox' },
        { icon: '📤', label: 'Gönderdiğim Talepler', href: '/demands.html?filter=sent' },
        { icon: '📝', label: 'Taslak Talepler', href: '/demands.html?filter=draft' },
      ]
    },
    {
      key: 'bids', icon: '💰', label: 'Teklifler', href: '/bids.html', dropdown: [
        { icon: '📥', label: 'Gelen Teklifler', href: '/bids.html?tab=incoming' },
        { icon: '📤', label: 'Gönderdiğim Teklifler', href: '/bids.html?tab=outgoing' },
        { icon: '✅', label: 'Onaylanan Teklifler', href: '/bids.html?tab=approved' },
      ]
    },
    {
      key: 'sales', icon: '💼', label: 'Satışlar', href: '/pages/sale-new.html', premiumOnly: true, dropdown: [
        { icon: '📋', label: 'Satış Listesi', href: '/pages/sales.html' },
        { icon: '➕', label: 'Yeni Satış', href: '/pages/sale-new.html' },
      ]
    },
    {
      key: 'customers', icon: '👥', label: 'Müşteriler', href: '/pages/customers.html', premiumOnly: true, dropdown: [
        { icon: '📋', label: 'Müşteri Listesi', href: '/pages/customers.html' },
      ]
    },
    {
      key: 'invoicing', icon: '🧾', label: 'Faturalama', href: '/pages/invoices.html', premiumOnly: true, dropdown: [
        { icon: '📋', label: 'Fatura Listesi', href: '/pages/invoices.html' },
        { icon: '➕', label: 'Sıfırdan Fatura', href: '/pages/invoice-direct-new.html' },
        { icon: '🧾', label: 'Satıştan Fatura', href: '/pages/invoice-new.html' },
        { icon: '📥', label: 'Fatura İçe Aktar', href: '/pages/invoice-import.html' },
        { icon: '🚚', label: 'İrsaliye Listesi', href: '/pages/delivery-notes.html' },
        { icon: '➕', label: 'Sıfırdan İrsaliye', href: '/pages/delivery-direct-new.html' },
        { icon: '🚚', label: 'Satıştan İrsaliye', href: '/pages/delivery-note-new.html' },
        { icon: '📩', label: 'Gelen e-Belgeler', href: '/pages/incoming-docs.html' },
      ]
    },
    { key: 'main', icon: '🛍️', label: 'Ana Talep Ekranı', href: '/main-demands.html', dropdown: [] },
    {
      key: 'new-requests', icon: '➕', label: 'Yeni Talep Oluştur', href: '/demand-new.html', dropdown: [
        { icon: '🧾', label: 'Yeni Satın Alma Talebi Oluştur', href: '/demand-new.html' },
        { icon: '🏢', label: 'Şirket İçi Satın Alma Talebi Oluştur', href: '/internal-demand-new.html' },
        { icon: '🗂️', label: 'Şirket İçi Satın Alma Taleplerini Yönet', href: '/internal-demands.html' },
      ]
    },
    // Stok Takip ayarların soluna
    {
      key: 'inventory', icon: '📦', label: 'Stok Takip', href: '/inventory-index.html', premiumOnly: true, dropdown: [
        { icon: '➕', label: 'Yeni Stok Kartı Oluştur', href: '/pages/stock-new.html' },
        { icon: '🛠️', label: 'Stok Listesi', href: '/pages/stock-list.html' },
        { icon: '🏷️', label: 'Özel Kod Yönetimi', href: '/pages/stock-groups.html' },
        { icon: '📥', label: 'Stok Kartı İçe Aktar', href: '/pages/stock-import.html' },
        { icon: '🔄', label: 'Stok Hareketleri', href: '/pages/stock-movements.html' },
        { icon: '📊', label: 'Stok Raporları', href: '/pages/reports.html' },
      ]
    },
    // Hakedişler stok takibinin sağına
    { key: 'interim-payments', icon: '💵', label: 'Hakedişler', href: '/interim-payments.html', dropdown: [], restricted: 'interim-payments-menu' },
    // Ayarlar hakedişin sağına
    {
      key: 'settings', icon: '⚙️', label: 'Ayarlar', href: '/settings.html', dropdown: [
        { icon: '🧩', label: 'Menüyü Özelleştir', href: '#header-customization', id: 'headerCustomizeLink' },
        { icon: '⚙️', label: 'Genel Ayarlar', href: '/settings.html' },
        { icon: '👥', label: 'Şirket Kullanıcıları', href: '/settings.html#company-users' },
        { icon: '🔐', label: 'Rol ve Yetki Yönetimi', href: '/settings.html#approval-settings' },
        { icon: '🏢', label: 'Şirket Profili', href: '/settings.html#company-profile' },
        { icon: '⭐', label: 'Premium Hesap', href: '/settings.html#premium' },
        { icon: '📍', label: 'Adres Yönetimi', href: '/settings.html#addresses' },
        { icon: '🛡️', label: 'Güvenlik Ayarları', href: '/settings.html#security' },
      ]
    },
    // Admin Kontrol Paneli (dropdown içinde Premium Kontrol), sadece admin
    // Teklifbul Rule v1.0 - Absolute path kullan (relative path hatası önlemek için)
    {
      key: 'admin-dashboard', icon: '🔐', label: 'Admin Kontrol Paneli', href: '/pages/admin/dashboard.html', dropdown: [
        { icon: '⭐', label: 'Premium Kontrol', href: '/pages/admin/subscription-monitor.html' },
        { icon: '🛡️', label: 'Premium Yönetimi', href: '/pages/admin/premium-control.html' },
        { icon: '🚀', label: 'Veri Göçü Paneli', href: '/pages/admin/migration-dashboard.html' }
      ], restricted: 'admin-menu'
    },
  ];

  const currentPath = window.location.pathname + window.location.search;
  const getHeaderPrefsStorageKey = () => `${HEADER_PREFS_STORAGE_PREFIX}:${auth?.currentUser?.uid || 'guest'}`;

  const readHiddenNavKeysFromLocal = () => {
    try {
      const raw = localStorage.getItem(getHeaderPrefsStorageKey());
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      const keys = Array.isArray(parsed?.hiddenNavKeys) ? parsed.hiddenNavKeys : [];
      return new Set(keys.filter((k) => typeof k === 'string' && !NON_HIDEABLE_NAV_KEYS.has(k)));
    } catch (_e) {
      return new Set();
    }
  };

  const writeHiddenNavKeys = (keys) => {
    try {
      localStorage.setItem(getHeaderPrefsStorageKey(), JSON.stringify({
        hiddenNavKeys: Array.from(keys),
        updatedAt: Date.now()
      }));
    } catch (_e) {
      // localStorage erişilemezse sessizce geç
    }
  };
  hiddenNavKeysState = readHiddenNavKeysFromLocal();

  const applyHiddenNavKeys = (keys, { persistLocal = true } = {}) => {
    hiddenNavKeysState = new Set(
      Array.from(keys || []).filter((k) => typeof k === 'string' && !NON_HIDEABLE_NAV_KEYS.has(k))
    );
    if (persistLocal) {
      writeHiddenNavKeys(hiddenNavKeysState);
    }
  };

  const hasCachedPremiumAccess = (() => {
    try {
      const raw = localStorage.getItem(PREMIUM_NAV_CACHE_KEY);
      if (!raw) return false;

      // Legacy format desteği: "1" / "0"
      if (raw === '1' || raw === '0') {
        return raw === '1';
      }

      const parsed = JSON.parse(raw);
      const updatedAt = Number(parsed?.updatedAt || 0);
      if (!updatedAt || (Date.now() - updatedAt) > PREMIUM_NAV_CACHE_TTL_MS) {
        localStorage.removeItem(PREMIUM_NAV_CACHE_KEY);
        return false;
      }

      return parsed?.visible === true;
    } catch (_e) {
      return false;
    }
  })();

  const buildNav = () => navItems
    .filter((item) => {
      if (NON_HIDEABLE_NAV_KEYS.has(item.key)) return true;
      return !hiddenNavKeysState.has(item.key);
    })
    .map(item => {
    const isActive = currentPath.includes(item.href.replace('./', '/')) || activeRoute === item.key;
    const hasDropdown = item.dropdown && item.dropdown.length > 0;
    const restrictedAttr = item.restricted ? `data-restricted="${item.restricted}" id="${item.restricted}"` : '';
    // Teklifbul Rule v1.0 - Admin menüsü başlangıçta gizli, admin kontrolü sonrası gösterilecek
    const restrictedStyle = item.restricted === 'admin-menu' ? 'style="display:none !important;"' : '';
    const premiumClass = item.premiumOnly ? `premium-only-nav ${hasCachedPremiumAccess ? 'show-premium' : ''}` : '';
    return `
      <li class="nav-item ${premiumClass} ${hasDropdown ? 'has-dropdown' : ''} ${isActive ? 'is-active' : ''}" ${restrictedAttr} ${restrictedStyle} id="nav-${item.key}">
        <a href="${item.href}" class="nav-link ${isActive ? 'is-active' : ''}" ${hasDropdown ? 'aria-haspopup="true"' : ''}>
          ${item.icon ? `<span class="nav-link-icon">${item.icon}</span>` : ''}${item.label}
          ${hasDropdown ? '<span class="nav-toggle">▾</span>' : ''}
        </a>
        ${hasDropdown ? `
          <div class="nav-dropdown">
            ${item.dropdown.map(sub => {
      const icon = sub.icon ? `<span class="nav-dropdown-icon" aria-hidden="true">${sub.icon}</span>` : '';
      const label = sub.label || '';
      const customId = sub.id ? `id="${sub.id}"` : '';
      return `<a class="nav-dropdown-link" ${customId} href="${sub.href}" aria-label="${label}">${icon}${label}</a>`;
    }).join('')}
          </div>
        ` : ''}
      </li>
    `;
  }).join('');

  // Teklifbul Rule v1.0 - Dropdown link'lerine event listener ekle (event delegation)
  // Bu sayede dropdown link'ine tıklandığında sadece o link çalışır, ana link çalışmaz
  // Not: Bu listener aşağıdaki dropdown click handler'dan önce çalışmalı (capture phase)
  // Middle click için auxclick event'ini de dinle
  // CRITICAL: Bu handler SYNC olmalı - stopPropagation await öncesinde çalışmalı
  const handleDropdownLink = (event) => {
    const dropdownLink = event.target.closest('.nav-dropdown-link');
    if (dropdownLink) {
      // Teklifbul Rule v1.0 - Middle click / new tab intent kontrolü
      // SYNC: Bu kontrol hemen yapılmalı, await olmadan
      const isMiddleClickDirect = event.type === 'auxclick' ||
        event.button === 1 ||
        event.which === 2 ||
        (event.buttons !== undefined && (event.buttons & 4) === 4);
      const isNewTabIntent = isMiddleClickDirect || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;

      if (isNewTabIntent) {
        // Yeni sekme niyeti var, tarayıcıya bırak - hiçbir şey yapma
        return;
      }

      // SYNC: Dropdown'ı kapat ve stopPropagation - await'ten ÖNCE yapılmalı
      const dropdownItems = document.querySelectorAll('.nav-item.has-dropdown');
      dropdownItems.forEach(i => i.classList.remove('is-open'));
      event.stopPropagation();
      // Normal link davranışı çalışsın (href'e git) - preventDefault yapma
    }
  };

  // Click ve auxclick (middle click) event'lerini dinle
  document.addEventListener('click', handleDropdownLink, true); // Capture phase
  document.addEventListener('auxclick', handleDropdownLink, true); // Middle click için

  el.innerHTML = `
    <div class="topbar">
      <div class="topbar-left">
        <button id="mobileMenuToggle" class="mobile-menu-btn" aria-label="Menüyü Aç/Kapat">
          <span class="hamburger-icon"></span>
        </button>
        <ul class="nav-list" id="mainNavList">
          ${buildNav()}
        </ul>
      </div>
      <div class="topbar-right">
        <div id="notificationBell" class="notif-wrap" style="position:relative; display:flex; align-items:center; justify-content:center;">
          <button id="notificationBtn" class="icon-btn" title="Bildirimler" aria-label="Bildirimler" style="width:38px; height:38px; border-radius:12px; border:1px solid rgba(37,99,235,.25); background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); color:#1d4ed8; display:inline-flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 2px 8px rgba(37,99,235,.18); cursor:pointer;">🔔</button>
          <span id="notificationCount" class="notif-count" style="position:absolute; top:-6px; right:-6px; min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:#ef4444; color:#ffffff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(239,68,68,.35); border:2px solid #ffffff;">0</span>
        </div>
        <button id="themeToggle" class="btn btn-outline btn-sm" title="Tema Değiştir">
          ${currentTheme === 'dark' ? '☀️ Açık' : '🌙 Koyu'}
        </button>
        <span id="userEmail" class="topbar-text"></span>
        <button id="logoutBtn" class="btn btn-danger btn-sm">Çıkış</button>
      </div>
    </div>
    <div id="notificationDropdown" class="notif-dropdown" style="display:none;">
      <div class="notif-header" id="notifHeaderLink" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <span>Bildirimler</span>
        <small style="font-weight: 400; font-size: 11px; color: #3b82f6;">Tümünü Gör</small>
      </div>
      <div id="notificationList" class="notif-list">
        <div class="notif-empty">Yeni bildirim yok</div>
      </div>
      <div class="notif-footer">
        <button id="closeNotifications" class="link-btn">Kapat</button>
      </div>
    </div>
    <div id="headerCustomizationModal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,.55); z-index:2200; align-items:center; justify-content:center; padding:20px;">
      <div style="width:min(560px,96vw); max-height:85vh; overflow:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,.25);">
        <div style="padding:14px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <strong>Menü Özelleştirme</strong>
          <button id="closeHeaderCustomization" class="btn btn-outline btn-sm" type="button">Kapat</button>
        </div>
        <div style="padding:14px 16px;">
          <p style="margin:0 0 12px 0; color:var(--text-muted); font-size:13px;">
            İstemediğiniz üst menü başlıklarını gizleyebilirsiniz. Varsayılan düzen korunur; istediğiniz zaman geri alabilirsiniz.
          </p>
          <div id="headerCustomizationList" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;"></div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
            <button id="resetHeaderCustomization" class="btn btn-outline btn-sm" type="button">Varsayılana Dön</button>
            <button id="saveHeaderCustomization" class="btn btn-primary btn-sm" type="button">Kaydet</button>
          </div>
        </div>
      </div>
    </div>
    <style>
      :root {
        --background: #ffffff;
        --text: #1f2937;
        --text-muted: #6b7280;
        --border: #e5e7eb;
        --card-bg: #ffffff;
        --surface: #f9fafb;
        --nav-hover: #f3f4f6;
        --dropdown-bg: #ffffff;
        --dropdown-shadow: rgba(15,23,42,0.18);
        --dropdown-hover: #eff6ff;
      }
      .premium-only-nav { display: none !important; }
      .premium-only-nav.show-premium { display: block !important; }
      [data-theme="dark"] {
        --background: #111827;
        --text: #ffffff;
        --text-muted: rgba(255,255,255,0.7);
        --border: rgba(255,255,255,0.25);
        --card-bg: #111827;
        --surface: #111827;
        --nav-hover: rgba(255,255,255,0.05);
        --dropdown-bg: #111827;
        --dropdown-shadow: rgba(0,0,0,0.5);
        --dropdown-hover: rgba(255,255,255,0.1);
      }
      body { background: var(--background); color: var(--text); }
      .topbar {
        min-height: 68px;
        background: var(--background);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        position: relative;
        z-index: 30;
        flex-wrap: nowrap;
        gap: 12px;
      }
      .topbar-left { 
        display:flex; 
        align-items:center; 
        gap:10px; 
        flex: 1;
        min-width: 0;
      }
      .brand-inline { font-weight:700; color: var(--text); text-decoration:none; margin-right:6px; flex-shrink: 0; }
      .nav-list {
        list-style:none;
        display:flex;
        align-items:center;
        gap:4px;
        padding:0;
        margin:0;
        flex-wrap:wrap;
      }
      .nav-item { position:relative; flex-shrink: 0; padding-bottom: 6px; margin-bottom: -6px; }
      #admin-menu .nav-link {
        color: #ff9800;
        border-bottom: 1px dashed rgba(255, 152, 0, 0.3);
      }
      #admin-menu .nav-link:hover {
        background: rgba(255, 152, 0, 0.1);
      }
      .nav-link {
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 500;
        color: var(--text-muted);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background .15s, color .15s;
        min-height: 36px;
        min-width: max-content;
        white-space: nowrap;
      }
      .nav-link-icon { font-size: 16px; }
      .nav-toggle { margin-left: 4px; font-size: 12px; color: #6b7280; }
      .nav-link:hover { background: var(--nav-hover); color: var(--text); }
      .nav-link.is-active { background: #2563eb; color: #fff; }
      .nav-item.has-dropdown .nav-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        min-width: 220px;
        background: var(--dropdown-bg);
        border-radius: 10px;
        box-shadow: 0 12px 30px var(--dropdown-shadow);
        padding: 8px 0;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(4px);
        transition: all .15s ease;
        z-index: 100;
      }
      .nav-item.has-dropdown:hover > .nav-dropdown,
      .nav-item.has-dropdown.is-open > .nav-dropdown {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
      }
      .nav-dropdown-link {
        padding: 6px 14px;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--text);
        text-decoration: none;
        white-space: nowrap;
      }
      .nav-dropdown-icon { font-size: 14px; }
      .nav-dropdown-link:hover { background: var(--dropdown-hover); color: var(--primary); }
      /* Teklifbul Rule v1.0 - Admin menüsü başlangıçta gizli, admin kontrolü sonrası gösterilecek */
      #admin-menu,
      [data-restricted="admin-menu"] {
        display: none !important;
      }
      .topbar-right {
        display:flex;
        align-items:center;
        gap:12px;
        justify-content: flex-end;
        flex-wrap: nowrap;
        flex-shrink: 0;
      }
      .mobile-menu-btn {
        display: none;
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        z-index: 60;
      }
      .hamburger-icon {
        display: block;
        width: 24px;
        height: 2px;
        background: var(--text);
        position: relative;
        transition: background .2s;
      }
      .hamburger-icon::before,
      .hamburger-icon::after {
        content: '';
        position: absolute;
        width: 24px;
        height: 2px;
        background: var(--text);
        transition: transform .2s;
      }
      .hamburger-icon::before { top: -6px; }
      .hamburger-icon::after { bottom: -6px; }

      .is-mobile-open .hamburger-icon { background: transparent; }
      .is-mobile-open .hamburger-icon::before { transform: translateY(6px) rotate(45deg); }
      .is-mobile-open .hamburger-icon::after { transform: translateY(-6px) rotate(-45deg); }

      /* Responsive Adjustments */
      @media (max-width: 1400px) {
        .nav-link { font-size: 13px; padding: 4px 8px; }
        .nav-link-icon { font-size: 14px; }
      }
      @media (max-width: 1200px) {
        .nav-link { font-size: 12px; padding: 3px 6px; gap: 4px; }
        .nav-link-icon { font-size: 13px; }
        .nav-toggle { font-size: 10px; margin-left: 2px; }
      }
      @media (max-width: 900px) {
        .mobile-menu-btn { display: block; }
        .nav-list {
          display: none;
          position: absolute;
          top: 68px;
          left: 0;
          width: 100%;
          background: var(--background);
          flex-direction: column;
          align-items: flex-start;
          padding: 16px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          border-bottom: 1px solid var(--border);
          z-index: 55;
          max-height: calc(100vh - 68px);
          overflow-y: auto;
        }
        .is-mobile-open .nav-list { display: flex; }
        .nav-item { width: 100%; }
        .nav-link { width: 100%; border-radius: 8px; justify-content: space-between; padding: 12px 16px; }
        .nav-item.has-dropdown .nav-dropdown {
          position: static;
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          display: none;
          transform: none;
          box-shadow: none;
          padding: 8px 16px;
          background: var(--nav-hover);
          margin-top: 4px;
          width: 100%;
        }
        .nav-item.has-dropdown.is-open .nav-dropdown { display: block; pointer-events: auto; }
        .topbar-text { display: none; }
      }
    </style>
  `;

  // Apply current theme
  applyTheme(currentTheme);

  // Dropdown click/hover behaviour
  // Middle click için auxclick event'ini de dinle
  const handleNavClick = async (event) => {
    const dropdownItems = document.querySelectorAll('.nav-item.has-dropdown');

    // Teklifbul Rule v1.0 - Middle click / new tab intent kontrolü (sync import)
    let shouldSkipPreventDefault = null;
    try {
      // Try absolute path first (Vite root-based)
      let linkHandler;
      try {
        linkHandler = await import('/assets/js/utils/link-handler.js');
      } catch (err1) {
        // Fallback to relative path
        try {
          linkHandler = await import('../utils/link-handler.js');
        } catch (err2) {
          // Last fallback: try without .js extension
          linkHandler = await import('../utils/link-handler');
        }
      }
      shouldSkipPreventDefault = linkHandler.shouldSkipPreventDefault;
    } catch (err) {
      // Link handler yüklenemezse devam et - sessizce ignore et
    }

    // Teklifbul Rule v1.0 - Dropdown link'lerine tıklandığında event propagation'ı durdur
    // Bu sayede dropdown link'ine tıklandığında sadece o link çalışır, ana link çalışmaz
    const dropdownLink = event.target.closest('.nav-dropdown-link');
    if (dropdownLink) {
      // Teklifbul Rule v1.0 - Middle click / new tab intent kontrolü
      if (shouldSkipPreventDefault && shouldSkipPreventDefault(event, dropdownLink)) {
        // Yeni sekme niyeti var, tarayıcıya bırak
        return;
      }

      // Dropdown link'ine tıklandığında dropdown'ı kapat ve normal link davranışına izin ver
      dropdownItems.forEach(i => i.classList.remove('is-open'));
      // Event propagation'ı durdurma - normal link davranışı çalışsın
      return;
    }

    const toggle = event.target.closest('.nav-toggle');
    if (toggle) {
      event.preventDefault();
      const parent = toggle.closest('.nav-item');
      const isOpen = parent?.classList.contains('is-open');
      dropdownItems.forEach(i => i.classList.remove('is-open'));
      if (parent && !isOpen) parent.classList.add('is-open');
      return;
    }

    const link = event.target.closest('.nav-item.has-dropdown > .nav-link');
    if (link) {
      // Teklifbul Rule v1.0 - Middle click / new tab intent kontrolü
      // Önce direkt middle click kontrolü (import başarısız olsa bile çalışmalı)
      const isMiddleClickDirect = event.type === 'auxclick' ||
        event.button === 1 ||
        event.which === 2 ||
        (event.buttons !== undefined && (event.buttons & 4) === 4);
      const isNewTabIntent = isMiddleClickDirect || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;

      if (isNewTabIntent) {
        // Yeni sekme niyeti var, tarayıcıya bırak - hiçbir şey yapma
        return;
      }

      // shouldSkipPreventDefault fonksiyonu varsa onu da kontrol et
      if (shouldSkipPreventDefault && shouldSkipPreventDefault(event, link)) {
        // Yeni sekme niyeti var, tarayıcıya bırak
        return;
      }

      // Teklifbul Rule v1.0 - Ana link'e tıklandığında dropdown davranışı
      // Sadece normal click için (middle click değil)
      const isMobile = window.innerWidth <= 900;
      if (isMobile) {
        // Mobilde: Ana link'e tıklandığında dropdown'ı aç/kapat
        event.preventDefault();
        const parent = link.parentElement;
        const isOpen = parent?.classList.contains('is-open');
        dropdownItems.forEach(i => i.classList.remove('is-open'));
        if (parent && !isOpen) parent.classList.add('is-open');
      } else {
        // Desktop'ta: Ana link'e tıklandığında her zaman href'e git
        // Dropdown'ları kapat ve normal link davranışına izin ver
        dropdownItems.forEach(i => i.classList.remove('is-open'));
        // Normal link davranışı çalışsın (href'e git) - preventDefault yapma
      }
      return;
    }

    if (!event.target.closest('.nav-item.has-dropdown')) {
      dropdownItems.forEach(i => i.classList.remove('is-open'));
    }
  };

  // Click ve auxclick (middle click) event'lerini dinle
  document.addEventListener('click', handleNavClick);
  document.addEventListener('auxclick', handleNavClick);

  const renderNavList = () => {
    const navListEl = el.querySelector('#mainNavList');
    if (!navListEl) return;
    navListEl.innerHTML = buildNav();
  };

  const openHeaderCustomizationModal = () => {
    const modalEl = el.querySelector('#headerCustomizationModal');
    const listEl = el.querySelector('#headerCustomizationList');
    if (!modalEl || !listEl) return;
    const hiddenKeys = readHiddenNavKeys();
    const customizableItems = navItems.filter((item) => !NON_HIDEABLE_NAV_KEYS.has(item.key) && item.key !== 'admin-dashboard');

    listEl.innerHTML = customizableItems.map((item) => {
      const checked = hiddenKeys.has(item.key) ? '' : 'checked';
      return `
        <label style="display:flex; gap:8px; align-items:center; padding:8px; border:1px solid var(--border); border-radius:8px; cursor:pointer;">
          <input type="checkbox" data-nav-key="${item.key}" ${checked} />
          <span>${item.icon || ''} ${item.label}</span>
        </label>
      `;
    }).join('');

    modalEl.style.display = 'flex';
  };

  const closeHeaderCustomizationModal = () => {
    const modalEl = el.querySelector('#headerCustomizationModal');
    if (modalEl) modalEl.style.display = 'none';
  };

  el.addEventListener('click', (event) => {
    const customizeLink = event.target.closest('#headerCustomizeLink');
    if (customizeLink) {
      event.preventDefault();
      openHeaderCustomizationModal();
      return;
    }

    const closeBtn = event.target.closest('#closeHeaderCustomization');
    if (closeBtn) {
      event.preventDefault();
      closeHeaderCustomizationModal();
      return;
    }

    const resetBtn = event.target.closest('#resetHeaderCustomization');
    if (resetBtn) {
      event.preventDefault();
      applyHiddenNavKeys(new Set());
      renderNavList();
      closeHeaderCustomizationModal();
      return;
    }

    const saveBtn = event.target.closest('#saveHeaderCustomization');
    if (saveBtn) {
      event.preventDefault();
      const checkedInputs = Array.from(el.querySelectorAll('#headerCustomizationList input[type="checkbox"][data-nav-key]'));
      const hiddenKeys = new Set();
      checkedInputs.forEach((input) => {
        const key = input.getAttribute('data-nav-key');
        if (!input.checked && key && !NON_HIDEABLE_NAV_KEYS.has(key)) {
          hiddenKeys.add(key);
        }
      });
      applyHiddenNavKeys(hiddenKeys);
      renderNavList();
      closeHeaderCustomizationModal();

      // Performans odaklı: sadece kullanıcı Kaydet'e bastığında tek write.
      // Sayfa açılışında ekstra write/read yapılmaz; localStorage anında uygulanır.
      (async () => {
        try {
          const user = auth.currentUser;
          if (!user) return;
          const { doc, updateDoc, serverTimestamp } = await getFirestoreModules();
          await updateDoc(doc(db, 'users', user.uid), {
            uiPrefs: {
              hiddenHeaderKeys: Array.from(hiddenNavKeysState),
              updatedAt: serverTimestamp()
            }
          });
        } catch (saveErr) {
          logger.warn('Header tercihleri Firestore kaydedilemedi, local cache kullanılacak', saveErr);
        }
      })();
    }
  });

  el.addEventListener('click', (event) => {
    const modalEl = el.querySelector('#headerCustomizationModal');
    if (event.target === modalEl) {
      closeHeaderCustomizationModal();
    }
  });

  // Fill user email
  const fillEmail = () => {
    const u = auth.currentUser;
    const emailEl = el.querySelector('#userEmail');
    if (emailEl) emailEl.textContent = u?.email || '';
  };

  // Cache for company name to avoid repeated queries across page loads
  const COMPANY_NAME_CACHE = new Map();

  // Fill company name from user settings
  const fillCompanyName = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Check cache first
      if (COMPANY_NAME_CACHE.has(user.uid)) {
        const companyName = COMPANY_NAME_CACHE.get(user.uid);
        const companyEl = el.querySelector('#headerCompanyName');
        if (companyEl) companyEl.textContent = companyName;
        return;
      }

      // Hesap ayarlarından şirket adını çek (profiles collection)
      const collections = ['profiles', 'users', 'publicProfiles'];
      let companyName = 'Şirket Adı Yok';

      // OPTIMIZED: Try all collections in parallel instead of sequential
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
      const { db } = await import('../firebase.js');

      const promises = collections.map(async (collection) => {
        try {
          // Teklifbul Rule v1.0 - Offline kontrolü
          if (!navigator.onLine) {
            logger.info(`Offline durumda - ${collection} collection okunamadı`);
            return null;
          }

          const profileSnap = await getDoc(doc(db, collection, user.uid));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            const name = profileData?.companyName ||
              profileData?.company?.name ||
              profileData?.displayName ||
              profileData?.name || null;
            const plan = profileData?.plan || profileData?.planId || profileData?.companyPlan || null;
            return { name, plan };
          }
        } catch (error) {
          // Teklifbul Rule v1.0 - Offline ve SSL hatalarını sessizce handle et
          const isOfflineError = error.message?.includes('offline') ||
            error.message?.includes('Failed to get document') ||
            error.code === 'unavailable';
          const isSSLError = error.message?.includes('CERT_AUTHORITY_INVALID') ||
            error.message?.includes('ERR_CERT');

          if (isOfflineError || isSSLError) {
            // Offline veya SSL hatası için sessiz log (kullanıcıya gösterme)
            logger.info(`Profile collection ${collection} okunamadı (offline/SSL)`, {
              offline: isOfflineError,
              ssl: isSSLError
            });
          } else {
            logger.warn(`Profile collection ${collection} okunamadı`, error.message);
          }
        }
        return null;
      });

      const results = await Promise.all(promises);
      const foundItem = results.find(item => item && item.name && item.name.trim());
      if (foundItem) {
        companyName = foundItem.name.trim();
      }

      const planItem = results.find(item => item && item.plan);
      const fetchedPlan = planItem ? planItem.plan : null;
      // Assign to user so other functions have it
      if (fetchedPlan) {
        user.plan = fetchedPlan;
      }

      // Cache the result
      COMPANY_NAME_CACHE.set(user.uid, companyName);

      // Header'da göster
      const companyEl = el.querySelector('#headerCompanyName');
      if (companyEl) {
        companyEl.textContent = companyName;
        // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
      }
    } catch (error) {
      logger.error('Şirket adı yüklenirken hata', error);
      const companyEl = el.querySelector('#headerCompanyName');
      if (companyEl) companyEl.textContent = 'Şirket Adı Yok';
    }
  };

  // Setup theme toggle
  const themeToggle = el.querySelector('#themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Mobile menu toggle logic
  const mobileMenuToggle = el.querySelector('#mobileMenuToggle');
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      el.classList.toggle('is-mobile-open');
    });
  }

  // Setup notification system - Teklifbul Rule v1.0
  const notificationBtn = el.querySelector('#notificationBtn');
  const notificationDropdown = el.querySelector('#notificationDropdown');
  const closeNotificationsBtn = el.querySelector('#closeNotifications');
  const notificationCount = el.querySelector('#notificationCount');
  const notificationList = el.querySelector('#notificationList');

  // Bildirimleri yükle ve göster - Teklifbul Rule v1.0
  let currentUnreadCount = 0; // Global scope için unread count
  let lastNotificationCount = -1; // Önceki bildirim sayısı (gereksiz logları önlemek için, -1 = ilk yükleme)
  let lastUnreadCount = -1; // Önceki okunmamış sayısı (-1 = ilk yükleme)

  async function loadNotifications() {
    // Teklifbul Rule v1.0 - Internet bağlantısı kontrolü
    if (!navigator.onLine) {
      // Offline durumda bildirim yükleme yapma
      return;
    }
    try {
      const user = auth.currentUser;
      if (!user) {
        // Teklifbul Rule v1.0 - Kullanıcı yoksa sessizce çık
        return;
      }

      // Firestore'dan bildirimleri yükle
      const { collection, query, where, orderBy, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
      const { db } = await import('../../firebase.js');

      if (!db) {
        logger.warn('Firestore DB bulunamadı, bildirimler yüklenemedi');
        return;
      }

      // Teklifbul Rule v1.0 - Firestore index olmadan sorgu yap (index oluşturulana kadar)
      let snapshot;
      let needsClientSort = false;

      try {
        // Önce index'li sorguyu dene (hızlı)
        const indexedQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        snapshot = await getDocs(indexedQuery);
      } catch (indexError) {
        // Teklifbul Rule v1.0 - Offline ve SSL hatalarını kontrol et
        const isOfflineError = indexError.message?.includes('offline') ||
          indexError.message?.includes('Failed to get document') ||
          indexError.code === 'unavailable' ||
          indexError.message?.includes('ERR_CERT') ||
          indexError.message?.includes('CERT_AUTHORITY_INVALID');

        if (isOfflineError) {
          // Offline durumda sessizce çık
          logger.info('Bildirimler yüklenemedi (offline/SSL)', {
            error: indexError.message?.substring(0, 100)
          });
          return;
        }

        // Index yoksa, index gerektirmeyen sorgu yap
        logger.warn('Firestore index bulunamadı, index gerektirmeyen sorgu kullanılıyor');
        if (indexError.message.includes('index') && indexError.message.includes('create_composite')) {
          const indexUrl = indexError.message.match(/https:\/\/[^\s]+/)?.[0];
          if (indexUrl) {
            logger.info('Index oluşturmak için', { indexUrl });
          }
        }

        // Index gerektirmeyen sorgu: sadece userId filtresi
        const simpleQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          limit(50) // Daha fazla al, client-side sıralama yapacağız
        );
        snapshot = await getDocs(simpleQuery);
        needsClientSort = true;
      }

      const notifications = [];
      currentUnreadCount = 0;

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        notifications.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || (data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000) : new Date())
        });
        if (!data.read) currentUnreadCount++;
      });

      // Teklifbul Rule v1.0 - Debug: Bildirim sayısını logla (sadece değişiklik olduğunda veya ilk yüklemede)
      const isFirstLoad = lastNotificationCount === -1;
      const countChanged = notifications.length !== lastNotificationCount || currentUnreadCount !== lastUnreadCount;
      if ((notifications.length > 0 && countChanged) || isFirstLoad) {
        logger.info(`Bildirimler yüklendi: ${notifications.length} adet (${currentUnreadCount} okunmamış)`);
        lastNotificationCount = notifications.length;
        lastUnreadCount = currentUnreadCount;
      }

      // Client-side sıralama (eğer orderBy kullanılamadıysa)
      if (needsClientSort) {
        notifications.sort((a, b) => {
          const timeA = a.createdAt?.getTime?.() || 0;
          const timeB = b.createdAt?.getTime?.() || 0;
          return timeB - timeA; // Yeni önce
        });
      }

      // En son 20'yi al
      const limitedNotifications = notifications.slice(0, 20);

      // Bildirim sayısını güncelle
      if (notificationCount) {
        notificationCount.textContent = currentUnreadCount > 0 ? currentUnreadCount : '';
        notificationCount.style.display = currentUnreadCount > 0 ? 'flex' : 'none';
      }

      // Bildirim listesini göster
      if (notificationList) {
        if (limitedNotifications.length === 0) {
          notificationList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text);">Yeni bildirim yok</div>';
        } else {
          // Teklifbul Rule v1.0 - XSS koruma: notif.title/body Firestore'dan geliyor, sanitize sart
          notificationList.innerHTML = '';
          limitedNotifications.forEach(notif => {
            const timeAgo = getTimeAgo(notif.createdAt);
            const bgColor = getNotificationColor(notif.createdAt);
            const readBorder = notif.read ? '' : '3px solid #3b82f6';

            const wrap = document.createElement('div');
            wrap.style.cssText = `padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; background: ${bgColor};`;
            if (readBorder) wrap.style.borderLeft = readBorder;
            wrap.setAttribute('data-id', String(notif.id || ''));
            wrap.setAttribute('data-read', String(!!notif.read));

            const titleDiv = document.createElement('div');
            titleDiv.style.cssText = 'font-weight: 600; margin-bottom: 2px; color: var(--text); font-size: 13px;';
            titleDiv.textContent = notif.title || 'Bildirim';

            const bodyDiv = document.createElement('div');
            bodyDiv.style.cssText = 'font-size: 12px; color: var(--text); opacity: 0.9; margin-bottom: 4px;';
            bodyDiv.textContent = notif.body || notif.message || '';

            const timeDiv = document.createElement('div');
            timeDiv.style.cssText = 'font-size: 10px; color: var(--text); opacity: 0.6;';
            timeDiv.textContent = timeAgo;

            wrap.appendChild(titleDiv);
            wrap.appendChild(bodyDiv);
            wrap.appendChild(timeDiv);
            notificationList.appendChild(wrap);
          });

          // Bildirim tıklama event'leri - Teklifbul Rule v1.0
          notificationList.querySelectorAll('[data-id]').forEach(item => {
            item.addEventListener('click', async () => {
              const notifId = item.getAttribute('data-id');
              const isRead = item.getAttribute('data-read') === 'true';

              if (!isRead) {
                // Okundu olarak işaretle
                try {
                  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
                  const { db } = await import('../../firebase.js');
                  await updateDoc(doc(db, 'notifications', notifId), { read: true, readAt: new Date() });
                  item.setAttribute('data-read', 'true');
                  item.style.background = '';
                  item.style.borderLeft = '';
                  currentUnreadCount--;
                  if (notificationCount) {
                    notificationCount.textContent = currentUnreadCount > 0 ? currentUnreadCount : '';
                    notificationCount.style.display = currentUnreadCount > 0 ? 'flex' : 'none';
                  }
                } catch (err) {
                  logger.error('Bildirim okundu işaretleme hatası', err);
                }
              }

              // Bildirim tipine göre yönlendir
              const notif = limitedNotifications.find(n => n.id === notifId);
              if (notif?.data?.demandId) {
                window.location.href = `/demand-detail.html?id=${notif.data.demandId}`;
              } else if (notif?.data?.bidId) {
                window.location.href = `/bids.html?tab=incoming`;
              } else if (notif?.data?.rfqId) {
                window.location.href = `/bids.html?tab=incoming`;
              }
            });
          });
        }
      }

    } catch (error) {
      // Teklifbul Rule v1.0 - Offline ve SSL hatalarını sessizce handle et
      const isOfflineError = error.message?.includes('offline') ||
        error.message?.includes('Failed to get document') ||
        error.code === 'unavailable' ||
        error.message?.includes('ERR_CERT') ||
        error.message?.includes('CERT_AUTHORITY_INVALID') ||
        error.message?.includes('ERR_INTERNET_DISCONNECTED') ||
        error.message?.includes('ERR_NAME_NOT_RESOLVED');

      if (isOfflineError) {
        // Offline/SSL hatası için sessiz log (kullanıcıya gösterme)
        logger.info('Bildirimler yüklenemedi (offline/SSL)', {
          error: error.message?.substring(0, 100)
        });
        // Offline durumda bildirim listesini boş bırak veya cache'den göster
        if (notificationList) {
          notificationList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary, #6b7280);">Bildirimler şu anda yüklenemiyor</div>';
        }
      } else {
        // Diğer hatalar için normal log
        logger.error('Bildirimler yüklenemedi', error?.message || error);
        if (notificationList) {
          notificationList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--error, #ef4444);">Bildirimler yüklenemedi</div>';
        }
      }
      // Bildirim sayısını sıfırla (hata durumunda)
      if (notificationCount) {
        notificationCount.textContent = '';
        notificationCount.style.display = 'none';
      }
    }
  }

  // Zaman gösterimi helper
  function getTimeAgo(date) {
    if (!date) return '';
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) return date.toLocaleDateString('tr-TR');
    if (days > 0) return `${days} gün önce`;
    if (hours > 0) return `${hours} saat önce`;
    if (minutes > 0) return `${minutes} dakika önce`;
  return 'Az önce';
  }

  // Bildirim renk skalası (yeşilden kırmızıya)
  function getNotificationColor(date) {
    if (!date) return 'transparent';
    const diffHours = (new Date() - date) / (1000 * 60 * 60);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('force-dark');
    
    if (diffHours < 1) return isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(232, 255, 243, 0.9)'; // Yeni: Yeşilimsi
    if (diffHours < 12) return isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(243, 232, 255, 0.8)'; // Orta: Morumsu/Şık
    if (diffHours < 24) return isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(254, 243, 199, 0.8)'; // Günlük: Sarımsı
    return isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(254, 226, 226, 0.7)'; // Eski: Kırmızımsı
  }

  if (notificationBtn && notificationDropdown) {
    // Header title link
    const notifHeaderLink = el.querySelector('#notifHeaderLink');
    if (notifHeaderLink) {
      notifHeaderLink.addEventListener('click', () => {
        window.location.href = '/pages/notifications.html';
      });
    }
    notificationBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = notificationDropdown.style.display === 'block';
      notificationDropdown.style.display = isOpen ? 'none' : 'block';

      // Dropdown açıldığında bildirimleri yükle
      if (!isOpen) {
        await loadNotifications();
      }
    });

    closeNotificationsBtn.addEventListener('click', () => {
      notificationDropdown.style.display = 'none';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!notificationBtn.contains(e.target) && !notificationDropdown.contains(e.target)) {
        notificationDropdown.style.display = 'none';
      }
    });

    // Teklifbul Rule v1.0 - Notification interval cleanup için global değişkenler
    // Cleanup fonksiyonu - global interval'ı temizle
    function cleanupNotificationInterval() {
      if (globalNotificationInterval) {
        clearInterval(globalNotificationInterval);
        globalNotificationInterval = null;
      }
    }

    // Önceki listener'ı temizle (eğer varsa)
    if (globalAuthUnsubscribe) {
      globalAuthUnsubscribe();
      globalAuthUnsubscribe = null;
    }

    // Önceki interval'ı temizle (eğer varsa)
    cleanupNotificationInterval();

    // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
    // waitAuthReady() ile auth state'in yüklenmesini bekle
    (async () => {
      try {
        const { waitAuthReady } = await import('../../firebase.js');
        await waitAuthReady();
        logger.debug("Header notifications: Auth state ready");
      } catch (err) {
        logger.warn("Header notifications: waitAuthReady hatası, devam ediliyor", err);
      }

      // Auth state yüklendikten sonra bildirimleri yükle
      if (auth.currentUser) {
        loadNotifications();
        // Her 30 saniyede bir güncelle
        globalNotificationInterval = setInterval(loadNotifications, 30000);
      } else {
        globalAuthUnsubscribe = auth.onAuthStateChanged((user) => {
          if (user) {
            // Önceki interval'ı temizle (eğer varsa)
            cleanupNotificationInterval();
            loadNotifications();
            globalNotificationInterval = setInterval(loadNotifications, 30000);
          } else {
            // Kullanıcı çıkış yaptığında interval'ı temizle
            cleanupNotificationInterval();
          }
        });
      }
    })();

    // Sayfa unload'da cleanup (her durumda)
    window.addEventListener('beforeunload', () => {
      cleanupNotificationInterval();
      if (globalAuthUnsubscribe) {
        globalAuthUnsubscribe();
        globalAuthUnsubscribe = null;
      }
    });
  }

  // Setup logout button - Teklifbul Rule v1.0
  // IMPORTANT: Only logout handler can perform redirect, all other redirects are handled by auth-guard.js
  const logoutBtn = el.querySelector('#logoutBtn');
  if (logoutBtn) {
    // Teklifbul Rule v1.0 - Sadece left-click (button === 0) ile logout yap
    // Middle-click (button === 1) ve right-click (button === 2) logout yapmamalı
    logoutBtn.addEventListener('click', async (e) => {
      // Middle-click veya right-click ise işleme alma
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      // Teklifbul Rule v1.0 - Logout akışı (toast + logger ile)
      const { logger } = await import('../../../src/shared/log/logger.js');
      const { toast } = await import('../../../src/shared/ui/toast.js');
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js');

      logger.group("Logout");
      try {
        try {
          localStorage.removeItem(PREMIUM_NAV_CACHE_KEY);
        } catch (_e) {
          // localStorage erişim hatası sessizce geç
        }
        await signOut(auth);
        toast.info(MESSAGES.INFO_SESSION_CLOSED);
        logger.info("Oturum kapatıldı");
        // Logout sonrası redirect yapılabilir (tek istisna - logout handler)
        location.href = "./index.html";
      } catch (err) {
        logger.error("Çıkış hatası", err);
        toast.error(MESSAGES.ERROR_LOGOUT);
      } finally {
        logger.end();
      }
    });
  }

  // Initialize on auth ready
  // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
  // waitAuthReady() ile auth state'in yüklenmesini bekle
  try {
    const { waitAuthReady } = await import('../../firebase.js');
    await waitAuthReady();
    logger.debug("Header: Auth state ready");
  } catch (err) {
    logger.warn("Header: waitAuthReady hatası, devam ediliyor", err);
  }

  // Auth state yüklendikten sonra kullanıcı bilgilerini göster
  if (auth.currentUser) {
    fillEmail();
    await fillCompanyName();
  } else {
    // Optimized auth listener - cleanup immediately after first check
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        fillEmail();
        await fillCompanyName();
        unsub(); // Cleanup immediately - no need to keep listening
      }
    });

    // Safety cleanup after 5 seconds (in case user is already logged in)
    setTimeout(() => {
      try {
        unsub();
      } catch (_e) {
        // Ignore - might already be unsubscribed
      }
    }, 5000);
  }

  // Resolve shared company ID (same logic as settings.html)
  function resolveSharedCompanyId(userData) {
    if (!userData) return null;
    const companyId = userData.activeCompanyId || userData.companyId || (Array.isArray(userData.companies) && userData.companies.length ? userData.companies[0] : null);
    if (companyId && typeof companyId === 'string' && companyId.trim() !== '') return companyId;
    return null;
  }

  // Teklifbul Rule v1.0 - Premium Plus kontrolü ve hakedişler menüsünü göster/gizle
  // Admin kullanıcılar tüm premium özelliklere erişebilir
  async function checkPremiumPlusAndShowMenu() {
    let isAdmin = false;
    try {
      const user = auth.currentUser;
      if (!user) {
        document.getElementById('interim-payments-menu')?.setAttribute('style', 'display:none;');
        // Teklifbul Rule v1.0 - Admin menüsü kullanıcı yoksa gizli kalmalı
        const adminMenuEl = document.getElementById('admin-menu');
        if (adminMenuEl) {
          adminMenuEl.style.setProperty('display', 'none', 'important');
        }
        document.querySelectorAll('[data-restricted="admin-only"]').forEach(elm => elm.setAttribute('style', 'display:none;'));
        return;
      }

      const token = await user.getIdToken();
      if (!token) {
        document.getElementById('interim-payments-menu')?.setAttribute('style', 'display:none;');
        document.getElementById('admin-menu')?.setAttribute('style', 'display:none;');
        document.querySelectorAll('[data-restricted="admin-only"]').forEach(elm => elm.setAttribute('style', 'display:none;'));
        return;
      }

      const adminEmailList = `${window.ADMIN_EMAILS || ''}`.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (!adminEmailList.length) adminEmailList.push('akyildizfaruk@gmail.com');

      // Teklifbul Rule v1.0 - Admin kontrolü subscription kontrolünden BAĞIMSIZ olmalı
      // Admin kontrolü - claim + email allowlist (API çağrısı yok, 403 spam engellendi)
      try {
        const tokenResult = await user.getIdTokenResult(true);
        const claimAdmin = tokenResult?.claims?.admin === true
          || tokenResult?.claims?.isAdmin === true
          || tokenResult?.claims?.role === 'admin'
          || tokenResult?.claims?.ops === true;
        isAdmin = claimAdmin || (user.email && adminEmailList.includes(user.email.toLowerCase()));
      } catch (_adminError) {
        // Hata durumunda yalnızca admin-email listesi fallback
        isAdmin = user.email ? adminEmailList.includes(user.email.toLowerCase()) : false;
      }

      // Admin görünürlüğünü uygula (subscription kontrolünden önce ve bağımsız)
      const adminMenuEl = document.getElementById('admin-menu');
      if (adminMenuEl) {
        // Teklifbul Rule v1.0 - Admin kontrolü başarılı olunca göster, değilse gizli kal
        if (isAdmin) {
          // CSS'deki !important'ı override etmek için setProperty kullan
          adminMenuEl.style.setProperty('display', 'block', 'important');
        } else {
          adminMenuEl.style.setProperty('display', 'none', 'important');
        }
      }
      document.querySelectorAll('[data-restricted="admin-only"]').forEach(elm => {
        elm.setAttribute('style', isAdmin ? 'display:block;' : 'display:none;');
      });
      const premiumCard = document.getElementById('nav-premium-control');
      if (premiumCard) premiumCard.setAttribute('style', isAdmin ? 'display:block;' : 'display:none;');

      // Teklifbul Rule v1.0 - Şirket bazlı premium kontrolü
      let companyPlan = null;
      try {
        const { doc, getDoc } = await getFirestoreModules();
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const serverHiddenKeys = Array.isArray(userData?.uiPrefs?.hiddenHeaderKeys) ? userData.uiPrefs.hiddenHeaderKeys : null;
        if (serverHiddenKeys) {
          applyHiddenNavKeys(new Set(serverHiddenKeys), { persistLocal: true });
          renderNavList();
        }
        const companyId = resolveSharedCompanyId(userData);

        if (companyId) {
          const companyDoc = await getDoc(doc(db, 'companies', companyId));
          const company = companyDoc.exists() ? companyDoc.data() : null;

          if (company) {
            const planId = company?.planId ?? null;
            const isPremium = (typeof company?.isPremium === "boolean") ? company.isPremium : (!!planId && planId !== "free");
            companyPlan = { planId, isPremium };
          }
        }
      } catch (e) {
        logger.warn('Şirket premium durumu yüklenemedi', e);
      }

      // Subscription summary API'den plan bilgisini al
      // Teklifbul Rule v1.0 - Subscription kontrolü admin kontrolünden bağımsız
      // Backend hatası olsa bile admin menüsü gösterilmeli
      let premiumNavVisible = isAdmin || (companyPlan && (companyPlan.isPremium === true || (companyPlan.planId && companyPlan.planId !== 'free')));
      try {
        // Teklifbul Rule v1.0 - Ortak authFetch helper kullan (x-company-id otomatik eklenir)
        const { authFetch } = await import('../utils/api-helpers.js');
        const response = await authFetch('/api/account/subscription');

        if (response.ok) {
          const summary = await response.json();
          let planId = summary?.plan?.planId || summary?.planId || 'free';

          // Teklifbul Rule v1.0 - Şirket bazlı premium override
          if (companyPlan && (companyPlan.isPremium === true || (companyPlan.planId && companyPlan.planId !== 'free'))) {
            planId = companyPlan.planId || planId;
            logger.debug('[HEADER] Premium plan şirket dokümanından override edildi', { planId, source: 'companyDoc' });
          }

          const userShape = {
            plan: planId,
            planId,
            isAdmin,
            role: isAdmin ? 'admin' : summary?.plan?.role,
            email: user.email
          };
          premiumNavVisible = premiumNavVisible || hasPremiumAccess(userShape);

          const isPremiumPlus = hasPremiumPlusAccess(userShape);
          const menuEl = document.getElementById('interim-payments-menu');
          if (menuEl) menuEl.setAttribute('style', isPremiumPlus ? 'display:block;' : 'display:none;');
        } else {
          // Hata durumunda şirket bazlı premium varsa onu kullan
          if (companyPlan && (companyPlan.isPremium === true || (companyPlan.planId && companyPlan.planId !== 'free'))) {
            const planId = companyPlan.planId || 'free';
            premiumNavVisible = premiumNavVisible || hasPremiumAccess({ plan: planId, planId, isAdmin, email: user.email });
            const isPremiumPlus = planId === 'premium_plus' ||
              planId === 'premium_plus_monthly' ||
              planId === 'premium_plus_yearly' ||
              planId?.includes('premium_plus');
            const menuEl = document.getElementById('interim-payments-menu');
            if (menuEl) menuEl.setAttribute('style', (isPremiumPlus || isAdmin) ? 'display:block;' : 'display:none;');
          } else {
            // Hata durumunda admin için yine de göster
            const menuEl = document.getElementById('interim-payments-menu');
            if (menuEl) menuEl.setAttribute('style', isAdmin ? 'display:block;' : 'display:none;');
          }
        }
      } catch (subscriptionError) {
        // Teklifbul Rule v1.0 - Subscription API hatası admin menüsünü etkilememeli
        logger.warn('Subscription kontrolü başarısız (admin menüsü etkilenmedi)', subscriptionError);
        // Hata durumunda admin için yine de premium menüyü göster
        const menuEl = document.getElementById('interim-payments-menu');
        if (menuEl) menuEl.setAttribute('style', isAdmin ? 'display:block;' : 'display:none;');
      }

      // Teklifbul Rule v1.0 - Premium nav öğeleri (Satışlar/Müşteriler/Stok Takip) görünürlüğünü kesinleştir
      document.querySelectorAll('.premium-only-nav').forEach((elem) => {
        elem.classList.toggle('show-premium', !!premiumNavVisible);
      });
      try {
        localStorage.setItem(PREMIUM_NAV_CACHE_KEY, JSON.stringify({
          visible: !!premiumNavVisible,
          uid: user.uid || null,
          updatedAt: Date.now()
        }));
      } catch (_e) {
        // localStorage erişimi yoksa sessizce geç
      }
    } catch (error) {
      // Teklifbul Rule v1.0 - Genel hata durumunda admin kontrolü yapılmışsa menüyü göster
      logger.warn('Premium Plus kontrolü başarısız', error);
      document.getElementById('interim-payments-menu')?.setAttribute('style', 'display:none;');
      // Admin kontrolü zaten yukarıda yapıldı, admin ise menüyü göster
      // Admin menüsü subscription hatasından etkilenmemeli
      if (isAdmin) {
        const adminMenuEl = document.getElementById('admin-menu');
        if (adminMenuEl) {
          adminMenuEl.style.setProperty('display', 'block', 'important');
        }
        document.querySelectorAll('[data-restricted="admin-only"]').forEach(elm => {
          elm.setAttribute('style', 'display:block;');
        });
      }
    }
  }

  // Kullanıcı giriş yaptığında kontrol et - Teklifbul Rule v1.0 - Memory Leak Prevention
  // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
  // waitAuthReady() ile auth state'in yüklenmesini bekle
  (async () => {
    try {
      const { waitAuthReady } = await import('../../firebase.js');
      await waitAuthReady();
      logger.debug("Header premium check: Auth state ready");
    } catch (err) {
      logger.warn("Header premium check: waitAuthReady hatası, devam ediliyor", err);
    }

    // Auth state yüklendikten sonra premium kontrolü yap
    if (auth.currentUser) {
      checkPremiumPlusAndShowMenu();
      renderNavList();

      // Teklifbul Rule v1.7 - Setup premium link interceptors
      try {
        const { setupPremiumLinkInterceptors } = await import('../utils/premium-link-interceptor.js');
        await setupPremiumLinkInterceptors();
      } catch (err) {
        logger.warn('Failed to setup premium link interceptors', err);
      }
    } else {
      const unsub = auth.onAuthStateChanged((user) => {
        if (user) {
          checkPremiumPlusAndShowMenu();
          renderNavList();
          // Cleanup after first check
          unsub();
        } else {
          document.getElementById('interim-payments-menu')?.setAttribute('style', 'display:none;');
        }
      });

      // Safety cleanup after 5 seconds
      setTimeout(() => {
        try {
          unsub();
        } catch (_e) {
          // Ignore - might already be unsubscribed
        }
      }, 5000);
    }
  })();

  // Teklifbul Rule v2.2 - Initialize insufficient tokens modal when header is initialized
  ensureInsufficientTokensModal();

  // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
  return el;
}

// Teklifbul Rule v2.2 - Initialize insufficient tokens modal (global, once)
let insufficientTokensModalInitPromise = null;
function ensureInsufficientTokensModal() {
  if (!insufficientTokensModalInitPromise) {
    insufficientTokensModalInitPromise = import('./insufficient-tokens-modal.js')
      .then(({ initInsufficientTokensModal }) => {
        initInsufficientTokensModal();
      })
      .catch(err => {
        logger.warn('Failed to initialize insufficient tokens modal', err);
      });
  }
  return insufficientTokensModalInitPromise;
}

// Teklifbul Rule v1.0 - Otomatik başlatma: Eğer #app-header varsa ve header henüz başlatılmamışsa, header'ı otomatik yükle
// Not: Çoğu sayfa manuel olarak initGlobalHeader çağırıyor, bu sadece fallback
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#app-header') && !headerInitialized) {
      initGlobalHeader();
    }
    // Teklifbul Rule v2.2 - Initialize insufficient tokens modal
    ensureInsufficientTokensModal();
  });
} else {
  // DOM zaten yüklendi
  if (document.querySelector('#app-header') && !headerInitialized) {
    initGlobalHeader();
  }
  // Teklifbul Rule v2.2 - Initialize insufficient tokens modal
  ensureInsufficientTokensModal();
}