// Teklifbul Rule v1.0 - Admin Panel Script
import { requireAuth } from '../../firebase.js';
import { logger } from '../../src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Merkezi debug helper
import { debugAgentLog } from '../../src/shared/log/debugLog.js';
import { toast } from '../../src/shared/ui/toast.js';
import { MESSAGES } from '../../src/shared/constants/messages.js';
import DOMPurify from 'dompurify';
import { initGlobalHeader } from '../../assets/js/ui/header.js';

// Teklifbul Rule v1.0 - Vite env değişkeni için fallback
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) 
  ? import.meta.env.VITE_API_URL 
  : 'http://localhost:5174';
let currentUser = null;
let currentToken = null;

// Admin kontrolü
async function checkAdminAccess() {
  try {
    currentUser = await requireAuth();
    if (!currentUser) {
      window.location.href = '/login.html';
      return false;
    }

    currentToken = await currentUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}/api/admin/check`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) {
      if (response.status === 403) {
        toast.error(MESSAGES.ERROR_ADMIN_PERMISSION);
        window.location.href = '/index.html';
        return false;
      }
      throw new Error('Admin kontrolü başarısız');
    }

    // Teklifbul Rule v1.0 - Admin kontrolü başarılı, sayfayı göster
    document.body.classList.add('admin-verified');

    // Kullanıcı bilgilerini göster
    document.getElementById('admin-user-name').textContent = currentUser.displayName || 'Admin';
    document.getElementById('admin-user-email').textContent = currentUser.email || '-';

    return true;
  } catch (error) {
    logger.error('Admin kontrolü hatası', error);
    toast.error(MESSAGES.ERROR_ADMIN_PERMISSION_CHECK);
    window.location.href = '/index.html';
    return false;
  }
}

// Tab navigation
function initTabs() {
  const navLinks = document.querySelectorAll('.admin-sidebar-nav .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      if (!tab) return;
      
      // Update active state
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      // Show/hide tabs
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
      
      // Update page title
      const titles = {
        users: 'Kullanıcılar',
        subscriptions: 'Paketler',
        logs: 'Loglar',
        errors: 'Hatalar',
        settings: 'Sistem Ayarları'
      };
      document.getElementById('page-title').textContent = titles[tab] || 'Admin Panel';
      
      // Load tab data
      loadTabData(tab);
    });
  });
}

// Teklifbul Rule v1.0 - Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// User filters
function bindUserFilters() {
  const searchInput = document.getElementById('user-search');
  const planFilter = document.getElementById('user-filter-plan');
  const statusFilter = document.getElementById('user-filter-status');
  const authFilter = document.getElementById('user-filter-auth');
  
  const applyFilters = debounce(() => {
    loadUsers();
  }, 300);
  
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
  if (planFilter) {
    planFilter.addEventListener('change', applyFilters);
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }
  if (authFilter) {
    authFilter.addEventListener('change', applyFilters);
  }
}

// Load users
async function loadUsers() {
  const container = document.getElementById('users-table-container');
  if (!container) return;
  
  // Teklifbul Rule v1.0 - XSS Protection
  container.innerHTML = DOMPurify.sanitize('<div class="loading">Yükleniyor...</div>', {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });

  try {
    const planFilter = document.getElementById('user-filter-plan')?.value || 'all';
    const statusFilter = document.getElementById('user-filter-status')?.value || 'all';
    const authFilter = document.getElementById('user-filter-auth')?.value || 'all';
    const searchTerm = document.getElementById('user-search')?.value.trim().toLowerCase() || '';

    // Plan filtresini API seviyesinde uygula - Teklifbul Rule v1.0 - Performans optimizasyonu
    // Limit'i düşür, sadece gerekli veriyi çek (200'den 100'e düşürüldü)
    // Auth kontrolü aktif (kullanıcı auth tablosunda var mı görmek için)
    let url = `${API_BASE_URL}/api/admin/users/list?limit=100&checkAuth=true`;
    if (planFilter === 'free') {
      url += `&planId=free`;
    } else if (planFilter === 'premium') {
      url += `&planId=premium&planId=premium_monthly&planId=premium_yearly`;
    } else if (planFilter === 'premium_plus') {
      url += `&planId=premium_plus&planId=premium_plus_monthly&planId=premium_plus_yearly`;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) throw new Error('Kullanıcılar yüklenemedi');

    const data = await response.json();
    let users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = DOMPurify.sanitize('<div class="loading">Kullanıcı bulunamadı</div>', {
        ALLOWED_TAGS: ['div'],
        ALLOWED_ATTR: ['class']
      });
      return;
    }

    // Client-side filtreler: status + auth + search (backend'de desteklenmiyor)
    users = users.filter(user => {
      // Arama filtresi
      const haystack = `${user.displayName || user.name || ''} ${user.email || ''} ${user.companyName || ''}`.toLowerCase();
      const searchMatch = searchTerm ? haystack.includes(searchTerm) : true;
      const isActive = user.isActive !== false;
      const authExists = user.authExists === true;
      const authExistsFalse = user.authExists === false;
      const authExistsNull = user.authExists === null || user.authExists === undefined;
      
      // Durum filtresi
      let statusMatch = true;
      if (statusFilter === 'active') {
        statusMatch = isActive;
      } else if (statusFilter === 'inactive') {
        statusMatch = !isActive || authExistsFalse;
      }
      
      // Auth filtresi
      let authMatch = true;
      if (authFilter === 'exists') {
        authMatch = authExists;
      } else if (authFilter === 'missing') {
        authMatch = authExistsFalse;
      } else if (authFilter === 'unknown') {
        authMatch = authExistsNull;
      }

      // Plan normalizasyonu (backend'de zaten filtrelendi, sadece kontrol)
      const plan = (user.planId || 'free').toString();
      const isPrem = user.isPremium === true;
      const planMatch =
        planFilter === 'all'
          ? true
          : planFilter === 'free'
            ? !isPrem && plan === 'free'
            : planFilter === 'premium'
              ? (isPrem && !plan.startsWith('premium_plus')) || plan === 'premium' || plan === 'premium_monthly' || plan === 'premium_yearly'
              : planFilter === 'premium_plus'
                ? plan === 'premium_plus' || plan === 'premium_plus_monthly' || plan === 'premium_plus_yearly'
                : true;

      return statusMatch && authMatch && planMatch && searchMatch;
    });

    let html = '<table class="admin-table"><thead><tr>';
    html += '<th>Ad Soyad</th><th>Email</th><th>Firma</th><th>Vergi No</th><th>Plan</th><th>Durum</th><th>Auth</th><th>İşlemler</th>';
    html += '</tr></thead><tbody>';

    users.forEach(user => {
      const plan = user.planId || 'free';
      const authExists = user.authExists === true;
      const authExistsFalse = user.authExists === false;
      const authExistsNull = user.authExists === null || user.authExists === undefined;
      const isActive = user.isActive !== false;
      
      let status, statusBadge;
      if (authExistsFalse || !isActive) {
        status = 'Pasif';
        statusBadge = 'badge-danger';
      } else {
        status = 'Aktif';
        statusBadge = 'badge-success';
      }
      
      let authStatus, authBadge;
      if (authExistsNull) {
        authStatus = 'Bilinmiyor';
        authBadge = 'badge-secondary';
      } else if (authExists) {
        authStatus = 'Auth\'ta Var';
        authBadge = 'badge-success';
      } else {
        authStatus = 'Auth\'ta Yok';
        authBadge = 'badge-warning';
      }
      
      html += `<tr data-uid="${DOMPurify.sanitize(user.uid)}">`;
      html += `<td>${DOMPurify.sanitize(user.displayName || user.name || '-')}</td>`;
      html += `<td>${DOMPurify.sanitize(user.email || '-')}</td>`;
      html += `<td>${DOMPurify.sanitize(user.companyName || '-')}</td>`;
      html += `<td>${DOMPurify.sanitize(user.taxId || '-')}</td>`;
      html += `<td><span class="badge badge-info">${DOMPurify.sanitize(plan)}</span></td>`;
      html += `<td><span class="badge ${statusBadge}">${DOMPurify.sanitize(status)}</span></td>`;
      html += `<td><span class="badge ${authBadge}">${DOMPurify.sanitize(authStatus)}</span></td>`;
      html += `<td>
        <button class="btn btn-sm btn-primary user-edit-btn" data-uid="${DOMPurify.sanitize(user.uid)}">Düzenle</button>
      </td>`;
      html += `</tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = DOMPurify.sanitize(html, { ALLOWED_ATTR: ['class','data-uid'] });
    
    // Teklifbul Rule v1.0 - Event delegation
    container.querySelectorAll('.user-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-uid');
        if (uid) {
          editUser(uid);
        }
      });
    });
  } catch (error) {
    logger.error('Kullanıcılar yüklenemedi', error);
    container.innerHTML = DOMPurify.sanitize('<div class="error-message">Kullanıcılar yüklenemedi</div>', {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['class']
    });
  }
}

