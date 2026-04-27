/**
 * Delivery Note Detail - E-Belge UI Flow
 * Teklifbul Rule v1.0 - Delivery note detail sayfası için handler'lar
 */

import { authFetch } from '../assets/js/utils/api-helpers.js';
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { can, getEinvoicePerms } from '../assets/js/state/permissions.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { formatCurrency, formatDate } from './sales.js';

const qs = (s) => document.querySelector(s);

let currentDeliveryNote = null;
let companyId = null;

// Initialize
(async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const deliveryNoteId = urlParams.get('id');

    if (!deliveryNoteId) {
      toast.error('İrsaliye ID bulunamadı');
      window.location.href = '/pages/sales.html';
      return;
    }

    const ctx = await requireCompanyContext({ redirectOnPending: true });
    if (!ctx || !ctx.companyId) {
      logger.warn('Delivery note detail: company context alınamadı');
      return;
    }

    companyId = ctx.companyId;

    await loadDeliveryNote(deliveryNoteId);
    setupEventListeners();
  } catch (error) {
    logger.error('Delivery note detail initialization error', error);
    toast.error(`Başlatma hatası: ${error.message}`);
  }
})();

/**
 * Delivery note yükle
 */
async function loadDeliveryNote(deliveryNoteId) {
  try {
    logger.group('İrsaliye Yükleniyor');

    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'İrsaliye yüklenemedi');
    }

    const data = await response.json();
    if (!data.ok || !data.deliveryNote) {
      throw new Error('İrsaliye bulunamadı');
    }

    currentDeliveryNote = data.deliveryNote;

    // Delivery note'u render et
    renderDeliveryNoteDetail(currentDeliveryNote);

    logger.info('İrsaliye yüklendi', { deliveryNoteId });
    logger.end();
  } catch (error) {
    logger.error('İrsaliye yüklenirken hata', error);
    toast.error(`İrsaliye yüklenemedi: ${error.message}`);
    logger.end();
  }
}

/**
 * Delivery note detayını render et
 */
function renderDeliveryNoteDetail(deliveryNote) {
  // Genel bilgiler
  if (qs('#deliveryNumber')) {
    qs('#deliveryNumber').textContent = deliveryNote.number || 'N/A';
  }
  if (qs('#deliveryNumberDetail')) {
    qs('#deliveryNumberDetail').textContent = deliveryNote.number || 'N/A';
  }

  // Status badge
  const statusBadge = getDocumentStatusBadge(deliveryNote.status);
  if (qs('#deliveryStatus')) {
    qs('#deliveryStatus').innerHTML = statusBadge;
  }

  // CreatedAt
  if (qs('#createdAt') && deliveryNote.createdAt) {
    qs('#createdAt').textContent = formatDate(deliveryNote.createdAt);
  }

  // Snapshot varsa göster
  if (deliveryNote.snapshot) {
    renderSnapshot(deliveryNote.snapshot);
    if (qs('#deliverySnapshotCard')) {
      qs('#deliverySnapshotCard').style.display = 'block';
    }
  }

  // Aksiyon butonlarını render et
  renderDeliveryNoteActions(deliveryNote);
}

/**
 * Snapshot render et
 */
