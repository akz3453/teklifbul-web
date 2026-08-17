/**
 * AI Usage Report Page (Settings.html)
 * Teklifbul Rule v1.5 - Token & AI Usage Dashboard (Company)
 *
 * Init guard: UI/handlers are attached once; subsequent visits only reload data.
 */

import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';
import { setTableEmpty } from '../../utils/safe-table.js';

let initialized = false;
let isReloading = false;
let currentDays = 7;
let currentReportData = null; // Teklifbul Rule v1.5.1 - CSV export için

function el(id) {
  return document.getElementById(id);
}

function getRoot() {
  return el('aiUsageReportRoot');
}

function formatNumber(num) {
  return new Intl.NumberFormat('tr-TR').format(num);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function renderShell() {
  const root = getRoot();
  if (!root) return;

  root.innerHTML = `
    <div style="display:grid; gap:20px;">
      <!-- Days Filter -->
      <div style="display:flex; gap:8px; align-items:center; padding:12px; background:#f9fafb; border-radius:8px;">
        <span style="font-weight:600; color:#374151;">Dönem:</span>
        <button id="aiur_days_7" class="btn btn-secondary" style="padding:6px 16px; font-size:13px;">7 Gün</button>
        <button id="aiur_days_14" class="btn btn-secondary" style="padding:6px 16px; font-size:13px;">14 Gün</button>
        <button id="aiur_days_30" class="btn btn-secondary" style="padding:6px 16px; font-size:13px;">30 Gün</button>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
        <div id="aiur_card_balance" style="padding:20px; background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Mevcut Bakiye</div>
          <div id="aiur_balanceTokens" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="aiur_card_paid" style="padding:20px; background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Ödenen Tüketim</div>
          <div id="aiur_totalPaid" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="aiur_card_free" style="padding:20px; background:linear-gradient(135deg, #059669 0%, #047857 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Ücretsiz Kullanım</div>
          <div id="aiur_totalFree" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="aiur_card_remaining" style="padding:20px; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Tahmini Kalan Gün</div>
          <div id="aiur_daysRemaining" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="aiur_card_cost" style="padding:20px; background:linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Tahmini Maliyet (USD)</div>
          <div id="aiur_totalCost" style="font-size:28px; font-weight:700;">-</div>
          <div id="aiur_projectedCost" style="font-size:11px; opacity:0.8; margin-top:4px;">-</div>
        </div>
      </div>

      <!-- Meta Info -->
      <div id="aiur_meta_info" style="padding:12px; background:#f0f9ff; border-radius:8px; font-size:12px; color:#1e40af; display:none;">
        <span id="aiur_meta_text"></span>
      </div>

      <!-- Daily Usage Table -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h4 style="margin:0; font-size:16px; font-weight:700; color:#1f2937;">Günlük Kullanım</h4>
          <button id="aiur_export_daily" class="btn btn-secondary" style="padding:6px 16px; font-size:13px;" disabled>CSV (Günlük)</button>
        </div>
        <div id="aiur_daily_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:10px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Tarih</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ödenen Tüketim</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretsiz Kullanım</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Satın Alınan</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet (USD)</th>
              </tr>
            </thead>
            <tbody id="aiur_daily_tbody">
              <tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- By Model Table -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h4 style="margin:0; font-size:16px; font-weight:700; color:#1f2937;">Model Bazlı Kullanım</h4>
          <button id="aiur_export_model" class="btn btn-secondary" style="padding:6px 16px; font-size:13px;" disabled>CSV (Model)</button>
        </div>
        <div id="aiur_model_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:10px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Sağlayıcı</th>
                <th style="padding:10px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Model</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ödenen Tüketim</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretsiz Kullanım</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">İstek Sayısı</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet (USD)</th>
              </tr>
            </thead>
            <tbody id="aiur_model_tbody">
              <tr><td colspan="6" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- By Route Table -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h4 style="margin:0; font-size:16px; font-weight:700; color:#1f2937;">Endpoint Bazlı Kullanım</h4>
          <button id="aiur_export_route" class="btn btn-secondary" style="padding:6px 16px; font-size:13px;" disabled>CSV (Endpoint)</button>
        </div>
        <div id="aiur_route_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:10px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Endpoint</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ödenen Tüketim</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretsiz Kullanım</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">İstek Sayısı</th>
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet (USD)</th>
              </tr>
            </thead>
            <tbody id="aiur_route_tbody">
              <tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Days filter buttons
  for (const days of [7, 14, 30]) {
    const btn = el(`aiur_days_${days}`);
    if (btn) {
      btn.addEventListener('click', () => {
        currentDays = days;
        reload();
      });
    }
  }

  // CSV Export buttons
  const exportDailyBtn = el('aiur_export_daily');
  const exportModelBtn = el('aiur_export_model');
  const exportRouteBtn = el('aiur_export_route');

  if (exportDailyBtn) {
    exportDailyBtn.addEventListener('click', () => exportCSV('daily'));
  }
  if (exportModelBtn) {
    exportModelBtn.addEventListener('click', () => exportCSV('model'));
  }
  if (exportRouteBtn) {
    exportRouteBtn.addEventListener('click', () => exportCSV('route'));
  }
}

function setLoading(loading) {
  const root = getRoot();
  if (!root) return;

  // Teklifbul Rule v1.5.1 - Disable export buttons during loading
  const exportButtons = ['aiur_export_daily', 'aiur_export_model', 'aiur_export_route'];
  exportButtons.forEach(id => {
    const btn = el(id);
    if (btn) btn.disabled = loading;
  });
}

async function fetchReport(days) {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch(`/api/ai/usage-report?days=${days}`);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    // Teklifbul Rule v1.5.1 - 403 error message
    if (resp.status === 403) {
      throw new Error('Yetkiniz yok');
    }
    throw new Error(data?.message || data?.error || 'Rapor yüklenemedi');
  }
  return await resp.json();
}

function renderReport(data) {
  // Teklifbul Rule v1.5.1 - Store data for CSV export
  currentReportData = data;

  // Summary cards
  el('aiur_balanceTokens').textContent = formatNumber(data?.wallet?.balanceTokens || 0);
  el('aiur_totalPaid').textContent = formatNumber(Math.abs(data?.summary?.totalConsumedTokensPaid || 0)); // Guard: abs
  el('aiur_totalFree').textContent = formatNumber(data?.summary?.totalConsumedTokensFree || 0);
  // Teklifbul Rule v1.5.1 - estimatedDaysRemaining format: "≈ X gün" or "-"
  const daysRemaining = data?.summary?.estimatedDaysRemaining;
  el('aiur_daysRemaining').textContent = (daysRemaining !== null && daysRemaining !== undefined) ? `≈ ${daysRemaining} gün` : '-';

  // Teklifbul Rule v1.9 - Cost card
  if (data?.cost) {
    el('aiur_totalCost').textContent = `$${Number(data.cost.totalCostUSD || 0).toFixed(2)}`;
    const projected = data.cost.projectedMonthlyCostUSD || 0;
    el('aiur_projectedCost').textContent = projected > 0 ? `Bu hızla ay sonunda ≈ $${projected.toFixed(2)}` : '';
  }

  // Teklifbul Rule v1.5.1 - Meta info display
  const metaInfo = el('aiur_meta_info');
  const metaText = el('aiur_meta_text');
  if (metaInfo && metaText && data.meta) {
    const minTokens = data.meta.minTokens || 200;
    metaText.textContent = `Minimum token eşiği: ${formatNumber(minTokens)}`;
    metaInfo.style.display = 'block';
  }

  // Update days filter active state
  for (const days of [7, 14, 30]) {
    const btn = el(`aiur_days_${days}`);
    if (btn) {
      if (days === currentDays) {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  }

  // Daily table
  const dailyTbody = el('aiur_daily_tbody');
  if (dailyTbody) {
    const dailyArr = data?.daily || [];
    if (dailyArr.length === 0) {
      dailyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Veri bulunamadı</td></tr>';
    } else {
      const costMap = new Map();
      if (data?.cost?.daily) {
        data.cost.daily.forEach(d => costMap.set(d.date, d.costUSD));
      }
      dailyTbody.innerHTML = dailyArr.map(d => {
        const costUSD = costMap.get(d.date) || 0;
        return `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${formatDate(d.date)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(Math.abs(d.paidConsumed))}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(d.freeUsedTotalTokens)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(d.purchases)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">$${Number(costUSD).toFixed(2)}</td>
        </tr>
      `;
      }).join('');
    }
  }

  // By model table
  const modelTbody = el('aiur_model_tbody');
  if (modelTbody) {
    const modelArr = data?.byModel || [];
    if (modelArr.length === 0) {
      modelTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#9ca3af;">Veri bulunamadı</td></tr>';
    } else {
      const costMap = new Map();
      if (data?.cost?.byModel) {
        data.cost.byModel.forEach(m => costMap.set(`${m.provider}::${m.model}`, m.costUSD));
      }
      modelTbody.innerHTML = modelArr.map(m => {
        const costUSD = costMap.get(`${m.provider}::${m.model}`) || 0;
        return `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${m.provider}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${m.model}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(Math.abs(m.paidConsumed))}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(m.freeUsedTotalTokens)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(m.requests)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">$${Number(costUSD).toFixed(2)}</td>
        </tr>
      `;
      }).join('');
    }
  }

  // By route table
  const routeTbody = el('aiur_route_tbody');
  if (routeTbody) {
    const routeArr = data?.byRoute || [];
    if (routeArr.length === 0) {
      routeTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Veri bulunamadı</td></tr>';
    } else {
      const costMap = new Map();
      if (data?.cost?.byRoute) {
        data.cost.byRoute.forEach(r => costMap.set(r.route, r.costUSD));
      }
      routeTbody.innerHTML = routeArr.map(r => {
        const costUSD = costMap.get(r.route) || 0;
        return `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${r.route}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(Math.abs(r.paidConsumed))}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(r.freeUsedTotalTokens)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatNumber(r.requests)}</td>
          <td style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">$${Number(costUSD).toFixed(2)}</td>
        </tr>
      `;
      }).join('');
    }
  }
}

// Teklifbul Rule v1.5.1 - CSV Export functions
function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains delimiter (;) or newline or quote, wrap in quotes and escape quotes
  if (str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(rows, headers) {
  // Teklifbul Rule v1.5.1 - TR locale CSV: delimiter ';', newline \r\n
  const lines = [];
  // Header row
  lines.push(headers.map(escapeCSVValue).join(';'));
  // Data rows
  rows.forEach(row => {
    lines.push(headers.map(h => escapeCSVValue(row[h] || '')).join(';'));
  });
  return lines.join('\r\n');
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportCSV(type) {
  if (!currentReportData) {
    toast.error('Rapor verisi yüklenmedi');
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const days = currentDays;

  let csvContent, filename;

  if (type === 'daily') {
    const costMap = new Map();
    if (currentReportData.cost && currentReportData.cost.daily) {
      currentReportData.cost.daily.forEach(d => costMap.set(d.date, d.costUSD));
    }
    const headers = ['Tarih', 'Ödenen Tüketim', 'Ücretsiz Kullanım', 'Satın Alınan', 'Maliyet (USD)'];
    const rows = currentReportData.daily.map(d => ({
      'Tarih': d.date,
      'Ödenen Tüketim': Math.abs(d.paidConsumed),
      'Ücretsiz Kullanım': d.freeUsedTotalTokens,
      'Satın Alınan': d.purchases,
      'Maliyet (USD)': Number(costMap.get(d.date) || 0).toFixed(2),
    }));
    csvContent = generateCSV(rows, headers);
    filename = `ai-usage-daily-${days}d-${dateStr}.csv`;
  } else if (type === 'model') {
    const costMap = new Map();
    if (currentReportData.cost && currentReportData.cost.byModel) {
      currentReportData.cost.byModel.forEach(m => costMap.set(`${m.provider}::${m.model}`, m.costUSD));
    }
    const headers = ['Sağlayıcı', 'Model', 'Ödenen Tüketim', 'Ücretsiz Kullanım', 'İstek Sayısı', 'Maliyet (USD)'];
    const rows = currentReportData.byModel.map(m => ({
      'Sağlayıcı': m.provider,
      'Model': m.model,
      'Ödenen Tüketim': Math.abs(m.paidConsumed),
      'Ücretsiz Kullanım': m.freeUsedTotalTokens,
      'İstek Sayısı': m.requests,
      'Maliyet (USD)': Number(costMap.get(`${m.provider}::${m.model}`) || 0).toFixed(2),
    }));
    csvContent = generateCSV(rows, headers);
    filename = `ai-usage-model-${days}d-${dateStr}.csv`;
  } else if (type === 'route') {
    const costMap = new Map();
    if (currentReportData.cost && currentReportData.cost.byRoute) {
      currentReportData.cost.byRoute.forEach(r => costMap.set(r.route, r.costUSD));
    }
    const headers = ['Endpoint', 'Ödenen Tüketim', 'Ücretsiz Kullanım', 'İstek Sayısı', 'Maliyet (USD)'];
    const rows = currentReportData.byRoute.map(r => ({
      'Endpoint': r.route,
      'Ödenen Tüketim': Math.abs(r.paidConsumed),
      'Ücretsiz Kullanım': r.freeUsedTotalTokens,
      'İstek Sayısı': r.requests,
      'Maliyet (USD)': Number(costMap.get(r.route) || 0).toFixed(2),
    }));
    csvContent = generateCSV(rows, headers);
    filename = `ai-usage-route-${days}d-${dateStr}.csv`;
  } else {
    toast.error('Geçersiz export tipi');
    return;
  }

  try {
    downloadCSV(csvContent, filename);
    toast.success('CSV dosyası indirildi');
    logger.info('CSV exported', { type, filename });
  } catch (err) {
    logger.error('CSV export failed', err);
    toast.error('CSV indirme hatası');
  }
}

async function reload() {
  if (isReloading) return;
  isReloading = true;
  setLoading(true);

  try {
    const data = await fetchReport(currentDays);
    renderReport(data);
    logger.info('AI usage report loaded', { days: currentDays });
  } catch (err) {
    logger.error('Failed to load AI usage report', err);
    toast.error(err.message || 'Rapor yüklenemedi');
    // Teklifbul Rule v1.0 - Hata durumunda takılı "Yükleniyor..." temizle
    const errMsg = err?.message || 'Rapor yüklenemedi';
    const dailyTbody = el('aiur_daily_tbody');
    const modelTbody = el('aiur_model_tbody');
    const routeTbody = el('aiur_route_tbody');
    if (dailyTbody) setTableEmpty(dailyTbody, 5, errMsg);
    if (modelTbody) setTableEmpty(modelTbody, 6, errMsg);
    if (routeTbody) setTableEmpty(routeTbody, 5, errMsg);
  } finally {
    isReloading = false;
    setLoading(false);
  }
}

export async function initAiUsageReportPage() {
  const root = getRoot();
  if (!root) {
    logger.warn('AI Usage Report root element not found');
    return;
  }

  if (initialized) {
    logger.info('AI Usage Report page already initialized, reloading data');
    await reload();
    return;
  }

  logger.group('AI Usage Report Page Init');
  initialized = true;

  renderShell();
  await reload();

  logger.end();
}

