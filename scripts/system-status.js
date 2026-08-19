/**
 * System Status Panel
 * Teklifbul Rule v1.0 - Admin System Status Panel
 * 
 * Sistem durumu ve metrikleri görüntüleme
 */

import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { getAdminPerms } from '../assets/js/state/permissions.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';

/**
 * Format uptime seconds to human readable
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (days > 0) {
    return `${days}g ${hours}s ${minutes}d`;
  } else if (hours > 0) {
    return `${hours}s ${minutes}d`;
  } else if (minutes > 0) {
    return `${minutes}d ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format timestamp to readable date
 */
function formatTimestamp(isoString) {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

/**
 * Get status badge HTML
 */
function getStatusBadge(statusCode) {
  const badges = {
    200: '<span style="background:#dcfce7;color:#065f46;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">200 OK</span>',
    400: '<span style="background:#fef3c7;color:#92400e;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">400 Bad Request</span>',
    404: '<span style="background:#fee2e2;color:#991b1b;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">404 Not Found</span>',
    500: '<span style="background:#fee2e2;color:#991b1b;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">500 Error</span>'
  };
  return badges[statusCode] || `<span style="background:#e5e7eb;color:#374151;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">${statusCode}</span>`;
}

/**
 * Load system status data
 */
export async function loadSystemStatus() {
  try {
    logger.group('Sistem Durumu Yükleniyor');

    // Permission check
    const adminPerms = getAdminPerms();
    if (!adminPerms?.metrics?.view) {
      logger.warn('Sistem durumu: admin.metrics.view yetkisi yok');
      toast.error('Bu sayfayı görüntülemek için yetkiniz yok');
      logger.end();
      return;
    }

    // authFetch import
    const { authFetch } = await import('../assets/js/utils/api-helpers.js');

    // Teklifbul Rule v1.0 - Production'da /health hosting HTML döner; /api/* Cloud Function'a gider
    const parseJsonSafe = async (res) => {
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) {
        const preview = (await res.text()).slice(0, 80);
        throw new Error(`Beklenen JSON değil (content-type: ${ct || 'yok'}): ${preview}`);
      }
      return res.json();
    };

    // Load health and metrics in parallel
    const [healthResponse, metricsResponse] = await Promise.allSettled([
      authFetch('/api/health', { method: 'GET' }),
      authFetch('/api/metrics', { method: 'GET' })
    ]);

    // Health data
    let healthData = null;
    if (healthResponse.status === 'fulfilled' && healthResponse.value.ok) {
      try {
        healthData = await parseJsonSafe(healthResponse.value);
      } catch (parseErr) {
        logger.warn('Health JSON parse hatası', parseErr);
      }
    } else {
      logger.warn('Health endpoint hatası', healthResponse);
    }

    // Metrics: açıksa ok:true snapshot; kapalıysa 200 + ok:false veya eski kurulumda 404
    let metricsData = null;
    if (metricsResponse.status === 'fulfilled') {
      const res = metricsResponse.value;
      if (res.ok) {
        try {
          const raw = await parseJsonSafe(res);
          if (raw.ok === true) {
            metricsData = raw;
          } else if (raw.disabled) {
            logger.info('Sistem durumu: trafik metrikleri kapalı (sunucu ENABLE_METRICS)');
          }
        } catch (parseErr) {
          logger.warn('Metrics JSON parse hatası', parseErr);
        }
      } else if (res.status === 401 || res.status === 403) {
        logger.info('Sistem durumu: trafik metrikleri yetkisiz veya secret gerekli');
      } else if (res.status === 404) {
        logger.info('Sistem durumu: trafik metrikleri kapalı veya yok (404)');
      } else {
        logger.warn('Metrics endpoint hatası', { status: res.status, statusText: res.statusText });
      }
    } else {
      logger.warn('Metrics isteği reddedildi', metricsResponse);
    }

    // Render health card
    renderHealthCard(healthData);

    // Render traffic card
    renderTrafficCard(metricsData);

    // Render slow routes card
    renderSlowRoutesCard(metricsData);

    logger.info('Sistem durumu yüklendi', { hasHealth: !!healthData, hasMetrics: !!metricsData });
    logger.end();
  } catch (error) {
    logger.error('Sistem durumu yükleme hatası', error);
    toast.error(`Hata: ${error.message || 'Sistem durumu yüklenemedi'}`);
    logger.end();
  }
}

/**
 * Render health card
 */
