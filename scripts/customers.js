/**
 * Customers Management - Satış Modülü Faz 1
 * Müşteri CRUD, code generation, validation, soft delete
 * Teklifbul Rule v1.0 - Modüler, DRY, async/await, toast notifications
 */

// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth } from '/firebase.js';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  orderBy,
  limit,
  serverTimestamp,
  startAfter,
  getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '../src/shared/constants/messages.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getCustomerPerms } from '../assets/js/state/permissions.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { debounce } from '../assets/js/utils/debounce.js';

const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

const state = {
  customers: [],
  filteredCustomers: [],
  companyId: null,
  userId: null,
  editingCustomerId: null,
  isUserAdmin: false,
  provinces: [],
  districts: [],
  currentTab: 'all', // 'all', 'cari' veya 'pending'
  canApproveCustomers: false, // Onay yetkisi var mı?
  userRole: null,
  paging: {
    pageSize: 15,
    currentPage: 1,
    lastVisible: null,
    pageHistory: [null], // Page 1 starts at null
    totalItems: 0,
    hasMore: false
  }
};

const CUSTOMER_PERMS = getCustomerPerms();

// Initialize
(async () => {
  try {
    const user = await requireAuth();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }

    state.userId = user.uid;

    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.warn('Customers: company context alınamadı');
      toast.error(MESSAGES.ERROR_CUSTOMER_COMPANY_VERIFY);
      return;
    }

    state.companyId = companyContext.companyId;

    // Permission kontrolü
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Customers: initPermissions sonuç vermedi');
      return;
    }

    // Kullanıcı rolünü al
    const userDoc = await getDoc(doc(db, 'users', state.userId));
    const userData = userDoc.data() || {};
    state.userRole = userData.companyRoleKey || userData.companyRole || '';
    
    // Yönetim kadrosu kontrolü (görseldeki rollere göre)
    state.isUserAdmin = isManagementStaff(state.userRole);
    state.canApproveCustomers = canApproveCustomer(state.userRole);

    if (CUSTOMER_PERMS.view && !can(CUSTOMER_PERMS.view)) {
      toast.error(MESSAGES.ERROR_CUSTOMER_VIEW_PERMISSION);
      logger.warn('Customers: view yetkisi yok');
      window.location.href = '/dashboard.html';
      return;
    }

    // Initial load
    await loadCustomers();
    setupEventListeners();
    
    // URL'den edit parametresini kontrol et
    const urlParams = new URLSearchParams(window.location.search);
    const editCustomerId = urlParams.get('edit');
    if (editCustomerId) {
      await openCustomerModal(editCustomerId);
      // URL'yi temizle
      window.history.replaceState({}, '', '/pages/customers.html');
    }
  } catch (error) {
    logger.error('Customers initialization error', error);
    
    // AUTH_REQUIRED hatası durumunda login sayfasına yönlendir
    if (error.message === 'AUTH_REQUIRED' || error.message?.includes('AUTH_REQUIRED')) {
      logger.warn('Customers: Authentication required, redirecting to login');
      window.location.href = '/index.html';
      return;
    }
    
    toast.error(MESSAGES.ERROR_CUSTOMER_INIT.replace('{message}', error.message));
  }
})();

/**
 * Müşterileri yükle (Firestore Pagination)
 */
async function loadCustomers(reset = true) {
  try {
    logger.group('Müşteriler Yükleniyor');
    
    if (CUSTOMER_PERMS.view && !can(CUSTOMER_PERMS.view)) {
      logger.warn('Customers: view yetkisi olmadan loadCustomers çağrıldı');
      return;
    }

    const pageSize = state.paging.pageSize;

    if (reset) {
      state.paging.currentPage = 1;
      state.paging.lastVisible = null;
      state.paging.pageHistory = [null];
      
      // Get total count
      try {
        const countQuery = query(
          collection(db, 'customers'),
          where('companyId', '==', state.companyId)
        );
        const countSnap = await getCountFromServer(countQuery);
        state.paging.totalItems = countSnap.data().count;
      } catch (countErr) {
        logger.warn('Could not get total customer count', countErr);
      }
    }

    let qConstraints = [
      where('companyId', '==', state.companyId),
      orderBy('createdAt', 'desc'),
      limit(pageSize + 1)
    ];

    if (state.paging.currentPage > 1 && state.paging.lastVisible) {
      qConstraints.splice(qConstraints.length - 1, 0, startAfter(state.paging.lastVisible));
    }

    const q = query(collection(db, 'customers'), ...qConstraints);
    const snapshot = await getDocs(q);
    
    let docs = snapshot.docs;
    state.paging.hasMore = docs.length > pageSize;
    
    if (state.paging.hasMore) {
      docs = docs.slice(0, pageSize);
    }

    state.customers = docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (docs.length > 0) {
      state.paging.lastVisible = docs[docs.length - 1];
    }

    logger.info('Müşteriler yüklendi', { 
      count: state.customers.length, 
      currentPage: state.paging.currentPage,
      hasMore: state.paging.hasMore
    });
    
    logger.end();
    applyFilters();
    updatePagerUI();
  } catch (error) {
    logger.error('Müşteriler yüklenirken hata', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_LOAD.replace('{message}', error.message));
  }
}

/**
 * Pagination UI güncelle
 */