// Edit user (global function for onclick)
window.editUser = async function(userId) {
  const modal = document.getElementById('user-edit-modal');
  const loadingText = document.getElementById('edit-loading-text');
  
  if (!modal) {
    toast.error('Modal bulunamadı');
    return;
  }
  
  // Modal'ı hemen göster ve loading göster
  modal.style.display = 'flex';
  if (loadingText) {
    loadingText.style.display = 'block';
  }
  
  // Form alanlarını temizle
  const editUserId = document.getElementById('edit-user-id');
  const editUserEmail = document.getElementById('edit-user-email');
  const editUserName = document.getElementById('edit-user-name');
  const editUserCompany = document.getElementById('edit-user-company');
  const editUserTaxId = document.getElementById('edit-user-tax-id');
  const editUserJoinCode = document.getElementById('edit-user-join-code');
  const editUserEmailVerified = document.getElementById('edit-user-email-verified');
  const editUserStatus = document.getElementById('edit-user-status');
  
  // Form alanlarını disable et (yüklenene kadar)
  [editUserName, editUserCompany, editUserTaxId, editUserEmailVerified, editUserStatus, editUserJoinCode].forEach(el => {
    if (el) el.disabled = true;
  });
  
  try {
    logger.info('Kullanıcı bilgileri yükleniyor', { userId });
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Kullanıcı bilgileri alınamadı');
    }
    
    const user = await response.json();
    logger.info('Kullanıcı bilgileri alındı', { userId, hasData: !!user });
    
    // Populate edit form - HTML'deki gerçek ID'leri kullan
    if (editUserId) editUserId.value = user.uid || user.id || userId || '';
    if (editUserEmail) editUserEmail.value = user.email || user.contactEmails?.[0] || '';
    if (editUserName) editUserName.value = user.displayName || user.name || '';
    if (editUserCompany) editUserCompany.value = user.companyName || user.company?.name || '';
    if (editUserTaxId) editUserTaxId.value = user.taxId || user.taxNumber || '';
    if (editUserJoinCode) editUserJoinCode.value = user.companyCode || '';
    if (editUserEmailVerified) {
      editUserEmailVerified.value = (user.emailVerified === true || user.emailVerified === 'true') ? 'true' : 'false';
    }
    if (editUserStatus) {
      const isActive = user.isActive !== false && user.status !== 'inactive';
      editUserStatus.value = isActive ? 'active' : 'inactive';
    }
    
    // Form alanlarını enable et
    [editUserName, editUserCompany, editUserTaxId, editUserEmailVerified, editUserStatus, editUserJoinCode].forEach(el => {
      if (el) el.disabled = false;
    });
    
    // Loading'i gizle
    if (loadingText) {
      loadingText.style.display = 'none';
    }
    
    logger.info('Kullanıcı formu dolduruldu', { 
      userId,
      hasName: !!editUserName?.value,
      hasCompany: !!editUserCompany?.value,
      hasTaxId: !!editUserTaxId?.value
    });
  } catch (error) {
    logger.error('Kullanıcı düzenleme hatası', error);
    toast.error(`Kullanıcı bilgileri alınamadı: ${error.message || 'Bilinmeyen hata'}`);
    
    // Loading'i gizle ve modal'ı kapat
    if (loadingText) {
      loadingText.style.display = 'none';
    }
    modal.style.display = 'none';
    
    // Form alanlarını enable et (hata olsa bile)
    [editUserName, editUserCompany, editUserTaxId, editUserEmailVerified, editUserStatus, editUserJoinCode].forEach(el => {
      if (el) el.disabled = false;
    });
  }
};

