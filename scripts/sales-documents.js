/**
 * Sales Documents - E-Belge UI Flow
 * Teklifbul Rule v1.0 - Invoice/Delivery Note UI handlers
 */

import { authFetch } from '../assets/js/utils/api-helpers.js';
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { can, getEinvoicePerms } from '../assets/js/state/permissions.js';
import { getSalesPerms } from '../assets/js/state/permissions.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';

const SALES_PERMS = getSalesPerms();

/**
 * Satış belgelerini yükle (Faturalar + İrsaliyeler)
 */
export async function loadSaleDocuments(sale) {
  try {
    logger.group('Satış Belgeleri Yükleniyor');

    if (!sale || !sale.id) {
      logger.warn('Sale ID bulunamadı');
      logger.end();
      return;
    }

    const einvoicePerms = getEinvoicePerms();

    // Butonları göster/gizle
    const btnCreateInvoice = document.querySelector('#btnCreateInvoiceFromSale');
    const btnCreateDelivery = document.querySelector('#btnCreateDeliveryFromSale');

    if (btnCreateInvoice) {
      const canCreateInvoice = (SALES_PERMS.createInvoice && can(SALES_PERMS.createInvoice)) ||
                               (einvoicePerms.einvoice.create && can(einvoicePerms.einvoice.create));
      btnCreateInvoice.style.display = canCreateInvoice ? 'inline-block' : 'none';
    }

    if (btnCreateDelivery) {
      const canCreateDelivery = (SALES_PERMS.createDeliveryNote && can(SALES_PERMS.createDeliveryNote)) ||
                                (einvoicePerms.edespatch.create && can(einvoicePerms.edespatch.create));
      btnCreateDelivery.style.display = canCreateDelivery ? 'inline-block' : 'none';
    }

    // Faturaları yükle
    const invoices = await loadSaleInvoices(sale.invoiceIds || []);

    // İrsaliyeleri yükle
    const deliveryNotes = await loadSaleDeliveryNotes(sale.deliveryNoteIds || []);

    // Teklifbul Rule v1.0 - Son belge durumlarını badge'e gönder
    const lastInvoice = invoices.length > 0 ? invoices[invoices.length - 1] : null;
    const lastDelivery = deliveryNotes.length > 0 ? deliveryNotes[deliveryNotes.length - 1] : null;

    // renderEdocLockBadge'ı güncelle (sales.js'den import et)
    if (window.location.pathname.includes('sale-detail.html')) {
      import('./sales.js').then(({ renderEdocLockBadge }) => {
        renderEdocLockBadge(sale, {
          lastInvoiceStatus: lastInvoice?.status || null,
          lastDeliveryStatus: lastDelivery?.status || null
        });
      }).catch((error) => {
        logger.warn('sales.js import edilemedi (renderEdocLockBadge)', error);
      });
    }

    logger.end();
  } catch (error) {
    logger.error('Satış belgeleri yüklenirken hata', error);
    toast.error(`Belgeler yüklenirken hata: ${error.message}`);
  }
}

/**
 * Satış faturalarını yükle
 * Teklifbul Rule v1.0 - Invoice listesi döndürüyor (badge için)
 */