function updatePagerUI() {
  const pageInfo = qs('#pageInfo');
  const totalInfo = qs('#totalItemsInfo');
  const btnPrev = qs('#btnPrev');
  const btnNext = qs('#btnNext');
  const pagerCont = qs('#pagination-controls');

  if (pagerCont) {
    // Sadece veri varsa veya sayfa > 1 ise göster
    pagerCont.style.display = (state.customers.length > 0 || state.paging.currentPage > 1) ? 'flex' : 'none';
  }

  if (pageInfo) pageInfo.textContent = `Sayfa ${state.paging.currentPage}`;
  if (totalInfo) totalInfo.textContent = `Toplam: ${state.paging.totalItems}`;

  if (btnPrev) btnPrev.disabled = state.paging.currentPage === 1;
  if (btnNext) btnNext.disabled = !state.paging.hasMore;
}

/**
 * Tab değiştirme
 */
function switchTab(tab) {
  state.currentTab = tab;
  
  // Tab butonlarını güncelle
  qs('#tabAll')?.classList.toggle('active', tab === 'all');
  qs('#tabCari')?.classList.toggle('active', tab === 'cari');
  qs('#tabPending')?.classList.toggle('active', tab === 'pending');
  
  applyFilters();
}

/**
 * Filtreleme ve arama
 */
function applyFilters() {
  const searchQuery = (qs('#searchInput')?.value || '').toLowerCase().trim();
  const showArchived = qs('#showArchived')?.checked || false;

  state.filteredCustomers = state.customers.filter((customer) => {
    // Tab filtresi
    if (state.currentTab === 'pending') {
      // Sadece onay bekleyen müşteriler
      if (customer.status !== 'pending') {
        return false;
      }
    } else if (state.currentTab === 'cari') {
      // Sadece cari müşteriler (onaylı olanlar - opsiyonel olarak hepsi de olabilir ama kullanıcı 'cari çalıştığımız' dediği için onaylı/aktif olanlar mantıklı)
      // Ancak müşteri bazen tipini 'cari' seçmiş olabilir ama henüz onaylanmamış olabilir.
      // Kullanıcının talebi "cari müşterileri ayırmamız lazım" dediği için customerType üzerinden gidelim.
      if (customer.customerType !== 'cari') {
        return false;
      }
    } else if (state.currentTab === 'all') {
      // Tüm müşteriler
    }

    // Arşiv filtresi
    if (!showArchived && (customer.isArchived || !customer.isActive)) {
      return false;
    }

    // Arama filtresi
    if (searchQuery) {
      const searchableText = [
        customer.code,
        customer.name,
        customer.taxNumber,
        customer.taxOffice,
        customer.contact?.email,
        customer.contact?.phone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  });

  renderTable();
}

/**
 * Tabloyu render et
 */
function renderTable() {
  const tbody = qs('#customersTableBody');
  if (!tbody) return;

  if (state.filteredCustomers.length === 0) {
    // Teklifbul Rule v1.0 - XSS Protection
    tbody.innerHTML = DOMPurify.sanitize(`
      <tr>
        <td colspan="8" style="text-align:center;padding:40px;color:#6b7280">
          Müşteri bulunamadı
        </td>
      </tr>
    `, {
      ALLOWED_TAGS: ['tr', 'td'],
      ALLOWED_ATTR: ['colspan', 'style']
    });
    return;
  }

  tbody.innerHTML = state.filteredCustomers
    .map(
      (customer) => `
    <tr>
      <td><strong>${escapeHtml(customer.code || '')}</strong></td>
      <td>${escapeHtml(customer.name || '')}</td>
      <td>${escapeHtml(customer.taxNumber || '-')}</td>
      <td>${escapeHtml(customer.taxOffice || '-')}</td>
      <td>
        ${customer.contact?.email ? escapeHtml(customer.contact.email) : '-'}<br/>
        <small class="muted">${customer.contact?.phone || ''}</small>
      </td>
      <td>${customer.paymentTerms || 30} gün</td>
      <td>
        ${customer.status === 'pending' ? '<span class="badge" style="background:#fef3c7;color:#92400e">Onay Bekliyor</span>' : ''}
        ${customer.status === 'approved' ? '<span class="badge badge-active">Onaylandı</span>' : ''}
        ${customer.status === 'rejected' ? '<span class="badge badge-archived">Reddedildi</span>' : ''}
        ${!customer.status && customer.isArchived ? '<span class="badge badge-archived">Arşivli</span>' : ''}
        ${!customer.status && !customer.isArchived && customer.isActive ? '<span class="badge badge-active">Aktif</span>' : ''}
        ${!customer.status && !customer.isArchived && !customer.isActive ? '<span class="badge badge-archived">Pasif</span>' : ''}
      </td>
      <td>
        ${state.currentTab === 'pending' ? `
          <button class="btn btn-secondary btn-edit-customer" data-customer-id="${DOMPurify.sanitize(customer.id || '', { ALLOWED_TAGS: [] })}" style="padding:6px 12px;font-size:12px;margin-right:4px">Düzenle</button>
          ${state.canApproveCustomers ? `
            <button class="btn btn-primary btn-approve-customer" data-customer-id="${DOMPurify.sanitize(customer.id || '', { ALLOWED_TAGS: [] })}" style="padding:6px 12px;font-size:12px;margin-right:4px">Onayla</button>
            <button class="btn btn-danger btn-reject-customer" data-customer-id="${DOMPurify.sanitize(customer.id || '', { ALLOWED_TAGS: [] })}" style="padding:6px 12px;font-size:12px">Reddet</button>
          ` : ''}
        ` : ''}
        ${state.currentTab === 'all' ? `
          <button class="btn btn-secondary btn-edit-customer" data-customer-id="${escapeHtml(customer.id)}" style="padding:6px 12px;font-size:12px;margin-right:4px">Düzenle</button>
          <button class="btn btn-primary btn-view-customer" data-customer-id="${escapeHtml(customer.id)}" style="padding:6px 12px;font-size:12px;margin-right:4px">Detay</button>
          ${CUSTOMER_PERMS.archive && can(CUSTOMER_PERMS.archive) && !customer.isArchived ? `<button class="btn btn-danger btn-archive-customer" data-customer-id="${escapeHtml(customer.id)}" style="padding:6px 12px;font-size:12px">Arşivle</button>` : ''}
        ` : ''}
      </td>
    </tr>
  `
    )
    .join('');
  
  // Event delegation ile buton event listener'larını ekle
  attachTableEventListeners();
}

/**
 * Tablo butonları için event delegation
 * Teklifbul Rule v1.0 - Event listener'ı sadece bir kez ekle
 */
let tableEventListenerAttached = false;
function attachTableEventListeners() {
  const tbody = qs('#customersTableBody');
  if (!tbody || tableEventListenerAttached) return;
  
  // Event delegation: tbody üzerinde tüm tıklamaları dinle
  tbody.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !target.classList) return;
    
    const customerId = target.getAttribute('data-customer-id');
    if (!customerId) return;
    
    // Düzenle butonu
    if (target.classList.contains('btn-edit-customer')) {
      e.preventDefault();
      e.stopPropagation();
      editCustomer(customerId);
      return;
    }
    
    // Onayla butonu
    if (target.classList.contains('btn-approve-customer')) {
      e.preventDefault();
      e.stopPropagation();
      approveCustomer(customerId);
      return;
    }
    
    // Reddet butonu
    if (target.classList.contains('btn-reject-customer')) {
      e.preventDefault();
      e.stopPropagation();
      rejectCustomer(customerId);
      return;
    }
    
    // Arşivle butonu
    if (target.classList.contains('btn-archive-customer')) {
      e.preventDefault();
      e.stopPropagation();
      archiveCustomer(customerId);
      return;
    }
    
    // Detay butonu (müşteri detay sayfasına git)
    if (target.classList.contains('btn-view-customer')) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = `/pages/customer-detail.html?id=${customerId}`;
      return;
    }
  });
  
  tableEventListenerAttached = true;
}