// Save user
const editUserForm = document.getElementById('user-edit-form');
if (editUserForm) {
  editUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('edit-user-id')?.value;
    if (!userId) {
      toast.error('Kullanıcı ID bulunamadı');
      return;
    }
    
    // HTML'deki gerçek ID'leri kullan
    const editUserName = document.getElementById('edit-user-name');
    const editUserCompany = document.getElementById('edit-user-company');
    const editUserTaxId = document.getElementById('edit-user-tax-id');
    const editUserJoinCode = document.getElementById('edit-user-join-code');
    const editUserStatus = document.getElementById('edit-user-status');
    const editUserEmailVerified = document.getElementById('edit-user-email-verified');
    
    const updates = {
      displayName: editUserName?.value?.trim() || '',
      companyName: editUserCompany?.value?.trim() || '',
      taxId: editUserTaxId?.value?.trim() || '',
      isActive: editUserStatus?.value === 'active',
    };
    
    if (editUserJoinCode && editUserJoinCode.value?.trim()) {
      updates.companyJoinCode = editUserJoinCode.value.trim().toUpperCase();
    }
    
    // Email verified güncellemesi
    if (editUserEmailVerified) {
      updates.emailVerified = editUserEmailVerified.value === 'true';
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) throw new Error('Kullanıcı güncellenemedi');
      
      toast.success('Kullanıcı güncellendi');
      const modal = document.getElementById('user-edit-modal');
      if (modal) modal.style.display = 'none';
      await loadUsers();
    } catch (error) {
      logger.error('Kullanıcı güncelleme hatası', error);
      toast.error('Kullanıcı güncellenemedi');
    }
  });
}

// Close modal
const editModalClose = document.getElementById('btn-cancel-edit');
if (editModalClose) {
  editModalClose.addEventListener('click', () => {
    const modal = document.getElementById('user-edit-modal');
    if (modal) modal.style.display = 'none';
  });
}

// Load tab data
async function loadTabData(tab) {
  switch (tab) {
    case 'users':
      await loadUsers();
      break;
    case 'subscriptions':
      await loadSubscriptions();
      // Teklifbul Rule v1.0 - Arama ve filtreleme event listener'ları
      setTimeout(() => {
        const subscriptionSearch = document.getElementById('subscription-search');
        const subscriptionFilterPlan = document.getElementById('subscription-filter-plan');
        if (subscriptionSearch && !subscriptionSearch.dataset.listenerAdded) {
          subscriptionSearch.dataset.listenerAdded = 'true';
          subscriptionSearch.addEventListener('input', debounce(() => loadSubscriptions(), 300));
        }
        if (subscriptionFilterPlan && !subscriptionFilterPlan.dataset.listenerAdded) {
          subscriptionFilterPlan.dataset.listenerAdded = 'true';
          subscriptionFilterPlan.addEventListener('change', () => loadSubscriptions());
        }
      }, 100);
      break;
    case 'logs':
      await loadLogs();
      break;
    case 'errors':
      await loadErrors();
      break;
    case 'settings':
      await loadSettings();
      break;
  }
}

// Plan definitions - Teklifbul Rule v1.0 - Şirket plan değiştirme için
const planDefinitions = {
  free: {
    id: 'free',
    name: 'Ücretsiz Plan',
    amount: 0,
    features: ['Sınırlı teklif oluşturma', 'Temel raporlar', 'Standart destek'],
    aiAccess: false
  },
  premium_monthly: {
    id: 'premium_monthly',
    name: 'Premium Aylık',
    amount: 359,
    features: ['Sınırsız teklif ve depo', 'Temel raporlar', 'Öncelikli destek'],
    aiAccess: false
  },
  premium_yearly: {
    id: 'premium_yearly',
    name: 'Premium Yıllık',
    amount: 3949,
    features: ['Sınırsız teklif ve depo', 'Temel raporlar', 'Öncelikli destek', 'Yıllık ödeme avantajı'],
    aiAccess: false
  },
  premium_plus_monthly: {
    id: 'premium_plus_monthly',
    name: 'Premium Plus Aylık',
    amount: 600,
    features: ['Sınırsız teklif ve depo', 'AI satın alma asistanı (token paketi ile)', 'Gelişmiş raporlar', 'Öncelikli destek', 'AI özelliklerine erişim'],
    aiAccess: true
  },
  premium_plus_yearly: {
    id: 'premium_plus_yearly',
    name: 'Premium Plus Yıllık',
    amount: 6600,
    features: ['Sınırsız teklif ve depo', 'AI satın alma asistanı (token paketi ile)', 'Gelişmiş raporlar', 'Öncelikli destek', 'Yıllık ödeme avantajı', 'AI özelliklerine erişim'],
    aiAccess: true
  }
};

// Şirket subscription cache - Teklifbul Rule v1.0
let currentCompanies = [];

