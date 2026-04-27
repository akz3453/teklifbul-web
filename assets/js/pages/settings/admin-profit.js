/**
 * Admin Profit Report Page (Settings.html)
 * Teklifbul Rule v2.0 - Profit Engine (Company Profitability System)
 *
 * Init guard: UI/handlers are attached once; subsequent visits only reload data.
 */

import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let isReloading = false;
let currentMonth = null; // YYYY-MM format

function el(id) {
  return document.getElementById(id);
}

function getRoot() {
  return el('page-admin-profit');
}

function formatNumber(num) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function formatCurrency(num) {
  return `${formatNumber(num)} ₺`;
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function generateMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const value = `${year}-${month}`;
    const label = date.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
    options.push({ value, label });
  }
  return options;
}

function renderShell() {
  const root = getRoot();
  if (!root) return;

  const monthOptions = generateMonthOptions();
  const currentMonthValue = getCurrentMonth();

  root.innerHTML = `
    <div style="display:grid; gap:20px;">
      <!-- Month Selector -->
      <div style="display:flex; gap:12px; align-items:center; padding:12px; background:#f9fafb; border-radius:8px;">
        <label for="ap_month_select" style="font-weight:600; color:#374151;">Ay:</label>
        <select id="ap_month_select" style="padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; background:white; cursor:pointer;">
          ${monthOptions.map(opt => `<option value="${opt.value}" ${opt.value === currentMonthValue ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
        <button id="ap_reload_btn" class="btn btn-primary" style="padding:8px 16px; font-size:14px;">Yenile</button>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
        <div id="ap_card_revenue" style="padding:20px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Bu Ay Toplam Gelir</div>
          <div id="ap_totalRevenue" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="ap_card_cost" style="padding:20px; background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Bu Ay Toplam AI Maliyeti</div>
          <div id="ap_totalCost" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="ap_card_profit" style="padding:20px; background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Net Kâr</div>
          <div id="ap_totalProfit" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div id="ap_card_projection" style="padding:20px; background:linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Ay Sonu Tahmini Kâr</div>
          <div id="ap_projectedProfit" style="font-size:28px; font-weight:700;">-</div>
        </div>
      </div>

      <!-- Teklifbul Rule v3.18 - Unknown Cost Warning -->
      <div id="ap_unknown_cost_warning" style="display:none; padding:12px; background:#fef3c7; border:1px solid #fbbf24; border-radius:8px; margin-top:12px;">
        <div style="font-size:13px; color:#92400e; font-weight:600;">
          ⚠️ Bazı AI maliyetleri hesaplanamadı
        </div>
        <div id="ap_unknown_cost_text" style="font-size:12px; color:#78350f; margin-top:4px;"></div>
      </div>

      <!-- Teklifbul Rule v3.18 - FX Drift Warning -->
      <div id="ap_fx_drift_warning" style="display:none; padding:12px; background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; margin-top:12px;">
        <div style="font-size:13px; color:#92400e; font-weight:600;">
          ⚠️ Kur değişimi uyarısı
        </div>
        <div id="ap_fx_drift_text" style="font-size:12px; color:#78350f; margin-top:4px;"></div>
      </div>

      <!-- Teklifbul Rule v3.19 - Explanation Panel -->
      <div id="ap_explanation_panel" style="background:white; border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-top:16px; display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:pointer;" id="ap_explanation_toggle">
          <h4 style="margin:0; font-size:16px; font-weight:700; color:#1f2937;">Kâr Neden Değişti?</h4>
          <span id="ap_explanation_icon" style="font-size:18px; color:#6b7280;">▼</span>
        </div>
        <div id="ap_explanation_content" style="display:block; font-size:13px; color:#374151; line-height:1.6;">
          <div style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</div>
        </div>
      </div>

      <!-- Teklifbul Rule v2.6 - Profit/Burn Alerts Panel -->
      <div id="ap_alerts_panel" style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:none;">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">⚠️ Uyarılar</h4>
        <div id="ap_alerts_content">
          <div style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</div>
        </div>
      </div>

      <!-- Teklifbul Rule v3.20 - Auto-Protection Panel -->
      <div id="ap_auto_protection_panel" style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h4 style="margin:0; font-size:16px; font-weight:700; color:#1f2937;">🛡️ Oto Koruma (Auto-Protection)</h4>
          <div style="display:flex; gap:8px;">
            <button id="ap_btn_auto_protection_dry_run" class="btn btn-secondary" style="padding:8px 16px; font-size:14px;">
              DRY RUN Çalıştır
            </button>
            <button id="ap_btn_auto_protection_apply" class="btn btn-danger" style="padding:8px 16px; font-size:14px;">
              Uygula (APPLY)
            </button>
          </div>
        </div>
        <div style="font-size:12px; color:#6b7280; margin-bottom:12px;">
          Profit alerts (burn/risk HIGH) firmaları için otomatik guardrails önerileri. Varsayılan: DRY RUN (mutation yok).
        </div>
        <div id="ap_auto_protection_results" style="display:none; margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:pointer;" id="ap_auto_protection_toggle">
            <h5 style="margin:0; font-size:14px; font-weight:600; color:#374151;">Sonuçlar</h5>
            <span id="ap_auto_protection_icon" style="font-size:14px; color:#6b7280;">▼</span>
          </div>
          <div id="ap_auto_protection_content" style="display:block; font-size:13px;">
            <div style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</div>
          </div>
        </div>
      </div>

      <!-- Teklifbul Rule v2.1 - Risk Summary -->
      <div id="ap_risk_summary" style="padding:12px; background:#f0f9ff; border-radius:8px; font-size:13px; color:#1e40af; display:none;">
        <span id="ap_risk_summary_text"></span>
      </div>

      <!-- Companies Table -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Firma Kârlılık Raporu</h4>
        <div id="ap_companies_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Firma</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Gelir</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Net Kâr</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Marj (%)</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet/Gelir (%)</th>
                <th style="padding:12px; text-align:center; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Burn</th>
                <th style="padding:12px; text-align:center; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Risk</th>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Öneri</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Tahmini Kâr</th>
                <th style="padding:12px; text-align:center; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Durum</th>
              </tr>
            </thead>
            <tbody id="ap_companies_tbody">
              <tr><td colspan="11" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Event handlers
  const monthSelect = el('ap_month_select');
  const reloadBtn = el('ap_reload_btn');

  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      currentMonth = monthSelect.value;
      reload();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      reload();
    });
  }

  // Teklifbul Rule v3.20 - Auto-Protection handlers
  const dryRunBtn = el('ap_btn_auto_protection_dry_run');
  const applyBtn = el('ap_btn_auto_protection_apply');

  if (dryRunBtn) {
    dryRunBtn.addEventListener('click', async () => {
      await handleAutoProtectionRun(true);
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      await handleAutoProtectionRun(false);
    });
  }

  // Collapsible results panel
  const resultsToggle = el('ap_auto_protection_toggle');
  const resultsIcon = el('ap_auto_protection_icon');
  const resultsContent = el('ap_auto_protection_content');
  if (resultsToggle && resultsIcon && resultsContent) {
    let isExpanded = true;
    resultsToggle.addEventListener('click', () => {
      isExpanded = !isExpanded;
      resultsContent.style.display = isExpanded ? 'block' : 'none';
      resultsIcon.textContent = isExpanded ? '▼' : '▶';
    });
  }
}

