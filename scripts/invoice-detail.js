/**
 * Invoice Detail - E-Belge UI Flow
 * Teklifbul Rule v1.0 - Invoice detail sayfası için handler'lar
 */

import { authFetch } from '../assets/js/utils/api-helpers.js';
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { can, getEinvoicePerms } from '../assets/js/state/permissions.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { setTableEmpty, appendTextCell, fillTableRows } from '../assets/js/utils/safe-table.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { formatCurrency, formatDate } from './sales.js';

const qs = (s) => document.querySelector(s);

let currentInvoice = null;
let companyId = null;

// Initialize
(async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const invoiceId = urlParams.get('id');

    if (!invoiceId) {
      toast.error('Fatura ID bulunamadı');
      window.location.href = '/pages/sales.html';
      return;
    }

    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('Invoice detail: company context alınamadı');
      return;
    }

    companyId = ctx.companyId;

    await loadInvoice(invoiceId);
    setupEventListeners();
  } catch (error) {
    logger.error('Invoice detail initialization error', error);
    toast.error(`Başlatma hatası: ${error.message}`);
  }
})();

/**
 * Invoice yükle
 */
async function loadInvoice(invoiceId) {
  try {
    logger.group('Fatura Yükleniyor');

    const response = await authFetch(`/api/invoices/${invoiceId}`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fatura yüklenemedi');
    }

    const data = await response.json();
    if (!data.ok || !data.invoice) {
      throw new Error('Fatura bulunamadı');
    }

    currentInvoice = data.invoice;

    // Invoice'ı render et
    renderInvoiceDetail(currentInvoice);

    logger.info('Fatura yüklendi', { invoiceId });
    logger.end();
  } catch (error) {
    logger.error('Fatura yüklenirken hata', error);
    toast.error(`Fatura yüklenemedi: ${error.message}`);
    logger.end();
  }
}

/**
 * Invoice detayını render et
 */
function renderInvoiceDetail(invoice) {
  // Genel bilgiler
  if (qs('#invoiceNumber')) {
    qs('#invoiceNumber').textContent = invoice.number || invoice.invoiceNumber || 'N/A';
  }
  if (qs('#invoiceNumberDetail')) {
    qs('#invoiceNumberDetail').textContent = invoice.number || invoice.invoiceNumber || 'N/A';
  }

  // Müşteri
  if (qs('#customerName')) {
    qs('#customerName').textContent = invoice.customerName || invoice.snapshot?.buyer?.name || 'N/A';
  }

  // Status badge
  const statusEl = qs('#invoiceStatus');
  if (statusEl) {
    const statusInfo = getDocumentStatusInfo(invoice.status);
    statusEl.textContent = '';
    const statusSpan = document.createElement('span');
    statusSpan.className = `badge ${statusInfo.class}`;
    statusSpan.textContent = statusInfo.label;
    statusEl.appendChild(statusSpan);
  }

  // Ödeme durumu badge
  if (qs('#paymentStatus')) {
    const paymentStatusMap = {
      paid: { label: 'Ödendi', class: 'badge-paid' },
      partial: { label: 'Kısmi Ödendi', class: 'badge-partial' },
      unpaid: { label: 'Ödenmedi', class: 'badge-unpaid' }
    };
    const pStatus = paymentStatusMap[invoice.paymentStatus] || { label: invoice.paymentStatus || 'Ödenmedi', class: 'badge-unpaid' };
    const payEl = qs('#paymentStatus');
    payEl.textContent = '';
    const paySpan = document.createElement('span');
    paySpan.className = `badge ${pStatus.class}`;
    paySpan.textContent = String(pStatus.label || '');
    payEl.appendChild(paySpan);
  }

  // Tarihler
  if (qs('#invoiceDate')) {
    qs('#invoiceDate').textContent = formatDate(invoice.issueDate || invoice.createdAt) || '-';
  }
  if (qs('#dueDate')) {
    qs('#dueDate').textContent = formatDate(invoice.dueDate) || '-';
  }

  // Para birimi
  if (qs('#currency')) {
    qs('#currency').textContent = invoice.currency || invoice.snapshot?.totals?.currency || 'TRY';
  }

  // Döviz kuru
  if (invoice.exchangeRate && qs('#exchangeRateRow')) {
    qs('#exchangeRateRow').style.display = 'grid';
    qs('#exchangeRate').textContent = invoice.exchangeRate;
  }

  // E-Fatura durumu
  if (invoice.edoc && qs('#efaturaRow')) {
    qs('#efaturaRow').style.display = 'grid';
    const edocStatusMap = {
      draft: 'Taslak',
      ready: 'Hazır',
      sent: 'Gönderildi',
      accepted: 'Kabul Edildi',
      rejected: 'Reddedildi',
      cancelled: 'İptal Edildi'
    };
    qs('#efaturaStatus').textContent = edocStatusMap[invoice.edoc.status] || invoice.edoc.status || 'N/A';
    if (invoice.edoc.uuid && qs('#efaturaUUIDRow')) {
      qs('#efaturaUUIDRow').style.display = 'grid';
      qs('#efaturaUUID').textContent = invoice.edoc.uuid;
    }
  }

  // Finansal özet
  const currency = invoice.currency || invoice.snapshot?.totals?.currency || 'TRY';
  const totals = invoice.snapshot?.totals || {};
  if (qs('#subtotal')) {
    qs('#subtotal').textContent = formatCurrency(totals.subtotal || 0, currency);
  }
  if (qs('#totalVat')) {
    qs('#totalVat').textContent = formatCurrency(totals.totalVat || 0, currency);
  }
  if (qs('#totalAmount')) {
    qs('#totalAmount').textContent = formatCurrency(totals.totalAmount || invoice.totalAmount || 0, currency);
  }

  // Ödeme özeti
  const payments = invoice.payments || [];
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalAmount = totals.totalAmount || invoice.totalAmount || 0;
  const remaining = totalAmount - totalPaid;

  if (qs('#totalPaid')) {
    qs('#totalPaid').textContent = formatCurrency(totalPaid, currency);
  }
  if (qs('#remainingAmount')) {
    qs('#remainingAmount').textContent = formatCurrency(remaining, currency);
  }

  // Snapshot varsa göster
  if (invoice.snapshot) {
    renderSnapshot(invoice.snapshot);
    if (qs('#snapshotCard')) {
      qs('#snapshotCard').style.display = 'block';
    }
  }

  // Fatura kalemlerini render et
  renderInvoiceItems(invoice);

  // Ödeme kayıtlarını render et
  renderPayments(invoice);

  // Aksiyon butonlarını render et
  renderInvoiceActions(invoice);
}

