/**
 * Müşteri Detay Sayfası
 * Teklifbul Rule v1.0 - Müşteri hareketlerini göster, extre çıktı al
 */

import { requireAuth } from '../firebase.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => document.querySelectorAll(sel);

const state = {
  customerId: null,
  customer: null,
  companyId: null,
  userId: null,
  movements: [],
  filteredMovements: [],
  transactions: [], // Cari hareketler
  currentTab: 'all', // 'all', 'sales', 'invoices', 'deliveryNotes', 'transactions'
  startDate: null,
  endDate: null
};

// Initialize
(async () => {
  try {
    logger.group('Müşteri Detay Sayfası Başlatılıyor');

    const user = await requireAuth();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }

    state.userId = user.uid;

    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.warn('Customer Detail: company context alınamadı');
      toast.error('Şirket bilgisi doğrulanamadı.');
      return;
    }

    state.companyId = companyContext.companyId;

    // URL'den müşteri ID'sini al
    const urlParams = new URLSearchParams(window.location.search);
    state.customerId = urlParams.get('id');

    if (!state.customerId) {
      toast.error('Müşteri ID bulunamadı');
      window.location.href = '/pages/customers.html';
      return;
    }

    await loadCustomer();
    await loadMovements();
    setupEventListeners();

    logger.end();
  } catch (error) {
    logger.error('Customer Detail initialization error', error);

    if (error.message === 'AUTH_REQUIRED') {
      window.location.href = '/index.html';
      return;
    }

    toast.error(`Sayfa yüklenirken hata: ${error.message}`);
  }
})();

/**
 * Müşteri bilgilerini yükle
 */
async function loadCustomer() {
  try {
    logger.group('Müşteri Yükleniyor');

    const customerDoc = await getDoc(doc(db, 'customers', state.customerId));
    if (!customerDoc.exists()) {
      toast.error('Müşteri bulunamadı');
      window.location.href = '/pages/customers.html';
      return;
    }

    state.customer = { id: customerDoc.id, ...customerDoc.data() };
    renderCustomerInfo();

    logger.info('Müşteri yüklendi', { customerId: state.customerId });
    logger.end();
  } catch (error) {
    logger.error('Müşteri yüklenirken hata', error);
    toast.error(`Müşteri yüklenirken hata: ${error.message}`);
  }
}

/**
 * Müşteri bilgilerini render et
 */
function renderCustomerInfo() {
  const customer = state.customer;
  if (!customer) return;

  // Breadcrumb
  qs('#breadcrumbCustomerName').textContent = customer.name || 'Müşteri Detayı';

  // Header
  qs('#customerCodeHeader').textContent = customer.code || '-';

  // Genel Bilgiler
  qs('#customerCode').textContent = customer.code || '-';
  qs('#customerName').textContent = customer.name || '-';
  qs('#taxNumber').textContent = customer.taxNumber || '-';
  qs('#taxOffice').textContent = customer.taxOffice || '-';
  qs('#contactEmail').textContent = customer.contact?.email || '-';

  // İletişim telefonu (ilk kişiden)
  const firstPerson = customer.contact?.persons?.[0];
  qs('#contactPhone').textContent = firstPerson?.phone || customer.contact?.phone || '-';

  // Adres
  const address = customer.address || {};
  const addressParts = [
    address.street,
    address.avenue,
    address.neighborhood,
    address.district,
    address.city,
    address.postalCode ? `PK: ${address.postalCode}` : null,
    address.doorNumber ? `No: ${address.doorNumber}` : null,
    address.apartment ? `Daire: ${address.apartment}` : null
  ].filter(Boolean);
  qs('#address').textContent = addressParts.length > 0 ? addressParts.join(', ') : '-';

  qs('#paymentTerms').textContent = customer.paymentTerms ? `${customer.paymentTerms} gün` : '-';
  qs('#creditLimit').textContent = customer.creditLimit ? formatCurrency(customer.creditLimit, customer.currency || 'TRY') : '-';
  qs('#currency').textContent = customer.currency || 'TRY';

  // Durum
  let statusText = '-';
  let statusClass = '';
  if (customer.status === 'pending') {
    statusText = 'Onay Bekliyor';
    statusClass = 'badge-pending';
  } else if (customer.status === 'approved') {
    statusText = 'Onaylandı';
    statusClass = 'badge-active';
  } else if (customer.status === 'rejected') {
    statusText = 'Reddedildi';
    statusClass = 'badge-unpaid';
  } else if (customer.isArchived) {
    statusText = 'Arşivli';
    statusClass = 'badge-unpaid';
  } else if (customer.isActive !== false) {
    statusText = 'Aktif';
    statusClass = 'badge-active';
  } else {
    statusText = 'Pasif';
    statusClass = 'badge-unpaid';
  }
  const statusEl = qs('#status');
  statusEl.textContent = '';
  const span = document.createElement('span');
  span.className = `badge ${statusClass}`;
  span.textContent = statusText;
  statusEl.appendChild(span);
}

