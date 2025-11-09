/**
 * Shared Header Component
 * Unified header for all pages with real company name display
 */

import { auth } from '../../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';

// Theme management
let currentTheme = localStorage.getItem('theme') || 'light';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
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
  const el = (typeof mount === 'string') ? document.querySelector(mount) : mount;
  if (!el) {
    logger.warn('Header mount point not found', { mount });
    return;
  }

  el.classList.add('global-header');
  el.innerHTML = `
    <div class="header-wrap" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--card-bg);">
      <nav class="nav-left" style="display:flex;gap:20px;align-items:center;">
        <a href="/dashboard.html" class="brand" style="font-weight:600;color:var(--text);text-decoration:none;">Teklifbul</a>
        <a href="/dashboard.html" class="nav ${activeRoute==='dashboard'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">📊</span>Dashboard
        </a>
        <a href="/demands.html" class="nav ${activeRoute==='demands'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">📋</span>Talepler
        </a>
        <a href="/bids.html?tab=incoming" class="nav ${activeRoute==='bids'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">💰</span>Teklifler
        </a>
        <a href="/main-demands.html" class="nav ${activeRoute==='main'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">🛍️</span>Ana Talep Ekranı
        </a>
        <a href="/demand-new.html" class="nav ${activeRoute==='new'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">➕</span>Yeni Talep
        </a>
        <a href="/settings.html" class="nav ${activeRoute==='settings'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">⚙️</span>Ayarlar
        </a>
        <a href="/inventory-index.html" class="nav ${activeRoute==='inventory'?'active':''}" style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">📦</span>Stok Takip
        </a>
      </nav>
      <div class="nav-right" style="display:flex;gap:12px;align-items:center;">
        <!-- Notification Icon -->
        <div id="notificationBell" style="position: relative; cursor: pointer;">
          <button id="notificationBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 4px;">
            🔔
          </button>
          <span id="notificationCount" style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; width: 18px; height: 18px; font-size: 12px; display: flex; align-items: center; justify-content: center;">0</span>
        </div>
        <!-- Theme Toggle -->
        <button id="themeToggle" class="btn btn-outline" title="Tema Değiştir" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:14px;">
          ${currentTheme === 'dark' ? '☀️ Açık' : '🌙 Koyu'}
        </button>
        <span style="color:var(--text-muted);">Şirket Adı:</span>
        <span id="headerCompanyName" style="font-weight:600;color:var(--text);">Yükleniyor…</span>
        <span id="userEmail" style="color:var(--text-muted);"></span>
        <button id="logoutBtn" class="btn btn-danger btn-sm">Çıkış</button>
      </div>
    </div>
    
    <!-- Notification Dropdown -->
    <div id="notificationDropdown" style="display: none; position: absolute; right: 20px; top: 60px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 300px; z-index: 1000;">
      <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Bildirimler</div>
      <div id="notificationList" style="max-height: 300px; overflow-y: auto;">
        <div style="padding: 16px; text-align: center; color: #6b7280;">Yeni bildirim yok</div>
      </div>
      <div style="padding: 8px; border-top: 1px solid #e5e7eb; text-align: center;">
        <button id="closeNotifications" style="background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 14px;">Kapat</button>
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
      }
      
      [data-theme="dark"] {
        --background: #111827;
        --text: #f9fafb;
        --text-muted: #9ca3af;
        --border: #374151;
        --card-bg: #1f2937;
        --surface: #111827;
      }
      
      body {
        background-color: var(--background);
        color: var(--text);
      }
    </style>
  `;

  // Apply current theme
  applyTheme(currentTheme);

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
          const profileSnap = await getDoc(doc(db, collection, user.uid));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            return profileData?.companyName || 
                   profileData?.company?.name || 
                   profileData?.displayName ||
                   profileData?.name || null;
          }
        } catch (error) {
          logger.warn(`Profile collection ${collection} okunamadı`, error.message);
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      const foundName = results.find(name => name && name.trim());
      if (foundName) {
        companyName = foundName.trim();
      }
      
      // Cache the result
      COMPANY_NAME_CACHE.set(user.uid, companyName);
      
      // Header'da göster
      const companyEl = el.querySelector('#headerCompanyName');
      if (companyEl) {
        companyEl.textContent = companyName;
        logger.info('Header şirket adı güncellendi', { companyName });
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

  // Setup notification system - Teklifbul Rule v1.0
  const notificationBtn = el.querySelector('#notificationBtn');
  const notificationDropdown = el.querySelector('#notificationDropdown');
  const closeNotificationsBtn = el.querySelector('#closeNotifications');
  const notificationCount = el.querySelector('#notificationCount');
  const notificationList = el.querySelector('#notificationList');
  
  // Bildirimleri yükle ve göster - Teklifbul Rule v1.0
  let currentUnreadCount = 0; // Global scope için unread count
  
  async function loadNotifications() {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      // Firestore'dan bildirimleri yükle
      const { collection, query, where, orderBy, limit, getDocs, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
      const { db } = await import('../../firebase.js');
      
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
          notificationList.innerHTML = '<div style="padding: 16px; text-align: center; color: #6b7280;">Yeni bildirim yok</div>';
        } else {
          notificationList.innerHTML = limitedNotifications.map(notif => {
            const timeAgo = getTimeAgo(notif.createdAt);
            const readClass = notif.read ? '' : 'style="background: #f0f9ff; border-left: 3px solid #3b82f6;"';
            return `
              <div ${readClass} style="padding: 12px; border-bottom: 1px solid #e5e7eb; cursor: pointer;" data-id="${notif.id}" data-read="${notif.read || false}">
                <div style="font-weight: 600; margin-bottom: 4px; color: #1f2937;">${notif.title || 'Bildirim'}</div>
                <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">${notif.body || notif.message || ''}</div>
                <div style="font-size: 11px; color: #9ca3af;">${timeAgo}</div>
              </div>
            `;
          }).join('');
          
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
      logger.error('Bildirimler yüklenemedi', error);
      if (notificationList) {
        notificationList.innerHTML = '<div style="padding: 16px; text-align: center; color: #ef4444;">Bildirimler yüklenemedi</div>';
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
  
  if (notificationBtn && notificationDropdown) {
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
    
    // Kullanıcı giriş yaptığında bildirimleri yükle
    if (auth.currentUser) {
      loadNotifications();
      // Her 30 saniyede bir güncelle
      setInterval(loadNotifications, 30000);
    } else {
      auth.onAuthStateChanged((user) => {
        if (user) {
          loadNotifications();
          setInterval(loadNotifications, 30000);
        }
      });
    }
  }

  // Setup logout button - Teklifbul Rule v1.0
  const logoutBtn = el.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      // Teklifbul Rule v1.0 - Logout akışı (toast + logger ile)
      const { logger } = await import('../../../src/shared/log/logger.js');
      const { toast } = await import('../../../src/shared/ui/toast.js');
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js');
      
      logger.group("Logout");
      try {
        await signOut(auth);
        toast.info(MESSAGES.INFO_SESSION_CLOSED);
        logger.info("Oturum kapatıldı");
        // onAuthStateChanged login'e yönlendirir
      } catch (err) {
        logger.error("Çıkış hatası", err);
        toast.error(MESSAGES.ERROR_LOGOUT);
      } finally {
        logger.end();
      }
    });
  }

  // Initialize on auth ready
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
      } catch (e) {
        // Ignore - might already be unsubscribed
      }
    }, 5000);
  }

  logger.info('Global header initialized', { route: activeRoute });
}