// Şirket subscription düzenleme - Teklifbul Rule v1.0
async function editCompanySubscription(companyId) {
  try {
    // Şirket bilgilerini al
    let company = currentCompanies.find(c => c.companyId === companyId);
    if (!company) {
      // Eğer cache'de yoksa API'den al
      const response = await fetch(`${API_BASE_URL}/api/admin/companies/${companyId}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      
      if (!response.ok) {
        toast.error('Şirket bilgileri alınamadı');
        return;
      }
      
      const data = await response.json();
      company = data.company || data;
    }
    
    showCompanyPlanEditModal(company);
  } catch (error) {
    logger.error('Şirket subscription modal hatası', error);
    toast.error('Modal açılamadı');
  }
}

function showCompanyPlanEditModal(company) {
  const currentPlanId = company.planId || 'free';
  
  // Modal oluştur
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.right = '0';
  modal.style.bottom = '0';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.style.zIndex = '1000';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  
  const planOptions = Object.values(planDefinitions).map(plan => {
    const isSelected = plan.id === currentPlanId;
    const safePlanId = DOMPurify.sanitize(plan.id || '', { ALLOWED_TAGS: [] });
    const safePlanName = DOMPurify.sanitize(plan.name || '', { ALLOWED_TAGS: [] });
    const aiBadge = plan.aiAccess ? '<span class="badge badge-success" style="margin-left: 8px;">🤖 AI Erişimi</span>' : '';
    const safeFeatures = plan.features.map(f => {
      const safeFeature = DOMPurify.sanitize(f || '', { ALLOWED_TAGS: [] });
      return `<li>${safeFeature}</li>`;
    }).join('');
    
    return `
      <label style="display: block; padding: 12px; margin: 8px 0; border: 2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}; border-radius: 8px; cursor: pointer; background: ${isSelected ? '#eff6ff' : '#fff'};">
        <input type="radio" name="planId" value="${safePlanId}" ${isSelected ? 'checked' : ''} style="margin-right: 8px;">
        <strong>${safePlanName}</strong> ${aiBadge}
        <div style="margin-top: 4px; color: #6b7280; font-size: 14px;">
          ${plan.amount > 0 ? `₺${plan.amount.toLocaleString('tr-TR')} / ${plan.id.includes('yearly') ? 'yıl' : 'ay'}` : 'Ücretsiz'}
        </div>
        <ul style="margin: 8px 0 0 24px; padding: 0; color: #4b5563; font-size: 13px;">
          ${safeFeatures}
        </ul>
      </label>
    `;
  }).join('');
  
  const expiresAtValue = company.expiresAt ? new Date(company.expiresAt).toISOString().slice(0, 16) : '';
  
  const safeCompanyName = DOMPurify.sanitize(company.companyName || '', { ALLOWED_TAGS: [] });
  const safeTaxId = DOMPurify.sanitize(company.taxId || '', { ALLOWED_TAGS: [] });
  const safeCurrentPlan = DOMPurify.sanitize(planDefinitions[currentPlanId]?.name || currentPlanId || '', { ALLOWED_TAGS: [] });
  const safePlanOptions = DOMPurify.sanitize(planOptions, {
    ALLOWED_TAGS: ['label', 'input', 'strong', 'span', 'div', 'ul', 'li'],
    ALLOWED_ATTR: ['style', 'class', 'type', 'name', 'value', 'checked']
  });
  
  modal.innerHTML = DOMPurify.sanitize(`
    <div class="modal-content" style="max-width: 700px; background: white; padding: 24px; border-radius: 8px; max-height: 90vh; overflow-y: auto;">
      <span class="close modal-close-btn" style="float: right; font-size: 28px; font-weight: bold; cursor: pointer; color: #aaa;">&times;</span>
      <h2>Şirket Planı Değiştir</h2>
      <div style="margin-top: 20px;">
        <p><strong>Şirket:</strong> ${safeCompanyName}</p>
        <p><strong>Vergi No:</strong> ${safeTaxId}</p>
        <p><strong>Kullanıcı Sayısı:</strong> ${company.userCount || 0}</p>
        <p><strong>Mevcut Plan:</strong> ${safeCurrentPlan}</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          <em>Not: Plan değişikliği şirketteki tüm kullanıcıları etkiler.</em>
        </p>
      </div>
      <form id="company-plan-change-form" style="margin-top: 20px;">
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 12px; font-weight: 600;">Yeni Plan Seçin:</label>
          ${safePlanOptions}
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600;">Bitiş Tarihi (Opsiyonel):</label>
          <input type="datetime-local" id="company-plan-expires-at" value="${expiresAtValue}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
          <small style="color: #6b7280;">Boş bırakılırsa planın varsayılan süresi kullanılır</small>
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600;">Başlangıç Tarihi (Opsiyonel):</label>
          <input type="datetime-local" id="company-plan-started-at" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
          <small style="color: #6b7280;">Boş bırakılırsa şu anki tarih kullanılır</small>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn btn-secondary modal-close-btn">İptal</button>
          <button type="submit" class="btn btn-primary">Planı Değiştir</button>
        </div>
      </form>
    </div>
  `, {
    ALLOWED_TAGS: ['div', 'span', 'h2', 'p', 'strong', 'button', 'form', 'label', 'input', 'ul', 'li', 'small', 'em'],
    ALLOWED_ATTR: ['class', 'style', 'type', 'name', 'value', 'checked', 'id']
  });
  
  document.body.appendChild(modal);
  
  // Form submit handler
  const form = modal.querySelector('#company-plan-change-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const planId = formData.get('planId');
      const expiresAtInput = modal.querySelector('#company-plan-expires-at');
      const startedAtInput = modal.querySelector('#company-plan-started-at');
      const expiresAt = expiresAtInput?.value || '';
      const startedAt = startedAtInput?.value || '';
      
      try {
        toast.info('Plan değiştiriliyor...');
        
        const updateData = { planId };
        if (expiresAt) updateData.expiresAt = new Date(expiresAt).toISOString();
        if (startedAt) updateData.startedAt = new Date(startedAt).toISOString();
        
        const response = await fetch(`${API_BASE_URL}/api/admin/companies/${company.companyId}/subscription`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Plan değiştirilemedi');
        }
        
        toast.success('Plan başarıyla güncellendi');
        modal.remove();
        await loadSubscriptions();
      } catch (error) {
        logger.error('Plan değiştirme hatası', error);
        const errorMessage = error?.message || error?.toString() || 'Bilinmeyen hata';
        toast.error(`Plan değiştirilemedi: ${errorMessage}`);
      }
    });
  }
  
  // Close button handlers - Teklifbul Rule v1.0 - CSP uyumlu
  modal.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Load subscriptions
async function loadSubscriptions() {
  const container = document.getElementById('subscriptions-table-container');
  if (!container) return;
  
  // Teklifbul Rule v1.0 - XSS Protection
  container.innerHTML = DOMPurify.sanitize('<div class="loading">Yükleniyor...</div>', {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });

  try {
    const planFilter = document.getElementById('subscription-filter-plan')?.value || 'all';
    const searchTerm = document.getElementById('subscription-search')?.value.trim().toLowerCase() || '';
    
    let url = `${API_BASE_URL}/api/admin/companies/subscriptions?limit=200`;
    if (planFilter !== 'all') {
      url += `&planId=${planFilter}`;
    }
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) throw new Error('Şirket abonelikleri yüklenemedi');

    const data = await response.json();
    let companies = data.companies || [];
    currentCompanies = companies; // Cache'e kaydet

    if (companies.length === 0) {
      container.innerHTML = DOMPurify.sanitize('<div class="loading">Şirket bulunamadı</div>', {
        ALLOWED_TAGS: ['div'],
        ALLOWED_ATTR: ['class']
      });
      return;
    }

    // Arama filtresi
    if (searchTerm) {
      companies = companies.filter(company => {
        const haystack = `${company.companyName || ''} ${company.taxId || ''}`.toLowerCase();
        return haystack.includes(searchTerm);
      });
    }

    if (companies.length === 0) {
      container.innerHTML = DOMPurify.sanitize('<div class="loading">Arama sonucu bulunamadı</div>', {
        ALLOWED_TAGS: ['div'],
        ALLOWED_ATTR: ['class']
      });
      return;
    }

    let html = '<table class="admin-table"><thead><tr>';
    html += '<th>Şirket Adı</th><th>Vergi No</th><th>Plan</th><th>Bitiş Tarihi</th><th>Durum</th><th>Kullanıcı Sayısı</th><th>İşlemler</th>';
    html += '</tr></thead><tbody>';

    companies.forEach(company => {
      let statusText = 'Aktif';
      let statusBadge = 'badge-success';
      
      if (company.status === 'expired') {
        statusText = 'Süresi Dolmuş';
        statusBadge = 'badge-danger';
      } else if (company.status === 'active') {
        statusText = 'Aktif';
        statusBadge = 'badge-success';
      } else if (company.isDeleted) {
        statusText = 'Silinmiş';
        statusBadge = 'badge-secondary';
      }
      
      let planDisplay = company.planId || 'free';
      const planLabels = {
        'free': 'Free',
        'premium_monthly': 'Premium (Aylık)',
        'premium_yearly': 'Premium (Yıllık)',
        'premium_plus_monthly': 'Premium Plus (Aylık)',
        'premium_plus_yearly': 'Premium Plus (Yıllık)'
      };
      planDisplay = planLabels[planDisplay] || planDisplay;
      
      const expiresAt = company.expiresAt ? new Date(company.expiresAt).toLocaleDateString('tr-TR') : '-';
      
      html += `<tr data-company-id="${DOMPurify.sanitize(company.companyId)}">`;
      html += `<td>${DOMPurify.sanitize(company.companyName)}</td>`;
      html += `<td>${DOMPurify.sanitize(company.taxId)}</td>`;
      html += `<td><span class="badge badge-info">${DOMPurify.sanitize(planDisplay)}</span></td>`;
      html += `<td>${DOMPurify.sanitize(expiresAt)}</td>`;
      html += `<td><span class="badge ${statusBadge}">${DOMPurify.sanitize(statusText)}</span></td>`;
      html += `<td>${company.userCount || 0}</td>`;
      html += `<td>
        <button class="btn btn-sm btn-primary company-sub-edit-btn" data-company-id="${DOMPurify.sanitize(company.companyId)}">Plan Değiştir</button>
      </td>`;
      html += `</tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = DOMPurify.sanitize(html, { ALLOWED_ATTR: ['class','data-company-id'] });
    
    // Teklifbul Rule v1.0 - Event delegation (CSP uyumlu)
    container.querySelectorAll('.company-sub-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const companyId = btn.getAttribute('data-company-id');
        if (companyId) {
          editCompanySubscription(companyId);
        }
      });
    });
  } catch (error) {
    logger.error('Şirket abonelikleri yüklenemedi', error);
    container.innerHTML = DOMPurify.sanitize('<div class="error-message">Şirket abonelikleri yüklenemedi</div>', {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['class']
    });
  }
}