/**
 * Müşteri hareketlerini yükle
 */
async function loadMovements() {
  try {
    logger.group('Müşteri Hareketleri Yükleniyor');

    const response = await authFetch(`/api/customers/${state.customerId}/movements?startDate=${state.startDate || ''}&endDate=${state.endDate || ''}`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Hareketler yüklenemedi');
    }

    const data = await response.json();
    state.movements = data.movements || [];
    state.filteredMovements = state.movements;

    calculateSummary();
    renderMovements();

    logger.info('Hareketler yüklendi', { count: state.movements.length });
    logger.end();
  } catch (error) {
    logger.error('Hareketler yüklenirken hata', error);
    toast.error(`Hareketler yüklenirken hata: ${error.message}`);
  }
}

/**
 * Cari hareketleri yükle
 * Teklifbul Rule v1.0
 */
async function loadTransactions() {
  try {
    logger.group('Cari Hareketler Yükleniyor');
    toast.info('Lütfen bekleyin...');

    const response = await authFetch(`/api/customers/${state.customerId}/transactions?limit=100`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || 'Cari hareketler yüklenemedi');
    }

    const data = await response.json();
    state.transactions = (data.transactions || []).map((tx) => ({
      ...tx,
      type: tx.transactionType || tx.type,
      documentNumber: tx.documentNumber || tx.description || '-'
    }));

    if (state.currentTab === 'transactions') {
      renderMovements();
    }

    logger.info('Cari hareketler yüklendi', { count: state.transactions.length });
    logger.end();
  } catch (error) {
    logger.error('Cari hareketler yüklenirken hata', error);
    toast.error(`Hata: ${error.message}`);
    logger.end();
  }
}

/**
 * Tahsilat modalını aç
 * Teklifbul Rule v1.0
 */
function openPaymentModal() {
  const modal = qs('#paymentModal');
  if (!modal) {
    toast.error('Hata: Tahsilat formu bulunamadı');
    return;
  }

  const amountInput = qs('#payAmount');
  const currencyInput = qs('#payCurrency');
  const dateInput = qs('#payDate');
  const descInput = qs('#payDescription');

  if (amountInput) amountInput.value = '';
  if (currencyInput) currencyInput.value = state.customer?.currency || 'TRY';
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  if (descInput) descInput.value = '';

  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }
}

/**
 * Manuel tahsilat kaydet
 * Teklifbul Rule v1.0
 */
