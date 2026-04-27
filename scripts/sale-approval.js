/**
 * Sale Approval UI - Satış Modülü Faz 3
 * Onay UI, iptal UI, double submit protection, race protection
 * Teklifbul Rule v1.0 - Double submit engelleme, race protection UI, toast notifications
 */

import { authFetch } from '../assets/js/utils/api-helpers.js';
import { toast } from '../src/shared/ui/toast.js';
import { logger } from '../src/shared/log/logger.js';

// Double submit protection: Her buton için request ID ve processing flag
const processingFlags = new Map();
const requestIds = new Map();

/**
 * UUID generate (request ID için)
 */
function generateRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Satış onayı
 * @param saleId - Satış ID
 * @param buttonElement - Buton elementi (disable için)
 */
export async function approveSale(saleId, buttonElement = null) {
  // Double submit protection
  if (processingFlags.get(saleId)) {
    logger.warn('Satış onayı zaten işleniyor', { saleId });
    toast.warn('Onay işlemi zaten devam ediyor. Lütfen bekleyin...');
    return;
  }

  processingFlags.set(saleId, true);
  const requestId = generateRequestId();
  requestIds.set(saleId, requestId);

  // Buton disable
  if (buttonElement) {
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'Onaylanıyor...';
  }

  try {
    logger.group('Satış Onaylanıyor');

    const response = await authFetch(`/api/sales/${saleId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ requestId })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Satış onaylanamadı');
    }

    // Yetersiz stok kontrolü
    if (result.insufficientStockItems && result.insufficientStockItems.length > 0) {
      const itemsList = result.insufficientStockItems
        .map((item) => `${item.sku}: ${item.requested} talep, ${item.available} mevcut`)
        .join('\n');

      toast.error(`Yetersiz stok:\n${itemsList}`);
      logger.warn('Satış onayı başarısız: Yetersiz stok', {
        saleId,
        insufficientStockItems: result.insufficientStockItems
      });
      return;
    }

    toast.success('Satış onaylandı');
    logger.info('Satış onaylandı', { saleId, requestId });

    // Sayfayı yenile (güncel durumu görmek için)
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    logger.error('Satış onayı hatası', error);
    toast.error(`Onay hatası: ${error.message}`);
  } finally {
    logger.end();
    processingFlags.set(saleId, false);
    requestIds.delete(saleId);

    // Buton enable
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = 'Onayla';
    }
  }
}

/**
 * Satış reddetme
 * @param saleId - Satış ID
 * @param buttonElement - Buton elementi (disable için)
 */
export async function rejectSale(saleId, buttonElement = null) {
  // Double submit protection
  if (processingFlags.get(`reject_${saleId}`)) {
    logger.warn('Satış reddetme zaten işleniyor', { saleId });
    toast.warn('Reddetme işlemi zaten devam ediyor. Lütfen bekleyin...');
    return;
  }

  // Red nedeni sor
  const reason = prompt('Red nedeni:');
  if (!reason || !reason.trim()) {
    toast.warn('Red nedeni girilmedi. İşlem iptal edildi.');
    return;
  }

  processingFlags.set(`reject_${saleId}`, true);

  // Buton disable
  if (buttonElement) {
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'Reddediliyor...';
  }

  try {
    logger.group('Satış Reddediliyor');

    const response = await authFetch(`/api/sales/${saleId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Satış reddedilemedi');
    }

    toast.success('Satış reddedildi');
    logger.info('Satış reddedildi', { saleId, reason });

    // Sayfayı yenile
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    logger.error('Satış reddetme hatası', error);
    toast.error(`Reddetme hatası: ${error.message}`);
  } finally {
    logger.end();
    processingFlags.set(`reject_${saleId}`, false);

    // Buton enable
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = 'Reddet';
    }
  }
}

/**
 * Satış iptali
 * @param saleId - Satış ID
 * @param buttonElement - Buton elementi (disable için)
 */
export async function cancelSale(saleId, buttonElement = null) {
  // Onay sor
  if (!confirm('Bu satışı iptal etmek istediğinizden emin misiniz?')) {
    return;
  }

  // Double submit protection
  if (processingFlags.get(`cancel_${saleId}`)) {
    logger.warn('Satış iptali zaten işleniyor', { saleId });
    toast.warn('İptal işlemi zaten devam ediyor. Lütfen bekleyin...');
    return;
  }

  const reason = prompt('İptal nedeni (opsiyonel):') || null;

  processingFlags.set(`cancel_${saleId}`, true);

  // Buton disable
  if (buttonElement) {
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'İptal ediliyor...';
  }

  try {
    logger.group('Satış İptal Ediliyor');

    const response = await authFetch(`/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason?.trim() || null })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Satış iptal edilemedi');
    }

    toast.success('Satış iptal edildi');
    logger.info('Satış iptal edildi', { saleId, reason });

    // Sayfayı yenile
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    logger.error('Satış iptali hatası', error);
    toast.error(`İptal hatası: ${error.message}`);
  } finally {
    logger.end();
    processingFlags.set(`cancel_${saleId}`, false);

    // Buton enable
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = 'İptal Et';
    }
  }
}

/**
 * Onaya gönderme (draft → pending_approval)
 * @param saleId - Satış ID
 * @param buttonElement - Buton elementi (disable için)
 */
export async function submitForApproval(saleId, buttonElement = null) {
  // Double submit protection
  if (processingFlags.get(`submit_${saleId}`)) {
    logger.warn('Onaya gönderme zaten işleniyor', { saleId });
    toast.warn('Onaya gönderme işlemi zaten devam ediyor. Lütfen bekleyin...');
    return;
  }

  processingFlags.set(`submit_${saleId}`, true);

  // Buton disable
  if (buttonElement) {
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'Gönderiliyor...';
  }

  try {
    logger.group('Satış Onaya Gönderiliyor');

    // CompanyId'yi al (state'ten)
    const { state } = await import('./sales.js');
    const companyId = state?.companyId;

    if (!companyId) {
      throw new Error('Company ID bulunamadı');
    }

    // Status'ü pending_approval yap (PUT /api/sales/:id)
    const response = await authFetch(`/api/sales/${saleId}`, {
      method: 'PUT',
      body: JSON.stringify({
        companyId: companyId,
        status: 'pending_approval'
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Satış onaya gönderilemedi');
    }

    toast.success('Satış onaya gönderildi');
    logger.info('Satış onaya gönderildi', { saleId });

    // Sayfayı yenile
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    logger.error('Onaya gönderme hatası', error);
    toast.error(`Onaya gönderme hatası: ${error.message}`);
  } finally {
    logger.end();
    processingFlags.set(`submit_${saleId}`, false);

    // Buton enable
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = 'Onaya Gönder';
    }
  }
}

// Global functions (window'a export)
window.approveSale = approveSale;
window.rejectSale = rejectSale;
window.cancelSale = cancelSale;
window.submitForApproval = submitForApproval;