function renderHealthCard(healthData) {
  const healthCard = document.getElementById('healthContent');
  if (!healthCard) return;

  if (!healthData) {
    healthCard.innerHTML = DOMPurify.sanitize('<div style="color:#dc2626;">❌ Health verisi alınamadı</div>', {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['style']
    });
    return;
  }

  const safeService = DOMPurify.sanitize(healthData.service || 'N/A', { ALLOWED_TAGS: [] });
  const safeVersion = DOMPurify.sanitize(healthData.version || 'N/A', { ALLOWED_TAGS: [] });
  const safeEnv = DOMPurify.sanitize(healthData.environment || 'N/A', { ALLOWED_TAGS: [] });
  const uptime = formatUptime(healthData.uptimeSec || 0);
  const timestamp = formatTimestamp(healthData.timestamp);

  const html = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#6b7280;">Uptime:</span>
        <strong style="color:#1f2937;">${DOMPurify.sanitize(uptime, { ALLOWED_TAGS: [] })}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#6b7280;">Version:</span>
        <strong style="color:#1f2937;">${safeVersion}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#6b7280;">Environment:</span>
        <strong style="color:#1f2937;">${safeEnv}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#6b7280;">Service:</span>
        <strong style="color:#1f2937;">${safeService}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px solid #e5e7eb;">
        <span style="color:#6b7280; font-size:12px;">Server Time:</span>
        <span style="color:#6b7280; font-size:12px;">${DOMPurify.sanitize(timestamp, { ALLOWED_TAGS: [] })}</span>
      </div>
    </div>
  `;

  healthCard.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'strong'],
    ALLOWED_ATTR: ['style']
  });
}

/**
 * Render traffic card
 */
function renderTrafficCard(metricsData) {
  const trafficCard = document.getElementById('trafficContent');
  if (!trafficCard) return;

  if (!metricsData) {
    trafficCard.innerHTML = DOMPurify.sanitize('<div style="color:#dc2626;">❌ Metrics verisi alınamadı</div>', {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['style']
    });
    return;
  }

  const totalRequests = metricsData.totalRequests || 0;
  const statusCounts = metricsData.statusCounts || {};

  // Status counts HTML
  let statusHtml = '';
  const statusOrder = [200, 400, 404, 500];
  statusOrder.forEach(code => {
    const count = statusCounts[code] || 0;
    if (count > 0) {
      const safeCode = DOMPurify.sanitize(String(code), { ALLOWED_TAGS: [] });
      const safeCount = DOMPurify.sanitize(String(count), { ALLOWED_TAGS: [] });
      statusHtml += `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          ${getStatusBadge(code)}
          <strong style="color:#1f2937;">${safeCount}</strong>
        </div>
      `;
    }
  });

  // Other status codes
  Object.keys(statusCounts).forEach(code => {
    const codeNum = parseInt(code);
    if (!statusOrder.includes(codeNum) && statusCounts[code] > 0) {
      const safeCode = DOMPurify.sanitize(String(code), { ALLOWED_TAGS: [] });
      const safeCount = DOMPurify.sanitize(String(statusCounts[code]), { ALLOWED_TAGS: [] });
      statusHtml += `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="background:#e5e7eb;color:#374151;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">${safeCode}</span>
          <strong style="color:#1f2937;">${safeCount}</strong>
        </div>
      `;
    }
  });

  const safeTotal = DOMPurify.sanitize(String(totalRequests), { ALLOWED_TAGS: [] });

  const html = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #e5e7eb;">
        <span style="color:#6b7280;">Toplam İstek:</span>
        <strong style="color:#1f2937; font-size:18px;">${safeTotal}</strong>
      </div>
      <div>
        <div style="color:#6b7280; font-size:12px; margin-bottom:8px;">Status Dağılımı:</div>
        ${statusHtml || '<div style="color:#6b7280; font-size:12px;">Veri yok</div>'}
      </div>
    </div>
  `;

  trafficCard.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'strong'],
    ALLOWED_ATTR: ['style']
  });
}

/**
 * Render slow routes card
 */