// Load logs
async function loadLogs() {
  const container = document.getElementById('logs-table-container');
  if (!container) return;
  
  // Teklifbul Rule v1.0 - XSS Protection
  container.innerHTML = DOMPurify.sanitize('<div class="loading">Yükleniyor...</div>', {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });

  try {
    // Filtreleri al
    const eventType = document.getElementById('log-filter-type')?.value || 'all';
    const period = document.getElementById('log-filter-period')?.value || '24h';
    
    const url = `${API_BASE_URL}/api/admin/logs?limit=200&eventType=${encodeURIComponent(eventType)}&period=${encodeURIComponent(period)}`;
    logger.info('Loglar yükleniyor', { eventType, period, url });
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Loglar yüklenemedi');
    }

    const data = await response.json();
    const logs = data.logs || [];

    logger.info('Loglar alındı', { count: logs.length, eventType, period });

    if (logs.length === 0) {
      container.innerHTML = DOMPurify.sanitize('<div class="loading">Seçilen kriterlere uygun log bulunamadı</div>', {
        ALLOWED_TAGS: ['div'],
        ALLOWED_ATTR: ['class']
      });
      return;
    }

    let html = '<table class="admin-table"><thead><tr>';
    html += '<th>Tarih/Saat</th><th>Olay Tipi</th><th>Kullanıcı</th><th>Endpoint</th><th>IP</th><th>Mesaj</th>';
    html += '</tr></thead><tbody>';

    logs.forEach(log => {
      const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString('tr-TR') : '-';
      const eventType = log.eventType || log.level || log.type || 'unknown';
      const userId = log.userId || log.user || log.email || log.actorEmail || '-';
      const method = log.method || '';
      const path = log.path || log.endpoint || log.url || '-';
      const ip = log.ip || log.clientIp || log.remoteAddress || '-';
      const message = log.message || log.msg || log.error || log.description || '-';
      
      // Event type'a göre badge rengi
      let badgeClass = 'badge-warning';
      if (eventType.toLowerCase().includes('error') || eventType.toLowerCase().includes('failure')) {
        badgeClass = 'badge-danger';
      } else if (eventType.toLowerCase().includes('admin') || eventType.toLowerCase().includes('action')) {
        badgeClass = 'badge-info';
      } else if (eventType.toLowerCase().includes('rate') || eventType.toLowerCase().includes('limit')) {
        badgeClass = 'badge-warning';
      }
      
      html += `<tr>`;
      html += `<td>${DOMPurify.sanitize(timestamp)}</td>`;
      html += `<td><span class="badge ${badgeClass}">${DOMPurify.sanitize(eventType)}</span></td>`;
      html += `<td>${DOMPurify.sanitize(userId)}</td>`;
      html += `<td>${DOMPurify.sanitize(method)} ${DOMPurify.sanitize(path)}</td>`;
      html += `<td>${DOMPurify.sanitize(ip)}</td>`;
      html += `<td title="${DOMPurify.sanitize(message)}">${DOMPurify.sanitize(message.length > 100 ? message.substring(0, 100) + '...' : message)}</td>`;
      html += `</tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = DOMPurify.sanitize(html);
  } catch (error) {
    logger.error('Loglar yüklenemedi', error);
    const errorMessage = error?.message || error?.toString() || 'Bilinmeyen hata';
    container.innerHTML = DOMPurify.sanitize(`<div class="error-message">Loglar yüklenemedi: ${DOMPurify.sanitize(errorMessage)}</div>`, {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['class']
    });
  }
}

// Log filters - event listener'ları ekle
function bindLogFilters() {
  const logFilterType = document.getElementById('log-filter-type');
  const logFilterPeriod = document.getElementById('log-filter-period');
  
  if (logFilterType) {
    logFilterType.addEventListener('change', () => {
      loadLogs();
    });
  }
  
  if (logFilterPeriod) {
    logFilterPeriod.addEventListener('change', () => {
      loadLogs();
    });
  }
}

// Errors module - seçili hataları takip et
let currentErrors = [];
let selectedErrorIds = new Set();

// Render error statistics bar
function renderErrorStats(errors) {
  const total = errors.length;
  const critical = errors.filter(e => e.severity === 'critical').length;
  const high = errors.filter(e => e.severity === 'high').length;
  const medium = errors.filter(e => e.severity === 'medium').length;
  const low = errors.filter(e => e.severity === 'low').length;
  const unresolved = errors.filter(e => !e.resolved).length;
  const aiAnalyzed = errors.filter(e => e.aiAnalyzed).length;
  
  return `
    <div class="error-stats-bar">
      <div class="error-stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">Toplam Hata</div>
      </div>
      <div class="error-stat-card critical">
        <div class="stat-value">${critical}</div>
        <div class="stat-label">Kritik</div>
      </div>
      <div class="error-stat-card">
        <div class="stat-value">${high}</div>
        <div class="stat-label">Yüksek</div>
      </div>
      <div class="error-stat-card">
        <div class="stat-value">${unresolved}</div>
        <div class="stat-label">Çözülmemiş</div>
      </div>
      <div class="error-stat-card">
        <div class="stat-value">${aiAnalyzed}</div>
        <div class="stat-label">AI Analiz Edilmiş</div>
      </div>
    </div>
  `;
}

// Load errors
async function loadErrors() {
  const container = document.getElementById('errors-table-container');
  if (!container) return;
  
  // Teklifbul Rule v1.0 - XSS Protection
  container.innerHTML = DOMPurify.sanitize('<div class="loading">🔄 Hatalar yükleniyor...</div>', {
    ALLOWED_TAGS: ['div'],
    ALLOWED_ATTR: ['class']
  });

  try {
    const typeFilter = document.getElementById('error-filter-type')?.value || 'all';
    const severityFilter = document.getElementById('error-filter-severity')?.value || 'all';
    // PERFORMANS: Varsayılan olarak sadece çözülmemiş hataları göster
    const resolvedFilter = document.getElementById('error-filter-resolved')?.value || 'false';
    const searchQuery = document.getElementById('error-search')?.value || '';

    const params = new URLSearchParams({
      limit: '100',
      offset: '0',
      orderBy: 'timestamp',
      orderDirection: 'desc'
    });

    if (typeFilter !== 'all') params.append('type', typeFilter);
    if (severityFilter !== 'all') params.append('severity', severityFilter);
    if (resolvedFilter !== 'all') params.append('resolved', resolvedFilter);
    if (searchQuery) params.append('search', searchQuery);

    const response = await fetch(`${API_BASE_URL}/api/admin/errors?${params}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Index hatası kontrolü
      if (errorData.error === 'index_required' && errorData.indexLink) {
        const createIndex = confirm(
          'Firestore index gerekli. Index oluşturmak için Firebase Console\'a gitmek ister misiniz?\n\n' +
          'Index oluşturulduktan sonra birkaç dakika bekleyip sayfayı yenileyin.'
        );
        if (createIndex) {
          window.open(errorData.indexLink, '_blank');
        }
        container.innerHTML = DOMPurify.sanitize(`
          <div style="text-align:center; padding:40px;">
            <div style="color:#ef4444; font-size:18px; font-weight:600; margin-bottom:16px;">
              ⚠️ Firestore Index Gerekli
            </div>
            <p style="color:#6b7280; margin-bottom:20px;">
              Hataları görüntülemek için Firestore index oluşturmanız gerekiyor.
            </p>
            <p style="color:#6b7280; margin-top:20px; font-size:13px;">
              Index oluşturulduktan sonra birkaç dakika bekleyip sayfayı yenileyin.
            </p>
          </div>
        `, { ALLOWED_TAGS: ['div', 'p'], ALLOWED_ATTR: ['style'] });
        return;
      }
      
      throw new Error(errorData.message || 'Hatalar yüklenemedi');
    }

    const data = await response.json();
    currentErrors = data.errors || [];

    if (currentErrors.length === 0) {
      const filterInfo = resolvedFilter === 'false' ? ' (Çözülmemiş filtresi aktif)' : '';
      container.innerHTML = DOMPurify.sanitize(`
        <div style="text-align:center; padding:40px;">
          <div style="font-size:48px; margin-bottom:16px;">✅</div>
          <div style="font-size:18px; font-weight:600; color:#065f46; margin-bottom:8px;">Hata bulunamadı${filterInfo}</div>
          <p style="color:#6b7280; font-size:14px;">Sistemde kayıtlı hata bulunmuyor veya seçilen filtrelere uygun hata yok.</p>
          ${resolvedFilter === 'false' ? '<p style="color:#6b7280; font-size:13px; margin-top:8px;">💡 Tüm hataları görmek için durum filtresini "Tüm Durumlar" yapabilirsiniz.</p>' : ''}
        </div>
      `, { ALLOWED_TAGS: ['div', 'p'], ALLOWED_ATTR: ['style'] });
      return;
    }

    renderErrorsTable(currentErrors);
  } catch (error) {
    logger.error('Hatalar yüklenemedi', error);
    const errorMessage = error?.message || error?.toString() || 'Bilinmeyen hata';
    container.innerHTML = DOMPurify.sanitize(`
      <div class="error-message">
        <strong>❌ Hatalar yüklenemedi</strong><br>
        <span style="font-size:13px;">${DOMPurify.sanitize(errorMessage)}</span>
      </div>
    `, {
      ALLOWED_TAGS: ['div', 'strong', 'br', 'span'],
      ALLOWED_ATTR: ['class', 'style']
    });
  }
}

