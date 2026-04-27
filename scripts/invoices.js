/**
 * Invoices Management - Satış Modülü Faz 4
 * Fatura CRUD, ödeme kaydı, sale status senkronu
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
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '../src/shared/constants/messages.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getSalesPerms } from '../assets/js/state/permissions.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { state, formatCurrency, formatDate } from './sales.js';

const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

const SALES_PERMS = getSalesPerms();

let currentSale = null;

function renderNoSaleState(message, options = {}) {
  const form = qs('#invoiceForm');
  if (!form) return;

  const {
    title = 'Satış seçilmedi',
    primaryHref = '/pages/sales.html',
    primaryText = 'Satış Listesine Git',
    secondaryHref = '/pages/invoice-direct-new.html',
    secondaryText = 'Sıfırdan Fatura Oluştur'
  } = options;

  form.innerHTML = `
    <div class="card" style="margin-top: 8px;">
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      <p class="muted" style="margin-bottom:16px;">${escapeHtml(message)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="${escapeHtml(primaryHref)}" class="btn btn-primary">${escapeHtml(primaryText)}</a>
        <a href="${escapeHtml(secondaryHref)}" class="btn btn-secondary">${escapeHtml(secondaryText)}</a>
      </div>
    </div>
  `;
}

// Initialize
(async () => {
  try {
    const user = await requireAuth();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }

    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.warn('Invoices: company context alınamadı');
      return;
    }

    // Permission kontrolü
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Invoices: initPermissions sonuç vermedi');
      return;
    }

    if (SALES_PERMS.createInvoice && !can(SALES_PERMS.createInvoice)) {
      toast.error(MESSAGES.ERROR_INVOICE_CREATE_PERMISSION);
      window.location.href = '/pages/sales.html';
      return;
    }

    // URL'den saleId al
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');

    if (!saleId) {
      toast.info('Satış seçmeden açtınız. Satıştan fatura için önce bir satış seçin.');
      renderNoSaleState(
        'Bu sayfa satış bazlı fatura oluşturur. Devam etmek için bir satış seçin veya sıfırdan fatura oluşturun.',
        {
          title: 'Satış bilgisi bulunamadı',
          primaryHref: '/pages/sales.html',
          primaryText: 'Satışlardan Seç',
          secondaryHref: '/pages/invoice-direct-new.html',
          secondaryText: 'Sıfırdan Fatura'
        }
      );
      return;
    }

    // Satışı yükle
    await loadSale(saleId);
    setupEventListeners();
  } catch (error) {
    logger.error('Invoices initialization error', error);
    toast.error(`Başlatma hatası: ${error.message}`);
  }
})();

/**
 * Satışı yükle
 */
async function loadSale(saleId) {
  try {
    logger.group('Satış Yükleniyor');

    const saleDoc = await getDoc(doc(db, 'sales', saleId));
    if (!saleDoc.exists()) {
      toast.warn(MESSAGES.ERROR_INVOICE_SALE_NOT_FOUND);
      renderNoSaleState(
        'Fatura oluşturmak istediğiniz satış bulunamadı. Farklı bir satış seçebilir veya sıfırdan fatura oluşturabilirsiniz.',
        {
          title: 'Satış bulunamadı',
          primaryHref: '/pages/sales.html',
          primaryText: 'Satış Listesine Dön',
          secondaryHref: '/pages/invoice-direct-new.html',
          secondaryText: 'Sıfırdan Fatura'
        }
      );
      return;
    }

    currentSale = { id: saleDoc.id, ...saleDoc.data() };

    // Company kontrolü
    if (currentSale.companyId !== state.companyId) {
      toast.error(MESSAGES.ERROR_INVOICE_UNAUTHORIZED);
      window.location.href = '/pages/sales.html';
      return;
    }

    // Status kontrolü (saved, approved veya delivered olmalı)
    if (currentSale.status !== 'saved' && currentSale.status !== 'approved' && currentSale.status !== 'delivered') {
      toast.error(MESSAGES.ERROR_INVOICE_CREATE_STATUS.replace('{status}', currentSale.status));
      window.location.href = `/pages/sale-detail.html?id=${saleId}`;
      return;
    }

    // Form'u doldur
    document.getElementById('saleId').value = saleId;
    document.getElementById('saleNumber').textContent = currentSale.saleNumber || '';
    document.getElementById('customerName').textContent = currentSale.customerName || '';
    
    // Statusü Türkçeleştir (sales.js'den gelen getStatusLabel'ı kullanabiliriz veya buraya kopyalayabiliriz)
    const statusLabels = {
      saved: 'Kaydedildi',
      approved: 'Onaylandı',
      delivered: 'Teslim Edildi',
      invoiced: 'Faturalandı',
      cancelled: 'İptal Edildi'
    };
    document.getElementById('saleStatus').textContent = statusLabels[currentSale.status] || currentSale.status;

    // İrsaliye kontrolü
    if (currentSale.deliveryNoteIds && currentSale.deliveryNoteIds.length > 0) {
      document.getElementById('deliveryNotesRow').style.display = 'grid';
      document.getElementById('deliveryNotes').textContent = `${currentSale.deliveryNoteIds.length} irsaliye`;
    } else {
      // İrsaliyesiz fatura uyarısı
      document.getElementById('noDeliveryNoteWarning').style.display = 'block';
    }

    // Kalemleri render et
    renderInvoiceItems(currentSale.items || []);

    logger.info('Satış yüklendi', { saleId, itemsCount: currentSale.items?.length || 0 });
    logger.end();
  } catch (error) {
    logger.error('Satış yüklenirken hata', error);
    toast.error(MESSAGES.ERROR_INVOICE_SALE_LOAD.replace('{message}', error.message));
  }
}