async function loadSaleInvoices(invoiceIds) {
  const container = document.querySelector('#invoiceListContainer');
  if (!container) return [];

  if (!invoiceIds || invoiceIds.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280; font-size:14px;">Henüz fatura oluşturulmamış</div>';
    return [];
  }

  try {
    const einvoicePerms = getEinvoicePerms();
    
    // Teklifbul Rule v1.0 - PERFORMANCE: Parallel loading (N+1 query fix)
    // Sequential await yerine Promise.all kullanarak tüm invoice'ları paralel yükle
    const invoicePromises = invoiceIds.map(async (invoiceId) => {
      try {
        const response = await authFetch(`/api/invoices/${invoiceId}`, { method: 'GET' });
        if (!response.ok) {
          logger.warn('Invoice yüklenemedi', { invoiceId });
          return null;
        }
        const data = await response.json();
        if (data.ok && data.invoice) {
          return data.invoice;
        }
        return null;
      } catch (error) {
        logger.warn('Invoice yükleme hatası', { invoiceId, error: error.message });
        return null;
      }
    });
    
    const invoiceResults = await Promise.allSettled(invoicePromises);
    const invoices = invoiceResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    if (invoices.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280; font-size:14px;">Fatura yüklenemedi</div>';
      return;
    }

    const invoicesHTML = invoices.map((invoice) => {
      const statusBadge = getDocumentStatusBadge(invoice.status);
      const canView = einvoicePerms.einvoice.view && can(einvoicePerms.einvoice.view);
      const canStatus = einvoicePerms.einvoice.status && can(einvoicePerms.einvoice.status);

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:8px; background:#fff">
          <div style="flex:1">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px">
              <strong style="color:#1f2937">${DOMPurify.sanitize(invoice.number || 'N/A', { ALLOWED_TAGS: [] })}</strong>
              ${statusBadge}
            </div>
            <div style="font-size:12px; color:#6b7280">
              Oluşturulma: ${formatDate(invoice.createdAt)}
            </div>
          </div>
          <div style="display:flex; gap:8px">
            ${canView ? `<a href="/pages/invoice-detail.html?id=${invoice.id}" class="btn btn-secondary" style="padding:6px 12px; font-size:12px;">Detay</a>` : ''}
            ${canView && invoice.edoc?.pdfUrl ? `<button class="btn btn-secondary btn-invoice-pdf" data-invoice-id="${invoice.id}" data-pdf-url="${DOMPurify.sanitize(invoice.edoc.pdfUrl, { ALLOWED_TAGS: [] })}" style="padding:6px 12px; font-size:12px;">PDF</button>` : ''}
            ${canStatus ? `<button class="btn btn-secondary btn-invoice-status" data-invoice-id="${invoice.id}" style="padding:6px 12px; font-size:12px;">Durum</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = DOMPurify.sanitize(invoicesHTML, {
      ALLOWED_TAGS: ['div', 'strong', 'span', 'a', 'button'],
      ALLOWED_ATTR: ['class', 'style', 'href', 'data-invoice-id', 'data-pdf-url']
    });

    container.querySelectorAll('.btn-invoice-pdf').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const pdfUrl = e.target.getAttribute('data-pdf-url');
        if (pdfUrl) window.open(pdfUrl, '_blank');
      });
    });

    container.querySelectorAll('.btn-invoice-status').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const invoiceId = e.target.getAttribute('data-invoice-id');
        if (invoiceId) await syncInvoiceStatus(invoiceId);
      });
    });

    return invoices; // Teklifbul Rule v1.0 - Invoice listesi döndür
  } catch (error) {
    logger.error('Faturalar yüklenirken hata', error);
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#dc2626; font-size:14px;">Faturalar yüklenirken hata oluştu</div>';
    return [];
  }
}

/**
 * Satış irsaliyelerini yükle
 * Teklifbul Rule v1.0 - Delivery note listesi döndürüyor (badge için)
 */
async function loadSaleDeliveryNotes(deliveryNoteIds) {
  const container = document.querySelector('#deliveryListContainer');
  if (!container) return [];

  if (!deliveryNoteIds || deliveryNoteIds.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280; font-size:14px;">Henüz irsaliye oluşturulmamış</div>';
    return [];
  }

  try {
    const einvoicePerms = getEinvoicePerms();
    
    // Teklifbul Rule v1.0 - PERFORMANCE: Parallel loading (N+1 query fix)
    // Sequential await yerine Promise.all kullanarak tüm delivery note'ları paralel yükle
    const deliveryNotePromises = deliveryNoteIds.map(async (deliveryNoteId) => {
      try {
        const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}`, { method: 'GET' });
        if (!response.ok) {
          logger.warn('Delivery note yüklenemedi', { deliveryNoteId });
          return null;
        }
        const data = await response.json();
        if (data.ok && data.deliveryNote) {
          return data.deliveryNote;
        }
        return null;
      } catch (error) {
        logger.warn('Delivery note yükleme hatası', { deliveryNoteId, error: error.message });
        return null;
      }
    });
    
    const deliveryNoteResults = await Promise.allSettled(deliveryNotePromises);
    const deliveryNotes = deliveryNoteResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    if (deliveryNotes.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280; font-size:14px;">İrsaliye yüklenemedi</div>';
      return;
    }

    const deliveryNotesHTML = deliveryNotes.map((dn) => {
      const statusBadge = getDocumentStatusBadge(dn.status);
      const canView = einvoicePerms.edespatch.view && can(einvoicePerms.edespatch.view);
      const canStatus = einvoicePerms.edespatch.status && can(einvoicePerms.edespatch.status);

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid #e5e7eb; border-radius:6px; margin-bottom:8px; background:#fff">
          <div style="flex:1">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px">
              <strong style="color:#1f2937">${DOMPurify.sanitize(dn.number || 'N/A', { ALLOWED_TAGS: [] })}</strong>
              ${statusBadge}
            </div>
            <div style="font-size:12px; color:#6b7280">
              Oluşturulma: ${formatDate(dn.createdAt)}
            </div>
          </div>
          <div style="display:flex; gap:8px">
            ${canView ? `<a href="/pages/delivery-note-detail.html?id=${dn.id}" class="btn btn-secondary" style="padding:6px 12px; font-size:12px;">Detay</a>` : ''}
            ${canView && dn.edoc?.pdfUrl ? `<button class="btn btn-secondary btn-delivery-pdf" data-delivery-id="${dn.id}" data-pdf-url="${DOMPurify.sanitize(dn.edoc.pdfUrl, { ALLOWED_TAGS: [] })}" style="padding:6px 12px; font-size:12px;">PDF</button>` : ''}
            ${canStatus ? `<button class="btn btn-secondary btn-delivery-status" data-delivery-id="${dn.id}" style="padding:6px 12px; font-size:12px;">Durum</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = DOMPurify.sanitize(deliveryNotesHTML, {
      ALLOWED_TAGS: ['div', 'strong', 'span', 'a', 'button'],
      ALLOWED_ATTR: ['class', 'style', 'href', 'data-delivery-id', 'data-pdf-url']
    });

    container.querySelectorAll('.btn-delivery-pdf').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const pdfUrl = e.target.getAttribute('data-pdf-url');
        if (pdfUrl) window.open(pdfUrl, '_blank');
      });
    });

    container.querySelectorAll('.btn-delivery-status').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const deliveryNoteId = e.target.getAttribute('data-delivery-id');
        if (deliveryNoteId) await syncDeliveryNoteStatus(deliveryNoteId);
      });
    });

    return deliveryNotes; // Teklifbul Rule v1.0 - Delivery note listesi döndür
  } catch (error) {
    logger.error('İrsaliyeler yüklenirken hata', error);
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#dc2626; font-size:14px;">İrsaliyeler yüklenirken hata oluştu</div>';
    return [];
  }
}

/**
 * Document status badge oluştur
 */
function getDocumentStatusBadge(status) {
  const statusMap = {
    draft: { label: 'Taslak', class: 'badge-draft' },
    ready: { label: 'Hazır', class: 'badge-warning' },
    sent: { label: 'Gönderildi', class: 'badge-info' },
    accepted: { label: 'Kabul Edildi', class: 'badge-success' },
    rejected: { label: 'Reddedildi', class: 'badge-danger' },
    cancelled: { label: 'İptal Edildi', class: 'badge-danger' }
  };
  const statusInfo = statusMap[status] || { label: status, class: 'badge-secondary' };
  return `<span class="badge ${statusInfo.class}">${DOMPurify.sanitize(statusInfo.label, { ALLOWED_TAGS: [] })}</span>`;
}

/**
 * Fatura oluştur (sale'dan)
 */
export async function createInvoiceFromSale(saleId) {
  try {
    logger.group('Fatura Oluşturuluyor');
    const einvoicePerms = getEinvoicePerms();
    const canCreate = (SALES_PERMS.createInvoice && can(SALES_PERMS.createInvoice)) ||
                      (einvoicePerms.einvoice.create && can(einvoicePerms.einvoice.create));
    if (!canCreate) {
      toast.error('Fatura oluşturma yetkiniz yok');
      logger.end();
      return;
    }
    const { requireCompanyContext } = await import('../assets/js/state/company-context.js');
    const ctx = await requireCompanyContext();
    
    // Idempotency: requestId üret
    const requestId = crypto.randomUUID();

    const response = await authFetch('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({ 
        saleId: saleId,
        companyId: ctx.companyId,
        requestId: requestId
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Fatura oluşturulamadı');
    }
    const data = await response.json();
    if (data.ok) {
      toast.success('Fatura taslağı oluşturuldu');
      window.location.href = `/pages/invoice-detail.html?id=${data.invoiceId}`;
    }
    logger.end();
  } catch (error) {
    logger.error('Fatura oluşturma hatası', error);
    toast.error(`Fatura oluşturulamadı: ${error.message}`);
    logger.end();
  }
}

/**
 * İrsaliye oluştur (sale'dan)
 */
export async function createDeliveryNoteFromSale(saleId) {
  try {
    logger.group('İrsaliye Oluşturuluyor');
    const einvoicePerms = getEinvoicePerms();
    const canCreate = (SALES_PERMS.createDeliveryNote && can(SALES_PERMS.createDeliveryNote)) ||
                      (einvoicePerms.edespatch.create && can(einvoicePerms.edespatch.create));
    if (!canCreate) {
      toast.error('İrsaliye oluşturma yetkiniz yok');
      logger.end();
      return;
    }
    const { requireCompanyContext } = await import('../assets/js/state/company-context.js');
    const ctx = await requireCompanyContext();
    const response = await authFetch(`/api/sales/${saleId}/delivery-note`, {
      method: 'POST',
      body: JSON.stringify({ companyId: ctx.companyId })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'İrsaliye oluşturulamadı');
    }
    const data = await response.json();
    if (data.ok) {
      toast.success('İrsaliye taslağı oluşturuldu');
      window.location.href = `/pages/delivery-note-detail.html?id=${data.deliveryNoteId}`;
    }
    logger.end();
  } catch (error) {
    logger.error('İrsaliye oluşturma hatası', error);
    toast.error(`İrsaliye oluşturulamadı: ${error.message}`);
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
    const response = await authFetch(`/api/invoices/${invoiceId}/status`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fatura durumu sorgulanamadı');
    }
    const data = await response.json();
    if (data.ok) {
      toast.success('Fatura durumu güncellendi');
      // Sale detail'i yeniden yükle
      const { state, loadSaleDetail } = await import('./sales.js');
      if (state.currentSale) {
        await loadSaleDetail();
      }
    }
    logger.end();
  } catch (error) {
    logger.error('Fatura durumu güncelleme hatası', error);
    toast.error(`Fatura durumu güncellenemedi: ${error.message}`);
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
    const response = await authFetch(`/api/delivery-notes/${deliveryNoteId}/status`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'İrsaliye durumu sorgulanamadı');
    }
    const data = await response.json();
    if (data.ok) {
      toast.success('İrsaliye durumu güncellendi');
      // Sale detail'i yeniden yükle
      const { state, loadSaleDetail } = await import('./sales.js');
      if (state.currentSale) {
        await loadSaleDetail();
      }
    }
    logger.end();
  } catch (error) {
    logger.error('İrsaliye durumu güncelleme hatası', error);
    toast.error(`İrsaliye durumu güncellenemedi: ${error.message}`);
    logger.end();
  }
}

/**
 * Format date helper
 */
function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('tr-TR');
}