function renderSlowRoutesCard(metricsData) {
  const slowRoutesCard = document.getElementById('slowRoutesContent');
  if (!slowRoutesCard) return;

  if (!metricsData) {
    slowRoutesCard.innerHTML = DOMPurify.sanitize('<div style="color:#dc2626;">❌ Metrics verisi alınamadı</div>', {
      ALLOWED_TAGS: ['div'],
      ALLOWED_ATTR: ['style']
    });
    return;
  }

  const slowRoutes = metricsData.slowRoutesByP95 || [];
  const topRoutes = metricsData.topRoutesByCount || [];
  const routeStats = metricsData.routeStats || {};

  // Slow routes table (top 5)
  let slowRoutesHtml = '';
  if (slowRoutes.length > 0) {
    slowRoutesHtml = `
      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:2px solid #e5e7eb;">
            <th style="text-align:left; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">Route</th>
            <th style="text-align:right; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">P95 (ms)</th>
            <th style="text-align:right; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">Max (ms)</th>
            <th style="text-align:right; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">Count</th>
          </tr>
        </thead>
        <tbody>
    `;

    slowRoutes.slice(0, 5).forEach(route => {
      const safeRoute = DOMPurify.sanitize(route.route || 'N/A', { ALLOWED_TAGS: [] });
      const safeP95 = DOMPurify.sanitize(String(route.p95Ms || 0), { ALLOWED_TAGS: [] });
      const safeCount = DOMPurify.sanitize(String(route.count || 0), { ALLOWED_TAGS: [] });
      
      // Get max from routeStats
      const stats = routeStats[route.route] || {};
      const safeMax = DOMPurify.sanitize(String(stats.maxMs || 0), { ALLOWED_TAGS: [] });

      slowRoutesHtml += `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px; font-size:13px; color:#1f2937; font-family:monospace;">${safeRoute}</td>
          <td style="padding:8px; font-size:13px; color:#dc2626; text-align:right; font-weight:600;">${safeP95}</td>
          <td style="padding:8px; font-size:13px; color:#991b1b; text-align:right; font-weight:600;">${safeMax}</td>
          <td style="padding:8px; font-size:13px; color:#6b7280; text-align:right;">${safeCount}</td>
        </tr>
      `;
    });

    slowRoutesHtml += `
        </tbody>
      </table>
    `;
  } else {
    slowRoutesHtml = '<div style="color:#6b7280; font-size:13px; padding:12px;">Yavaş route bulunamadı</div>';
  }

  // Top routes table (top 5)
  let topRoutesHtml = '';
  if (topRoutes.length > 0) {
    topRoutesHtml = `
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid #e5e7eb;">
        <h5 style="margin:0 0 12px 0; font-size:14px; color:#1f2937;">En Çok Çağrılan Route'lar:</h5>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid #e5e7eb;">
              <th style="text-align:left; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">Route</th>
              <th style="text-align:right; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">Count</th>
              <th style="text-align:right; padding:8px; font-size:12px; color:#6b7280; font-weight:600;">Avg (ms)</th>
            </tr>
          </thead>
          <tbody>
    `;

    topRoutes.slice(0, 5).forEach(route => {
      const safeRoute = DOMPurify.sanitize(route.route || 'N/A', { ALLOWED_TAGS: [] });
      const safeCount = DOMPurify.sanitize(String(route.count || 0), { ALLOWED_TAGS: [] });
      
      const stats = routeStats[route.route] || {};
      const safeAvg = DOMPurify.sanitize(String(stats.avgMs || 0), { ALLOWED_TAGS: [] });

      topRoutesHtml += `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px; font-size:13px; color:#1f2937; font-family:monospace;">${safeRoute}</td>
          <td style="padding:8px; font-size:13px; color:#6b7280; text-align:right; font-weight:600;">${safeCount}</td>
          <td style="padding:8px; font-size:13px; color:#6b7280; text-align:right;">${safeAvg}</td>
        </tr>
      `;
    });

    topRoutesHtml += `
          </tbody>
        </table>
      </div>
    `;
  }

  const html = slowRoutesHtml + topRoutesHtml;

  slowRoutesCard.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'h5'],
    ALLOWED_ATTR: ['style']
  });
}

/**
 * Attach event listeners
 */
export function attachSystemStatusEvents() {
  const refreshBtn = document.getElementById('btnRefreshSystemStatus');
  if (refreshBtn) {
    // Remove existing listeners (race protection)
    const newBtn = refreshBtn.cloneNode(true);
    refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
    
    newBtn.addEventListener('click', async () => {
      await loadSystemStatus();
    });
  }
}

/**
 * Load system status page
 * Teklifbul Rule v1.0 - Permission guard
 */
export async function loadSystemStatusPage() {
  try {
    logger.group('Sistem Durumu Sayfası Yükleniyor');

    // Permission check
    const adminPerms = getAdminPerms();
    if (!adminPerms?.metrics?.view) {
      logger.warn('Sistem durumu sayfası: admin.metrics.view yetkisi yok');
      toast.error('Bu sayfayı görüntülemek için yetkiniz yok');
      
      // Hide page and show error message
      const pageEl = document.getElementById('page-system-status');
      if (pageEl) {
        pageEl.innerHTML = DOMPurify.sanitize(`
          <div class="section">
            <h3>📊 Sistem Durumu</h3>
            <div style="padding:20px; background:#fee2e2; border:1px solid #fca5a5; border-radius:8px; color:#991b1b;">
              ❌ Bu sayfayı görüntülemek için yetkiniz yok.
            </div>
          </div>
        `, {
          ALLOWED_TAGS: ['div', 'h3'],
          ALLOWED_ATTR: ['class', 'style']
        });
      }
      
      logger.end();
      return;
    }

    // Attach events
    attachSystemStatusEvents();

    // Load data
    await loadSystemStatus();

    logger.end();
  } catch (error) {
    logger.error('Sistem durumu sayfası yükleme hatası', error);
    toast.error(`Hata: ${error.message || 'Sayfa yüklenemedi'}`);
    logger.end();
  }
}

