/**
 * Shared Header Component
 * Unified header for all pages with real company name display
 */

import { auth } from '../firebase.js';

/**
 * Initialize global header component
 * @param {Object} options - Configuration options
 * @param {string|Element} options.mount - Mount point selector or element
 * @param {string} options.activeRoute - Active route name for highlighting
 */
export async function initGlobalHeader({ mount = '#app-header', activeRoute = '' } = {}) {
  const el = (typeof mount === 'string') ? document.querySelector(mount) : mount;
  if (!el) {
    console.warn('Header mount point not found:', mount);
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
      </nav>
      <div class="nav-right" style="display:flex;gap:12px;align-items:center;">
        <button id="themeToggle" class="btn btn-outline" title="Tema Değiştir" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:14px;">🌙 Koyu</button>
        <span style="color:var(--text-muted);">Şirket Adı:</span>
        <span id="headerCompanyName" style="font-weight:600;color:var(--text);">Yükleniyor…</span>
        <span id="userEmail" style="color:var(--text-muted);"></span>
        <button id="logoutBtn" class="btn btn-danger btn-sm">Çıkış</button>
      </div>
    </div>
  `;

  // Fill user email
  const fillEmail = () => {
    const u = auth.currentUser;
    const emailEl = el.querySelector('#userEmail');
    if (emailEl) emailEl.textContent = u?.email || '';
  };

  // Fill company name from user settings
  const fillCompanyName = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      // Hesap ayarlarından şirket adını çek (profiles collection)
      const collections = ['profiles', 'users', 'publicProfiles'];
      let companyName = 'Şirket Adı Yok';
      
      for (const collection of collections) {
        try {
          const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
          const { db } = await import('../firebase.js');
          
          const profileSnap = await getDoc(doc(db, collection, user.uid));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            const name = profileData?.companyName || 
                        profileData?.company?.name || 
                        profileData?.displayName ||
                        profileData?.name;
            
            if (name && name.trim()) {
              companyName = name.trim();
              break;
            }
          }
        } catch (error) {
          console.warn(`Profile collection ${collection} okunamadı:`, error.message);
          continue;
        }
      }
      
      // Header'da göster
      const companyEl = el.querySelector('#headerCompanyName');
      if (companyEl) {
        companyEl.textContent = companyName;
        console.log(`🏢 Header şirket adı güncellendi: ${companyName}`);
      }
    } catch (error) {
      console.error('Şirket adı yüklenirken hata:', error);
      const companyEl = el.querySelector('#headerCompanyName');
      if (companyEl) companyEl.textContent = 'Şirket Adı Yok';
    }
  };

  // Setup logout button
  const logoutBtn = el.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await auth.signOut();
        window.location.href = 'index.html';
      } catch (error) {
        console.error('Logout error:', error);
      }
    });
  }

  // Initialize on auth ready
  if (auth.currentUser) {
    fillEmail();
    await fillCompanyName();
  } else {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        fillEmail();
        await fillCompanyName();
        unsub();
      }
    });
  }

  console.log(`✅ Global header initialized for route: ${activeRoute}`);
}