/**
 * Yönetim kadrosu kontrolü (görseldeki rollere göre)
 * Teklifbul Rule v1.0 - Yönetim kadrosu: buyer ve supplier için aynı roller
 */
function isManagementStaff(userRole) {
  const managementRoles = [
    // Buyer yönetim kadrosu
    'buyer:isveren',
    'buyer:yonetim_kurulu_baskani',
    'buyer:yonetim_kurulu_uyesi',
    'buyer:ceo',
    'buyer:genel_mudur',
    'buyer:genel_mudur_yardimcisi',
    // Supplier yönetim kadrosu
    'supplier:isveren',
    'supplier:yonetim_kurulu_baskani',
    'supplier:yonetim_kurulu_uyesi',
    'supplier:ceo',
    'supplier:genel_mudur',
    'supplier:genel_mudur_yardimcisi',
    // Prefix'siz versiyonlar (geriye dönük uyumluluk)
    'isveren',
    'yonetim_kurulu_baskani',
    'yonetim_kurulu_uyesi',
    'ceo',
    'genel_mudur',
    'genel_mudur_yardimcisi'
  ];
  
  return managementRoles.includes(userRole);
}

/**
 * Onay yetkisi kontrolü
 * Yönetim kadrosu + supplier:satis_muduru + supplier:satis_yoneticisi
 */
function canApproveCustomer(userRole) {
  const approvalRoles = [
    // Yönetim kadrosu (görseldeki roller)
    'buyer:isveren',
    'buyer:yonetim_kurulu_baskani',
    'buyer:yonetim_kurulu_uyesi',
    'buyer:ceo',
    'buyer:genel_mudur',
    'buyer:genel_mudur_yardimcisi',
    'supplier:isveren',
    'supplier:yonetim_kurulu_baskani',
    'supplier:yonetim_kurulu_uyesi',
    'supplier:ceo',
    'supplier:genel_mudur',
    'supplier:genel_mudur_yardimcisi',
    // Satış rolleri
    'supplier:satis_muduru',
    'supplier:satis_yoneticisi',
    // Prefix'siz versiyonlar (geriye dönük uyumluluk)
    'isveren',
    'yonetim_kurulu_baskani',
    'yonetim_kurulu_uyesi',
    'ceo',
    'genel_mudur',
    'genel_mudur_yardimcisi',
    'satis_muduru',
    'satis_yoneticisi'
  ];
  
  return approvalRoles.includes(userRole);
}

/**
 * Event listener'ları kur
 */
