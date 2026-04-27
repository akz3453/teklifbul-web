/**
 * Admin Company Profit Detail Page (Settings.html)
 * Teklifbul Rule v2.5 - Admin Profit Drill-down (Company Detail)
 *
 * Init guard: UI/handlers are attached once; subsequent visits only reload data.
 */

import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let isReloading = false;

function el(id) {
  return document.getElementById(id);
}

function getRoot() {
  return el('adminProfitDetailRoot');
}

function formatNumber(num) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function formatCurrency(num) {
  return `${formatNumber(num)} ₺`;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return isoString;
  }
}

function getUrlParams() {
  const hash = window.location.hash.replace('#', '');
  const [page, queryString] = hash.split('?');
  if (!queryString) return {};

  const params = {};
  queryString.split('&').forEach(param => {
    const [key, value] = param.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });
  return params;
}

function renderShell() {
  const root = getRoot();
  if (!root) return;

  root.innerHTML = `
    <div style="display:grid; gap:20px;">
      <!-- Back Button -->
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:12px;">
          <button id="apd_btn_back" class="btn btn-secondary" style="padding:8px 16px; font-size:14px;">← Geri</button>
          <h3 id="apd_company_name" style="margin:0; font-size:18px; font-weight:700; color:#1f2937;">Firma Detayı</h3>
        </div>
        
        <!-- Teklifbul Rule v3.11 - AI Emergency Controls Section -->
        <div id="apd_ai_emergency_controls" style="display:none; background:#fff3cd; border:2px solid #ffc107; border-radius:8px; padding:16px; margin-bottom:20px; width:100%;">
          <h4 style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#856404;">🚨 AI Acil Durum Kontrolleri</h4>
          
          <!-- Global Status -->
          <div style="margin-bottom:16px; padding:12px; background:white; border-radius:6px; border:1px solid #e5e7eb;">
            <div style="font-size:14px; font-weight:600; color:#1f2937; margin-bottom:8px;">Global Durum</div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:8px; font-size:13px;">
              <div>
                <span style="color:#6b7280;">Global AI Disabled:</span>
                <strong id="apd_global_ai_disabled" style="color:#dc2626; margin-left:4px;">-</strong>
              </div>
              <div>
                <span style="color:#6b7280;">Panic Mode:</span>
                <strong id="apd_panic_mode" style="color:#dc2626; margin-left:4px;">-</strong>
              </div>
              <div id="apd_global_reason" style="color:#9ca3af; font-size:12px; grid-column:1/-1;"></div>
            </div>
          </div>
          
          <!-- Company Status -->
          <div style="margin-bottom:16px; padding:12px; background:white; border-radius:6px; border:1px solid #e5e7eb;">
            <div style="font-size:14px; font-weight:600; color:#1f2937; margin-bottom:8px;">Firma Durumu</div>
            <div style="font-size:13px;">
              <span style="color:#6b7280;">Company AI Disabled:</span>
              <strong id="apd_company_ai_disabled" style="color:#dc2626; margin-left:4px;">-</strong>
            </div>
            <div id="apd_company_reason" style="color:#9ca3af; font-size:12px; margin-top:4px;"></div>
          </div>
          
          <!-- Action Buttons -->
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button id="apd_btn_toggle_company_ai" class="btn btn-warning" style="padding:8px 16px; font-size:13px;">
              Bu Firmada AI'ı Kapat/Aç
            </button>
            <button id="apd_btn_toggle_global_ai" class="btn btn-danger" style="padding:8px 16px; font-size:13px;">
              Global AI'ı Kapat/Aç
            </button>
            <button id="apd_btn_toggle_panic" class="btn" style="padding:8px 16px; font-size:13px; background:#dc2626; color:white; border:none;">
              PANIC MODE Aç/Kapat
            </button>
          </div>
        </div>
        <!-- Teklifbul Rule v2.7.1 - Force Free Mode Button -->
        <button id="apd_btn_force_free" class="btn btn-secondary" style="padding:8px 16px; font-size:14px; display:none; margin-right:8px;">
          Free Mode'a Al
        </button>
        <!-- Teklifbul Rule v2.9 - Force Free Mode Off Button -->
        <button id="apd_btn_force_free_off" class="btn btn-success" style="padding:8px 16px; font-size:14px; display:none; margin-right:8px;">
          Free Mode'u Kapat
        </button>
        <!-- Teklifbul Rule v2.7.2 - Daily Cap Button -->
        <button id="apd_btn_daily_cap" class="btn btn-warning" style="padding:8px 16px; font-size:14px; display:none; margin-right:8px;">
          Günlük Kota
        </button>
        <!-- Teklifbul Rule v2.9 - Clear Daily Cap Button -->
        <button id="apd_btn_clear_daily_cap" class="btn btn-danger" style="padding:8px 16px; font-size:14px; display:none;">
          Kotayı Kaldır
        </button>
        <!-- Teklifbul Rule v3.4 - AI Health Check Button -->
        <button id="apd_btn_ai_health" class="btn btn-info" style="padding:8px 16px; font-size:14px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer;">
          AI Sağlık Kontrolü
        </button>
        <!-- Teklifbul Rule v3.14 - Entitlements Debug Button -->
        <button id="apd_btn_entitlements" class="btn btn-info" style="padding:8px 16px; font-size:14px; background:#8b5cf6; color:white; border:none; border-radius:4px; cursor:pointer;">
          Entitlements
        </button>
        <!-- Teklifbul Rule v3.5.1 - Reset Guardrails Button -->
        <button id="apd_btn_reset_guardrails" class="btn btn-secondary" style="padding:8px 16px; font-size:14px; display:none;">
          Guardrails Sıfırla
        </button>
        <!-- Teklifbul Rule v3.20 - Auto-Protection Suggestion Button -->
        <button id="apd_btn_auto_protection" class="btn btn-info" style="padding:8px 16px; font-size:14px; background:#8b5cf6; color:white; border:none; border-radius:4px; cursor:pointer;">
          Bu Firma için Oto Koruma Önerisi
        </button>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
        <div style="padding:20px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Bu Ay Gelir</div>
          <div id="apd_revenue" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div style="padding:20px; background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Bu Ay AI Maliyeti</div>
          <div id="apd_cost" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div style="padding:20px; background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Net Kâr</div>
          <div id="apd_profit" style="font-size:28px; font-weight:700;">-</div>
        </div>
        <div style="padding:20px; background:linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius:8px; color:white;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">Maliyet/Gelir</div>
          <div id="apd_burn" style="font-size:28px; font-weight:700;">-</div>
        </div>
      </div>

      <!-- Usage Summary (7/30 days) -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Kullanım Özeti</h4>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
          <div>
            <div style="font-size:13px; color:#6b7280; margin-bottom:8px;">Son 7 Gün</div>
            <div style="font-size:14px; color:#1f2937;">
              <div>Ücretli: <strong id="apd_usage7_paid">-</strong></div>
              <div>Ücretsiz: <strong id="apd_usage7_free">-</strong></div>
              <div>Maliyet: <strong id="apd_usage7_cost">-</strong> <span id="apd_usage7_cost_source" style="display:none; margin-left:8px;"></span></div>
              <div id="apd_usage7_unknown_cost" style="display:none;"></div>
            </div>
          </div>
          <div>
            <div style="font-size:13px; color:#6b7280; margin-bottom:8px;">Son 30 Gün</div>
            <div style="font-size:14px; color:#1f2937;">
              <div>Ücretli: <strong id="apd_usage30_paid">-</strong></div>
              <div>Ücretsiz: <strong id="apd_usage30_free">-</strong></div>
              <div>Maliyet: <strong id="apd_usage30_cost">-</strong> <span id="apd_usage30_cost_source" style="display:none; margin-left:8px;"></span></div>
              <div id="apd_usage30_unknown_cost" style="display:none;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Teklifbul Rule v3.1 - Today Paid Usage -->
      <div id="apd_today_usage" style="display:none;"></div>

      <!-- Teklifbul Rule v3.3 - Guardrails History -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Guardrails Geçmişi</h4>
        <div id="apd_guardrails_history" style="min-height:100px;">
          <div style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</div>
        </div>
      </div>

      <!-- Purchases Table -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Satın Alımlar (Son 20)</h4>
        <div id="apd_purchases_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Tarih</th>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Paket</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Token</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Fiyat</th>
              </tr>
            </thead>
            <tbody id="apd_purchases_tbody">
              <tr><td colspan="4" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Teklifbul Rule v3.18 - FX Drift Warning -->
      <div id="apd_fx_drift_warning" style="display:none;"></div>

      <!-- By Model Table (7 days) -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Model Dağılımı (Son 7 Gün)</h4>
        <div id="apd_byModel_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Sağlayıcı</th>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Model</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretli Token</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretsiz Token</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">İstek</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet (USD)</th>
              </tr>
            </thead>
            <tbody id="apd_byModel_tbody">
              <tr><td colspan="6" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- By Route Table (7 days) -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Endpoint Dağılımı (Son 7 Gün)</h4>
        <div id="apd_byRoute_table" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Endpoint</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretli Token</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretsiz Token</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">İstek</th>
                <th style="padding:12px; text-align:right; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Maliyet (USD)</th>
              </tr>
            </thead>
            <tbody id="apd_byRoute_tbody">
              <tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Back button handler
  const backBtn = el('apd_btn_back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.hash = 'admin-profit';
    });
  }

  // Teklifbul Rule v3.4 - AI Health Check button
  const healthBtn = el('apd_btn_ai_health');
  if (healthBtn) {
    healthBtn.addEventListener('click', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const companyId = urlParams.get('companyId');
      if (companyId) {
        await handleAiHealthCheck(companyId);
      } else {
        toast.error('Company ID bulunamadı');
      }
    });
  }

  // Teklifbul Rule v3.14 - Entitlements Debug Button
  const entitlementsBtn = el('apd_btn_entitlements');
  if (entitlementsBtn) {
    entitlementsBtn.addEventListener('click', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const companyId = urlParams.get('companyId');
      if (companyId) {
        await handleEntitlementsDebug(companyId);
      } else {
        toast.error('Company ID bulunamadı');
      }
    });
  }

  // Teklifbul Rule v3.20 - Auto-Protection Suggestion Button
  const autoProtectionBtn = el('apd_btn_auto_protection');
  if (autoProtectionBtn) {
    autoProtectionBtn.addEventListener('click', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const companyId = urlParams.get('companyId');
      const monthParam = urlParams.get('month') || getCurrentMonth();

      if (!companyId) {

        toast.error('Company ID bulunamadı');
        return;
      }

      await handleAutoProtectionSuggestion(companyId, monthParam);
    });
  }

  // Teklifbul Rule v2.7.1 - Force Free Mode button handler
  const forceFreeBtn = el('apd_btn_force_free');
  if (forceFreeBtn) {
    forceFreeBtn.addEventListener('click', async () => {
      const params = getUrlParams();
      const companyId = params.companyId;
      if (!companyId) {
        toast.error('Firma ID bulunamadı');
        return;
      }
      await handleForceFreeMode(companyId, 'admin_detail', forceFreeBtn);
    });
  }

  // Teklifbul Rule v2.7.2 - Daily Cap button handler
  const dailyCapBtn = el('apd_btn_daily_cap');
  if (dailyCapBtn) {
    dailyCapBtn.addEventListener('click', async () => {
      const params = getUrlParams();
      const companyId = params.companyId;
      if (!companyId) {
        toast.error('Firma ID bulunamadı');
        return;
      }
      await handleSetDailyCap(companyId, dailyCapBtn);
    });
  }

  // Teklifbul Rule v2.9 - Force Free Mode Off button handler
  const forceFreeOffBtn = el('apd_btn_force_free_off');
  if (forceFreeOffBtn) {
    forceFreeOffBtn.addEventListener('click', async () => {
      const params = getUrlParams();
      const companyId = params.companyId;
      if (!companyId) {
        toast.error('Firma ID bulunamadı');
        return;
      }
      await handleForceFreeModeOff(companyId, forceFreeOffBtn);
    });
  }

  // Teklifbul Rule v2.9 - Clear Daily Cap button handler
  const clearDailyCapBtn = el('apd_btn_clear_daily_cap');
  if (clearDailyCapBtn) {
    clearDailyCapBtn.addEventListener('click', async () => {
      const params = getUrlParams();
      const companyId = params.companyId;
      if (!companyId) {
        toast.error('Firma ID bulunamadı');
        return;
      }
      await handleClearDailyCap(companyId, clearDailyCapBtn);
    });
  }

  // Teklifbul Rule v3.5.1 - Reset Guardrails button
  const resetGuardrailsBtn = el('apd_btn_reset_guardrails');
  if (resetGuardrailsBtn) {
    resetGuardrailsBtn.addEventListener('click', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const companyId = urlParams.get('companyId');
      if (!companyId) {

        toast.error('Company ID bulunamadı');
        return;
      }
      await handleResetGuardrails(companyId, resetGuardrailsBtn);
    });
  }

  // Teklifbul Rule v3.11 - AI Emergency Controls buttons
  const toggleCompanyAiBtn = el('apd_btn_toggle_company_ai');
  if (toggleCompanyAiBtn) {
    toggleCompanyAiBtn.addEventListener('click', async () => {
      const params = getUrlParams();
      const companyId = params.companyId;
      if (!companyId) {
        toast.error('Firma ID bulunamadı');
        return;
      }
      await handleToggleCompanyAi(companyId);
    });
  }

  const toggleGlobalAiBtn = el('apd_btn_toggle_global_ai');
  if (toggleGlobalAiBtn) {
    toggleGlobalAiBtn.addEventListener('click', async () => {
      await handleToggleGlobalAi();
    });
  }

  const togglePanicBtn = el('apd_btn_toggle_panic');
  if (togglePanicBtn) {
    togglePanicBtn.addEventListener('click', async () => {
      await handleTogglePanic();
    });
  }
}

async function fetchDetail(companyId, month) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/company-profit-detail?companyId=${encodeURIComponent(companyId)}&month=${encodeURIComponent(month)}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || 'Detay yüklenemedi');
    }
    return await resp.json();
  } catch (err) {
    logger.error('Failed to fetch company profit detail', err);
    throw err;
  }
}

async function renderDetail(data) {
  // Company name
  el('apd_company_name').textContent = data.company?.name || data.company?.companyId || 'Firma Detayı';

  // Teklifbul Rule v2.7.1 + v2.9 - Show force free buttons conditionally
  const forceFreeBtn = el('apd_btn_force_free');
  const forceFreeOffBtn = el('apd_btn_force_free_off');
  if (forceFreeBtn && forceFreeOffBtn) {
    const forcedFreeMode = data.forcedFreeMode === true;
    if (forcedFreeMode) {
      // Forced free mode is ON: show "Free Mode'u Kapat"
      forceFreeOffBtn.style.display = 'inline-block';
      forceFreeBtn.style.display = 'none';
    } else {
      // Forced free mode is OFF: show "Free Mode'a Al" if burn/risk is HIGH
      const shouldShow = (data.burnRatio !== null && data.burnRatio >= 1.0) || data.profitTRY < 0;
      forceFreeBtn.style.display = shouldShow ? 'inline-block' : 'none';
      forceFreeOffBtn.style.display = 'none';
    }
  }

  // Teklifbul Rule v2.7.2 + v2.9 - Show daily cap buttons conditionally
  const dailyCapBtn = el('apd_btn_daily_cap');
  const clearDailyCapBtn = el('apd_btn_clear_daily_cap');
  if (dailyCapBtn && clearDailyCapBtn) {
    const dailyCap = data.dailyPaidTokenCap !== null && data.dailyPaidTokenCap !== undefined;
    if (dailyCap) {
      // Daily cap is set: show both "Günlük Kota" (update) and "Kotayı Kaldır"
      dailyCapBtn.style.display = 'inline-block';
      clearDailyCapBtn.style.display = 'inline-block';
    } else {
      // Daily cap is not set: show only "Günlük Kota" (set)
      dailyCapBtn.style.display = 'inline-block';
      clearDailyCapBtn.style.display = 'none';
    }
  }

  // Summary cards
  el('apd_revenue').textContent = formatCurrency(data.revenueTRY);
  el('apd_cost').textContent = formatCurrency(data.costTRY);
  el('apd_profit').textContent = formatCurrency(data.profitTRY);

  const burnPct = data.burnRatio !== null ? data.burnRatio * 100 : null;
  el('apd_burn').textContent = burnPct !== null ? `${formatNumber(burnPct)}%` : '-';

  // Teklifbul Rule v3.1 - Today paid usage display
  const todayUsageEl = el('apd_today_usage');
  if (todayUsageEl) {
    const todayPaidUsage = data.todayPaidUsage || { dateKey: '', paidUsedTokens: 0 };
    const todayUsed = todayPaidUsage.paidUsedTokens || 0;
    const dailyCap = data.dailyPaidTokenCap !== null && data.dailyPaidTokenCap !== undefined ? data.dailyPaidTokenCap : null;

    if (dailyCap !== null) {
      const percent = dailyCap > 0 ? Math.min(100, (todayUsed / dailyCap) * 100) : 0;
      const progressColor = percent >= 100 ? '#dc2626' : percent >= 70 ? '#f59e0b' : '#10b981';
      todayUsageEl.innerHTML = `
        <div style="margin-top:12px; padding:12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb;">
          <div style="font-size:13px; font-weight:600; color:#374151; margin-bottom:6px;">Bugün Kullanılan Paid Token</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:14px; color:#1f2937;"><strong>${todayUsed.toLocaleString('tr-TR')} / ${dailyCap.toLocaleString('tr-TR')}</strong></span>
            <span style="font-size:12px; color:#6b7280; font-weight:600;">${percent.toFixed(1)}%</span>
          </div>
          <div style="width:100%; height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden;">
            <div style="width:${percent}%; height:100%; background:${progressColor}; transition:width 0.3s;"></div>
          </div>
        </div>
      `;
      todayUsageEl.style.display = 'block';
    } else if (todayUsed > 0) {
      todayUsageEl.innerHTML = `
        <div style="margin-top:12px; padding:12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb;">
          <div style="font-size:13px; font-weight:600; color:#374151; margin-bottom:4px;">Bugün Kullanılan Paid Token</div>
          <div style="font-size:14px; color:#1f2937;"><strong>${todayUsed.toLocaleString('tr-TR')}</strong></div>
        </div>
      `;
      todayUsageEl.style.display = 'block';
    } else {
      todayUsageEl.style.display = 'none';
    }
  }

  // Teklifbul Rule v3.3 - Load guardrails history
  await loadGuardrailsHistory(data.company?.companyId || companyId);

  // Teklifbul Rule v3.11 - Load AI controls
  await loadAiControls(data.company?.companyId || companyId);

  // Usage summary
  const usage7 = data.usageSummary7 || {};
  el('apd_usage7_paid').textContent = usage7.paidTokens?.toLocaleString('tr-TR') || '0';
  el('apd_usage7_free').textContent = usage7.freeTokens?.toLocaleString('tr-TR') || '0';
  el('apd_usage7_cost').textContent = `$${formatNumber(usage7.costUSD || 0)} (${formatCurrency(usage7.costTRY || 0)})`;

  // Teklifbul Rule v3.18 - Show cost source and unknown cost
  const usage7CostSource = el('apd_usage7_cost_source');
  if (usage7CostSource) {
    const costSource = usage7.costSource || 'estimated';
    const costSourceLabel = costSource === 'ledger' ? 'LEDGER' : costSource === 'mixed' ? 'MIXED' : 'ESTIMATED';
    const costSourceColor = costSource === 'ledger' ? '#10b981' : costSource === 'mixed' ? '#f59e0b' : '#6b7280';
    usage7CostSource.innerHTML = `<span style="padding:4px 8px; background:${costSourceColor}; color:white; border-radius:4px; font-size:11px; font-weight:600;">${costSourceLabel}</span>`;
    usage7CostSource.style.display = 'inline-block';
  }
  if (usage7.unknownCostTokens > 0) {
    const usage7Unknown = el('apd_usage7_unknown_cost');
    if (usage7Unknown) {
      usage7Unknown.textContent = `Unknown cost tokens: ${usage7.unknownCostTokens.toLocaleString('tr-TR')}`;
      usage7Unknown.style.display = 'block';
      usage7Unknown.style.color = '#dc2626';
      usage7Unknown.style.fontSize = '12px';
      usage7Unknown.style.marginTop = '4px';
    }
  }

  const usage30 = data.usageSummary30 || {};
  el('apd_usage30_paid').textContent = usage30.paidTokens?.toLocaleString('tr-TR') || '0';
  el('apd_usage30_free').textContent = usage30.freeTokens?.toLocaleString('tr-TR') || '0';
  el('apd_usage30_cost').textContent = `$${formatNumber(usage30.costUSD || 0)} (${formatCurrency(usage30.costTRY || 0)})`;

  // Teklifbul Rule v3.18 - Show cost source and unknown cost
  const usage30CostSource = el('apd_usage30_cost_source');
  if (usage30CostSource) {
    const costSource = usage30.costSource || 'estimated';
    const costSourceLabel = costSource === 'ledger' ? 'LEDGER' : costSource === 'mixed' ? 'MIXED' : 'ESTIMATED';
    const costSourceColor = costSource === 'ledger' ? '#10b981' : costSource === 'mixed' ? '#f59e0b' : '#6b7280';
    usage30CostSource.innerHTML = `<span style="padding:4px 8px; background:${costSourceColor}; color:white; border-radius:4px; font-size:11px; font-weight:600;">${costSourceLabel}</span>`;
    usage30CostSource.style.display = 'inline-block';
  }
  if (usage30.unknownCostTokens > 0) {
    const usage30Unknown = el('apd_usage30_unknown_cost');
    if (usage30Unknown) {
      usage30Unknown.textContent = `Unknown cost tokens: ${usage30.unknownCostTokens.toLocaleString('tr-TR')}`;
      usage30Unknown.style.display = 'block';
      usage30Unknown.style.color = '#dc2626';
      usage30Unknown.style.fontSize = '12px';
      usage30Unknown.style.marginTop = '4px';
    }
  }

  // Teklifbul Rule v3.18 - FX drift warning
  if (data.meta?.fxDriftWarning) {
    const fxWarning = el('apd_fx_drift_warning');
    if (fxWarning) {
      const warning = data.meta.fxDriftWarning;
      fxWarning.innerHTML = `
        <div style="padding:12px; background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; margin-top:12px;">
          <div style="font-size:13px; color:#92400e; font-weight:600; margin-bottom:4px;">
            ⚠️ Kur değişimi uyarısı
          </div>
          <div style="font-size:12px; color:#78350f;">
            Bu ay raporları etkileyebilir: Mevcut kur ${warning.current}, snapshot kur ${warning.snapshotOrNull || 'yok'} (fark: %${warning.pctDiff.toFixed(1)}).
          </div>
        </div>
      `;
      fxWarning.style.display = 'block';
    }
  }

  // Purchases table
  const purchasesTbody = el('apd_purchases_tbody');
  if (purchasesTbody) {
    const purchases = data.purchases || [];
    if (purchases.length === 0) {
      purchasesTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#9ca3af;">Satın alım bulunamadı</td></tr>';
    } else {
      purchasesTbody.innerHTML = purchases.map(p => `
        <tr>
          <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${formatDate(p.createdAt)}</td>
          <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${p.packageName || p.packageId || '-'}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(p.tokens || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${formatCurrency(p.priceTRY || 0)}</td>
        </tr>
      `).join('');
    }
  }

  // By Model table
  const byModelTbody = el('apd_byModel_tbody');
  if (byModelTbody) {
    const byModel = data.byModel7 || [];
    if (byModel.length === 0) {
      byModelTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#9ca3af;">Veri bulunamadı</td></tr>';
    } else {
      byModelTbody.innerHTML = byModel.map(m => `
        <tr>
          <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${m.provider || '-'}</td>
          <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${m.model || '-'}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(m.paidConsumed || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(m.freeUsedTotalTokens || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(m.requests || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">$${formatNumber(m.costUSD || 0)}</td>
        </tr>
      `).join('');
    }
  }

  // By Route table
  const byRouteTbody = el('apd_byRoute_tbody');
  if (byRouteTbody) {
    const byRoute = data.byRoute7 || [];
    if (byRoute.length === 0) {
      byRouteTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Veri bulunamadı</td></tr>';
    } else {
      byRouteTbody.innerHTML = byRoute.map(r => `
        <tr>
          <td style="padding:12px; border-bottom:1px solid #e5e7eb;">${r.route || '-'}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(r.paidConsumed || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(r.freeUsedTotalTokens || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">${(r.requests || 0).toLocaleString('tr-TR')}</td>
          <td style="padding:12px; text-align:right; border-bottom:1px solid #e5e7eb;">$${formatNumber(r.costUSD || 0)}</td>
        </tr>
      `).join('');
    }
  }
}

async function reload() {
  if (isReloading) return;
  isReloading = true;

  const params = getUrlParams();
  const companyId = params.companyId;
  const month = params.month;

  if (!companyId || !month) {
    logger.warn('Missing companyId or month parameter');
    toast.error('Firma ID veya ay parametresi eksik');
    window.location.hash = 'admin-profit';
    isReloading = false;
    return;
  }

  const tbody = el('apd_purchases_tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>';
  }

  try {
    const data = await fetchDetail(companyId, month);
    await renderDetail(data);
    logger.info('Company profit detail loaded', { companyId, month });
  } catch (err) {
    logger.error('Failed to load company profit detail', err);
    toast.error(err.message || 'Detay yüklenemedi');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#dc2626;">Hata: ' + (err.message || 'Yükleme başarısız') + '</td></tr>';
    }
  } finally {
    isReloading = false;
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

    // Reload detail
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

    // Reload detail
    await reload();
  } catch (err) {
    logger.error('Clear daily cap failed', err);
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

    // Reload detail
    await reload();
  } catch (err) {
    logger.error('Set daily cap failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = originalText;
  }
}

// Teklifbul Rule v3.4 + v3.19 - AI Health Check with Cost & FX Visibility
async function handleAiHealthCheck(companyId) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/ai-health?companyId=${encodeURIComponent(companyId)}`);

    if (!resp.ok) {
      throw new Error('Health check başarısız');
    }

    const data = await resp.json();

    // Teklifbul Rule v3.19 - Fetch cost & FX data from profit detail (current month)
    let costData = null;
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const detailResp = await authFetch(`/api/admin/company-profit-detail?companyId=${encodeURIComponent(companyId)}&month=${encodeURIComponent(month)}`);
      if (detailResp.ok) {
        const detailData = await detailResp.json();
        costData = {
          costSource: detailData.meta?.costSource || null,
          unknownCostTokens: detailData.meta?.unknownCostTokens || 0,
          fxDriftWarning: detailData.meta?.fxDriftWarning || null,
        };
      }
    } catch (costErr) {
      logger.warn('Failed to fetch cost data for health check', { error: costErr });
      // Non-blocking: continue without cost data
    }

    // Show modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;';
    modal.innerHTML = `
      <div style="background:white; border-radius:8px; padding:24px; max-width:600px; width:90%; max-height:80vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h3 style="margin:0; font-size:18px; font-weight:700; color:#1f2937;">AI Sağlık Kontrolü</h3>
          <button id="apd_health_modal_close" style="background:none; border:none; font-size:24px; color:#6b7280; cursor:pointer; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>
        <div style="display:grid; gap:12px;">
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Settings Doc</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${data.hasSettingsDoc ? '✅ Var' : '❌ Yok'}</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Aktif Provider/Model</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${data.provider || 'null'} / ${data.model || 'null'}</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Forced Free Mode</div>
            <div style="font-size:14px; font-weight:600; color:${data.forcedFreeMode ? '#dc2626' : '#059669'};">${data.forcedFreeMode ? '✅ Açık' : '❌ Kapalı'}</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Günlük Kota</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${data.dailyPaidTokenCap !== null ? formatNumber(data.dailyPaidTokenCap) + ' token' : 'Yok'}</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Bugün Kullanılan Paid Token</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${formatNumber(data.todayCounterPaidUsed || 0)} token</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Wallet Balance</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${formatNumber(data.walletBalanceTokens || 0)} token</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Kullanılabilir Model Sayısı</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${data.availableModelsCount || 0}</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Legacy Fallback Mümkün</div>
            <div style="font-size:14px; font-weight:600; color:${data.legacyFallbackPossible ? '#f59e0b' : '#059669'};">${data.legacyFallbackPossible ? '⚠️ Evet' : '✅ Hayır (Company-flow aktif)'}</div>
          </div>
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Plan</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${data.planId || 'free'} ${data.isPremiumPlus ? '(Premium Plus)' : ''}</div>
          </div>
          ${costData ? `
          <!-- Teklifbul Rule v3.19 - Cost & FX Visibility -->
          <div style="margin-top:16px; padding-top:16px; border-top:2px solid #e5e7eb;">
            <h4 style="margin:0 0 12px 0; font-size:14px; font-weight:700; color:#1f2937;">Maliyet & Kur Bilgisi</h4>
            ${costData.costSource ? `
            <div style="padding:12px; background:#f9fafb; border-radius:6px; margin-bottom:8px;">
              <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Cost Source</div>
              <div style="font-size:14px; font-weight:600; color:#1f2937;">
                ${costData.costSource === 'ledger' ? '✅ LEDGER' : costData.costSource === 'mixed' ? '⚠️ MIXED' : '📊 ESTIMATED'}
              </div>
            </div>
            ` : ''}
            ${costData.unknownCostTokens > 0 ? `
            <div style="padding:12px; background:#fef3c7; border-radius:6px; margin-bottom:8px; border:1px solid #fbbf24;">
              <div style="font-size:12px; color:#92400e; margin-bottom:4px; font-weight:600;">Unknown Cost Tokens</div>
              <div style="font-size:14px; font-weight:600; color:#78350f;">${formatNumber(costData.unknownCostTokens)} token</div>
            </div>
            ` : ''}
            ${costData.fxDriftWarning ? `
            <div style="padding:12px; background:#fef3c7; border-radius:6px; border:1px solid #f59e0b;">
              <div style="font-size:12px; color:#92400e; margin-bottom:4px; font-weight:600;">⚠ FX Drift Warning</div>
              <div style="font-size:12px; color:#78350f;">
                Mevcut kur: ${costData.fxDriftWarning.current}, Snapshot: ${costData.fxDriftWarning.snapshotOrNull || 'yok'}<br>
                Fark: %${costData.fxDriftWarning.pctDiff.toFixed(1)}
              </div>
            </div>
            ` : ''}
          </div>
          ` : ''}
        </div>
        <div style="margin-top:20px; text-align:right;">
          <button id="apd_health_modal_close_btn" class="btn btn-secondary" style="padding:8px 16px; font-size:14px;">Kapat</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    el('apd_health_modal_close')?.addEventListener('click', closeModal);
    el('apd_health_modal_close_btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

  } catch (err) {
    logger.error('AI health check failed', err);

    toast.error(err?.message || 'Sağlık kontrolü başarısız');
  }
}

// Teklifbul Rule v3.20 - Auto-Protection Suggestion (single company)
async function handleAutoProtectionSuggestion(companyId, month) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');


    // Run DRY RUN with limit=100, then filter by companyId client-side
    const resp = await authFetch('/api/admin/auto-protection/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        month,
        dryRun: true,
        limit: 100, // Get more to find the company
      }),
    });

    if (!resp.ok) {
      throw new Error('Auto-protection önerisi alınamadı');
    }

    const data = await resp.json();

    // Filter by companyId
    const companyResult = data.results.find(r => r.companyId === companyId);

    if (!companyResult) {
      toast.info('Bu firma için öneri bulunamadı (HIGH alert yok veya zaten korumalı)');
      return;
    }

    // Show modal with suggestion
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;';

    const actionLabel = companyResult.proposedAction === 'force_free_on' ? 'Force Free Mode' :
      companyResult.proposedAction === 'set_daily_cap' ? 'Set Daily Cap' : 'Yok';

    modal.innerHTML = `
      <div style="background:white; border-radius:8px; padding:24px; max-width:500px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h3 style="margin:0; font-size:18px; font-weight:700; color:#1f2937;">Oto Koruma Önerisi</h3>
          <button id="apd_auto_protection_modal_close" style="background:none; border:none; font-size:24px; color:#6b7280; cursor:pointer; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>
        <div style="display:grid; gap:12px;">
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Önerilen Aksiyon</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${actionLabel}</div>
          </div>
          ${companyResult.capValue ? `
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Cap Değeri</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${formatNumber(companyResult.capValue)} token</div>
          </div>
          ` : ''}
          <div style="padding:12px; background:#f9fafb; border-radius:6px;">
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Sebep</div>
            <div style="font-size:14px; font-weight:600; color:#1f2937;">${companyResult.reason || '-'}</div>
          </div>
          <div style="padding:12px; background:#f0f9ff; border-radius:6px; border:1px solid #bfdbfe;">
            <div style="font-size:12px; color:#1e40af;">
              ℹ️ Bu bir DRY RUN sonucudur. Uygulamak için ana sayfadaki "Uygula (APPLY)" butonunu kullanın.
            </div>
          </div>
        </div>
        <div style="margin-top:20px; text-align:right;">
          <button id="apd_auto_protection_modal_close_btn" class="btn btn-secondary" style="padding:8px 16px; font-size:14px;">Kapat</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    el('apd_auto_protection_modal_close')?.addEventListener('click', closeModal);
    el('apd_auto_protection_modal_close_btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  } catch (err) {
    logger.error('Auto-protection suggestion failed', err);

    toast.error(err?.message || 'Öneri alınamadı');
  }
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Teklifbul Rule v3.14 - Entitlements Debug
async function handleEntitlementsDebug(companyId) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/entitlements?companyId=${encodeURIComponent(companyId)}`);

    if (!resp.ok) {
      throw new Error('Entitlements debug başarısız');
    }

    const data = await resp.json();

    // Build providers HTML
    const providersHtml = data.providers && data.providers.length > 0 ? data.providers.map(provider => {
      const providerWideBadge = provider.providerWide
        ? '<span style="display:inline-block; padding:2px 8px; background:#fef3c7; color:#92400e; border-radius:4px; font-size:11px; font-weight:600; margin-left:8px;">Provider-Wide</span>'
        : '';

      const modelsList = provider.allowedModels && provider.allowedModels.length > 0
        ? `<div style="margin-top:8px;"><strong style="font-size:12px; color:#6b7280;">Models:</strong> <span style="font-size:13px;">${provider.allowedModels.join(', ')}</span></div>`
        : '';

      const prefixesList = provider.allowedModelPrefixes && provider.allowedModelPrefixes.length > 0
        ? `<div style="margin-top:8px;"><strong style="font-size:12px; color:#6b7280;">Prefixes:</strong> <span style="font-size:13px;">${provider.allowedModelPrefixes.join(', ')}</span></div>`
        : '';

      const tiersList = provider.allowedTiers && provider.allowedTiers.length > 0
        ? `<div style="margin-top:8px;"><strong style="font-size:12px; color:#6b7280;">Tiers:</strong> <span style="font-size:13px;">${provider.allowedTiers.join(', ')}</span></div>`
        : '';

      const sourcesList = provider.sources && provider.sources.length > 0
        ? `<div style="margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb;">
            <strong style="font-size:12px; color:#6b7280;">Purchase Sources (${provider.sources.length}):</strong>
            <div style="margin-top:6px; display:grid; gap:4px; max-height:200px; overflow-y:auto;">
              ${provider.sources.map(src => `
                <div style="padding:6px; background:#f9fafb; border-radius:4px; font-size:11px;">
                  <div><strong>ID:</strong> ${src.purchaseId || '-'}</div>
                  <div><strong>Package:</strong> ${src.packageId || '-'}</div>
                  ${src.entitlementSnapshot ? `<div style="color:#6b7280; margin-top:2px;">Entitlement: ${JSON.stringify(src.entitlementSnapshot)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>`
        : '';

      return `
        <div style="padding:16px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb;">
          <div style="display:flex; align-items:center; margin-bottom:12px;">
            <strong style="font-size:14px; color:#1f2937;">${provider.providerKey}</strong>
            ${providerWideBadge}
            <span style="margin-left:auto; font-size:12px; color:#6b7280;">${provider.purchasesCount} purchase(s)</span>
          </div>
          ${modelsList}
          ${prefixesList}
          ${tiersList}
          ${sourcesList}
        </div>
      `;
    }).join('') : '<div style="padding:12px; color:#6b7280; font-size:13px;">No entitlements found</div>';

    // Show modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;';
    modal.innerHTML = `
      <div style="background:white; border-radius:8px; padding:24px; max-width:800px; width:90%; max-height:80vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h3 style="margin:0; font-size:18px; font-weight:700; color:#1f2937;">Entitlements Debug</h3>
          <button id="apd_entitlements_modal_close" style="background:none; border:none; font-size:24px; color:#6b7280; cursor:pointer; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>
        <div style="margin-bottom:16px; padding:12px; background:#eff6ff; border-radius:6px; border:1px solid #93c5fd;">
          <div style="font-size:12px; color:#1e40af; margin-bottom:4px;"><strong>Company ID:</strong> ${data.companyId}</div>
          <div style="font-size:12px; color:#1e40af;"><strong>Legacy Provider-Wide:</strong> ${data.env?.legacyProviderWide ? '✅ Enabled (default)' : '❌ Disabled (strict mode)'}</div>
        </div>
        <div style="display:grid; gap:12px;">
          ${providersHtml}
        </div>
        <div style="margin-top:20px; text-align:right;">
          <button id="apd_entitlements_modal_close_btn" class="btn btn-secondary" style="padding:8px 16px; font-size:14px;">Kapat</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    el('apd_entitlements_modal_close')?.addEventListener('click', closeModal);
    el('apd_entitlements_modal_close_btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

  } catch (err) {
    logger.error('Entitlements debug failed', err);

    toast.error(err?.message || 'Entitlements debug başarısız');
  }
}

// Teklifbul Rule v3.3 - Load guardrails history
async function loadGuardrailsHistory(companyId) {
  const historyEl = el('apd_guardrails_history');
  if (!historyEl) return;

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/guardrails/logs?companyId=${encodeURIComponent(companyId)}&limit=20`);

    if (!resp.ok) {
      throw new Error('Logs yüklenemedi');
    }

    const data = await resp.json();
    const logs = data.logs || [];

    if (logs.length === 0) {
      historyEl.innerHTML = '<div style="text-align:center; padding:20px; color:#9ca3af;">Guardrails geçmişi bulunamadı</div>';
      return;
    }

    historyEl.innerHTML = logs.map(log => {
      const date = new Date(log.createdAt);
      const dateStr = date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const actionLabels = {
        'force_free_on': 'Free Mode Açıldı',
        'force_free_off': 'Free Mode Kapatıldı',
        'set_daily_cap': 'Günlük Kota Belirlendi',
        'clear_daily_cap': 'Günlük Kota Kaldırıldı',
      };
      const actionLabel = actionLabels[log.action] || log.action;

      const actorDisplay = log.actorEmail || log.actorName || log.actorUid?.substring(0, 8) || 'Bilinmiyor';

      // Before -> After summary
      let changeSummary = '';
      if (log.action === 'force_free_on' || log.action === 'force_free_off') {
        changeSummary = `Free Mode: ${log.before.forcedFreeMode ? 'Açık' : 'Kapalı'} → ${log.after.forcedFreeMode ? 'Açık' : 'Kapalı'}`;
      } else if (log.action === 'set_daily_cap') {
        const beforeCap = log.before.dailyPaidTokenCap !== null ? formatNumber(log.before.dailyPaidTokenCap) : 'Yok';
        const afterCap = log.after.dailyPaidTokenCap !== null ? formatNumber(log.after.dailyPaidTokenCap) : 'Yok';
        changeSummary = `Günlük Kota: ${beforeCap} → ${afterCap} token`;
      } else if (log.action === 'clear_daily_cap') {
        const beforeCap = log.before.dailyPaidTokenCap !== null ? formatNumber(log.before.dailyPaidTokenCap) : 'Yok';
        changeSummary = `Günlük Kota: ${beforeCap} → Yok`;
      }

      return `
        <div style="padding:12px; border-bottom:1px solid #e5e7eb; ${logs.indexOf(log) === logs.length - 1 ? 'border-bottom:none;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <div style="flex:1; min-width:200px;">
              <div style="font-weight:600; color:#1f2937; margin-bottom:4px; font-size:14px;">
                ${actionLabel}
              </div>
              <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">
                ${changeSummary}
              </div>
              ${log.reason ? `<div style="font-size:11px; color:#9ca3af; font-style:italic; margin-top:4px;">Sebep: ${log.reason}</div>` : ''}
            </div>
            <div style="text-align:right; min-width:150px;">
              <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">
                ${dateStr}
              </div>
              <div style="font-size:11px; color:#9ca3af;">
                ${actorDisplay}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    logger.error('Failed to load guardrails history', err);
    historyEl.innerHTML = '<div style="text-align:center; padding:20px; color:#dc2626;">Geçmiş yüklenirken hata oluştu</div>';
  }
}

// Teklifbul Rule v3.11 - Load AI controls
async function loadAiControls(companyId) {
  const controlsEl = el('apd_ai_emergency_controls');
  if (!controlsEl) return;

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');

    // Load global controls
    const globalResp = await authFetch('/api/admin/ai-controls');
    if (!globalResp.ok) {
      throw new Error('Global controls yüklenemedi');
    }
    const globalData = await globalResp.json();
    const global = globalData.global || {};

    // Load company controls
    const companyResp = await authFetch(`/api/admin/ai-controls/company?companyId=${encodeURIComponent(companyId)}`);
    if (!companyResp.ok) {
      throw new Error('Company controls yüklenemedi');
    }
    const companyData = await companyResp.json();

    // Update UI
    el('apd_global_ai_disabled').textContent = global.globalAiDisabled ? 'ON' : 'OFF';
    el('apd_global_ai_disabled').style.color = global.globalAiDisabled ? '#dc2626' : '#059669';

    el('apd_panic_mode').textContent = global.panicMode ? 'ON' : 'OFF';
    el('apd_panic_mode').style.color = global.panicMode ? '#dc2626' : '#059669';

    const globalReasonEl = el('apd_global_reason');
    if (globalReasonEl) {
      if (global.globalAiDisabledReason || global.panicModeReason) {
        globalReasonEl.textContent = `Sebep: ${global.globalAiDisabledReason || global.panicModeReason || '-'}`;
        globalReasonEl.style.display = 'block';
      } else {
        globalReasonEl.style.display = 'none';
      }
    }

    el('apd_company_ai_disabled').textContent = companyData.companyAiDisabled ? 'ON' : 'OFF';
    el('apd_company_ai_disabled').style.color = companyData.companyAiDisabled ? '#dc2626' : '#059669';

    const companyReasonEl = el('apd_company_reason');
    if (companyReasonEl) {
      if (companyData.companyAiDisabledReason) {
        companyReasonEl.textContent = `Sebep: ${companyData.companyAiDisabledReason}`;
        companyReasonEl.style.display = 'block';
      } else {
        companyReasonEl.style.display = 'none';
      }
    }

    // Show controls section
    controlsEl.style.display = 'block';
  } catch (err) {
    logger.error('Failed to load AI controls', err);
    controlsEl.style.display = 'none';
  }
}

// Teklifbul Rule v3.11 - Handle toggle company AI
async function handleToggleCompanyAi(companyId) {
  const confirmed = confirm('Bu firmada AI\'ı kapatmak/ açmak istediğinizden emin misiniz?');
  if (!confirmed) return;

  const reasonInput = prompt('Sebep (opsiyonel):');
  const reason = reasonInput || 'admin';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');

    // Get current state
    const resp = await authFetch(`/api/admin/ai-controls/company?companyId=${encodeURIComponent(companyId)}`);
    if (!resp.ok) {
      throw new Error('Company controls yüklenemedi');
    }
    const data = await resp.json();
    const newState = !data.companyAiDisabled;

    // Toggle
    const toggleResp = await authFetch('/api/admin/ai-controls/company', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        companyAiDisabled: newState,
        reason,
      }),
    });

    if (!toggleResp.ok) {
      const errorData = await toggleResp.json().catch(() => ({}));
      throw new Error(errorData?.message || errorData?.error || 'İşlem başarısız');
    }

    toast.success(`Firma AI ${newState ? 'kapatıldı' : 'açıldı'}`);

    // Reload controls
    await loadAiControls(companyId);
  } catch (err) {
    logger.error('Toggle company AI failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  }
}

// Teklifbul Rule v3.11 - Handle toggle global AI
async function handleToggleGlobalAi() {
  const confirmed = confirm('Global AI\'ı kapatmak/ açmak istediğinizden emin misiniz? Bu işlem TÜM firmaları etkiler!');
  if (!confirmed) return;

  const reasonInput = prompt('Sebep (opsiyonel):');
  const reason = reasonInput || 'admin';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');

    // Get current state
    const resp = await authFetch('/api/admin/ai-controls');
    if (!resp.ok) {
      throw new Error('Global controls yüklenemedi');
    }
    const data = await resp.json();
    const newState = !data.global.globalAiDisabled;

    // Toggle
    const toggleResp = await authFetch('/api/admin/ai-controls/set-global', {
      method: 'POST',
      body: JSON.stringify({
        globalAiDisabled: newState,
        reason,
      }),
    });

    if (!toggleResp.ok) {
      const errorData = await toggleResp.json().catch(() => ({}));
      throw new Error(errorData?.message || errorData?.error || 'İşlem başarısız');
    }

    toast.success(`Global AI ${newState ? 'kapatıldı' : 'açıldı'}`);

    // Reload controls (need companyId from URL)
    const params = getUrlParams();
    const companyId = params.companyId;
    if (companyId) {
      await loadAiControls(companyId);
    }
  } catch (err) {
    logger.error('Toggle global AI failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  }
}

// Teklifbul Rule v3.11 - Handle toggle panic mode
async function handleTogglePanic() {
  const confirmed = confirm('PANIC MODE\'u açmak/ kapatmak istediğinizden emin misiniz? Bu işlem TÜM firmaları etkiler ve en yüksek önceliğe sahiptir!');
  if (!confirmed) return;

  const reasonInput = prompt('Sebep (opsiyonel):');
  const reason = reasonInput || 'admin';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');

    // Get current state
    const resp = await authFetch('/api/admin/ai-controls');
    if (!resp.ok) {
      throw new Error('Global controls yüklenemedi');
    }
    const data = await resp.json();
    const newState = !data.global.panicMode;

    // Toggle
    const toggleResp = await authFetch('/api/admin/ai-controls/set-panic', {
      method: 'POST',
      body: JSON.stringify({
        panicMode: newState,
        reason,
      }),
    });

    if (!toggleResp.ok) {
      const errorData = await toggleResp.json().catch(() => ({}));
      throw new Error(errorData?.message || errorData?.error || 'İşlem başarısız');
    }

    toast.success(`PANIC MODE ${newState ? 'açıldı' : 'kapatıldı'}`);

    // Reload controls (need companyId from URL)
    const params = getUrlParams();
    const companyId = params.companyId;
    if (companyId) {
      await loadAiControls(companyId);
    }
  } catch (err) {
    logger.error('Toggle panic mode failed', err);
    toast.error(err?.message || 'İşlem başarısız');
  }
}

export async function initAdminProfitDetailPage() {
  const root = getRoot();
  if (!root) {
    logger.warn('Admin Profit Detail root element not found');
    return;
  }

  if (initialized) {
    logger.info('Admin Profit Detail page already initialized, reloading data');
    await reload();
    return;
  }

  renderShell();
  initialized = true;
  await reload();
}