// Render errors table with checkboxes
function renderErrorsTable(errors) {
  const container = document.getElementById('errors-table-container');
  if (!container) return;
  
  // Teklifbul Rule v1.0 - Error statistics bar
  let html = renderErrorStats(errors);
  
  html += '<table class="admin-table"><thead><tr>';
  html += '<th><input type="checkbox" id="select-all-errors" title="Tümünü Seç/Kaldır"></th>';
  html += '<th>Tarih</th><th>Tip</th><th>Önem</th><th>Mesaj</th><th>Kod</th><th>Sayı</th><th>Durum</th><th>İşlemler</th>';
  html += '</tr></thead><tbody>';

  errors.forEach(error => {
    const timestamp = error.timestamp ? new Date(error.timestamp).toLocaleString('tr-TR') : '-';
    const severityClass = {
      critical: 'badge-danger',
      high: 'badge-danger',
      medium: 'badge-warning',
      low: 'badge-info'
    }[error.severity] || 'badge-info';
    
    const isSelected = selectedErrorIds.has(error.id);
    
    // Çözülen hatalar için stil (daha soluk görünsün ama görünür kalsın)
    const resolvedStyle = error.resolved ? 'style="opacity: 0.5; background-color: #f0f0f0;"' : '';
    html += `<tr ${resolvedStyle}>`;
    html += `<td><input type="checkbox" class="error-checkbox" data-error-id="${DOMPurify.sanitize(error.id)}" ${isSelected ? 'checked' : ''}></td>`;
    html += `<td>${DOMPurify.sanitize(timestamp)}</td>`;
    html += `<td><span class="badge">${DOMPurify.sanitize(error.type || '-')}</span></td>`;
    html += `<td><span class="badge ${severityClass}">${DOMPurify.sanitize(error.severity || '-')}</span></td>`;
    html += `<td title="${DOMPurify.sanitize(error.message || '')}">${DOMPurify.sanitize((error.message || '').substring(0, 50) + (error.message?.length > 50 ? '...' : ''))}</td>`;
    html += `<td>${DOMPurify.sanitize(error.code || '-')}</td>`;
    html += `<td>${error.count || 1}</td>`;
    html += `<td><span class="badge ${error.resolved ? 'badge-success' : 'badge-warning'}">${error.resolved ? 'Çözüldü' : 'Çözülmedi'}</span></td>`;
    html += `<td>`;
    html += `<button class="btn btn-sm btn-primary error-detail-btn" data-error-id="${DOMPurify.sanitize(error.id)}">Detay</button> `;
    if (!error.resolved) {
      html += `<button class="btn btn-sm btn-success error-resolve-btn" data-error-id="${DOMPurify.sanitize(error.id)}">Çözüldü</button> `;
    }
    html += `<button class="btn btn-sm btn-info error-analyze-btn" data-error-id="${DOMPurify.sanitize(error.id)}">AI Analiz</button>`;
    html += `</td>`;
    html += `</tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'button', 'span'],
    ALLOWED_ATTR: ['class', 'type', 'id', 'data-error-id', 'checked', 'title', 'onclick', 'style']
  });

  // Checkbox event listeners
  const selectAllCheckbox = document.getElementById('select-all-errors');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('.error-checkbox').forEach((cb) => {
        cb.checked = checked;
        const errorId = cb.getAttribute('data-error-id');
        if (errorId) {
          if (checked) {
            selectedErrorIds.add(errorId);
          } else {
            selectedErrorIds.delete(errorId);
          }
        }
      });
    });
  }

  document.querySelectorAll('.error-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const errorId = cb.getAttribute('data-error-id');
      if (errorId) {
        if (e.target.checked) {
          selectedErrorIds.add(errorId);
        } else {
          selectedErrorIds.delete(errorId);
        }
        // Tüm seçili checkbox'lar kontrol edildiğinde "Tümünü Seç" checkbox'ını güncelle
        const allCheckboxes = document.querySelectorAll('.error-checkbox');
        const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = allChecked;
        }
      }
    });
  });
  
  // BUTON EVENT LISTENER'LARI - Event delegation kullan
  container.querySelectorAll('.error-detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const errorId = btn.getAttribute('data-error-id');
      if (errorId) {
        viewErrorDetail(errorId);
      }
    });
  });
  
  container.querySelectorAll('.error-resolve-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const errorId = btn.getAttribute('data-error-id');
      if (errorId) {
        if (confirm('Bu hatayı çözüldü olarak işaretlemek istediğinizden emin misiniz?')) {
          await markErrorResolved(errorId);
        }
      }
    });
  });
  
  container.querySelectorAll('.error-analyze-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const errorId = btn.getAttribute('data-error-id');
      if (errorId) {
        await analyzeError(errorId);
      }
    });
  });
}

// Error detail modal
async function viewErrorDetail(errorId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/errors/${errorId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) throw new Error('Hata detayı alınamadı');

    const data = await response.json();
    const error = data.error;

    // Modal oluştur ve göster
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    const safeMessage = DOMPurify.sanitize(error.message || '-', { ALLOWED_TAGS: [] });
    const safeCode = DOMPurify.sanitize(error.code || '-', { ALLOWED_TAGS: [] });
    const safeType = DOMPurify.sanitize(error.type || '-', { ALLOWED_TAGS: [] });
    const safeSeverity = DOMPurify.sanitize(error.severity || '-', { ALLOWED_TAGS: [] });
    const safeUrl = DOMPurify.sanitize(error.url || error.path || '-', { ALLOWED_TAGS: [] });
    const safeUser = DOMPurify.sanitize(error.userEmail || error.userId || '-', { ALLOWED_TAGS: [] });
    const safeStack = error.stack ? DOMPurify.sanitize(error.stack, { ALLOWED_TAGS: [] }) : '';
    const safeSummary = error.aiAnalysis ? DOMPurify.sanitize(error.aiAnalysis.summary || '-', { ALLOWED_TAGS: [] }) : '';
    const safeSuggestedFix = error.aiAnalysis ? DOMPurify.sanitize(error.aiAnalysis.suggestedFix || '-', { ALLOWED_TAGS: [] }) : '';
    const aiProvider = error.aiAnalysis?.provider || error.aiAnalysis?.aiProvider || 'Gemini (varsayılan)';
    
    const aiAnalysisHtml = error.aiAnalysis ? `
      <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 5px;">
        <h3>🤖 AI Analiz</h3>
        <p><strong>AI Sağlayıcı:</strong> ${DOMPurify.sanitize(aiProvider, { ALLOWED_TAGS: [] })}</p>
        <p><strong>Özet:</strong> ${safeSummary}</p>
        <p><strong>Önerilen Çözüm:</strong> ${safeSuggestedFix}</p>
        <p><strong>Güven:</strong> ${(error.aiAnalysis.confidence * 100).toFixed(0)}%</p>
        ${error.aiAnalysis.analyzedAt ? `<p><strong>Analiz Tarihi:</strong> ${new Date(error.aiAnalysis.analyzedAt).toLocaleString('tr-TR')}</p>` : ''}
      </div>
    ` : '';
    
    modal.innerHTML = DOMPurify.sanitize(`
      <div class="modal-content" style="max-width: 800px;">
        <span class="close modal-close-btn">&times;</span>
        <h2>Hata Detayı</h2>
        <div style="margin-top: 20px;">
          <p><strong>Mesaj:</strong> ${safeMessage}</p>
          <p><strong>Kod:</strong> ${safeCode}</p>
          <p><strong>Tip:</strong> ${safeType}</p>
          <p><strong>Önem:</strong> ${safeSeverity}</p>
          <p><strong>Sayı:</strong> ${error.count || 1}</p>
          <p><strong>URL/Path:</strong> ${safeUrl}</p>
          <p><strong>Kullanıcı:</strong> ${safeUser}</p>
          <p><strong>Tarih:</strong> ${error.timestamp ? new Date(error.timestamp).toLocaleString('tr-TR') : '-'}</p>
          ${safeStack ? `<p><strong>Stack Trace:</strong><pre style="background: #f5f5f5; padding: 10px; overflow-x: auto;">${safeStack}</pre></p>` : ''}
          ${aiAnalysisHtml}
        </div>
      </div>
    `, {
      ALLOWED_TAGS: ['div', 'span', 'h2', 'h3', 'p', 'strong', 'pre'],
      ALLOWED_ATTR: ['class', 'style', 'onclick']
    });
    document.body.appendChild(modal);
    
    // Teklifbul Rule v1.0 - CSP uyumlu event listener
    const closeBtn = modal.querySelector('.modal-close-btn') || modal.querySelector('.close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.remove());
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  } catch (error) {
    logger.error('Hata detayı yüklenemedi', error);
    toast.error('Hata detayı yüklenemedi');
  }
}

// Mark error as resolved
async function markErrorResolved(errorId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/errors/${errorId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ resolved: true })
    });

    if (!response.ok) throw new Error('Hata güncellenemedi');

    toast.success('Hata çözüldü olarak işaretlendi');
    await loadErrors();
  } catch (error) {
    logger.error('Hata güncellenemedi', error);
    toast.error('Hata güncellenemedi');
  }
}

// Analyze error with AI
async function analyzeError(errorId) {
  try {
    toast.info('AI analizi başlatılıyor...');
    const response = await fetch(`${API_BASE_URL}/api/admin/errors/${errorId}/analyze`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!response.ok) throw new Error('AI analizi başarısız');

    const data = await response.json();
    toast.success('AI analizi tamamlandı');
    
    // Detay modalını aç
    await viewErrorDetail(errorId);
  } catch (error) {
    logger.error('AI analizi başarısız', error);
    toast.error('AI analizi başarısız');
  }
}

// Global functions (backward compatibility, artık kullanılmıyor - event delegation kullanılıyor)
window.viewErrorDetail = viewErrorDetail;
window.markErrorResolved = markErrorResolved;
window.analyzeError = analyzeError;

// Analyze selected errors - Teklifbul Rule v1.0 - Toplu AI analizi
const btnAnalyzeSelected = document.getElementById('btn-analyze-selected');
if (btnAnalyzeSelected) {
  btnAnalyzeSelected.addEventListener('click', async () => {
    if (selectedErrorIds.size === 0) {
      toast.warn('Lütfen analiz edilecek hataları seçin');
      return;
    }

    try {
      const originalText = btnAnalyzeSelected.textContent;
      btnAnalyzeSelected.disabled = true;
      btnAnalyzeSelected.textContent = `Analiz ediliyor... (${selectedErrorIds.size} hata)`;
      
      toast.info(`${selectedErrorIds.size} hata için AI analizi başlatılıyor...`);
      
      const response = await fetch(`${API_BASE_URL}/api/admin/errors/analyze-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ errorIds: Array.from(selectedErrorIds) })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Toplu analiz başarısız');
      }

      const data = await response.json();
      toast.success(`${data.results?.length || selectedErrorIds.size} hata analiz edildi`);
      
      // Seçimleri temizle ve tabloyu yenile
      selectedErrorIds.clear();
      await loadErrors();
    } catch (error) {
      logger.error('Toplu analiz başarısız', error);
      toast.error(`Toplu analiz başarısız: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      btnAnalyzeSelected.disabled = false;
      btnAnalyzeSelected.textContent = 'Seçili Hataları Analiz Et';
    }
  });
}

// Error filters
const errorFilterType = document.getElementById('error-filter-type');
const errorFilterSeverity = document.getElementById('error-filter-severity');
const errorFilterResolved = document.getElementById('error-filter-resolved');
const errorSearch = document.getElementById('error-search');

if (errorFilterType) errorFilterType.addEventListener('change', loadErrors);
if (errorFilterSeverity) errorFilterSeverity.addEventListener('change', loadErrors);
if (errorFilterResolved) errorFilterResolved.addEventListener('change', loadErrors);

// Error search with debounce
let errorSearchTimeout;
if (errorSearch) {
  errorSearch.addEventListener('input', (e) => {
    clearTimeout(errorSearchTimeout);
    errorSearchTimeout = setTimeout(() => {
      loadErrors();
    }, 500);
  });
}

// Load settings
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (!response.ok) throw new Error('Ayarlar yüklenemedi');
    
    const settings = await response.json();
    
    document.getElementById('setting-free-max-offers').value = settings.free?.maxOffersPerMonth || 0;
    document.getElementById('setting-premium-max-offers').value = settings.premium?.maxOffersPerMonth || 0;
    document.getElementById('setting-premium-plus-max-offers').value = settings.premiumPlus?.maxOffersPerMonth || 0;
    // Teklifbul Rule v1.0 - AI Token Limitleri kaldırıldı (token paketi sistemi kullanılıyor)
  } catch (error) {
    logger.error('Ayarlar yüklenemedi', error);
    toast.error(MESSAGES.ERROR_ADMIN_SETTINGS_LOAD);
  }
}

document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const settings = {
    free: {
      maxOffersPerMonth: parseInt(document.getElementById('setting-free-max-offers').value)
      // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
    },
    premium: {
      maxOffersPerMonth: parseInt(document.getElementById('setting-premium-max-offers').value)
      // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
    },
    premiumPlus: {
      maxOffersPerMonth: parseInt(document.getElementById('setting-premium-plus-max-offers').value)
      // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
    }
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) throw new Error('Ayarlar kaydedilemedi');

    toast.success(MESSAGES.SUCCESS_ADMIN_SETTINGS_SAVED);
  } catch (error) {
    logger.error('Ayarlar kaydetme hatası', error);
    toast.error(MESSAGES.ERROR_ADMIN_SETTINGS_SAVE);
  }
});

// Logout
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  const { logout } = await import('../../firebase.js');
  await logout();
  window.location.href = '/login.html';
});

// Teklifbul Rule v1.0 - Admin kontrolü önce yapılmalı, sayfa gösterilmeden
(async () => {
  const hasAccess = await checkAdminAccess();
  if (!hasAccess) {
    // Admin değilse sayfa zaten gösterilmeyecek (CSS ile gizli)
    return;
  }
  
  // Admin ise sayfa gösterildi, devam et
  // Initialize global header
  try {
    await initGlobalHeader({ mount: '#app-header', activeRoute: 'admin' });
  } catch (error) {
    logger.warn('Global header yüklenemedi', error);
  }
  
  initTabs();
  bindUserFilters();
  bindLogFilters(); // Log filtreleri için event listener'lar
  await loadUsers();
})();