/**
 * Fatura kalemlerini render et
 */
// Teklifbul Rule v1.0 — DOMPurify <tr>/<td>'yi table dışında siler; createElement kullan
function renderInvoiceItems(invoice) {
  const tbody = qs('#invoiceItemsTableBody');
  if (!tbody) return;

  const items = invoice.items || invoice.snapshot?.items || [];
  const currency = invoice.currency || invoice.snapshot?.totals?.currency || 'TRY';

  fillTableRows(
    tbody,
    items.map((item) => [
      item.sku || 'N/A',
      item.name || item.productName || 'N/A',
      item.quantity || 0,
      item.unit || 'AD',
      formatCurrency(item.unitPrice || 0, currency),
      `${item.vatRate || 0}%`,
      formatCurrency(item.totalWithVat || item.totalPrice || 0, currency),
    ]),
    7,
    'Kalem bulunamadı'
  );
}

/**
 * Ödeme kayıtlarını render et
 */
// Teklifbul Rule v1.0 — DOMPurify <tr>/<td>'yi table dışında siler; createElement kullan
function renderPayments(invoice) {
  const tbody = qs('#paymentsTableBody');
  if (!tbody) return;

  const payments = invoice.payments || [];
  const currency = invoice.currency || invoice.snapshot?.totals?.currency || 'TRY';

  fillTableRows(
    tbody,
    payments.map((payment) => {
      const methodLabel = {
        nakit: 'Nakit',
        havale: 'Havale',
        kredi_karti: 'Kredi Kartı',
        cek: 'Çek',
        senet: 'Senet'
      }[payment.method] || payment.method || 'N/A';

      return [
        formatDate(payment.date),
        formatCurrency(payment.amount || 0, currency),
        methodLabel,
        payment.reference || '-',
        payment.createdBy || '-',
      ];
    }),
    5,
    'Ödeme kaydı bulunamadı'
  );
}

/**
 * Snapshot render et
 */