function setupEventListeners() {
  // Tab değiştirme
  qs('#tabAll')?.addEventListener('click', () => switchTab('all'));
  qs('#tabCari')?.addEventListener('click', () => switchTab('cari'));
  qs('#tabPending')?.addEventListener('click', () => switchTab('pending'));

  // Arama (debounced - Teklifbul Rule v1.0)
  const debouncedApplyFilters = debounce(() => {
    applyFilters();
  }, 300);
  
  qs('#searchInput')?.addEventListener('input', debouncedApplyFilters);
  qs('#showArchived')?.addEventListener('change', applyFilters);

  // Pagination events
  qs('#btnPrev')?.addEventListener('click', () => {
    if (state.paging.currentPage > 1) {
      state.paging.currentPage--;
      state.paging.lastVisible = state.paging.pageHistory[state.paging.currentPage - 1];
      loadCustomers(false);
    }
  });

  qs('#btnNext')?.addEventListener('click', () => {
    if (state.paging.hasMore) {
      state.paging.pageHistory[state.paging.currentPage] = state.paging.lastVisible;
      state.paging.currentPage++;
      loadCustomers(false);
    }
  });

  qs('#f-pageSize')?.addEventListener('change', (e) => {
    state.paging.pageSize = parseInt(e.target.value, 10);
    loadCustomers(true);
  });

  // Yeni müşteri butonu
  qs('#btnNewCustomer')?.addEventListener('click', () => {
    if (CUSTOMER_PERMS.create && !can(CUSTOMER_PERMS.create)) {
      toast.error(MESSAGES.ERROR_CUSTOMER_CREATE_PERMISSION);
      return;
    }
    openCustomerModal();
  });

  // İletişim kişisi ekle butonu event listener'ı modal açıldığında bağlanacak
  // (openCustomerModal içinde bağlanıyor, burada bağlamaya gerek yok)

  // Modal kapatma
  qs('#closeModal')?.addEventListener('click', closeCustomerModal);
  qs('#btnCancel')?.addEventListener('click', closeCustomerModal);
  qs('#customerModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'customerModal') {
      closeCustomerModal();
    }
  });

  // Form submit
  qs('#customerForm')?.addEventListener('submit', handleFormSubmit);
}

/**
 * Müşteri modal'ını aç
 */
async function openCustomerModal(customerId = null) {
  state.editingCustomerId = customerId;
  const modal = qs('#customerModal');
  const form = qs('#customerForm');
  const title = qs('#modalTitle');

  if (!modal || !form || !title) return;

  // Kredi limiti düzenlenebilirliği - Herkese göster ama sadece admin düzenleyebilsin
  const creditLimitInput = qs('#creditLimit');
  const creditLimitNote = qs('#creditLimitNote');
  if (creditLimitInput) {
    if (state.isUserAdmin) {
      creditLimitInput.removeAttribute('readonly');
      creditLimitInput.style.background = '#fff';
      if (creditLimitNote) {
        creditLimitNote.textContent = 'Sadece yönetici kadrosu ayarlayabilir';
      }
    } else {
      creditLimitInput.setAttribute('readonly', 'readonly');
      creditLimitInput.style.background = '#f3f4f6';
      if (creditLimitNote) {
        creditLimitNote.textContent = 'Sadece yönetici kadrosu düzenleyebilir';
      }
    }
  }

  // Adres sistemini başlat
  await initAddressFields();

  // İletişim kişisi ekle butonu event listener'ını yeniden bağla (modal her açıldığında)
  const btnAddContact = qs('#btnAddContact');
  if (btnAddContact) {
    // Önceki listener'ları temizle (clone yöntemi ile)
    const newBtn = btnAddContact.cloneNode(true);
    btnAddContact.parentNode?.replaceChild(newBtn, btnAddContact);
    
    // Yeni listener ekle - debounce ile duplicate çağrıları önle
    let isAdding = false;
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Eğer zaten ekleme işlemi devam ediyorsa, yeni ekleme yapma
      if (isAdding) {
        logger.warn('İletişim kişisi ekleme zaten devam ediyor, atlanıyor');
        return;
      }
      
      isAdding = true;
      try {
        // Sadece bir tane ekle
        addContactPerson();
      } catch (error) {
        logger.error('İletişim kişisi eklenirken hata', error);
        toast.error(MESSAGES.ERROR_CUSTOMER_CONTACT_ADD);
      } finally {
        // Kısa bir gecikme ile flag'i sıfırla (debounce)
        setTimeout(() => {
          isAdding = false;
        }, 300);
      }
    });
  }

  if (customerId) {
    title.textContent = 'Müşteri Düzenle';
    await loadCustomerForEdit(customerId);
  } else {
    title.textContent = 'Yeni Müşteri';
    form.reset();
    qs('#customerId').value = '';
    qs('#customerCode').value = 'Otomatik oluşturulacak';
    qs('#isActive').checked = true;
    qs('#addressCountry').value = 'TR';
    qs('#paymentTerms').value = '30';
    qs('#currency').value = 'TRY';
    qs('#customerType').value = 'cari';
    // Teklifbul Rule v1.0 - Varsayılan senaryo: TİCARİ
    qs('#defaultScenario').value = 'TICARI';
    
    // İletişim kişilerini sıfırla (başlangıçta boş olsun, kullanıcı butona tıklayınca eklesin)
    const container = qs('#contactPersonsContainer');
    if (container) {
      container.innerHTML = '';
      // Başlangıçta boş bırak, kullanıcı "+ İletişim Kişisi Ekle" butonuna tıklayınca eklensin
    }
  }

  modal.style.display = 'block';
}

/**
 * Müşteri modal'ını kapat
 */
function closeCustomerModal() {
  const modal = qs('#customerModal');
  if (modal) {
    modal.style.display = 'none';
  }
  state.editingCustomerId = null;
}

/**
 * Düzenleme için müşteri yükle
 */