async function savePayment() {
  const saveBtn = qs('#btnSavePayment');
  try {
    logger.group('Tahsilat Kaydı');
    toast.info('Lütfen bekleyin...');

    const amount = Number(qs('#payAmount')?.value);
    const currency = qs('#payCurrency')?.value || 'TRY';
    const date = qs('#payDate')?.value || null;
    const description = (qs('#payDescription')?.value || '').trim();

    if (!amount || amount <= 0) {
      toast.warn('Dikkat: Geçerli bir tutar giriniz');
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Yükleniyor...';
    }

    const response = await authFetch(`/api/customers/${state.customerId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        date,
        description: description || 'Manuel Tahsilat'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || 'Tahsilat kaydedilemedi');
    }

    qs('#paymentModal')?.close();
    toast.success('İşlem tamamlandı');
    await loadTransactions();
    logger.info('Tahsilat kaydedildi', { amount, currency });
  } catch (error) {
    logger.error('Tahsilat kaydı hatası', error);
    toast.error(`Hata: ${error.message}`);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Kaydet';
    }
    logger.end();
  }
}

/**
 * Özet hesapla
 */
function calculateSummary() {
  const sales = state.movements.filter(m => m.type === 'sale');
  const invoices = state.movements.filter(m => m.type === 'invoice');

  const totalSales = sales.length;
  const totalInvoices = invoices.length;

  const totalAmount = state.movements
    .filter(m => m.type === 'invoice' || m.type === 'sale')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const paidAmount = invoices
    .filter(m => m.paymentStatus === 'paid')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const balance = totalAmount - paidAmount;

  const currency = state.customer?.currency || 'TRY';

  qs('#totalSales').textContent = totalSales;
  qs('#totalInvoices').textContent = totalInvoices;
  qs('#totalAmount').textContent = formatCurrency(totalAmount, currency);
  qs('#paidAmount').textContent = formatCurrency(paidAmount, currency);
  qs('#balance').textContent = formatCurrency(balance, currency);
}

/**
 * Hareketleri render et
 */
function renderMovements() {
  const tbody = qs('#movementsTableBody');
  if (!tbody) return;

  // Tab filtresi uygula
  let filtered = state.filteredMovements;
  if (state.currentTab === 'sales') {
    filtered = filtered.filter(m => m.type === 'sale');
  } else if (state.currentTab === 'invoices') {
    filtered = filtered.filter(m => m.type === 'invoice');
  } else if (state.currentTab === 'deliveryNotes') {
    filtered = filtered.filter(m => m.type === 'deliveryNote');
  } else if (state.currentTab === 'transactions') {
    // Cari Hareketler sekmesi için transactions array kullan
    filtered = state.transactions || [];
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:40px;color:#6b7280">
          Hareket bulunamadı
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((movement) => {
      const date = movement.date ? formatDate(movement.date) : '-';
      const typeLabel = getTypeLabel(movement.type);
      const documentNumber = movement.documentNumber || '-';
      const amount = formatCurrency(movement.amount || 0, movement.currency || 'TRY');
      const statusBadge = getStatusBadge(movement);
      const actionButton = getActionButton(movement);

      return `
        <tr>
          <td>${escapeHtml(date)}</td>
          <td>${escapeHtml(typeLabel)}</td>
          <td>${escapeHtml(documentNumber)}</td>
          <td>${escapeHtml(amount)}</td>
          <td>${statusBadge}</td>
          <td>${actionButton}</td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Tip etiketi
 */
function getTypeLabel(type) {
  const labels = {
    sale: 'Satış',
    invoice: 'Fatura',
    deliveryNote: 'İrsaliye',
    payment: 'Tahsilat',
    credit: 'Tahsilat',
    debit: 'Borç',
    opening_balance: 'Açılış',
    adjustment: 'Düzeltme'
  };
  return labels[type] || type;
}

/**
 * Durum badge
 */
function getStatusBadge(movement) {
  if (movement.type === 'invoice') {
    if (movement.paymentStatus === 'paid') {
      return '<span class="badge badge-paid">Ödendi</span>';
    } else if (movement.paymentStatus === 'partial') {
      return '<span class="badge badge-pending">Kısmi Ödendi</span>';
    } else {
      return '<span class="badge badge-unpaid">Ödenmedi</span>';
    }
  } else if (movement.type === 'sale') {
    const saleStatusMap = {
      saved: { label: 'Faturalanmadı', class: 'badge-info' },
      invoiced: { label: 'Faturalandı', class: 'badge-success' },
      cancelled: { label: 'İptal Edildi', class: 'badge-danger' },
      archived: { label: 'Arşivlendi', class: 'badge-secondary' }
    };
    
    const mapped = saleStatusMap[movement.status];
    if (mapped) {
      return `<span class="badge ${mapped.class}">${mapped.label}</span>`;
    } else if (movement.status === 'approved') {
      return '<span class="badge badge-active">Onaylandı</span>';
    } else if (movement.status === 'draft') {
      return '<span class="badge badge-pending">Taslak</span>';
    } else {
      return '<span class="badge badge-secondary">' + (movement.status || 'Bilinmiyor') + '</span>';
    }
  } else if (movement.type === 'deliveryNote') {
    return '<span class="badge badge-active">Teslim Edildi</span>';
  } else if (movement.type === 'payment' || movement.type === 'credit') {
    return '<span class="badge badge-paid">Tahsilat</span>';
  } else if (movement.type === 'debit') {
    return '<span class="badge badge-unpaid">Borç</span>';
  }
  return '-';
}

/**
 * İşlem butonu
 */
function getActionButton(movement) {
  if (movement.type === 'sale' && movement.id) {
    return `<button class="btn btn-secondary btn-view-movement" data-type="sale" data-id="${movement.id}" style="padding:4px 8px;font-size:11px">Görüntüle</button>`;
  } else if (movement.type === 'invoice' && movement.id) {
    return `<button class="btn btn-secondary btn-view-movement" data-type="invoice" data-id="${movement.id}" style="padding:4px 8px;font-size:11px">Görüntüle</button>`;
  } else if (movement.type === 'deliveryNote' && movement.id) {
    return `<button class="btn btn-secondary btn-view-movement" data-type="deliveryNote" data-id="${movement.id}" style="padding:4px 8px;font-size:11px">Görüntüle</button>`;
  }
  return '-';
}

/**
 * Event listener'ları kur
 */
function setupEventListeners() {
  // Düzenle butonu
  qs('#btnEdit')?.addEventListener('click', () => {
    window.location.href = `/pages/customers.html?edit=${state.customerId}`;
  });

  // Extre çıktı al butonu — seçim modalı aç
  qs('#btnExport')?.addEventListener('click', () => {
    openExportExtreModal();
  });
  qs('#btnCloseExportModal')?.addEventListener('click', () => {
    qs('#exportExtreModal')?.close();
  });
  qs('#btnCancelExport')?.addEventListener('click', () => {
    qs('#exportExtreModal')?.close();
  });
  qs('#btnConfirmExport')?.addEventListener('click', () => {
    exportExtre();
  });
  qs('#btnSelectAllExportTypes')?.addEventListener('click', () => {
    qsa('#exportExtreModal input[name="exportType"]').forEach((el) => {
      el.checked = true;
    });
  });

  // Tab değiştirme
  qs('#tabAllMovements')?.addEventListener('click', () => switchTab('all'));
  qs('#tabTransactions')?.addEventListener('click', () => switchTab('transactions'));
  qs('#tabSales')?.addEventListener('click', () => switchTab('sales'));
  qs('#tabInvoices')?.addEventListener('click', () => switchTab('invoices'));
  qs('#tabDeliveryNotes')?.addEventListener('click', () => switchTab('deliveryNotes'));

  // Filtre
  qs('#btnFilter')?.addEventListener('click', () => {
    state.startDate = qs('#startDate')?.value || null;
    state.endDate = qs('#endDate')?.value || null;
    loadMovements();
  });

  // Filtre sıfırla
  qs('#btnResetFilter')?.addEventListener('click', () => {
    state.startDate = null;
    state.endDate = null;
    qs('#startDate').value = '';
    qs('#endDate').value = '';
    loadMovements();
  });

  // Teklifbul Rule v1.0 - Tahsilat modalı
  qs('#btnAddPayment')?.addEventListener('click', () => {
    openPaymentModal();
  });
  qs('#btnSavePayment')?.addEventListener('click', () => {
    savePayment();
  });
  qs('#btnCloseModalX')?.addEventListener('click', () => {
    qs('#paymentModal')?.close();
  });
  qs('#btnCancelPayment')?.addEventListener('click', () => {
    qs('#paymentModal')?.close();
  });

  // Teklifbul Rule v1.0 - CSP Fix: Event delegation for view buttons
  qs('#movementsTableBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-view-movement');
    if (!btn) return;

    const type = btn.dataset.type;
    const id = btn.dataset.id;

    if (type === 'sale') {
      window.location.href = `/pages/sale-detail.html?id=${id}`;
    } else if (type === 'invoice') {
      window.location.href = `/pages/invoice-detail.html?id=${id}`;
    } else if (type === 'deliveryNote') {
      window.location.href = `/pages/delivery-note-detail.html?id=${id}`;
    }
  });
}

/**
 * Tab değiştir
 */
function switchTab(tab) {
  state.currentTab = tab;

  // Tab butonlarını güncelle
  qsa('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Cari sekmesinde tahsilat aksiyonunu göster
  const txActions = qs('#transactionActions');
  if (txActions) {
    txActions.style.display = tab === 'transactions' ? 'flex' : 'none';
  }

  if (tab === 'transactions') {
    loadTransactions();
    return;
  }

  renderMovements();
}

/**
 * Extre seçim modalını aç
 * Teklifbul Rule v1.0
 */
function openExportExtreModal() {
  const modal = qs('#exportExtreModal');
  if (!modal) {
    toast.error('Hata: Extre seçim formu bulunamadı');
    return;
  }
  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }
}

/**
 * Seçili extre türlerini oku
 * Teklifbul Rule v1.0
 */
function getSelectedExportTypes() {
  return Array.from(qsa('#exportExtreModal input[name="exportType"]:checked'))
    .map((el) => el.value)
    .filter(Boolean);
}

/**
 * Extre çıktı al (seçilen türlerle)
 * Teklifbul Rule v1.0
 */
async function exportExtre() {
  const confirmBtn = qs('#btnConfirmExport');
  const cancelBtn = qs('#btnCancelExport');
  let aborted = false;

  const onCancel = () => {
    aborted = true;
  };

  try {
    logger.group('Extre Çıktısı Alınıyor');

    const types = getSelectedExportTypes();
    if (types.length === 0) {
      toast.warn('Dikkat: En az bir bilgi türü seçin');
      return;
    }

    const startDate = state.startDate || qs('#startDate')?.value || '';
    const endDate = state.endDate || qs('#endDate')?.value || '';
    const typesParam = encodeURIComponent(types.join(','));

    toast.info('Lütfen bekleyin...');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Yükleniyor...';
    }
    cancelBtn?.addEventListener('click', onCancel, { once: true });

    const response = await authFetch(
      `/api/customers/${state.customerId}/extre?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&types=${typesParam}`,
      { method: 'GET' }
    );

    if (aborted) {
      toast.info('İşlem iptal edildi');
      return;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || 'Extre çıktısı alınamadı');
    }

    const blob = await response.blob();
    if (aborted) {
      toast.info('İşlem iptal edildi');
      return;
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musteri-extre-${state.customer?.code || state.customerId}-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    qs('#exportExtreModal')?.close();
    toast.success('İşlem tamamlandı');
    logger.info('Extre çıktısı alındı', { types });
  } catch (error) {
    logger.error('Extre çıktısı alınırken hata', error);
    toast.error(`Hata: ${error.message}`);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Excel İndir';
    }
    cancelBtn?.removeEventListener('click', onCancel);
    logger.end();
  }
}

/**
 * Tarih formatla
 */
function formatDate(timestamp) {
  if (!timestamp) return '-';

  let date;

  // Firestore Timestamp objesi
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  }
  // Firestore Timestamp-like obje (API'den gelince _seconds olabilir)
  else if (timestamp._seconds !== undefined) {
    date = new Date(timestamp._seconds * 1000);
  }
  // seconds property varsa (başka bir format)
  else if (timestamp.seconds !== undefined) {
    date = new Date(timestamp.seconds * 1000);
  }
  // ISO string veya diğer formatlar
  else {
    date = new Date(timestamp);
  }

  // Invalid Date kontrolü
  if (isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * Para formatla
 */
function formatCurrency(amount, currency = 'TRY') {
  if (amount === null || amount === undefined) return '-';
  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency
  });
  return formatter.format(amount);
}

/**
 * HTML escape
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