async function fetchProfitReport(month) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/profit-report?month=${month}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || 'Rapor yüklenemedi');
    }
    return await resp.json();
  } catch (err) {
    logger.error('Failed to fetch profit report', err);
    throw err;
  }
}

// Teklifbul Rule v2.6 - Fetch profit alerts
async function fetchProfitAlerts(month) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/alerts/profit?month=${month}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || 'Uyarılar yüklenemedi');
    }
    return await resp.json();
  } catch (err) {
    logger.warn('Failed to fetch profit alerts (non-critical)', err);
    return null; // Non-critical, return null instead of throwing
  }
}

function renderAlerts(alertsData, month) {
  const panel = el('ap_alerts_panel');
  const content = el('ap_alerts_content');
  if (!panel || !content) return;

  if (!alertsData || !alertsData.alerts || alertsData.alerts.length === 0) {
    content.innerHTML = '<div style="text-align:center; padding:20px; color:#059669; font-weight:600;">Bu ay kritik uyarı yok ✅</div>';
    panel.style.display = 'block';
    return;
  }

  const alerts = alertsData.alerts.slice(0, 10); // Max 10 göster
  const hasMore = alertsData.alerts.length > 10;

  content.innerHTML = alerts.map(alert => {
    const burnPct = alert.burnRatio !== null ? alert.burnRatio * 100 : null;
    const burnDisplay = burnPct !== null ? `${formatNumber(burnPct)}%` : '-';
    const profitColor = alert.profitTRY >= 0 ? '#059669' : '#dc2626';
    const actions = alert.suggestedActions || [];
    const actionsDisplay = actions.slice(0, 3).map(a => `<li style="margin:4px 0; font-size:12px;">${a}</li>`).join('');

    return `
      <div style="padding:16px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px; background:#fef2f2;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:200px;">
            <div style="font-weight:700; color:#1f2937; margin-bottom:8px;">
              <a href="/settings.html#admin-profit-detail?companyId=${encodeURIComponent(alert.companyId)}&month=${encodeURIComponent(month)}" 
                 class="cp-hover-underline"
                 style="color:#3b82f6; text-decoration:none; cursor:pointer;">
                ${alert.name || alert.companyId}
              </a>
            </div>
            <div style="font-size:13px; color:#6b7280; margin-bottom:8px;">
              Burn: <strong style="color:#dc2626;">${burnDisplay}</strong> | 
              Net Kâr: <strong style="color:${profitColor};">${formatCurrency(alert.profitTRY)}</strong>
            </div>
            <div style="font-size:13px; color:#991b1b; font-weight:600; margin-bottom:8px;">
              ${alert.message || 'Uyarı'}
            </div>
            ${actions.length > 0 ? `
              <div style="margin-top:8px;">
                <div style="font-size:12px; color:#6b7280; margin-bottom:4px; font-weight:600;">Önerilen Aksiyonlar:</div>
                <ul style="margin:0; padding-left:20px; color:#6b7280;">
                  ${actionsDisplay}
                </ul>
              </div>
            ` : ''}
          </div>
          <div style="display:flex; gap:8px; flex-direction:column;">
            <a href="/settings.html#admin-profit-detail?companyId=${encodeURIComponent(alert.companyId)}&month=${encodeURIComponent(month)}" 
               class="btn btn-primary" 
               style="padding:8px 16px; font-size:13px; text-decoration:none; display:inline-block; text-align:center;">
              Detay
            </a>
            ${alert.forcedFreeMode === true ? `
            <button type="button" class="btn btn-success" 
                    data-action="force-free-off" 
                    data-company-id="${alert.companyId}"
                    style="padding:8px 16px; font-size:13px; margin-bottom:8px;">
              Free Mode'u Kapat
            </button>
            ` : `
            <button type="button" class="btn btn-secondary" 
                    data-action="force-free" 
                    data-company-id="${alert.companyId}"
                    data-burn-flag="${alert.burnFlag}"
                    data-risk-flag="${alert.riskFlag}"
                    style="padding:8px 16px; font-size:13px; margin-bottom:8px;">
              Free Mode'a Al
            </button>
            `}
            ${alert.dailyPaidTokenCap !== null && alert.dailyPaidTokenCap !== undefined ? `
            <button type="button" class="btn btn-warning" 
                    data-action="set-daily-cap" 
                    data-company-id="${alert.companyId}"
                    style="padding:8px 16px; font-size:13px; margin-bottom:8px;">
              Günlük Kota
            </button>
            <button type="button" class="btn btn-danger" 
                    data-action="clear-daily-cap" 
                    data-company-id="${alert.companyId}"
                    style="padding:8px 16px; font-size:13px;">
              Kotayı Kaldır
            </button>
            ` : `
            <button type="button" class="btn btn-warning" 
                    data-action="set-daily-cap"
                    data-company-id="${alert.companyId}"
                    style="padding:8px 16px; font-size:13px;">
              Günlük Kota
            </button>
            `}
            ${!alert.forcedFreeMode && alert.suggestedDailyCap !== null && alert.suggestedDailyCap !== undefined ? `
            <div style="margin-top:8px; padding:8px; background:#f0f9ff; border-radius:6px; border:1px solid #bfdbfe;">
              <div style="font-size:12px; color:#1e40af; margin-bottom:4px; font-weight:600;">
                Önerilen Kota: ${formatNumber(alert.suggestedDailyCap)} token
              </div>
              ${alert.dailyPaidTokenCap !== null && alert.dailyPaidTokenCap >= alert.suggestedDailyCap ? `
              <div style="font-size:11px; color:#059669; font-style:italic;">
                Kota zaten yeterli
              </div>
              ` : `
              <button type="button" class="btn btn-primary" 
                      data-action="apply-suggested-cap"
                      data-company-id="${alert.companyId}"
                      data-suggested-cap="${alert.suggestedDailyCap}"
                      style="padding:6px 12px; font-size:12px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer;">
                Uygula
              </button>
              `}
            </div>
            ` : ''}
            ${(alert.forcedFreeMode === true || (alert.dailyPaidTokenCap !== null && alert.dailyPaidTokenCap !== undefined)) ? `
            <button type="button" class="btn btn-secondary" 
                    data-action="reset-guardrails"
                    data-company-id="${alert.companyId}"
                    style="padding:6px 12px; font-size:12px; margin-top:8px; background:#6b7280; color:white; border:none; border-radius:4px; cursor:pointer;">
              Sıfırla
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('') + (hasMore ? `<div style="text-align:center; padding:12px; color:#6b7280; font-size:13px;">... ve ${alertsData.alerts.length - 10} uyarı daha</div>` : '');

  panel.style.display = 'block';

  // Teklifbul Rule v2.7.1 - Bind force free mode handlers
  content.querySelectorAll('[data-action="force-free"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const companyId = btn.getAttribute('data-company-id');
      const burnFlag = btn.getAttribute('data-burn-flag');
      const riskFlag = btn.getAttribute('data-risk-flag');
      if (!companyId) return;

      const reason = burnFlag === 'HIGH' ? 'burn_high' : riskFlag === 'HIGH' ? 'risk_high' : 'admin';
      await handleForceFreeMode(companyId, reason, btn);
    });
  });

  // Teklifbul Rule v2.7.2 - Bind daily cap handlers
  content.querySelectorAll('[data-action="set-daily-cap"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const companyId = btn.getAttribute('data-company-id');
      if (!companyId) return;
      await handleSetDailyCap(companyId, btn);
    });
  });

  // Teklifbul Rule v2.9 - Bind force free off handlers
  content.querySelectorAll('[data-action="force-free-off"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const companyId = btn.getAttribute('data-company-id');
      if (!companyId) return;
      await handleForceFreeModeOff(companyId, btn);
    });
  });

  // Teklifbul Rule v2.9 - Bind clear daily cap handlers
  content.querySelectorAll('[data-action="clear-daily-cap"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const companyId = btn.getAttribute('data-company-id');
      if (!companyId) return;
      await handleClearDailyCap(companyId, btn);
    });
  });
}