async function loadCustomerForEdit(customerId) {
  try {
    const customerDoc = await getDoc(doc(db, 'customers', customerId));
    if (!customerDoc.exists()) {
      toast.error(MESSAGES.ERROR_CUSTOMER_NOT_FOUND);
      return;
    }

    const customer = { id: customerDoc.id, ...customerDoc.data() };

    qs('#customerId').value = customer.id;
    qs('#customerCode').value = customer.code || '';
    qs('#customerName').value = customer.name || '';
    qs('#taxNumber').value = customer.taxNumber || '';
    qs('#taxOffice').value = customer.taxOffice || '';
    qs('#addressStreet').value = customer.address?.street || '';
    qs('#addressAvenue').value = customer.address?.avenue || '';
    qs('#addressNeighborhood').value = customer.address?.neighborhood || '';
    qs('#addressDoorNumber').value = customer.address?.doorNumber || '';
    qs('#addressApartment').value = customer.address?.apartment || '';
    qs('#addressPostalCode').value = customer.address?.postalCode || '';
    qs('#addressCountry').value = customer.address?.country || 'TR';
    qs('#contactEmail').value = customer.contact?.email || '';
    qs('#paymentTerms').value = customer.paymentTerms || 30;
    qs('#creditLimit').value = customer.creditLimit || '';
    qs('#currency').value = customer.currency || 'TRY';
    qs('#isActive').checked = customer.isActive !== false;
    qs('#notes').value = customer.notes || '';
    qs('#customerType').value = customer.customerType || 'cari';

    // Teklifbul Rule v1.0 - E-Belge: Fatura bilgileri
    qs('#invoiceEmail').value = customer.email || '';
    qs('#defaultScenario').value = customer.defaultScenario || '';
    
    // Teklifbul Rule v1.0 - Fatura adresi artık yukarıdaki adres alanından oluşturuluyor
    // Eğer mevcut müşteride fatura adresi varsa ve adres alanları boşsa, fatura adresinden parse edip doldur
    if (customer.invoiceAddress && customer.invoiceAddress.city && !customer.address?.city) {
      // Fatura adresinden il ve ilçe bilgilerini al
      if (customer.invoiceAddress.city) {
        qs('#addressCity').value = customer.invoiceAddress.city;
        await loadDistrictsForProvince(customer.invoiceAddress.city);
        if (customer.invoiceAddress.district) {
          qs('#addressDistrict').value = customer.invoiceAddress.district;
        }
      }
      // Fatura adresinden posta kodu ve ülke bilgilerini al
      if (customer.invoiceAddress.postalCode) {
        qs('#addressPostalCode').value = customer.invoiceAddress.postalCode;
      }
      if (customer.invoiceAddress.country) {
        qs('#addressCountry').value = customer.invoiceAddress.country;
      }
    }
    
    // e-Fatura mükellef durumu
    if (customer.isEFaturaUser === true) {
      qs('#efaturaStatusBadge').textContent = 'Mükellef';
      qs('#efaturaStatusBadge').style.background = '#d1fae5';
      qs('#efaturaStatusBadge').style.borderColor = '#10b981';
      qs('#efaturaStatusBadge').style.color = '#065f46';
    } else if (customer.isEFaturaUser === false) {
      qs('#efaturaStatusBadge').textContent = 'Mükellef Değil';
      qs('#efaturaStatusBadge').style.background = '#fee2e2';
      qs('#efaturaStatusBadge').style.borderColor = '#ef4444';
      qs('#efaturaStatusBadge').style.color = '#991b1b';
    } else {
      qs('#efaturaStatusBadge').textContent = 'Sorgulanmadı';
    }

    // İl ve ilçe seçimleri
    if (customer.address?.city) {
      qs('#addressCity').value = customer.address.city;
      await loadDistrictsForProvince(customer.address.city);
      if (customer.address?.district) {
        qs('#addressDistrict').value = customer.address.district;
      }
    }

    // İletişim kişileri (geriye dönük uyumluluk için eski formatı da kontrol et)
    let contactPersons = customer.contact?.persons || [];
    if (contactPersons.length === 0 && (customer.contact?.contactPerson || customer.contact?.phone)) {
      // Eski format: tek kişi ve telefon
      contactPersons = [{
        name: customer.contact?.contactPerson || null,
        phone: customer.contact?.phone || null
      }];
    }
    loadContactPersons(contactPersons);
  } catch (error) {
    logger.error('Müşteri yüklenirken hata', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_LOAD_DETAIL.replace('{message}', error.message));
  }
}