function renderSnapshot(snapshot) {
  // Seller snapshot
  if (snapshot.seller && qs('#sellerSnapshot')) {
    const seller = snapshot.seller;
    qs('#sellerSnapshot').innerHTML = DOMPurify.sanitize(`
      <div><strong>VKN:</strong> ${seller.vkn || 'N/A'}</div>
      <div><strong>Ünvan:</strong> ${seller.title || 'N/A'}</div>
      ${seller.taxOffice ? `<div><strong>Vergi Dairesi:</strong> ${seller.taxOffice}</div>` : ''}
      ${seller.address ? `
        <div style="margin-top:8px"><strong>Adres:</strong></div>
        <div style="padding-left:16px; color:#6b7280">
          ${seller.address.line1 || ''}<br/>
          ${seller.address.line2 ? seller.address.line2 + '<br/>' : ''}
          ${seller.address.district || ''} ${seller.address.city || ''}<br/>
          ${seller.address.postalCode || ''} ${seller.address.country || 'TR'}
        </div>
      ` : ''}
    `, {
      ALLOWED_TAGS: ['div', 'strong', 'br'],
      ALLOWED_ATTR: ['style']
    });
  }

  // Buyer snapshot
  if (snapshot.buyer && qs('#buyerSnapshot')) {
    const buyer = snapshot.buyer;
    qs('#buyerSnapshot').innerHTML = DOMPurify.sanitize(`
      ${buyer.taxNumber ? `<div><strong>VKN/TCKN:</strong> ${buyer.taxNumber}</div>` : ''}
      ${buyer.name ? `<div><strong>Ad:</strong> ${buyer.name}</div>` : ''}
      ${buyer.title ? `<div><strong>Ünvan:</strong> ${buyer.title}</div>` : ''}
      ${buyer.taxOffice ? `<div><strong>Vergi Dairesi:</strong> ${buyer.taxOffice}</div>` : ''}
      ${buyer.email ? `<div><strong>E-posta:</strong> ${buyer.email}</div>` : ''}
      ${buyer.address ? `
        <div style="margin-top:8px"><strong>Adres:</strong></div>
        <div style="padding-left:16px; color:#6b7280">
          ${buyer.address.line1 || ''}<br/>
          ${buyer.address.line2 ? buyer.address.line2 + '<br/>' : ''}
          ${buyer.address.district || ''} ${buyer.address.city || ''}<br/>
          ${buyer.address.postalCode || ''} ${buyer.address.country || 'TR'}
        </div>
      ` : ''}
    `, {
      ALLOWED_TAGS: ['div', 'strong', 'br'],
      ALLOWED_ATTR: ['style']
    });
  }

  // Items snapshot
  // Teklifbul Rule v1.0 — DOMPurify <tr>/<td>'yi table dışında siler; createElement kullan
  if (snapshot.items && qs('#snapshotItemsTableBody')) {
    const tbody = qs('#snapshotItemsTableBody');
    const currency = snapshot.totals?.currency || 'TRY';
    if (snapshot.items.length === 0) {
      setTableEmpty(tbody, 7, 'Kalem bulunamadı');
    } else {
      tbody.textContent = '';
      snapshot.items.forEach((item) => {
        const tr = document.createElement('tr');
        appendTextCell(tr, item.sku || 'N/A');
        appendTextCell(tr, item.name || 'N/A');
        const qtyTd = appendTextCell(tr, item.quantity || 0);
        qtyTd.style.textAlign = 'right';
        appendTextCell(tr, item.unit || 'AD');
        const priceTd = appendTextCell(tr, formatCurrency(item.unitPrice || 0, currency));
        priceTd.style.textAlign = 'right';
        const vatTd = appendTextCell(tr, `${item.vatRate || 0}%`);
        vatTd.style.textAlign = 'right';
        const totalTd = appendTextCell(tr, formatCurrency(item.totalWithVat || item.totalPrice || 0, currency));
        totalTd.style.textAlign = 'right';
        tbody.appendChild(tr);
      });
    }
  }

  // Totals snapshot
  if (snapshot.totals && qs('#snapshotTotals')) {
    const totals = snapshot.totals;
    qs('#snapshotTotals').innerHTML = DOMPurify.sanitize(`
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #bae6fd">
        <span>Ara Toplam:</span>
        <strong>${formatCurrency(totals.subtotal || 0, totals.currency || 'TRY')}</strong>
      </div>
      ${totals.totalDiscount ? `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #bae6fd">
          <span>Toplam İndirim:</span>
          <strong>${formatCurrency(totals.totalDiscount, totals.currency || 'TRY')}</strong>
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #bae6fd">
        <span>Toplam KDV:</span>
        <strong>${formatCurrency(totals.totalVat || 0, totals.currency || 'TRY')}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:16px; font-weight:700">
        <span>Genel Toplam:</span>
        <strong>${formatCurrency(totals.totalAmount || 0, totals.currency || 'TRY')}</strong>
      </div>
      ${totals.exchangeRate ? `
        <div style="display:flex; justify-content:space-between; padding:8px 0; margin-top:8px; font-size:12px; color:#6b7280">
          <span>Döviz Kuru:</span>
          <span>${totals.exchangeRate}</span>
        </div>
      ` : ''}
    `, {
      ALLOWED_TAGS: ['div', 'span', 'strong'],
      ALLOWED_ATTR: ['style']
    });
  }

  // Dates snapshot
  if (snapshot.dates && qs('#snapshotDates')) {
    const dates = snapshot.dates;
    qs('#snapshotDates').innerHTML = DOMPurify.sanitize(`
      <div><strong>Fatura Tarihi:</strong> ${formatDate(dates.issueDate)}</div>
      ${dates.dueDate ? `<div><strong>Vade Tarihi:</strong> ${formatDate(dates.dueDate)}</div>` : ''}
      ${dates.createdFromSaleAt ? `<div style="margin-top:8px; font-size:12px; color:#6b7280"><strong>Satıştan Oluşturulma:</strong> ${formatDate(dates.createdFromSaleAt)}</div>` : ''}
    `, {
      ALLOWED_TAGS: ['div', 'strong'],
      ALLOWED_ATTR: ['style']
    });
  }
}

/**
 * Invoice aksiyon butonlarını render et
 */
function renderInvoiceActions(invoice) {
  const container = qs('#invoiceActions');
  if (!container) return;

  const einvoicePerms = getEinvoicePerms();
  let html = '';

  // Prepare butonu (draft ise)
  if (invoice.status === 'draft' && einvoicePerms.einvoice.create && can(einvoicePerms.einvoice.create)) {
    html += `<button id="btnPrepareInvoice" class="btn btn-primary">📋 Hazırla</button>`;
  }

  // Send butonu (ready ise)
  if (invoice.status === 'ready' && einvoicePerms.einvoice.send && can(einvoicePerms.einvoice.send)) {
    html += `<button id="btnSendInvoice" class="btn btn-primary">📤 Gönder</button>`;
  }

  // Status butonu (sent/accepted/rejected ise)
  if ((invoice.status === 'sent' || invoice.status === 'accepted' || invoice.status === 'rejected') &&
    einvoicePerms.einvoice.status && can(einvoicePerms.einvoice.status)) {
    html += `<button id="btnSyncInvoiceStatus" class="btn btn-secondary">🔄 Durum Güncelle</button>`;
  }

  // PDF butonu (view yetkisi varsa)
  if (einvoicePerms.einvoice.view && can(einvoicePerms.einvoice.view)) {
    if (invoice.edoc?.pdfUrl) {
      html += `<button id="btnViewInvoicePdf" class="btn btn-secondary" data-pdf-url="${DOMPurify.sanitize(invoice.edoc.pdfUrl, { ALLOWED_TAGS: [] })}">📄 PDF Görüntüle</button>`;
    } else if (invoice.edoc?.externalId) {
      html += `<button id="btnGetInvoicePdf" class="btn btn-secondary">📄 PDF Al</button>`;
    }
  }

  // Cancel butonu (sent/accepted ise)
  if ((invoice.status === 'sent' || invoice.status === 'accepted') &&
    einvoicePerms.einvoice.cancel && can(einvoicePerms.einvoice.cancel)) {
    html += `<button id="btnCancelInvoice" class="btn btn-danger">❌ İptal Et</button>`;
  }

  container.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['button'],
    ALLOWED_ATTR: ['id', 'class', 'data-pdf-url']
  });
}

/**
 * Event listener'ları kur
 */
function setupEventListeners() {
  // Prepare butonu
  qs('#btnPrepareInvoice')?.addEventListener('click', async () => {
    if (!currentInvoice) return;
    await prepareInvoice(currentInvoice.id);
  });

  // Send butonu
  qs('#btnSendInvoice')?.addEventListener('click', async () => {
    if (!currentInvoice) return;
    await sendInvoice(currentInvoice.id);
  });

  // Status sync butonu
  qs('#btnSyncInvoiceStatus')?.addEventListener('click', async () => {
    if (!currentInvoice) return;
    await syncInvoiceStatus(currentInvoice.id);
  });

  // PDF görüntüle butonu
  qs('#btnViewInvoicePdf')?.addEventListener('click', (e) => {
    const pdfUrl = e.target.getAttribute('data-pdf-url');
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  });

  // PDF al butonu
  qs('#btnGetInvoicePdf')?.addEventListener('click', async () => {
    if (!currentInvoice) return;
    await getInvoicePdf(currentInvoice.id);
  });

  // Cancel butonu
  qs('#btnCancelInvoice')?.addEventListener('click', async () => {
    if (!currentInvoice) return;
    if (!confirm('Faturayı iptal etmek istediğinizden emin misiniz?')) {
      return;
    }
    await cancelInvoice(currentInvoice.id);
  });
}

/**
 * Invoice prepare
 */
async function prepareInvoice(invoiceId) {
  try {
    logger.group('Fatura Hazırlanıyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.einvoice.create || !can(einvoicePerms.einvoice.create)) {
      toast.error('Fatura hazırlama yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/invoices/${invoiceId}/prepare`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.message || 'Fatura hazırlanamadı');
    }
    toast.success('Fatura hazırlandı');
    await loadInvoice(invoiceId);
    logger.end();
  } catch (error) {
    logger.error('Fatura hazırlama hatası', error);
    toast.error(`Fatura hazırlanamadı: ${error.message}`);
    logger.end();
  }
}

