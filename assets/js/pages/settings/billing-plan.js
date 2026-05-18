/**
 * Billing Plan Page (Settings.html)
 * Teklifbul Rule v1.6 - Plan & Usage Page (No-Payment Yet)
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
  return el('billingPlanRoot');
}

function formatNumber(num) {
  return new Intl.NumberFormat('tr-TR').format(num);
}

function renderShell() {
  const root = getRoot();
  if (!root) return;

  // Teklifbul Rule v1.7 - Read reason from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');

  root.innerHTML = `
    <div style="display:grid; gap:20px;">
      <!-- Reason Banner (if reason exists) -->
      ${reason ? `
      <div id="bp_reason_banner" style="padding:20px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:8px;">
        <h4 style="margin:0 0 8px 0; font-size:16px; font-weight:700; color:#92400e;">Bu özellik mevcut planınızda kapalı</h4>
        <p id="bp_reason_text" style="margin:0 0 12px 0; font-size:14px; color:#78350f;">-</p>
        <button id="bp_reason_cta" class="btn btn-primary" style="padding:8px 16px; font-size:13px;" disabled title="Ödeme altyapısı yakında">
          Paketler
        </button>
      </div>
      ` : ''}
      
      <!-- Current Plan Card -->
      <div id="bp_plan_card" style="padding:24px; background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius:12px; color:white;">
        <div style="font-size:14px; opacity:0.9; margin-bottom:8px;">Mevcut Plan</div>
        <div id="bp_plan_name" style="font-size:32px; font-weight:700; margin-bottom:4px;">-</div>
        <div id="bp_plan_id" style="font-size:13px; opacity:0.8;">-</div>
      </div>

      <!-- Features List -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Özellikler</h4>
        <div id="bp_features_list" style="display:grid; gap:12px;">
          <!-- Features will be rendered here -->
        </div>
      </div>

      <!-- AI Policy Card -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">AI Politikası</h4>
        <div id="bp_ai_policy" style="display:grid; gap:12px;">
          <!-- AI Policy will be rendered here -->
        </div>
      </div>

      <!-- Usage Summary (if available) -->
      <div id="bp_usage_summary" style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:none;">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Son 7 Gün Kullanım Özeti</h4>
        <div id="bp_usage_content" style="display:grid; gap:8px; font-size:14px; color:#374151;">
          <!-- Usage summary will be rendered here -->
        </div>
      </div>

      <!-- Plan Comparison Table -->
      <div style="background:white; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#1f2937;">Plan Karşılaştırması</h4>
        <div id="bp_plan_comparison" style="overflow-x:auto;">
          <table class="table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:12px; text-align:left; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Özellik</th>
                <th id="bp_col_free" style="padding:12px; text-align:center; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Ücretsiz</th>
                <th id="bp_col_premium" style="padding:12px; text-align:center; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Premium</th>
                <th id="bp_col_premium_plus" style="padding:12px; text-align:center; border-bottom:2px solid #e5e7eb; font-weight:600; color:#6b7280;">Premium Plus</th>
              </tr>
            </thead>
            <tbody id="bp_comparison_tbody">
              <tr><td colspan="4" style="text-align:center; padding:20px; color:#9ca3af;">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Premium Plus CTA -->
      <div id="bp_cta_section" style="background:#f0f9ff; border-radius:8px; padding:20px; border:2px dashed #3b82f6; display:none;">
        <h4 style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#1e40af;">Premium Plus'a Yükselt</h4>
        <p style="margin:0 0 16px 0; font-size:14px; color:#1e40af; opacity:0.8;">
          Premium Plus ile tüm özelliklere erişin ve token paketleri satın alın.
        </p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button id="bp_cta_upgrade" class="btn btn-primary" style="padding:12px 24px; font-size:14px;" disabled title="Ödeme altyapısı yakında">
            Premium Plus'a Yükselt
          </button>
          <button id="bp_cta_notify" class="btn btn-secondary" style="padding:12px 24px; font-size:14px;">
            Haberdar Et
          </button>
        </div>
      </div>
    </div>

    <!-- Upgrade Lead Modal -->
    <div id="bp_lead_modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:500px; width:90%; max-height:90vh; overflow-y:auto;">
        <h3 style="margin:0 0 16px 0; font-size:18px; font-weight:700; color:#1f2937;">Premium Plus'a Geçiş İsteği</h3>
        <p style="margin:0 0 20px 0; font-size:14px; color:#6b7280;">
          Ödeme altyapısı hazır olduğunda size haber vereceğiz.
        </p>
        <form id="bp_lead_form" style="display:grid; gap:16px;">
          <div>
            <label for="bp_lead_name" style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#374151;">Ad Soyad (Opsiyonel)</label>
            <input type="text" id="bp_lead_name" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; box-sizing:border-box;">
          </div>
          <div>
            <label for="bp_lead_email" class="required" style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#374151;">E-posta</label>
            <input type="email" id="bp_lead_email" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; box-sizing:border-box;">
          </div>
          <div>
            <label for="bp_lead_note" style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#374151;">Not (Opsiyonel)</label>
            <textarea id="bp_lead_note" rows="3" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; box-sizing:border-box; resize:vertical;"></textarea>
          </div>
          <div style="display:flex; gap:12px; justify-content:flex-end;">
            <button type="button" id="bp_lead_cancel" class="btn btn-secondary" style="padding:10px 20px; font-size:14px;">İptal</button>
            <button type="submit" id="bp_lead_submit" class="btn btn-primary" style="padding:10px 20px; font-size:14px;">Gönder</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Modal handlers
  const modal = el('bp_lead_modal');
  const cancelBtn = el('bp_lead_cancel');
  const form = el('bp_lead_form');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleLeadSubmit();
    });
  }

  const notifyBtn = el('bp_cta_notify');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'flex';
        // Teklifbul Rule v1.8 - Auto-fill reason in note if exists
        const urlParams = new URLSearchParams(window.location.search);
        const reason = urlParams.get('reason');
        const noteInput = el('bp_lead_note');
        if (noteInput && reason) {
          const reasonMessages = {
            sales: 'Satışlar modülü için Premium Plus istiyorum.',
            interim_payments: 'Hakediş modülü için Premium Plus istiyorum.',
            ai_paid_models: 'Ücretli AI modelleri için Premium Plus istiyorum.',
            token_packages: 'Token paketleri için Premium Plus istiyorum.',
            menu_customization: 'Üst menü kişiselleştirmesi için Premium istiyorum.',
          };
          noteInput.value = reasonMessages[reason] || `Premium Plus'a geçiş istiyorum. (Sebep: ${reason})`;
        }
        const emailInput = el('bp_lead_email');
        if (emailInput) emailInput.focus();
      }
    });
  }
}

function setLoading(loading) {
  const root = getRoot();
  if (!root) return;
  // Could add spinner overlay if needed
}

async function fetchPlan() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/billing/plan');
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 403) {
      throw new Error('Yetkiniz yok');
    }
    throw new Error(data?.message || data?.error || 'Plan bilgisi yüklenemedi');
  }
  return await resp.json();
}

async function fetchUsageSummary() {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/billing/usage-summary?days=7');
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    logger.warn('Usage summary fetch failed', err);
    return null;
  }
}

function renderPlan(data) {
  // Plan card
  el('bp_plan_name').textContent = data.plan.planName;
  el('bp_plan_id').textContent = `Plan ID: ${data.plan.planId}`;

  // Teklifbul Rule v1.7 - Render reason banner if exists
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  if (reason) {
    const reasonBanner = el('bp_reason_banner');
    const reasonText = el('bp_reason_text');
    if (reasonBanner && reasonText) {
      reasonBanner.style.display = 'block';
      const reasonMessages = {
        sales: 'Satışlar modülü Premium ile açılır.',
        interim_payments: 'Hakediş / Sözleşme modülü Premium Plus ile açılır.',
        ai_paid_models: 'Ücretli AI modelleri Premium Plus + Paket ile açılır.',
        token_packages: 'Token paketleri Premium Plus ile açılır.',
        menu_customization: 'Üst menüyü sıralayıp öğeleri gizleme özelliği Premium pakete dahildir.',
      };
      reasonText.textContent = reasonMessages[reason] || 'Bu özellik mevcut planınızda kapalı.';
    }
  } else {
    const reasonBanner = el('bp_reason_banner');
    if (reasonBanner) {
      reasonBanner.style.display = 'none';
    }
  }

  // Features list
  const featuresList = el('bp_features_list');
  if (featuresList) {
    const features = [
      { key: 'aiFreeModels', label: 'Ücretsiz AI Modelleri', icon: '✓' },
      { key: 'aiPaidModels', label: 'Ücretli AI Modelleri', icon: '✓' },
      { key: 'tokenPackages', label: 'Token Paketleri', icon: '✓' },
      { key: 'salesModule', label: 'Satışlar Modülü', icon: '✓' },
      { key: 'interimPaymentsModule', label: 'Hakediş Modülü', icon: '✓' },
    ];

    featuresList.innerHTML = features.map(f => {
      const enabled = data.features[f.key] === true;
      return `
        <div style="display:flex; align-items:center; gap:12px; padding:8px; background:${enabled ? '#f0fdf4' : '#fef2f2'}; border-radius:6px;">
          <span style="font-size:18px; color:${enabled ? '#059669' : '#dc2626'};">${enabled ? '✓' : '✗'}</span>
          <span style="font-size:14px; color:#374151; font-weight:${enabled ? '600' : '400'};">${f.label}</span>
        </div>
      `;
    }).join('');
  }

  // AI Policy
  const aiPolicy = el('bp_ai_policy');
  if (aiPolicy) {
    const policy = data.aiPolicy;
    aiPolicy.innerHTML = `
      <div style="padding:12px; background:#f9fafb; border-radius:6px;">
        <div style="font-weight:600; color:#374151; margin-bottom:8px;">Minimum Token Eşiği</div>
        <div style="font-size:14px; color:#6b7280;">${formatNumber(policy.minTokens)} token</div>
      </div>
      <div style="padding:12px; background:#f9fafb; border-radius:6px;">
        <div style="font-weight:600; color:#374151; margin-bottom:8px;">Rate Limit (${policy.rateLimits.windowSec} saniye)</div>
        <div style="font-size:14px; color:#6b7280;">
          Ücretsiz: ${formatNumber(policy.rateLimits.freeMax)} istek<br>
          Premium: ${formatNumber(policy.rateLimits.premiumMax)} istek<br>
          Premium Plus: ${formatNumber(policy.rateLimits.premiumPlusMax)} istek<br>
          <strong>Mevcut Planınız: ${formatNumber(policy.currentPlanLimit)} istek</strong>
        </div>
      </div>
      <div style="padding:12px; background:#f0fdf4; border-radius:6px; border-left:4px solid #059669;">
        <div style="font-weight:600; color:#059669; margin-bottom:4px;">✓ Ücretsiz Modeller</div>
        <div style="font-size:13px; color:#047857;">
          freeEligible modeller token harcamaz ve tüm planlarda kullanılabilir.
        </div>
      </div>
      ${policy.forcedFreeMode ? `
      <div style="padding:12px; background:#fef2f2; border-radius:6px; border-left:4px solid #dc2626;">
        <div style="font-weight:600; color:#991b1b; margin-bottom:4px;">⚠️ Zorunlu Ücretsiz Mod</div>
        <div style="font-size:13px; color:#7f1d1d;">
          Bu firmada ücretsiz mod zorunlu. Ücretli modeller devre dışı.
        </div>
      </div>
      ` : ''}
      ${policy.dailyPaidTokenCap !== null && policy.dailyPaidTokenCap !== undefined ? `
      <div style="padding:12px; background:#fff7ed; border-radius:6px; border-left:4px solid #f59e0b;">
        <div style="font-weight:600; color:#92400e; margin-bottom:4px;">📊 Günlük Ücretli Token Kotası</div>
        <div style="font-size:13px; color:#78350f; margin-bottom:6px;">
          Günlük ücretli token kotası: <strong>${formatNumber(policy.dailyPaidTokenCap)} token</strong>
        </div>
        ${policy.todayPaidUsage ? `
        <div style="font-size:12px; color:#78350f;">
          Bugün kullanılan: <strong>${formatNumber(policy.todayPaidUsage.paidUsedTokens || 0)} / ${formatNumber(policy.dailyPaidTokenCap)}</strong>
        </div>
        ` : ''}
      </div>
      ` : ''}
      ${policy.todayPaidUsage && (policy.todayPaidUsage.paidUsedTokens || 0) > 0 && !policy.dailyPaidTokenCap ? `
      <div style="padding:12px; background:#f0f9ff; border-radius:6px; border-left:4px solid #3b82f6;">
        <div style="font-weight:600; color:#1e40af; margin-bottom:4px;">📊 Bugün Kullanılan Paid Token</div>
        <div style="font-size:13px; color:#1e3a8a;">
          <strong>${formatNumber(policy.todayPaidUsage.paidUsedTokens || 0)}</strong>
        </div>
      </div>
      ` : ''}
    `;
  }

  // CTA Section (only show if not Premium Plus)
  const ctaSection = el('bp_cta_section');
  if (ctaSection) {
    if (!data.plan.planId.includes('premium_plus')) {
      ctaSection.style.display = 'block';
    } else {
      ctaSection.style.display = 'none';
    }
  }

  // Teklifbul Rule v1.8 - Render plan comparison table
  renderPlanComparison(data);
}

// Teklifbul Rule v1.8 - Render plan comparison table
function renderPlanComparison(data) {
  const tbody = el('bp_comparison_tbody');
  if (!tbody) return;

  const currentPlanId = data.plan.planId;
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');

  // Highlight current plan columns
  const colFree = el('bp_col_free');
  const colPremium = el('bp_col_premium');
  const colPremiumPlus = el('bp_col_premium_plus');

  if (colFree) colFree.style.background = currentPlanId === 'free' ? '#eff6ff' : '';
  if (colPremium) colPremium.style.background = currentPlanId.includes('premium') && !currentPlanId.includes('premium_plus') ? '#eff6ff' : '';
  if (colPremiumPlus) colPremiumPlus.style.background = currentPlanId.includes('premium_plus') ? '#eff6ff' : '';

  const comparisonRows = [
    { feature: 'AI Ücretsiz Modeller', free: true, premium: true, premiumPlus: true },
    { feature: 'AI Ücretli Modeller', free: false, premium: false, premiumPlus: true },
    { feature: 'Token Paketleri', free: false, premium: false, premiumPlus: true },
    { feature: 'Satışlar Modülü', free: false, premium: true, premiumPlus: true },
    { feature: 'Kişisel üst menü düzeni (sıra + gizle)', free: false, premium: true, premiumPlus: true },
    { feature: 'Hakediş Modülü', free: false, premium: false, premiumPlus: true },
    { feature: 'Rate Limit (req/60s)', free: data.aiPolicy.rateLimits.freeMax, premium: data.aiPolicy.rateLimits.premiumMax, premiumPlus: data.aiPolicy.rateLimits.premiumPlusMax },
  ];

  tbody.innerHTML = comparisonRows.map(row => {
    const isHighlighted = reason && (
      (reason === 'sales' && row.feature === 'Satışlar Modülü') ||
      (reason === 'interim_payments' && row.feature === 'Hakediş Modülü') ||
      (reason === 'ai_paid_models' && row.feature === 'AI Ücretli Modeller') ||
      (reason === 'token_packages' && row.feature === 'Token Paketleri') ||
      (reason === 'menu_customization' && row.feature === 'Kişisel üst menü düzeni (sıra + gizle)')
    );

    const rowStyle = isHighlighted ? 'background:#fef3c7;' : '';

    if (typeof row.free === 'boolean') {
      return `
        <tr style="${rowStyle}">
          <td style="padding:12px; border-bottom:1px solid #e5e7eb; font-weight:600;">${row.feature}</td>
          <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">${row.free ? '✓' : '✗'}</td>
          <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">${row.premium ? '✓' : '✗'}</td>
          <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">${row.premiumPlus ? '✓' : '✗'}</td>
        </tr>
      `;
    } else {
      return `
        <tr style="${rowStyle}">
          <td style="padding:12px; border-bottom:1px solid #e5e7eb; font-weight:600;">${row.feature}</td>
          <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">${formatNumber(row.free)}</td>
          <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">${formatNumber(row.premium)}</td>
          <td style="padding:12px; text-align:center; border-bottom:1px solid #e5e7eb;">${formatNumber(row.premiumPlus)}</td>
        </tr>
      `;
    }
  }).join('');
}

async function handleLeadSubmit() {
  const submitBtn = el('bp_lead_submit');
  const nameInput = el('bp_lead_name');
  const emailInput = el('bp_lead_email');
  const noteInput = el('bp_lead_note');
  const modal = el('bp_lead_modal');

  if (!emailInput || !submitBtn) return;

  const email = emailInput.value.trim();
  if (!email) {
    toast.error('E-posta adresi gereklidir');
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    toast.error('Geçerli bir e-posta adresi giriniz');
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Gönderiliyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/leads/upgrade', {
      method: 'POST',
      body: JSON.stringify({
        contactEmail: email,
        contactName: nameInput?.value.trim() || null,
        note: noteInput?.value.trim() || null,
        reason: reason || null,
        source: 'billing-plan',
      }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || 'Kayıt başarısız');
    }

    toast.success('Kaydettik, ödeme açılınca haber vereceğiz.');

    // Close modal and reset form
    if (modal) modal.style.display = 'none';
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (noteInput) noteInput.value = '';

    logger.info('Upgrade lead submitted', { email, reason });
  } catch (err) {
    logger.error('Failed to submit upgrade lead', err);
    toast.error(err.message || 'Kayıt başarısız');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Gönder';
  }
}

function renderUsageSummary(usageData) {
  if (!usageData) return;

  const usageSection = el('bp_usage_summary');
  const usageContent = el('bp_usage_content');
  if (!usageSection || !usageContent) return;

  const summary = usageData.summary;
  usageContent.innerHTML = `
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e5e7eb;">
      <span style="font-weight:600;">Ödenen Tüketim:</span>
      <span>${formatNumber(summary.totalConsumedTokensPaid)} token</span>
    </div>
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e5e7eb;">
      <span style="font-weight:600;">Ücretsiz Kullanım:</span>
      <span>${formatNumber(summary.totalConsumedTokensFree)} token</span>
    </div>
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e5e7eb;">
      <span style="font-weight:600;">Mevcut Bakiye:</span>
      <span>${formatNumber(usageData.wallet.balanceTokens)} token</span>
    </div>
    ${summary.estimatedDaysRemaining !== null ? `
      <div style="display:flex; justify-content:space-between; padding:8px 0;">
        <span style="font-weight:600;">Tahmini Kalan Gün:</span>
        <span>≈ ${summary.estimatedDaysRemaining} gün</span>
      </div>
    ` : ''}
  `;
  usageSection.style.display = 'block';
}

async function reload() {
  if (isReloading) return;
  isReloading = true;
  setLoading(true);

  try {
    const planData = await fetchPlan();
    renderPlan(planData);

    // Try to load usage summary (optional)
    const usageData = await fetchUsageSummary();
    if (usageData) {
      renderUsageSummary(usageData);
    }

    logger.info('Billing plan page loaded', { planId: planData.plan.planId });
  } catch (err) {
    logger.error('Failed to load billing plan page', err);
    toast.error(err.message || 'Plan bilgisi yüklenemedi');
  } finally {
    isReloading = false;
    setLoading(false);
  }
}

export async function initBillingPlanPage() {
  const root = getRoot();
  if (!root) {
    logger.warn('Billing Plan root element not found');
    return;
  }

  if (initialized) {
    logger.info('Billing Plan page already initialized, reloading data');
    await reload();
    return;
  }

  logger.group('Billing Plan Page Init');
  initialized = true;

  renderShell();
  await reload();

  logger.end();
}