/**
 * Form submit handler
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const customerId = qs('#customerId')?.value;
  const isEdit = !!customerId;

  // Permission kontrolü
  if (isEdit) {
    if (CUSTOMER_PERMS.edit && !can(CUSTOMER_PERMS.edit)) {
      toast.error(MESSAGES.ERROR_CUSTOMER_EDIT_PERMISSION);
      return;
    }
  } else {
    if (CUSTOMER_PERMS.create && !can(CUSTOMER_PERMS.create)) {
      toast.error(MESSAGES.ERROR_CUSTOMER_CREATE_PERMISSION);
      return;
    }
  }

  try {
    logger.group(isEdit ? 'Müşteri Güncelleniyor' : 'Müşteri Oluşturuluyor');

    // Teklifbul Rule v1.0 - Fatura adresini yukarıdaki adres alanından oluştur
    const addressStreet = qs('#addressStreet')?.value.trim() || '';
    const addressAvenue = qs('#addressAvenue')?.value.trim() || '';
    const addressNeighborhood = qs('#addressNeighborhood')?.value.trim() || '';
    const addressCity = qs('#addressCity')?.value || '';
    const addressDistrict = qs('#addressDistrict')?.value || '';
    const addressPostalCode = qs('#addressPostalCode')?.value.trim() || '';
    const addressDoorNumber = qs('#addressDoorNumber')?.value.trim() || '';
    const addressApartment = qs('#addressApartment')?.value.trim() || '';
    const addressCountry = qs('#addressCountry')?.value.trim() || 'TR';
    
    // Fatura adresi: Mahalle, Cadde, Sokak birleştirilerek line1 oluşturulur
    const invoiceAddressLine1 = [addressNeighborhood, addressAvenue, addressStreet]
      .filter(Boolean)
      .join(' ') || null;
    
    // Fatura adresi: Kapı No ve Daire birleştirilerek line2 oluşturulur
    const invoiceAddressLine2 = [addressDoorNumber, addressApartment]
      .filter(Boolean)
      .join(' ') || null;
    
    // Fatura adresi en az city, district olmalı (zorunlu alanlar)
    const invoiceAddress = (addressCity && addressDistrict) ? {
      line1: invoiceAddressLine1,
      line2: invoiceAddressLine2,
      city: addressCity,
      district: addressDistrict,
      postalCode: addressPostalCode || null,
      country: addressCountry
    } : null;

    const customerData = {
      companyId: state.companyId,
      name: qs('#customerName')?.value.trim(),
      taxNumber: qs('#taxNumber')?.value.trim() || null,
      taxOffice: qs('#taxOffice')?.value.trim() || null,
      // Teklifbul Rule v1.0 - E-Belge alanları
      invoiceAddress: invoiceAddress,
      email: qs('#invoiceEmail')?.value.trim() || null,
      defaultScenario: qs('#defaultScenario')?.value || null,
      address: {
        street: addressStreet || null,
        avenue: addressAvenue || null,
        neighborhood: addressNeighborhood || null,
        doorNumber: addressDoorNumber || null,
        apartment: addressApartment || null,
        district: addressDistrict || null,
        city: addressCity || null,
        postalCode: addressPostalCode || null,
        country: addressCountry
      },
      contact: {
        email: qs('#contactEmail')?.value.trim() || null,
        persons: getContactPersons()
      },
      paymentTerms: parseInt(qs('#paymentTerms')?.value || '30', 10),
      creditLimit: state.isUserAdmin && qs('#creditLimit')?.value ? parseFloat(qs('#creditLimit').value) : null,
      currency: qs('#currency')?.value || 'TRY',
      isActive: qs('#isActive')?.checked,
      customerType: qs('#customerType')?.value || 'cari',
      notes: qs('#notes')?.value.trim() || null,
      updatedBy: state.userId
    };

    if (isEdit) {
      // Güncelleme - Backend API kullan (validation için)
      const response = await authFetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify(customerData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Müşteri güncellenemedi');
      }

      toast.success(MESSAGES.SUCCESS_CUSTOMER_UPDATED);
      logger.info('Müşteri güncellendi', { customerId });
    } else {
      // Oluşturma - Backend API kullan (code generation için)
      // Yeni müşteriler varsayılan olarak 'pending' status ile kaydedilir
      const requestBody = {
        ...customerData,
        status: 'pending', // Onay bekliyor
        userId: state.userId // Backend'de createdBy için
      };
      const response = await authFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Müşteri oluşturulamadı');
      }

      toast.success(MESSAGES.SUCCESS_CUSTOMER_CREATED);
      logger.info('Müşteri oluşturuldu');
    }

    logger.end();
    closeCustomerModal();
    await loadCustomers();
  } catch (error) {
    logger.error('Müşteri kaydetme hatası', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_UPDATE.replace('{message}', error.message));
  }
}

/**
 * Müşteri düzenle
 */
async function editCustomer(customerId) {
  if (CUSTOMER_PERMS.edit && !can(CUSTOMER_PERMS.edit)) {
    toast.error('Müşteri düzenleme yetkiniz yok.');
    return;
  }
  await openCustomerModal(customerId);
}
window.editCustomer = editCustomer;

/**
 * Müşteri onayla
 */