/**
 * Invoice send
 */
async function sendInvoice(invoiceId) {
  try {
    logger.group('Fatura Gönderiliyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.einvoice.send || !can(einvoicePerms.einvoice.send)) {
      toast.error('Fatura gönderme yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/invoices/${invoiceId}/send`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fatura gönderilemedi');
    }
    const data = await response.json();
    toast.success('Fatura gönderildi');
    logger.info('Fatura gönderildi', { invoiceId, externalId: data.externalId, uuid: data.uuid });
    await loadInvoice(invoiceId);
    logger.end();
  } catch (error) {
    logger.error('Fatura gönderme hatası', error);
    toast.error(`Fatura gönderilemedi: ${error.message}`);
    logger.end();
  }
}

/**
 * Invoice status sync
 */
async function syncInvoiceStatus(invoiceId) {
  try {
    logger.group('Fatura Durumu Güncelleniyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.einvoice.status || !can(einvoicePerms.einvoice.status)) {
      toast.error('Fatura durumu sorgulama yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/invoices/${invoiceId}/status`, {
      method: 'GET'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fatura durumu sorgulanamadı');
    }
    const data = await response.json();
    toast.success('Fatura durumu güncellendi');
    await loadInvoice(invoiceId);
    logger.end();
  } catch (error) {
    logger.error('Fatura durumu güncelleme hatası', error);
    toast.error(`Fatura durumu güncellenemedi: ${error.message}`);
    logger.end();
  }
}

/**
 * Invoice PDF al
 */
async function getInvoicePdf(invoiceId) {
  try {
    logger.group('Fatura PDF Alınıyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.einvoice.view || !can(einvoicePerms.einvoice.view)) {
      toast.error('Fatura PDF görüntüleme yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/invoices/${invoiceId}/pdf`, {
      method: 'GET'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fatura PDF alınamadı');
    }
    const data = await response.json();
    if (data.ok && data.pdfUrl) {
      window.open(data.pdfUrl, '_blank');
      toast.success('PDF açıldı');
    }
    await loadInvoice(invoiceId);
    logger.end();
  } catch (error) {
    logger.error('Fatura PDF alma hatası', error);
    toast.error(`Fatura PDF alınamadı: ${error.message}`);
    logger.end();
  }
}

/**
 * Invoice cancel
 */
async function cancelInvoice(invoiceId) {
  try {
    logger.group('Fatura İptal Ediliyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.einvoice.cancel || !can(einvoicePerms.einvoice.cancel)) {
      toast.error('Fatura iptal etme yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/invoices/${invoiceId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fatura iptal edilemedi');
    }
    toast.success('Fatura iptal edildi');
    await loadInvoice(invoiceId);
    logger.end();
  } catch (error) {
    logger.error('Fatura iptal hatası', error);
    toast.error(`Fatura iptal edilemedi: ${error.message}`);
    logger.end();
  }
}

/**
 * Document status badge oluştur
 */
function getDocumentStatusInfo(status) {
  const statusMap = {
    draft: { label: 'Taslak', class: 'badge-draft' },
    ready: { label: 'Hazır', class: 'badge-warning' },
    sent: { label: 'Gönderildi', class: 'badge-sent' },
    accepted: { label: 'Kabul Edildi', class: 'badge-paid' },
    rejected: { label: 'Reddedildi', class: 'badge-cancelled' },
    cancelled: { label: 'İptal Edildi', class: 'badge-cancelled' }
  };
  const statusInfo = statusMap[status] || { label: status || '-', class: 'badge-secondary' };
  return {
    class: statusInfo.class,
    label: String(statusInfo.label || '-'),
  };
}