/**
 * Fatura kalemlerini render et
 */
function renderInvoiceItems(items) {
  const tbody = document.getElementById('invoiceItemsTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:40px;color:#6b7280">
          Kalem bulunamadı
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items
    .map(
      (item) => `
    <tr>
      <td>${escapeHtml(item.sku || '')}</td>
      <td>${escapeHtml(item.name || '')}</td>
      <td>${item.quantity || 0}</td>
      <td>${escapeHtml(item.unit || '')}</td>
      <td>${formatCurrency(item.unitPrice || 0, item.currency || 'TRY')}</td>
      <td>%${item.vatRate || 0}</td>
      <td>${formatCurrency(item.totalWithVat || 0, item.currency || 'TRY')}</td>
    </tr>
  `
    )
    .join('');
}

/**
 * Event listener'ları kur
 */
function setupEventListeners() {
  document.getElementById('btnCreateInvoice')?.addEventListener('click', async () => {
    await createInvoice();
  });
}

/**
 * Fatura oluştur
 */
async function createInvoice() {
  try {
    if (!currentSale) {
      toast.error(MESSAGES.ERROR_INVOICE_SALE_INFO_LOAD);
      return;
    }

    logger.group('Fatura Oluşturuluyor');

    // İrsaliyesiz fatura kontrolü
    const allowWithoutDeliveryNote = document.getElementById('allowWithoutDeliveryNote')?.checked || false;
    if (!currentSale.deliveryNoteIds || currentSale.deliveryNoteIds.length === 0) {
      if (!allowWithoutDeliveryNote) {
        // Teklifbul Rule v1.0 - UX Improvement: Blocking error yerine confirm dialog
        if (confirm('Bu satış için irsaliye bulunmuyor. İrsaliyesiz fatura oluşturmak istediğinize emin misiniz?')) {
          // Kullanıcı onayladı, devam et (checkbox'ı da işaretle görsel olarak)
          const checkbox = document.getElementById('allowWithoutDeliveryNote');
          if (checkbox) checkbox.checked = true;
          // allowWithoutDeliveryNote değerini true kabul et ve devam et
        } else {
          // Kullanıcı iptal etti
          return;
        }
      }
    }

    // Idempotency: requestId üret (uuid)
    const requestId = crypto.randomUUID();

    // API çağrısı
    const response = await authFetch('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        saleId: currentSale.id,
        companyId: state.companyId,
        deliveryNoteIds: currentSale.deliveryNoteIds || [],
        allowWithoutDeliveryNote: allowWithoutDeliveryNote,
        requestId: requestId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Fatura oluşturulamadı');
    }

    toast.success(MESSAGES.SUCCESS_INVOICE_CREATED);
    logger.info('Fatura oluşturuldu', {
      invoiceId: result.invoiceId,
      saleId: currentSale.id
    });
    logger.end();

    // Fatura detay sayfasına yönlendir
    setTimeout(() => {
      window.location.href = `/pages/invoice-detail.html?id=${result.invoiceId}`;
    }, 1000);
  } catch (error) {
    logger.error('Fatura oluşturma hatası', error);
    toast.error(MESSAGES.ERROR_INVOICE_CREATE.replace('{message}', error.message));
    logger.end();
  }
}

/**
 * Helper fonksiyonlar
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
