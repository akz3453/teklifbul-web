/**
 * Admin Error Reports UI
 * Teklifbul Rule v1.0 - Client Error Reporting v1
 * 
 * Admin panelden hata kayıtlarını listeler ve detay gösterir
 */

import { authFetch } from '../assets/js/utils/api-helpers.js';
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { MESSAGES } from '../src/shared/constants/messages.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { requireCompanyContext } from '../assets/js/state/company-context.js';

// Helper function to safely get an element
const qs = (selector) => document.querySelector(selector);

/**
 * Load error reports from backend
 */
async function loadErrorReports() {
  logger.group('Hata Kayıtları Yükleniyor');
  toast.info('Hata kayıtları güncelleniyor...');

  try {
    // Get company context
    const companyContext = await requireCompanyContext();
    if (!companyContext || !companyContext.companyId) {
      throw new Error('Company context bulunamadı');
    }

    // Get severity filter
    const severityFilter = qs('#errorReportsSeverityFilter')?.value || 'all';

    // Build query params
    const params = new URLSearchParams({
      companyId: companyContext.companyId,
      limit: '50',
      severity: severityFilter
    });

    // Fetch error reports
    const response = await authFetch(`/api/client-errors?${params.toString()}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Hata kayıtları yüklenemedi');
    }

    const data = await response.json();
    
    if (!data.ok || !Array.isArray(data.items)) {
      throw new Error('Geçersiz response formatı');
    }

    // Render table
    renderErrorReportsTable(data.items);

    toast.success('Hata kayıtları başarıyla güncellendi!');
    logger.info('Hata kayıtları yüklendi', { count: data.items.length });
  } catch (error) {
    logger.error('Hata kayıtları yükleme hatası', error);
    toast.error(MESSAGES.ERROR_SYSTEM_STATUS_LOAD || 'Hata kayıtları yüklenirken bir hata oluştu.');
    
    // Show error in table
    const tbody = qs('#errorReportsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding:20px; text-align:center; color:#ef4444; font-size:14px;">
            ${DOMPurify.sanitize(error.message || 'Hata kayıtları yüklenemedi')}
          </td>
        </tr>
      `;
    }
  } finally {
    logger.end();
  }
}

/**
 * Render error reports table
 */