async function approveCustomer(customerId) {
  if (!state.canApproveCustomers) {
    toast.error(MESSAGES.ERROR_CUSTOMER_APPROVE_PERMISSION);
    return;
  }

  if (!confirm('Bu müşteriyi onaylamak istediğinize emin misiniz?')) {
    return;
  }

  try {
    logger.group('Müşteri Onaylanıyor');

    const response = await authFetch(`/api/customers/${customerId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        companyId: state.companyId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Müşteri onaylanamadı');
    }

    toast.success(MESSAGES.SUCCESS_CUSTOMER_APPROVED);
    logger.info('Müşteri onaylandı', { customerId });
    logger.end();

    await loadCustomers();
  } catch (error) {
    logger.error('Müşteri onaylama hatası', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_UPDATE.replace('{message}', error.message));
  }
}
window.approveCustomer = approveCustomer;

/**
 * Müşteri reddet
 */
async function rejectCustomer(customerId) {
  if (!state.canApproveCustomers) {
    toast.error(MESSAGES.ERROR_CUSTOMER_REJECT_PERMISSION);
    return;
  }

  const reason = prompt('Red nedeni (opsiyonel):');
  if (reason === null) {
    return; // Kullanıcı iptal etti
  }

  try {
    logger.group('Müşteri Reddediliyor');

    const response = await authFetch(`/api/customers/${customerId}/reject`, {
      method: 'POST',
      body: JSON.stringify({
        companyId: state.companyId,
        reason: reason || undefined
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Müşteri reddedilemedi');
    }

    toast.success(MESSAGES.SUCCESS_CUSTOMER_REJECTED);
    logger.info('Müşteri reddedildi', { customerId, reason });
    logger.end();

    await loadCustomers();
  } catch (error) {
    logger.error('Müşteri reddetme hatası', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_UPDATE.replace('{message}', error.message));
  }
}
window.rejectCustomer = rejectCustomer;

/**
 * Müşteri arşivle
 */
async function archiveCustomer(customerId) {
  if (CUSTOMER_PERMS.archive && !can(CUSTOMER_PERMS.archive)) {
    toast.error(MESSAGES.ERROR_CUSTOMER_ARCHIVE_PERMISSION);
    return;
  }

  if (!confirm('Bu müşteriyi arşivlemek istediğinize emin misiniz?')) {
    return;
  }

  try {
    logger.group('Müşteri Arşivleniyor');

    const response = await authFetch(`/api/customers/${customerId}/archive`, {
      method: 'POST',
      body: JSON.stringify({
        companyId: state.companyId,
        userId: state.userId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Müşteri arşivlenemedi');
    }

    toast.success(MESSAGES.SUCCESS_CUSTOMER_ARCHIVED);
    logger.info('Müşteri arşivlendi', { customerId });
    logger.end();

    await loadCustomers();
  } catch (error) {
    logger.error('Müşteri arşivleme hatası', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_UPDATE.replace('{message}', error.message));
  }
}
window.archiveCustomer = archiveCustomer;

/**
 * HTML escape
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Adres sistemini başlat (İl-İlçe dropdown'ları)
 */
async function initAddressFields() {
  const ilSel = qs('#addressCity');
  const ilceSel = qs('#addressDistrict');
  
  if (!ilSel || !ilceSel) return;

  try {
    // İl-ilçe datasını yükle
    const raw = await loadProvinceDistrictData();
    const provinces = (Array.isArray(raw) ? raw : raw?.data || []).map(p => ({
      id: p.id ?? p.code ?? p.plaka_kodu ?? p.il,
      name: p.name ?? p.il ?? String(p),
      raw: p
    })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    fillSelectLocal(ilSel, provinces, 'İl seçiniz');

    // İl değiştiğinde ilçeleri yükle
    ilSel.addEventListener('change', async () => {
      const chosen = findByNameOrCode(provinces, ilSel.value);
      if (!chosen || !chosen.raw) {
        fillSelectLocal(ilceSel, [], 'İlçe seçiniz');
        ilceSel.disabled = true;
        return;
      }

      const dlist = mapDistricts(chosen.raw);
      fillSelectLocal(ilceSel, dlist, 'İlçe seçiniz');
      ilceSel.disabled = dlist.length === 0;
    });
  } catch (error) {
    logger.error('Adres sistemi başlatılamadı', error);
  }
}

/**
 * İl-ilçe datasını yükle
 */
async function loadProvinceDistrictData() {
  const sources = [
    '/public/assets/tr-il-ilce.json',
    './assets/tr-il-ilce.json',
    '/assets/tr-il-ilce.json',
    'https://raw.githubusercontent.com/muhammederdem/il-ilce-json/main/il-ilce.json',
    'https://cdn.jsdelivr.net/gh/muhammederdem/il-ilce-json@main/il-ilce.json'
  ];
  
  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      logger.info('İl-ilçe datası bu kaynaktan okunamadı', { url });
    }
  }
  
  return [];
}

/**
 * İlçeleri map et
 */
function mapDistricts(p) {
  const raw = p?.districts ?? p?.ilceleri ?? [];
  return raw.map(d => ({
    id: d.id ?? d.code ?? d.ilce_kodu ?? d,
    name: d.name ?? d.ilce ?? String(d)
  }));
}

/**
 * İsim veya kod ile bul
 */
function findByNameOrCode(list, val) {
  if (val == null) return null;
  if (!isNaN(Number(val))) {
    const code = Number(val);
    return list.find(x => Number(x.id ?? x.code) === code) || null;
  }
  const needle = String(val).trim().toLowerCase();
  return list.find(x => String(x.name ?? '').toLowerCase() === needle) || null;
}

/**
 * Select'i doldur
 */
function fillSelectLocal(sel, items, placeholder) {
  if (!sel) return;
  sel.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = placeholder;
  sel.appendChild(opt0);
  
  (items || []).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr')).forEach(it => {
    const o = document.createElement('option');
    o.value = String(it.id ?? it.code ?? it.value ?? it.name ?? '');
    o.textContent = it.name ?? it.label ?? String(it);
    if (it.id ?? it.code) o.dataset.code = String(it.id ?? it.code);
    sel.appendChild(o);
  });
  sel.disabled = (sel.options.length <= 1);
}

/**
 * İl seçildiğinde ilçeleri yükle
 */
async function loadDistrictsForProvince(provinceValue) {
  const ilSel = qs('#addressCity');
  const ilceSel = qs('#addressDistrict');
  
  if (!ilSel || !ilceSel || !provinceValue) return;

  try {
    const raw = await loadProvinceDistrictData();
    const provinces = (Array.isArray(raw) ? raw : raw?.data || []).map(p => ({
      id: p.id ?? p.code ?? p.plaka_kodu ?? p.il,
      name: p.name ?? p.il ?? String(p),
      raw: p
    }));

    const chosen = findByNameOrCode(provinces, provinceValue);
    if (chosen && chosen.raw) {
      const dlist = mapDistricts(chosen.raw);
      fillSelectLocal(ilceSel, dlist, 'İlçe seçiniz');
      ilceSel.disabled = dlist.length === 0;
    }
  } catch (error) {
    logger.error('İlçeler yüklenemedi', error);
  }
}

/**
 * İletişim kişisi ekle
 * Teklifbul Rule v1.0 - Her çağrıda tam bir satır oluştur (input alanları + sil butonu)
 */
function addContactPerson(name = '', phone = '') {
  const container = qs('#contactPersonsContainer');
  if (!container) {
    logger.warn('contactPersonsContainer bulunamadı');
    return;
  }

  logger.group('İletişim Kişisi Ekleniyor');
  
  try {
    // Row container
    const row = document.createElement('div');
    row.className = 'contact-person-row';
    row.setAttribute('style', 'display:flex;gap:8px;margin-bottom:8px;align-items:flex-start');
    
    const rowId = `contact-person-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    row.dataset.rowId = rowId;

    // İletişim Kişisi input wrapper
    const nameDiv = document.createElement('div');
    nameDiv.setAttribute('style', 'flex:1;min-width:0');
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'contact-person-name';
    nameInput.placeholder = 'İletişim Kişisi';
    nameInput.value = name || '';
    nameInput.setAttribute('style', 'width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box');
    
    nameDiv.appendChild(nameInput);
    row.appendChild(nameDiv);
    logger.info('İletişim Kişisi input eklendi', { hasInput: !!nameInput });

    // Telefon input wrapper
    const phoneDiv = document.createElement('div');
    phoneDiv.setAttribute('style', 'flex:1;min-width:0');
    
    const phoneInput = document.createElement('input');
    phoneInput.type = 'tel';
    phoneInput.className = 'contact-person-phone';
    phoneInput.placeholder = 'Telefon';
    phoneInput.value = phone || '';
    phoneInput.setAttribute('style', 'width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box');
    
    phoneDiv.appendChild(phoneInput);
    row.appendChild(phoneDiv);
    logger.info('Telefon input eklendi', { hasInput: !!phoneInput });

    // Sil butonu
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-contact';
    removeBtn.textContent = 'Sil';
    removeBtn.setAttribute('style', 'padding:2px 4px;background:#dc2626;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;width:auto;min-width:fit-content;height:auto;line-height:1.2;align-self:center;flex-shrink:0');
    removeBtn.addEventListener('click', () => {
      row.remove();
      updateRemoveButtons();
    });
    
    row.appendChild(removeBtn);
    logger.info('Sil butonu eklendi', { hasButton: !!removeBtn });

    // Doğrulama: Row'da 3 child olmalı (nameDiv, phoneDiv, removeBtn)
    if (row.children.length !== 3) {
      logger.error('Row\'da beklenmeyen child sayısı', { 
        expected: 3,
        actual: row.children.length,
        children: Array.from(row.children).map(c => c.tagName + '.' + c.className)
      });
      throw new Error(`Row'da ${row.children.length} child var, 3 olmalı`);
    }

    // Container'a ekle
    container.appendChild(row);
    
    // Final doğrulama: Input alanlarının DOM'da olduğunu kontrol et
    const nameInputFinal = row.querySelector('.contact-person-name');
    const phoneInputFinal = row.querySelector('.contact-person-phone');
    
    logger.info('Row container\'a eklendi', { 
      rowId, 
      rowChildrenCount: row.children.length,
      hasNameInput: !!nameInputFinal,
      hasPhoneInput: !!phoneInputFinal,
      nameInputType: nameInputFinal?.type,
      phoneInputType: phoneInputFinal?.type
    });
    
    if (!nameInputFinal || !phoneInputFinal) {
      logger.error('Input alanları DOM\'da bulunamadı', {
        rowHTML: row.outerHTML.substring(0, 200)
      });
      throw new Error('Input alanları DOM\'a eklenemedi');
    }
    
    // Sil butonlarını güncelle
    updateRemoveButtons();
  } catch (error) {
    logger.error('İletişim kişisi eklenirken hata', error);
    toast.error(MESSAGES.ERROR_CUSTOMER_CONTACT_ADD_WITH_MESSAGE.replace('{message}', error.message));
  } finally {
    logger.end();
  }
}

/**
 * İletişim kişilerini sıfırla
 */
function resetContactPersons() {
  const container = qs('#contactPersonsContainer');
  if (!container) return;
  
  // Container'ı temizle ve sadece 1 satır ekle
  container.innerHTML = '';
  addContactPerson(); // Sadece 1 satır ekle
}

/**
 * İletişim kişilerini yükle
 */
function loadContactPersons(persons) {
  const container = qs('#contactPersonsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!persons || persons.length === 0) {
    addContactPerson(); // En az 1 satır olsun
    return;
  }
  
  persons.forEach(person => {
    addContactPerson(
      person.name || person.contactPerson || '',
      person.phone || ''
    );
  });
}

/**
 * İletişim kişilerini al
 */
function getContactPersons() {
  const container = qs('#contactPersonsContainer');
  if (!container) return null;
  
  const rows = container.querySelectorAll('.contact-person-row');
  const persons = [];
  
  rows.forEach(row => {
    const name = row.querySelector('.contact-person-name')?.value.trim();
    const phone = row.querySelector('.contact-person-phone')?.value.trim();
    
    if (name || phone) {
      persons.push({
        name: name || null,
        phone: phone || null
      });
    }
  });
  
  return persons.length > 0 ? persons : null;
}

/**
 * Sil butonlarını güncelle (en az 1 satır kalmalı)
 */
function updateRemoveButtons() {
  const container = qs('#contactPersonsContainer');
  if (!container) return;
  
  // Sadece container içindeki satırları ve butonları bul
  const rows = container.querySelectorAll('.contact-person-row');
  const removeButtons = container.querySelectorAll('.btn-remove-contact');
  
  // Eğer sadece 1 satır varsa sil butonunu gizle, yoksa göster
  removeButtons.forEach(btn => {
    btn.style.display = rows.length > 1 ? 'block' : 'none';
  });
}