function renderSnapshot(snapshot) {
  // Seller snapshot
  if (snapshot.seller && qs('#deliverySellerSnapshot')) {
    const seller = snapshot.seller;
    qs('#deliverySellerSnapshot').innerHTML = DOMPurify.sanitize(`
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
  if (snapshot.buyer && qs('#deliveryBuyerSnapshot')) {
    const buyer = snapshot.buyer;
    qs('#deliveryBuyerSnapshot').innerHTML = DOMPurify.sanitize(`
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

  // Shipment snapshot
  if (snapshot.shipment && qs('#deliveryShipment')) {
    const shipment = snapshot.shipment;
    qs('#deliveryShipment').innerHTML = DOMPurify.sanitize(`
      <div><strong>Teslimat Tarihi:</strong> ${formatDate(shipment.shipDate)}</div>
      ${shipment.fromLocationName ? `<div><strong>Gönderim Lokasyonu:</strong> ${shipment.fromLocationName}</div>` : ''}
      ${shipment.shipToAddress ? `
        <div style="margin-top:8px"><strong>Teslimat Adresi:</strong></div>
        <div style="padding-left:16px; color:#6b7280">
          ${shipment.shipToAddress.line1 || ''}<br/>
          ${shipment.shipToAddress.line2 ? shipment.shipToAddress.line2 + '<br/>' : ''}
          ${shipment.shipToAddress.district || ''} ${shipment.shipToAddress.city || ''}<br/>
          ${shipment.shipToAddress.postalCode || ''} ${shipment.shipToAddress.country || 'TR'}
        </div>
      ` : ''}
    `, {
      ALLOWED_TAGS: ['div', 'strong', 'br'],
      ALLOWED_ATTR: ['style']
    });
  }

  // Items snapshot
  if (snapshot.items && qs('#deliveryItemsTableBody')) {
    const tbody = qs('#deliveryItemsTableBody');
    if (snapshot.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#6b7280">Kalem bulunamadı</td></tr>';
    } else {
      const itemsHTML = snapshot.items.map((item) => {
        return `
          <tr>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb">${DOMPurify.sanitize(item.sku || 'N/A', { ALLOWED_TAGS: [] })}</td>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb">${DOMPurify.sanitize(item.name || 'N/A', { ALLOWED_TAGS: [] })}</td>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb; text-align:right">${item.quantity || 0}</td>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb">${DOMPurify.sanitize(item.unit || 'AD', { ALLOWED_TAGS: [] })}</td>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb; text-align:right">${formatCurrency(item.unitPrice || 0, snapshot.totals?.currency || 'TRY')}</td>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb; text-align:right">${item.vatRate || 0}%</td>
            <td style="padding:12px; border-bottom:1px solid #e5e7eb; text-align:right">${formatCurrency(item.totalWithVat || item.totalPrice || 0, snapshot.totals?.currency || 'TRY')}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = DOMPurify.sanitize(itemsHTML, {
        ALLOWED_TAGS: ['tr', 'td'],
        ALLOWED_ATTR: ['style']
      });
    }
  }

  // Totals snapshot
  if (snapshot.totals && qs('#deliveryTotals')) {
    const totals = snapshot.totals;
    qs('#deliveryTotals').innerHTML = DOMPurify.sanitize(`
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
}

/**
 * Delivery note aksiyon butonlarını render et
 */
function renderDeliveryNoteActions(deliveryNote) {
  const container = qs('#deliveryActions');
  if (!container) return;

  const einvoicePerms = getEinvoicePerms();
  let html = '';

  // Prepare butonu (draft ise)
  if (deliveryNote.status === 'draft' && einvoicePerms.edespatch.create && can(einvoicePerms.edespatch.create)) {
    html += `<button id="btnPrepareDelivery" class="btn btn-primary">📋 Hazırla</button>`;
  }

  // Send butonu (ready ise)
  if (deliveryNote.status === 'ready' && einvoicePerms.edespatch.send && can(einvoicePerms.edespatch.send)) {
    html += `<button id="btnSendDelivery" class="btn btn-primary">📤 Gönder</button>`;
  }

  // Status butonu (sent/accepted/rejected ise)
  if ((deliveryNote.status === 'sent' || deliveryNote.status === 'accepted' || deliveryNote.status === 'rejected') &&
      einvoicePerms.edespatch.status && can(einvoicePerms.edespatch.status)) {
    html += `<button id="btnSyncDeliveryStatus" class="btn btn-secondary">🔄 Durum Güncelle</button>`;
  }

  // PDF butonu (view yetkisi varsa)
  if (einvoicePerms.edespatch.view && can(einvoicePerms.edespatch.view)) {
    if (deliveryNote.edoc?.pdfUrl) {
      html += `<button id="btnOpenDeliveryPdf" class="btn btn-secondary" data-pdf-url="${DOMPurify.sanitize(deliveryNote.edoc.pdfUrl, { ALLOWED_TAGS: [] })}">📄 PDF Görüntüle</button>`;
    } else if (deliveryNote.edoc?.externalId) {
      html += `<button id="btnGetDeliveryPdf" class="btn btn-secondary">📄 PDF Al</button>`;
    }
  }

  // Cancel butonu (sent/accepted ise)
  if ((deliveryNote.status === 'sent' || deliveryNote.status === 'accepted') &&
      einvoicePerms.edespatch.cancel && can(einvoicePerms.edespatch.cancel)) {
    html += `<button id="btnCancelDelivery" class="btn btn-danger">❌ İptal Et</button>`;
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
  qs('#btnPrepareDelivery')?.addEventListener('click', async () => {
    if (!currentDeliveryNote) return;
    await prepareDeliveryNote(currentDeliveryNote.id);
  });

  // Send butonu
  qs('#btnSendDelivery')?.addEventListener('click', async () => {
    if (!currentDeliveryNote) return;
    await sendDeliveryNote(currentDeliveryNote.id);
  });

  // Status sync butonu
  qs('#btnSyncDeliveryStatus')?.addEventListener('click', async () => {
    if (!currentDeliveryNote) return;
    await syncDeliveryNoteStatus(currentDeliveryNote.id);
  });

  // PDF görüntüle butonu
  qs('#btnOpenDeliveryPdf')?.addEventListener('click', (e) => {
    const pdfUrl = e.target.getAttribute('data-pdf-url');
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  });

  // PDF al butonu
  qs('#btnGetDeliveryPdf')?.addEventListener('click', async () => {
    if (!currentDeliveryNote) return;
    await getDeliveryNotePdf(currentDeliveryNote.id);
  });

  // Cancel butonu
  qs('#btnCancelDelivery')?.addEventListener('click', async () => {
    if (!currentDeliveryNote) return;
    if (!confirm('İrsaliyeyi iptal etmek istediğinizden emin misiniz?')) {
      return;
    }
    await cancelDeliveryNote(currentDeliveryNote.id);
  });
}

/**
 * Delivery note prepare
 */
async function prepareDeliveryNote(deliveryNoteId) {
  try {
    logger.group('İrsaliye Hazırlanıyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.edespatch.create || !can(einvoicePerms.edespatch.create)) {
      toast.error('İrsaliye hazırlama yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}/prepare`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });
    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error || 'İrsaliye hazırlanamadı';
      if (error.errorType === 'VALIDATION_ERROR' && error.details) {
        toast.error(`Validasyon hatası: ${error.details.join('; ')}`);
      } else if (error.errorType === 'FORBIDDEN') {
        toast.error('Yetkiniz yok');
      } else {
        toast.error(errorMessage);
      }
      throw new Error(errorMessage);
    }
    toast.success('İrsaliye hazırlandı');
    await loadDeliveryNote(deliveryNoteId);
    logger.end();
  } catch (error) {
    logger.error('İrsaliye hazırlama hatası', error);
    if (!error.message.includes('Yetkiniz yok') && !error.message.includes('Validasyon')) {
      toast.error(`İrsaliye hazırlanamadı: ${error.message}`);
    }
    logger.end();
  }
}

/**
 * Delivery note send
 */
async function sendDeliveryNote(deliveryNoteId) {
  try {
    logger.group('İrsaliye Gönderiliyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.edespatch.send || !can(einvoicePerms.edespatch.send)) {
      toast.error('İrsaliye gönderme yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}/send`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });
    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error || 'İrsaliye gönderilemedi';
      if (error.errorType === 'FORBIDDEN') {
        toast.error('Yetkiniz yok');
      } else if (error.errorType === 'PROVIDER_ERROR') {
        toast.error(`Sağlayıcı hatası: ${error.message || errorMessage}`);
      } else {
        toast.error(errorMessage);
      }
      throw new Error(errorMessage);
    }
    const data = await response.json();
    toast.success('İrsaliye gönderildi');
    logger.info('İrsaliye gönderildi', { deliveryNoteId, externalId: data.externalId, uuid: data.uuid });
    await loadDeliveryNote(deliveryNoteId);
    logger.end();
  } catch (error) {
    logger.error('İrsaliye gönderme hatası', error);
    if (!error.message.includes('Yetkiniz yok')) {
      toast.error(`İrsaliye gönderilemedi: ${error.message}`);
    }
    logger.end();
  }
}

/**
 * Delivery note status sync
 */
async function syncDeliveryNoteStatus(deliveryNoteId) {
  try {
    logger.group('İrsaliye Durumu Güncelleniyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.edespatch.status || !can(einvoicePerms.edespatch.status)) {
      toast.error('İrsaliye durumu sorgulama yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}/status`, {
      method: 'GET'
    });
    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error || 'İrsaliye durumu sorgulanamadı';
      if (error.errorType === 'FORBIDDEN') {
        toast.error('Yetkiniz yok');
      } else if (error.errorType === 'PROVIDER_ERROR') {
        toast.error(`Sağlayıcı hatası: ${error.message || errorMessage}`);
      } else {
        toast.error(errorMessage);
      }
      throw new Error(errorMessage);
    }
    const data = await response.json();
    toast.success('İrsaliye durumu güncellendi');
    await loadDeliveryNote(deliveryNoteId);
    logger.end();
  } catch (error) {
    logger.error('İrsaliye durumu güncelleme hatası', error);
    if (!error.message.includes('Yetkiniz yok')) {
      toast.error(`İrsaliye durumu güncellenemedi: ${error.message}`);
    }
    logger.end();
  }
}

/**
 * Delivery note PDF al
 */
async function getDeliveryNotePdf(deliveryNoteId) {
  try {
    logger.group('İrsaliye PDF Alınıyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.edespatch.view || !can(einvoicePerms.edespatch.view)) {
      toast.error('İrsaliye PDF görüntüleme yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}/pdf`, {
      method: 'GET'
    });
    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error || 'İrsaliye PDF alınamadı';
      if (error.errorType === 'FORBIDDEN') {
        toast.error('Yetkiniz yok');
      } else if (error.errorType === 'PROVIDER_ERROR') {
        toast.error(`Sağlayıcı hatası: ${error.message || errorMessage}`);
      } else {
        toast.error(errorMessage);
      }
      throw new Error(errorMessage);
    }
    const data = await response.json();
    if (data.ok && data.pdfUrl) {
      window.open(data.pdfUrl, '_blank');
      toast.success('PDF açıldı');
    }
    await loadDeliveryNote(deliveryNoteId);
    logger.end();
  } catch (error) {
    logger.error('İrsaliye PDF alma hatası', error);
    if (!error.message.includes('Yetkiniz yok')) {
      toast.error(`İrsaliye PDF alınamadı: ${error.message}`);
    }
    logger.end();
  }
}

/**
 * Delivery note cancel
 */
async function cancelDeliveryNote(deliveryNoteId) {
  try {
    logger.group('İrsaliye İptal Ediliyor');
    const einvoicePerms = getEinvoicePerms();
    if (!einvoicePerms.edespatch.cancel || !can(einvoicePerms.edespatch.cancel)) {
      toast.error('İrsaliye iptal etme yetkiniz yok');
      logger.end();
      return;
    }
    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });
    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error || 'İrsaliye iptal edilemedi';
      if (error.errorType === 'FORBIDDEN') {
        toast.error('Yetkiniz yok');
      } else if (error.errorType === 'PROVIDER_ERROR') {
        toast.error(`Sağlayıcı hatası: ${error.message || errorMessage}`);
      } else {
        toast.error(errorMessage);
      }
      throw new Error(errorMessage);
    }
    toast.success('İrsaliye iptal edildi');
    await loadDeliveryNote(deliveryNoteId);
    logger.end();
  } catch (error) {
    logger.error('İrsaliye iptal hatası', error);
    if (!error.message.includes('Yetkiniz yok')) {
      toast.error(`İrsaliye iptal edilemedi: ${error.message}`);
    }
    logger.end();
  }
}

/**
 * Document status badge oluştur
 */
function getDocumentStatusBadge(status) {
  const statusMap = {
    draft: { label: 'Taslak', class: 'badge-draft' },
    ready: { label: 'Hazır', class: 'badge-ready' },
    sent: { label: 'Gönderildi', class: 'badge-sent' },
    accepted: { label: 'Kabul Edildi', class: 'badge-accepted' },
    rejected: { label: 'Reddedildi', class: 'badge-rejected' },
    cancelled: { label: 'İptal Edildi', class: 'badge-cancelled' }
  };
  const statusInfo = statusMap[status] || { label: status, class: 'badge-secondary' };
  return `<span class="badge ${statusInfo.class}">${DOMPurify.sanitize(statusInfo.label, { ALLOWED_TAGS: [] })}</span>`;
}

