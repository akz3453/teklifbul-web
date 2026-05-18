/**
 * Hakediş PDF / Excel indirme yardımcıları
 * Teklifbul Rule v1.0
 */
import { auth, requireAuth } from '/firebase.js';
import { logger } from '/src/shared/log/logger.js';
import { toast } from '/src/shared/ui/toast.js';

async function getAuthToken() {
  const user = auth.currentUser || (await requireAuth());
  if (!user) {
    throw new Error('Giriş yapmanız gerekiyor');
  }
  const token = await user.getIdToken();
  if (!token) {
    throw new Error('Oturum doğrulanamadı');
  }
  return token;
}

function triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.setAttribute('aria-label', `Dosyayı indir: ${filename}`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Tek hakediş PDF indir
 * @param {string} paymentId
 * @param {string} [paymentNumber]
 */
export async function downloadInterimPaymentPdf(paymentId, paymentNumber) {
  if (!paymentId) {
    toast.error('Geçersiz hakediş kaydı');
    return;
  }
  logger.group('Hakediş PDF indir');
  try {
    toast.info('PDF hazırlanıyor...');
    const token = await getAuthToken();
    const response = await fetch(`/api/interim-payments/${paymentId}/export/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      let msg = 'PDF oluşturulamadı';
      try {
        const err = await response.json();
        msg = err.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await response.blob();
    const safeNum = (paymentNumber || paymentId).replace(/[^\w\-]/g, '_');
    triggerBlobDownload(blob, `hakedis-${safeNum}.pdf`);
    toast.success('PDF indirildi');
    logger.info('PDF indirme tamamlandı', { paymentId });
  } catch (err) {
    logger.error('PDF indirme hatası', err);
    toast.error(`PDF indirilemedi: ${err.message || err}`);
  } finally {
    logger.end();
  }
}

/**
 * Tek hakediş Excel indir
 * @param {string} paymentId
 * @param {string} [paymentNumber]
 */
export async function downloadInterimPaymentExcel(paymentId, paymentNumber) {
  if (!paymentId) {
    toast.error('Geçersiz hakediş kaydı');
    return;
  }
  logger.group('Hakediş Excel indir');
  try {
    toast.info('Excel hazırlanıyor...');
    const token = await getAuthToken();
    const response = await fetch(`/api/interim-payments/${paymentId}/export/excel`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      let msg = 'Excel oluşturulamadı';
      try {
        const err = await response.json();
        msg = err.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await response.blob();
    const safeNum = (paymentNumber || paymentId).replace(/[^\w\-]/g, '_');
    triggerBlobDownload(blob, `hakedis-${safeNum}.xlsx`);
    toast.success('Excel indirildi');
    logger.info('Excel indirme tamamlandı', { paymentId });
  } catch (err) {
    logger.error('Excel indirme hatası', err);
    toast.error(`Excel indirilemedi: ${err.message || err}`);
  } finally {
    logger.end();
  }
}

const STATUS_LABELS = {
  draft: 'Taslak',
  pending: 'Onay Bekliyor',
  approved: 'Onaylı',
  sent: 'Gönderildi',
  cancelled: 'İptal',
  rejected: 'Reddedildi',
};

function formatPeriod(payment) {
  const start = payment.periodStart
    ? new Date(payment.periodStart).toLocaleDateString('tr-TR')
    : '-';
  const end = payment.periodEnd
    ? new Date(payment.periodEnd).toLocaleDateString('tr-TR')
    : '-';
  return `${start} - ${end}`;
}

/**
 * Filtrelenmiş hakediş listesini Excel olarak indir (istemci tarafı)
 * @param {Array<Record<string, unknown>>} payments
 */
export async function exportInterimPaymentsListExcel(payments) {
  if (!payments?.length) {
    toast.warn('Dışa aktarılacak hakediş bulunamadı');
    return;
  }
  logger.group('Hakediş liste Excel');
  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel kütüphanesi yüklenemedi');
    }
    toast.info('Liste Excel hazırlanıyor...');
    const rows = payments.map((p) => ({
      'Hakediş No': p.paymentNumber || '',
      Şantiye: p.siteName || '',
      Sözleşme: p.contractName || '',
      Dönem: formatPeriod(p),
      Brüt: p.summary?.grossAmount ?? 0,
      Kesinti: p.summary?.deductionsTotal ?? 0,
      Net: p.summary?.netAmount ?? 0,
      KDV: p.summary?.kdvAmount ?? 0,
      Toplam: p.summary?.totalAmount ?? 0,
      Durum: STATUS_LABELS[p.status] || p.status || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hakedişler');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Hakedis_Listesi_${date}.xlsx`);
    toast.success('Liste Excel indirildi');
    logger.info('Liste Excel tamamlandı', { count: payments.length });
  } catch (err) {
    logger.error('Liste Excel hatası', err);
    toast.error(`Liste dışa aktarılamadı: ${err.message || err}`);
  } finally {
    logger.end();
  }
}