// Teklifbul Rule v2.7.1 - Handle force free mode action
async function handleForceFreeMode(companyId, reason, btnElement) {
  const originalText = btnElement.textContent;
  btnElement.disabled = true;
  btnElement.textContent = 'Uygulanıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/guardrails/apply', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        action: 'force_free_on',
        reason,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'İşlem başarısız');
    }

    toast.success('Firma free mode\'a alındı');

    // Reload report and alerts
    await reload();
  } catch (err) {
    logger.error('Force free mode failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

// Teklifbul Rule v2.9 - Handle force free mode off action
async function handleForceFreeModeOff(companyId, btnElement) {
  btnElement.disabled = true;
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Uygulanıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/guardrails/apply', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        action: 'force_free_off',
        reason: 'admin_off',
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'İşlem başarısız');
    }

    toast.success('Free mode kapatıldı');

    // Reload report and alerts
    await reload();
  } catch (err) {
    logger.error('Force free mode off failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

// Teklifbul Rule v2.9 - Handle clear daily cap action
async function handleClearDailyCap(companyId, btnElement) {
  btnElement.disabled = true;
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Uygulanıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/guardrails/apply', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        action: 'clear_daily_cap',
        reason: 'admin_clear',
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'İşlem başarısız');
    }

    toast.success('Günlük kota kaldırıldı');

    // Reload report and alerts
    await reload();
  } catch (err) {
    logger.error('Clear daily cap failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

// Teklifbul Rule v3.5.1 - Handle reset guardrails action
async function handleResetGuardrails(companyId, btnElement) {
  const confirmed = confirm('Bu işlem ücretsiz zorunlu modu kapatır ve günlük kotayı kaldırır. Devam?');
  if (!confirmed) return;

  btnElement.disabled = true;
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Sıfırlanıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/guardrails/apply', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        action: 'reset_guardrails',
        reason: 'admin_reset',
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'İşlem başarısız');
    }

    toast.success('Guardrails sıfırlandı');

    // Reload report and alerts
    await reload();
  } catch (err) {
    logger.error('Reset guardrails failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}



// Teklifbul Rule v3.2 - Handle apply suggested daily cap action
async function handleApplySuggestedCap(companyId, suggestedCap, btnElement) {
  btnElement.disabled = true;
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Uygulanıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/guardrails/apply', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        action: 'set_daily_cap',
        dailyPaidTokenCap: suggestedCap,
        reason: 'smart_suggestion_7d',
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'İşlem başarısız');
    }

    toast.success(`Önerilen kota (${formatNumber(suggestedCap)} token) uygulandı`);

    // Reload report and alerts
    await reload();
  } catch (err) {
    logger.error('Apply suggested cap failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

// Teklifbul Rule v2.7.2 - Handle set daily cap action
async function handleSetDailyCap(companyId, btnElement) {
  // Show modal for cap input
  const capInput = prompt('Günlük ücretli token kotası (0 = sınırsız, sayı = limit):');
  if (capInput === null) return; // User cancelled

  const cap = parseInt(capInput, 10);
  if (isNaN(cap) || cap < 0) {
    toast.error('Geçerli bir sayı girin (0 veya daha büyük)');
    return;
  }

  const reasonInput = prompt('Sebep (opsiyonel):');
  const reason = reasonInput || 'admin';

  btnElement.disabled = true;
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Uygulanıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/guardrails/apply', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        action: 'set_daily_cap',
        dailyPaidTokenCap: cap,
        reason,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'İşlem başarısız');
    }

    toast.success(`Günlük kota ${cap === 0 ? 'kaldırıldı' : cap + ' token olarak ayarlandı'}`);

    // Reload report and alerts
    await reload();
  } catch (err) {
    logger.error('Set daily cap failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

function renderReport(data) {
  // Summary cards
  el('ap_totalRevenue').textContent = formatCurrency(data.totals.revenueTRY);
  el('ap_totalCost').textContent = formatCurrency(data.totals.costTRY);
  el('ap_totalProfit').textContent = formatCurrency(data.totals.profitTRY);

  // Projected profit (average of all companies)
  const avgProjected = data.companies.length > 0
    ? data.companies.reduce((sum, c) => sum + c.projectedMonthlyProfitTRY, 0) / data.companies.length
    : 0;
  el('ap_projectedProfit').textContent = formatCurrency(avgProjected);

  // Teklifbul Rule v3.18 - Unknown cost warning
  const unknownCostWarning = el('ap_unknown_cost_warning');
  const unknownCostText = el('ap_unknown_cost_text');
  if (data.totals.unknownCostTokensTotal > 0) {
    unknownCostText.textContent = `Unknown cost tokens: ${formatNumber(data.totals.unknownCostTokensTotal)}. Catalog eksik olabilir.`;
    unknownCostWarning.style.display = 'block';
  } else {
    unknownCostWarning.style.display = 'none';
  }

  // Teklifbul Rule v3.18 - FX drift warning
  const fxDriftWarning = el('ap_fx_drift_warning');
  const fxDriftText = el('ap_fx_drift_text');
  if (data.meta?.fxDriftWarning) {
    const warning = data.meta.fxDriftWarning;
    fxDriftText.textContent = `Bu ay raporları etkileyebilir: Mevcut kur ${warning.current}, snapshot kur ${warning.snapshotOrNull || 'yok'} (fark: %${warning.pctDiff.toFixed(1)}).`;
    fxDriftWarning.style.display = 'block';
  } else {
    fxDriftWarning.style.display = 'none';
  }

  // Teklifbul Rule v3.19 - Generate explanations
  const explanationPanel = el('ap_explanation_panel');
  const explanationContent = el('ap_explanation_content');
  if (explanationPanel && explanationContent) {
    const explanations = [];

    // Check for unknown cost tokens
    if (data.totals.unknownCostTokensTotal > 0) {
      explanations.push('Bazı AI çağrılarının maliyeti net hesaplanamadı.');
    }

    // Check for estimated costs
    const hasEstimatedCosts = data.companies.some(c => c.costSource === 'estimated' || c.costSource === 'mixed');
    if (hasEstimatedCosts) {
      explanations.push('Maliyetler katalog tahminiyle hesaplandı.');
    }

    // Check for FX drift
    if (data.meta?.fxDriftWarning) {
      explanations.push('Kur dalgalanması raporu etkiledi.');
    }

    // Check for wallet drain (if we have usage data)
    // Note: This would require additional data, so we'll skip for now or make it optional

    if (explanations.length > 0) {
      explanationContent.innerHTML = explanations.map(exp =>
        `<div style="padding:8px 0; border-bottom:1px solid #e5e7eb; color:#374151;">• ${exp}</div>`
      ).join('');
      explanationPanel.style.display = 'block';
    } else {
      explanationPanel.style.display = 'none';
    }

    // Collapsible toggle
    const explanationToggle = el('ap_explanation_toggle');
    const explanationIcon = el('ap_explanation_icon');
    if (explanationToggle && explanationIcon) {
      let isExpanded = true;
      explanationToggle.addEventListener('click', () => {
        isExpanded = !isExpanded;
        explanationContent.style.display = isExpanded ? 'block' : 'none';
        explanationIcon.textContent = isExpanded ? '▼' : '▶';
      });
    }
  }

  // Teklifbul Rule v2.1 + v2.4 - Risk summary with burn counts
  const riskSummary = el('ap_risk_summary');
  const riskSummaryText = el('ap_risk_summary_text');
  if (riskSummary && riskSummaryText && data.totals) {
    const ok = data.totals.okCompaniesCount || 0;
    const med = data.totals.medRiskCompaniesCount || 0;
    const high = data.totals.lossCompaniesCount || 0;
    const burnHigh = data.totals.highBurnCount || 0;
    const burnMed = data.totals.medBurnCount || 0;
    const burnOk = data.totals.okBurnCount || 0;
    riskSummaryText.innerHTML = `
      <div>Karlı: ${ok} | Riskli: ${med} | Zararda: ${high}</div>
      <div style="margin-top:6px;">Aşırı tüketim: HIGH ${burnHigh} | MED ${burnMed} | OK ${burnOk}</div>
    `;
    riskSummary.style.display = 'block';
  }

  // Companies table
  const tbody = el('ap_companies_tbody');
  if (tbody) {
    if (data.companies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#9ca3af;">Veri bulunamadı</td></tr>';
    } else {
      tbody.innerHTML = data.companies.map(c => {
        const statusIcon = c.status === 'profit' ? '🟢' : '🔴';
        const statusText = c.status === 'profit' ? 'Karlı' : 'Zararda';
        const profitColor = c.profitTRY >= 0 ? '#059669' : '#dc2626';
        const projectedColor = c.projectedMonthlyProfitTRY >= 0 ? '#059669' : '#dc2626';

        // Teklifbul Rule v2.1 - Risk badge colors
        const riskColors = {
          'HIGH': { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
          'MED': { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' },
          'OK': { bg: '#d1fae5', text: '#059669', border: '#6ee7b7' },
        };
        const riskStyle = riskColors[c.riskFlag] || riskColors['OK'];

        // Teklifbul Rule v2.4 - Burn badge colors
        const burnColors = {
          'HIGH': { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
          'MED': { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' },
          'OK': { bg: '#d1fae5', text: '#059669', border: '#6ee7b7' },
        };
        const burnStyle = burnColors[c.burnFlag] || burnColors['OK'];

        const marginDisplay = c.marginPct !== null ? `${c.marginPct >= 0 ? '+' : ''}${formatNumber(c.marginPct)}%` : '-';
        const marginColor = c.marginPct !== null
          ? (c.marginPct >= 15 ? '#059669' : c.marginPct >= 0 ? '#d97706' : '#dc2626')
          : '#6b7280';

        // Teklifbul Rule v2.4 - Burn ratio display
        const burnPct = c.burnRatio !== null ? c.burnRatio * 100 : null;
        const burnDisplay = burnPct !== null ? `${formatNumber(burnPct)}%` : '-';
        const burnColor = burnPct !== null
          ? (burnPct >= 100 ? '#dc2626' : burnPct >= 70 ? '#d97706' : '#059669')
          : '#6b7280';

        // Teklifbul Rule v2.4 - Highlight HIGH burn rows
        const rowBg = c.burnFlag === 'HIGH' ? 'background:#fef2f2;' : '';

        return `
          <tr style="${rowBg}">
            <td style="padding:12px; border-bottom:1px solid #e5e7eb; font-weight:600;">
              <a href="/settings.html#admin-profit-detail?companyId=${encodeURIComponent(c.companyId)}&month=${encodeURIComponent(data.month)}" 
                 class="cp-hover-underline"
                 style="color:#3b82f6; text-decoration:none; cursor:pointer; font-weight:600;">
                ${c.name || c.companyId}
              </a>
            </td>
            <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatCurrency(c.revenueTRY)}</td>
            <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatCurrency(c.costTRY)}</td>
            <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb; color:${profitColor}; font-weight:600;">${formatCurrency(c.profitTRY)}</td>
            <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb; color:${marginColor}; font-weight:600;">${marginDisplay}</td>
            <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb; color:${burnColor}; font-weight:600;">${burnDisplay}</td>
            <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">
              <span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; background:${burnStyle.bg}; color:${burnStyle.text}; border:1px solid ${burnStyle.border};">
                ${c.burnFlag || 'OK'}
              </span>
            </td>
            <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">
              <span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; background:${riskStyle.bg}; color:${riskStyle.text}; border:1px solid ${riskStyle.border};">
                ${c.riskFlag}
              </span>
            </td>
            <td style="padding:12px; text-align:left; border-bottom:1px solid #e5e7eb; font-size:12px; color:#6b7280; max-width:300px;">${c.recommendation || '-'}</td>
            <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb; color:${projectedColor};">${formatCurrency(c.projectedMonthlyProfitTRY)}</td>
            <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">
              <span style="font-size:16px; margin-right:4px;">${statusIcon}</span>
              <span style="font-size:13px; color:${c.status === 'profit' ? '#059669' : '#dc2626'}; font-weight:600;">${statusText}</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

async function reload() {
  if (isReloading) return;
  isReloading = true;

  const monthSelect = el('ap_month_select');
  const month = monthSelect ? monthSelect.value : getCurrentMonth();
  currentMonth = month;

  const tbody = el('ap_companies_tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>';
  }

  try {
    const data = await fetchProfitReport(month);
    renderReport(data);
    logger.info('Profit report loaded', { month, companyCount: data.companies.length });

    // Teklifbul Rule v2.6 - Load alerts (non-critical)
    try {
      const alertsData = await fetchProfitAlerts(month);
      if (alertsData) {
        renderAlerts(alertsData, month);
      } else {
        // Alerts fetch failed, show error message
        const panel = el('ap_alerts_panel');
        const content = el('ap_alerts_content');
        if (panel && content) {
          content.innerHTML = '<div style="text-align:center; padding:20px; color:#d97706; font-size:13px;">Uyarılar yüklenemedi</div>';
          panel.style.display = 'block';
        }
      }
    } catch (alertsErr) {
      logger.warn('Alerts fetch failed (non-critical)', alertsErr);
      // Don't break the page, just log
    }
  } catch (err) {
    logger.error('Failed to load profit report', err);
    toast.error(err.message || 'Rapor yüklenemedi');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px; color:#dc2626;">Hata: ' + (err.message || 'Yükleme başarısız') + '</td></tr>';
    }
  } finally {
    isReloading = false;
  }
}

export async function initAdminProfitPage() {
  const root = getRoot();
  if (!root) {
    logger.warn('Admin Profit root element not found');
    return;
  }

  if (initialized) {
    logger.info('Admin Profit page already initialized, reloading data');
    await reload();
    return;
  }

  renderShell();
  initialized = true;
  await reload();
}