function renderErrorReportsTable(items) {
  const tbody = qs('#errorReportsTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding:20px; text-align:center; color:#6b7280; font-size:14px;">
          Hata kaydı bulunamadı
        </td>
      </tr>
    `;
    return;
  }

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  // Truncate message
  const truncate = (text, maxLength = 100) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Render rows
  tbody.innerHTML = items.map(item => {
    const severityBadge = item.severity === 'error' 
      ? '<span style="padding:4px 8px; background:#fee2e2; color:#dc2626; border-radius:4px; font-size:12px; font-weight:600;">ERROR</span>'
      : '<span style="padding:4px 8px; background:#fef3c7; color:#d97706; border-radius:4px; font-size:12px; font-weight:600;">WARN</span>';
    
    const message = DOMPurify.sanitize(truncate(item.message, 80));
    const route = DOMPurify.sanitize(item.route || '-');
    const userId = DOMPurify.sanitize(item.userId || 'anonymous');

    return `
      <tr class="cp-row-hover" style="cursor:pointer; transition:background 0.2s;" 
          data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}'
          data-action="open-modal">
        <td style="padding:10px; border-bottom:1px solid #e5e7eb; font-size:13px; color:#374151;">
          ${DOMPurify.sanitize(formatDate(item.occurredAt))}
        </td>
        <td style="padding:10px; border-bottom:1px solid #e5e7eb; font-size:13px;">
          ${severityBadge}
        </td>
        <td style="padding:10px; border-bottom:1px solid #e5e7eb; font-size:13px; color:#1f2937;">
          ${message}
        </td>
        <td style="padding:10px; border-bottom:1px solid #e5e7eb; font-size:13px; color:#6b7280;">
          ${route}
        </td>
        <td style="padding:10px; border-bottom:1px solid #e5e7eb; font-size:13px; color:#6b7280; font-family:monospace;">
          ${userId}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Open error report modal
 */
export function openErrorReportModal(item) {
  // Create modal if it doesn't exist
  let modal = qs('#errorReportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'errorReportModal';
    modal.style.cssText = `
      position:fixed; top:0; left:0; right:0; bottom:0; 
      background:rgba(0,0,0,0.5); 
      z-index:10000; 
      display:none; 
      align-items:center; 
      justify-content:center;
      padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:white; border-radius:8px; max-width:800px; max-height:90vh; overflow-y:auto; width:100%; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div style="padding:20px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:18px; color:#1f2937;">🐞 Hata Detayı</h3>
          <button id="errorReportModalClose" style="background:none; border:none; font-size:24px; cursor:pointer; color:#6b7280; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">
            ×
          </button>
        </div>
        <div id="errorReportModalContent" style="padding:20px;">
          <!-- Content will be inserted here -->
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close button handler
    qs('#errorReportModalClose')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  // Populate content
  const content = qs('#errorReportModalContent');
  if (content) {
    const formatDate = (dateString) => {
      if (!dateString) return '-';
      try {
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR');
      } catch (e) {
        return dateString;
      }
    };

    content.innerHTML = `
      <div style="display:grid; gap:16px;">
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Tarih</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:14px; color:#1f2937;">
            ${DOMPurify.sanitize(formatDate(item.occurredAt))}
          </div>
        </div>
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Severity</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:14px;">
            ${item.severity === 'error' 
              ? '<span style="padding:4px 8px; background:#fee2e2; color:#dc2626; border-radius:4px; font-size:12px; font-weight:600;">ERROR</span>'
              : '<span style="padding:4px 8px; background:#fef3c7; color:#d97706; border-radius:4px; font-size:12px; font-weight:600;">WARN</span>'}
          </div>
        </div>
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Mesaj</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:14px; color:#1f2937; word-break:break-word;">
            ${DOMPurify.sanitize(item.message || '-')}
          </div>
        </div>
        ${item.stack ? `
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Stack Trace</label>
          <pre style="padding:12px; background:#1f2937; color:#f9fafb; border-radius:6px; font-size:12px; font-family:monospace; overflow-x:auto; max-height:300px; overflow-y:auto; white-space:pre-wrap; word-break:break-word;">${DOMPurify.sanitize(item.stack)}</pre>
        </div>
        ` : ''}
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Page URL</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:13px; color:#1f2937; word-break:break-all;">
            ${DOMPurify.sanitize(item.pageUrl || '-')}
          </div>
        </div>
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Route</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:13px; color:#1f2937;">
            ${DOMPurify.sanitize(item.route || '-')}
          </div>
        </div>
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">User Agent</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:12px; color:#6b7280; word-break:break-all;">
            ${DOMPurify.sanitize(item.userAgent || '-')}
          </div>
        </div>
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Release</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:13px; color:#1f2937;">
            ${DOMPurify.sanitize(item.release || '-')}
          </div>
        </div>
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Session ID</label>
          <div style="padding:8px 12px; background:#f9fafb; border-radius:6px; font-size:12px; color:#6b7280; font-family:monospace; word-break:break-all;">
            ${DOMPurify.sanitize(item.sessionId || '-')}
          </div>
        </div>
        ${item.meta ? `
        <div>
          <label style="display:block; font-weight:600; color:#374151; margin-bottom:4px; font-size:13px;">Meta</label>
          <pre style="padding:12px; background:#f9fafb; border-radius:6px; font-size:12px; font-family:monospace; overflow-x:auto; max-height:200px; overflow-y:auto; white-space:pre-wrap; word-break:break-word;">${DOMPurify.sanitize(JSON.stringify(item.meta, null, 2))}</pre>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Show modal
  modal.style.display = 'flex';
}

// Make openErrorReportModal available globally for onclick handlers
window.openErrorReportModal = openErrorReportModal;

/**
 * Attach event listeners
 */
export function attachEvents() {
  const refreshBtn = qs('#btnRefreshErrorReports');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadErrorReports);
  }

  const severityFilter = qs('#errorReportsSeverityFilter');
  if (severityFilter) {
    severityFilter.addEventListener('change', loadErrorReports);
  }

  // Teklifbul Rule v1.0 - Delegated listener for row clicks (CSP Fix)
  const tbody = qs('#errorReportsTableBody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-action="open-modal"]');
      if (row) {
        try {
          const itemData = JSON.parse(row.getAttribute('data-item'));
          openErrorReportModal(itemData);
        } catch (err) {
          logger.error('Failed to parse error report data from row', err);
        }
      }
    });
  }
}

/**
 * Load error reports page
 */
export async function loadErrorReportsPage() {
  logger.group('Hata Kayıtları Sayfası Yükleniyor');
  try {
    await loadErrorReports();
    attachEvents();
  } catch (error) {
    logger.error('loadErrorReportsPage hatası', error);
    toast.error(MESSAGES.ERROR_SYSTEM_STATUS_LOAD || 'Hata kayıtları sayfası yüklenirken bir hata oluştu.');
  } finally {
    logger.end();
  }
}

