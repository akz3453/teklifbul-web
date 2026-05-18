/**
 * Admin AI Catalog Management Page
 * Teklifbul Rule v1.4 + v1.4.1 (Add/Edit/Toggle)
 */

import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let currentTab = 'models';
let pricingConfigCache = null;
let priceWatchCache = null;
let modelsCache = [];

function el(id) {
  return document.getElementById(id);
}

function getRoot() {
  return el('adminAiCatalogRoot');
}

function renderShell() {
  const root = getRoot();
  if (!root) return;

  root.innerHTML = `
    <style>
      #admin-catalog-tab-content .admin-catalog-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
        font-size: 12px;
      }
      #admin-catalog-tab-content .admin-catalog-table th,
      #admin-catalog-tab-content .admin-catalog-table td {
        border: 1px solid #e5e7eb;
        padding: 8px 10px;
        text-align: left;
        vertical-align: middle;
        white-space: nowrap;
      }
      #admin-catalog-tab-content .admin-catalog-table th {
        background: #f8fafc;
        font-weight: 700;
      }
    </style>
    <div style="display:grid; gap:20px;">
      <!-- Tabs -->
      <div style="display:flex; gap:8px; border-bottom:2px solid #e5e7eb;">
        <button type="button" class="admin-catalog-tab active" data-tab="models" style="padding:10px 16px; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; font-weight:600; color:#6b7280; transition:all 0.2s;">
          AI Modelleri
        </button>
        <button type="button" class="admin-catalog-tab" data-tab="packages" style="padding:10px 16px; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; font-weight:600; color:#6b7280; transition:all 0.2s;">
          Token Paketleri
        </button>
        <button type="button" class="admin-catalog-tab" data-tab="upgrade-leads" style="padding:10px 16px; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; font-weight:600; color:#6b7280; transition:all 0.2s;">
          Upgrade Leads
        </button>
      </div>

      <!-- Tab Content -->
      <div id="admin-catalog-tab-content"></div>
    </div>

    <!-- Modal Container -->
    <div id="admin-catalog-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
      <div id="admin-catalog-modal-content" style="background:white; border-radius:12px; padding:24px; max-width:600px; width:90vw; max-height:90vh; overflow-y:auto;">
        <div id="admin-catalog-modal-body"></div>
      </div>
    </div>
  `;
}

function setTabActive(tabName) {
  currentTab = tabName;
  const tabs = document.querySelectorAll('.admin-catalog-tab');
  tabs.forEach(tab => {
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
      tab.style.borderBottomColor = '#3b82f6';
      tab.style.color = '#1e40af';
    } else {
      tab.classList.remove('active');
      tab.style.borderBottomColor = 'transparent';
      tab.style.color = '#6b7280';
    }
  });
}

function showModal(title, bodyHtml) {
  const modal = el('admin-catalog-modal');
  const modalBody = el('admin-catalog-modal-body');
  if (!modal || !modalBody) return;

  modalBody.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h3 style="margin:0; font-size:18px; font-weight:700;">${title}</h3>
      <button type="button" id="admin-catalog-modal-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:#6b7280;">&times;</button>
    </div>
    ${bodyHtml}
  `;
  modal.style.display = 'flex';

  // Close button
  el('admin-catalog-modal-close')?.addEventListener('click', hideModal);
}

function hideModal() {
  const modal = el('admin-catalog-modal');
  if (modal) modal.style.display = 'none';
}

async function fetchModels() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/ai-models');
  const data = await resp.json();
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Yetkiniz yok');
    }
    throw new Error(data?.message || data?.error || 'Modeller yüklenemedi');
  }
  return data.models || [];
}

async function fetchModelSuggestions() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/ai-model-suggestions');
  const data = await resp.json();
  if (!resp.ok) {
    // Teklifbul Rule v1.0 - Backward compatibility:
    // Eski API sürümlerinde suggestions endpoint olmayabilir.
    if (resp.status === 404) {
      logger.warn('AI model suggestions endpoint not found, continuing without suggestions');
      return [];
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Yetkiniz yok');
    }
    throw new Error(data?.message || data?.error || 'Model önerileri yüklenemedi');
  }
  return data?.suggestions || [];
}

async function fetchPackages() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/ai-token-packages');
  const data = await resp.json();
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Yetkiniz yok');
    }
    throw new Error(data?.message || data?.error || 'Paketler yüklenemedi');
  }
  return data.packages || [];
}

async function fetchPricingConfig() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/ai-pricing-config');
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message || data?.error || 'Fiyatlandırma ayarları yüklenemedi');
  }
  return data?.config || {
    usdTry: 40,
    storedUsdTry: 40,
    liveUsdTry: null,
    effectiveUsdTry: 40,
    usdTrySource: 'stored',
    marginMultiplier: 2.2,
    minMarginMultiplier: 1.15,
    vatPercent: 20,
    useLiveUsdTry: true
  };
}

async function savePricingConfig(config) {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/ai-pricing-config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message || data?.error || 'Fiyatlandırma ayarları kaydedilemedi');
  }
}

async function fetchPriceWatch() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/ai-price-watch');
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.message || data?.error || 'Fiyat izleme verisi alınamadı');
  }
  return data || { staleReviewCount: 0, missingCostCount: 0, staleModels: [], missingCostModels: [] };
}

// Teklifbul Rule v1.8 - Fetch upgrade leads (admin only)
async function fetchUpgradeLeads() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/admin/upgrade-leads');
  const data = await resp.json();
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Yetkiniz yok');
    }
    throw new Error(data?.message || data?.error || 'Upgrade leads yüklenemedi');
  }
  return data.leads || [];
}

// Teklifbul Rule v1.8 - Render upgrade leads table
function renderUpgradeLeadsTable(leads) {
  const content = el('admin-catalog-tab-content');
  if (!content) return;

  const rows = leads.map(lead => {
    const createdAt = lead.createdAt?.toDate ? new Date(lead.createdAt.toDate()).toLocaleString('tr-TR') :
      (lead.createdAtMs ? new Date(lead.createdAtMs).toLocaleString('tr-TR') : '-');
    return `
      <tr>
        <td>${lead.companyId || '-'}</td>
        <td>${lead.contactEmail || '-'}</td>
        <td>${lead.contactName || '-'}</td>
        <td>${lead.reason || '-'}</td>
        <td>${lead.source || '-'}</td>
        <td>${lead.note || '-'}</td>
        <td>${createdAt}</td>
      </tr>
    `;
  }).join('');

  content.innerHTML = `
    <div>
      <h4 style="margin:0 0 16px 0; font-size:16px; font-weight:700;">Upgrade Leads (Son 50)</h4>
      <table class="table">
        <thead>
          <tr>
            <th>Şirket ID</th>
            <th>E-posta</th>
            <th>Ad Soyad</th>
            <th>Sebep</th>
            <th>Kaynak</th>
            <th>Not</th>
            <th>Oluşturulma</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#6b7280;">Lead bulunamadı</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderModelsTable(models, suggestions = []) {
  const content = el('admin-catalog-tab-content');
  if (!content) return;

  const activeModels = (models || []).filter((m) => m?.isActive !== false);
  const effectiveUsdTry = Number(pricingConfigCache?.effectiveUsdTry || pricingConfigCache?.usdTry || 0);
  const fxSourceLabel = pricingConfigCache?.usdTrySource === 'live' ? 'canlı' : 'kayıtlı';
  const fxInfo = pricingConfigCache
    ? `<span style="font-size:12px; color:#6b7280;">USD/TRY: ${effectiveUsdTry.toFixed(4)} (${fxSourceLabel}) | Kâr: ${pricingConfigCache.marginMultiplier}x (min ${Number(pricingConfigCache.minMarginMultiplier || 1.15).toFixed(2)}x) | KDV: %${pricingConfigCache.vatPercent}</span>`
    : '';
  const staleModels = Array.isArray(priceWatchCache?.staleModels) ? priceWatchCache.staleModels : [];
  const missingCostModels = Array.isArray(priceWatchCache?.missingCostModels) ? priceWatchCache.missingCostModels : [];
  const staleModelRows = staleModels
    .map((m) => `<li>${m.provider}/${m.model}${m.daysSinceReview ? ` (${m.daysSinceReview} gün)` : ''}</li>`)
    .join('');
  const missingModelRows = missingCostModels
    .map((m) => `<li>${m.provider}/${m.model}</li>`)
    .join('');
  const watchBanner = priceWatchCache && (Number(priceWatchCache.staleReviewCount || 0) > 0 || Number(priceWatchCache.missingCostCount || 0) > 0)
    ? `<div style="margin-bottom:12px; padding:10px; border:1px solid #f59e0b; border-radius:8px; background:#fff7ed; color:#92400e; font-size:12px;">
        <div style="font-weight:700; margin-bottom:6px;">
          Fiyat izleme uyarısı: ${Number(priceWatchCache.staleReviewCount || 0)} modelin maliyet incelemesi gecikmiş, ${Number(priceWatchCache.missingCostCount || 0)} modelde input/output maliyeti eksik.
        </div>
        <details style="margin-top:6px;">
          <summary style="cursor:pointer; font-weight:600;">Detaylı model listesi</summary>
          ${staleModels.length > 0
      ? `<div style="margin-top:6px;"><strong>İnceleme geciken modeller:</strong><ul style="margin:4px 0 0 16px;">${staleModelRows}</ul></div>`
      : ''}
          ${missingCostModels.length > 0
      ? `<div style="margin-top:6px;"><strong>Input/Output maliyeti eksik modeller:</strong><ul style="margin:4px 0 0 16px;">${missingModelRows}</ul></div>`
      : ''}
        </details>
      </div>`
    : '';
  const rows = activeModels.map(m => `
    <tr>
      <td>${m.provider || ''}</td>
      <td>${m.model || ''}</td>
      <td>${m.label || `${m.provider}/${m.model}`}</td>
      <td>${m.freeEligible ? '✅' : '❌'}</td>
      <td>${m.isActive !== false ? '✅' : '❌'}</td>
      <td>${Number(m.inputCostPer1MTokensUSD || 0).toFixed(4)} USD</td>
      <td>${Number(m.outputCostPer1MTokensUSD || 0).toFixed(4)} USD</td>
      <td>${m.sort || 100}</td>
      <td>
        <button type="button" class="btn btn-secondary" data-action="edit-model" data-id="${m.id}" style="padding:6px 12px; font-size:13px; margin-right:6px;">Düzenle</button>
        <button type="button" class="btn ${m.isActive !== false ? 'btn-warning' : 'btn-primary'}" data-action="toggle-model" data-id="${m.id}" data-active="${m.isActive !== false}" style="padding:6px 12px; font-size:13px; margin-right:6px;">${m.isActive !== false ? 'Pasif Yap' : 'Aktif Yap'}</button>
        <button type="button" class="btn btn-danger" data-action="delete-model" data-id="${m.id}" style="padding:6px 12px; font-size:13px;">Sil</button>
      </td>
    </tr>
  `).join('');

  const suggestionRows = suggestions.map((s) => `
    <tr>
      <td>${s.provider}</td>
      <td>${s.model}</td>
      <td>${s.label || `${s.provider}/${s.model}`}</td>
      <td>${s.freeEligible ? '✅' : '❌'}</td>
      <td>${s.sort || 100}</td>
      <td>
        <button
          type="button"
          class="btn btn-primary"
          data-action="add-suggested-model"
          data-provider="${s.provider}"
          data-model="${s.model}"
          data-label="${s.label || ''}"
          data-free-eligible="${s.freeEligible ? 'true' : 'false'}"
          data-sort="${s.sort || 100}"
          style="padding:6px 12px; font-size:13px;"
        >Kataloğa Ekle</button>
      </td>
    </tr>
  `).join('');

  content.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h4 style="margin:0; font-size:16px; font-weight:700;">AI Modelleri</h4>
        <button type="button" class="btn btn-primary" id="btn-add-model" style="padding:8px 16px; font-size:14px;">+ Yeni Model</button>
      </div>
      ${watchBanner}
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; background:#f8fafc;">
        <strong style="font-size:13px;">AI Fiyatlama Ayarları</strong>
        ${fxInfo}
        <button type="button" class="btn btn-secondary" id="btn-edit-pricing-config" style="padding:6px 12px; font-size:13px;">Ayarla</button>
      </div>
      <table class="table admin-catalog-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Model</th>
            <th>Label</th>
            <th>Ücretsiz</th>
            <th>Aktif</th>
            <th>Input/1M (USD)</th>
            <th>Output/1M (USD)</th>
            <th>Sort</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" style="text-align:center; padding:20px; color:#6b7280;">Aktif model bulunamadı</td></tr>'}
        </tbody>
      </table>
      <div style="margin-top:16px; padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f8fafc;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
          <strong style="font-size:14px;">Önerilen Güncel Modeller (Son Onay: Admin)</strong>
          <span style="font-size:12px; color:#6b7280;">Yeni model yoksa liste boş görünür</span>
        </div>
        <table class="table admin-catalog-table" style="margin-top:0;">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Model</th>
              <th>Label</th>
              <th>Ücretsiz</th>
              <th>Sort</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${suggestionRows || '<tr><td colspan="6" style="text-align:center; padding:12px; color:#6b7280;">Yeni öneri yok</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function showPricingConfigForm() {
  const cfg = pricingConfigCache || { usdTry: 40, marginMultiplier: 2.2, minMarginMultiplier: 1.15, vatPercent: 20, useLiveUsdTry: true };
  const shownUsdTry = Number(cfg.effectiveUsdTry || cfg.usdTry || 40);
  const storedUsdTry = Number(cfg.storedUsdTry || cfg.usdTry || 40);
  const bodyHtml = `
    <form id="admin-pricing-config-form" style="display:grid; gap:14px;">
      <div>
        <label for="pricing-usdTry">USD/TRY</label>
        <input type="number" id="pricing-usdTry" value="${storedUsdTry}" min="0.0001" step="0.0001" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <small style="color:#6b7280; font-size:12px;">Anlık efektif kur: <strong>${shownUsdTry.toFixed(4)}</strong> ${cfg.useLiveUsdTry !== false ? '(canlı kaynaktan)' : '(kayıtlı değer)'}</small>
      </div>
      <div>
        <label for="pricing-margin">Kâr Katsayısı</label>
        <input type="number" id="pricing-margin" value="${Number(cfg.marginMultiplier || 2.2)}" min="0.01" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <small style="color:#6b7280; font-size:12px;">%20 kâr için <strong>1.20</strong>, %35 kâr için <strong>1.35</strong> girin.</small>
      </div>
      <div>
        <label for="pricing-min-margin">Minimum Kâr Katsayısı (taban)</label>
        <input type="number" id="pricing-min-margin" value="${Number(cfg.minMarginMultiplier || 1.15)}" min="0.01" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <small style="color:#6b7280; font-size:12px;">Sistem bu değerin altına düşmez. Örn: 1.15 = minimum %15 kâr.</small>
      </div>
      <div>
        <label for="pricing-vat">KDV (%)</label>
        <input type="number" id="pricing-vat" value="${Number(cfg.vatPercent ?? 20)}" min="0" max="100" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="pricing-useLiveUsdTry" ${cfg.useLiveUsdTry !== false ? 'checked' : ''}>
        <span>USD/TRY için canlı kur kullan (site kur servisi)</span>
      </label>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button type="button" class="btn btn-secondary" id="pricing-cancel">İptal</button>
        <button type="submit" class="btn btn-primary" id="pricing-save">Kaydet + Yeniden Fiyatla</button>
      </div>
    </form>
  `;
  showModal('AI Fiyatlama Ayarları', bodyHtml);
  const parseLocaleNumber = (rawValue) => {
    const normalized = String(rawValue ?? '').trim().replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const normalizeInputValue = (inputId, decimals = 2) => {
    const input = el(inputId);
    if (!input) return;
    const parsed = parseLocaleNumber(input.value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    input.value = parsed.toFixed(decimals);
  };

  el('pricing-margin')?.addEventListener('blur', () => normalizeInputValue('pricing-margin', 2));
  el('pricing-min-margin')?.addEventListener('blur', () => normalizeInputValue('pricing-min-margin', 2));
  el('pricing-usdTry')?.addEventListener('blur', () => normalizeInputValue('pricing-usdTry', 4));
  el('pricing-vat')?.addEventListener('blur', () => normalizeInputValue('pricing-vat', 2));

  el('pricing-cancel')?.addEventListener('click', hideModal);
  el('admin-pricing-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const nextConfig = {
        usdTry: parseLocaleNumber(el('pricing-usdTry')?.value),
        marginMultiplier: parseLocaleNumber(el('pricing-margin')?.value),
        minMarginMultiplier: parseLocaleNumber(el('pricing-min-margin')?.value),
        vatPercent: parseLocaleNumber(el('pricing-vat')?.value),
        useLiveUsdTry: !!el('pricing-useLiveUsdTry')?.checked,
      };
      await savePricingConfig(nextConfig);
      pricingConfigCache = nextConfig;
      toast.success('Fiyatlama ayarları kaydedildi');
      await syncPackagePricesFromModelCosts();
      hideModal();
      await loadTab('models');
    } catch (err) {
      logger.error('Pricing config save error', err);
      toast.error(err?.message || 'Fiyatlama ayarları kaydedilemedi');
    }
  });
}

function renderPackagesTable(packages) {
  const content = el('admin-catalog-tab-content');
  if (!content) return;

  const getEffectiveCostPer1kUsd = (model) => {
    const inputPer1M = Number(model?.inputCostPer1MTokensUSD || 0);
    const outputPer1M = Number(model?.outputCostPer1MTokensUSD || 0);
    if (inputPer1M > 0 || outputPer1M > 0) {
      return ((inputPer1M * 0.7) + (outputPer1M * 0.3)) / 1000;
    }
    return Number(model?.costPer1kTokensUSD || 0);
  };

  const computePackageFinancials = (pkg) => {
    const usdTry = Number(pricingConfigCache?.effectiveUsdTry || pricingConfigCache?.usdTry || 0);
    const tokens = Number(pkg?.tokens || 0);
    const allowedProviders = Array.isArray(pkg?.allowedProviders)
      ? pkg.allowedProviders.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const allowedModels = Array.isArray(pkg?.allowedModels)
      ? pkg.allowedModels.map((x) => String(x || '').trim()).filter(Boolean)
      : null;

    const candidateCosts = (modelsCache || [])
      .filter((m) => m?.isActive !== false)
      .filter((m) => allowedProviders.length === 0 || allowedProviders.includes(String(m.provider || '').toLowerCase()))
      .filter((m) => !allowedModels || allowedModels.includes(String(m.model || '').trim()))
      .map(getEffectiveCostPer1kUsd)
      .filter((v) => Number.isFinite(v) && v > 0);

    if (!Number.isFinite(usdTry) || usdTry <= 0 || tokens <= 0 || candidateCosts.length === 0) {
      return { costTry: null, profitTry: null };
    }
    const minCostPer1kUsd = Math.min(...candidateCosts);
    const costTry = (tokens / 1000) * minCostPer1kUsd * usdTry;
    const priceTry = Number(pkg?.priceTRY || 0);
    const profitTry = priceTry - costTry;
    return {
      costTry,
      profitTry,
    };
  };

  const rows = packages.map(p => {
    const providers = Array.isArray(p.allowedProviders) ? p.allowedProviders.join(', ') : '';
    const models = Array.isArray(p.allowedModels) ? p.allowedModels.join(', ') : (p.allowedModels === null ? 'Tümü' : '');
    const financials = computePackageFinancials(p);
    const costLabel = financials.costTry === null ? '-' : `${Number(financials.costTry).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
    const profitLabel = financials.profitTry === null ? '-' : `${Number(financials.profitTry).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
    const purchaseCostLabel = `${Number(p.purchaseCostTRY || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
    const suggestedPriceLabel = `${Number(p.suggestedPriceTRY || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
    return `
      <tr>
        <td>${p.name || ''}</td>
        <td>${Number(p.tokens || 0).toLocaleString('tr-TR')}</td>
        <td>${purchaseCostLabel}</td>
        <td>${suggestedPriceLabel}</td>
        <td>${Number(p.priceTRY || 0).toLocaleString('tr-TR')} ₺</td>
        <td>${costLabel}</td>
        <td>${profitLabel}</td>
        <td>${providers}</td>
        <td>${models}</td>
        <td>${p.isActive !== false ? '✅' : '❌'}</td>
        <td>${p.sort || 100}</td>
        <td>
          <button type="button" class="btn btn-secondary" data-action="edit-package" data-id="${p.id}" style="padding:6px 12px; font-size:13px; margin-right:6px;">Düzenle</button>
          <button type="button" class="btn ${p.isActive !== false ? 'btn-warning' : 'btn-primary'}" data-action="toggle-package" data-id="${p.id}" data-active="${p.isActive !== false}" style="padding:6px 12px; font-size:13px; margin-right:6px;">${p.isActive !== false ? 'Pasif Yap' : 'Aktif Yap'}</button>
          <button type="button" class="btn btn-danger" data-action="delete-package" data-id="${p.id}" style="padding:6px 12px; font-size:13px;">Sil</button>
        </td>
      </tr>
    `;
  }).join('');

  content.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h4 style="margin:0; font-size:16px; font-weight:700;">Token Paketleri</h4>
        <button type="button" class="btn btn-primary" id="btn-add-package" style="padding:8px 16px; font-size:14px;">+ Yeni Paket</button>
      </div>
      <table class="table admin-catalog-table">
        <thead>
          <tr>
            <th>Ad</th>
            <th>Token</th>
            <th title="Sizin net alış fiyatınız (KDV hariç)">Alış (KDV Hariç)</th>
            <th title="Önerilen: Alış(KDV hariç) x 1.20 alış KDV x 1.20 kâr x 1.20 satış KDV">Önerilen Satış</th>
            <th title="Müşteriye satılan fiyat (KDV dahil)">Fiyat (Satış, KDV Dahil)</th>
            <th>Tahmini Maliyet</th>
            <th>Tahmini Kâr</th>
            <th>Provider'lar</th>
            <th>Modeller</th>
            <th>Aktif</th>
            <th>Sort</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="12" style="text-align:center; padding:20px; color:#6b7280;">Paket bulunamadı</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function showModelForm(model = null) {
  const isEdit = !!model;
  const title = isEdit ? 'Model Düzenle' : 'Yeni Model Ekle';
  const bodyHtml = `
    <form id="admin-model-form" style="display:grid; gap:16px;">
      <div>
        <label for="model-provider" class="required">Provider</label>
        <input type="text" id="model-provider" value="${model?.provider || ''}" placeholder="openai, gemini, free_local" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <div>
        <label for="model-model" class="required">Model</label>
        <input type="text" id="model-model" value="${model?.model || ''}" placeholder="gpt-4o-mini, gemini-pro, basic" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <div>
        <label for="model-label">Label (Opsiyonel)</label>
        <input type="text" id="model-label" value="${model?.label || ''}" placeholder="OpenAI - gpt-4o-mini" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <div>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="model-freeEligible" ${model?.freeEligible ? 'checked' : ''} style="width:18px; height:18px;">
          <span>Ücretsiz (freeEligible)</span>
        </label>
      </div>
      <div>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="model-isActive" ${model?.isActive !== false ? 'checked' : ''} style="width:18px; height:18px;">
          <span>Aktif</span>
        </label>
      </div>
      <div>
        <label for="model-sort">Sort (Sıralama)</label>
        <input type="number" id="model-sort" value="${model?.sort || 100}" min="0" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <small style="color:#6b7280; font-size:12px;">Küçük sayı üstte görünür. Örn: 5, 10, 20.</small>
      </div>
      <div>
        <label for="model-inputCostPer1MTokensUSD">Input (1M token) USD</label>
        <input type="number" id="model-inputCostPer1MTokensUSD" value="${model?.inputCostPer1MTokensUSD || 0}" min="0" step="0.0001" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <div>
        <label for="model-outputCostPer1MTokensUSD">Output (1M token) USD</label>
        <input type="number" id="model-outputCostPer1MTokensUSD" value="${model?.outputCostPer1MTokensUSD || 0}" min="0" step="0.0001" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <small style="color:#6b7280; font-size:12px;">Resmi model fiyatlarını Input/Output olarak girin. Sistem paket fiyatlarını buna göre yeniden hesaplar.</small>
      </div>
      <div id="model-form-error" style="display:none; padding:12px; background:#fee2e2; border-radius:6px; color:#dc2626; font-size:13px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">
        <button type="button" class="btn btn-secondary" id="model-form-cancel" style="padding:10px 20px;">İptal</button>
        <button type="submit" class="btn btn-primary" id="model-form-submit" style="padding:10px 20px;">${isEdit ? 'Güncelle' : 'Ekle'}</button>
      </div>
    </form>
  `;

  showModal(title, bodyHtml);

  el('model-form-cancel')?.addEventListener('click', hideModal);
  el('admin-model-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveModel(model?.id);
  });
}

function showPackageForm(pkg = null) {
  const isEdit = !!pkg;
  const title = isEdit ? 'Paket Düzenle' : 'Yeni Paket Ekle';
  const providers = Array.isArray(pkg?.allowedProviders) ? pkg.allowedProviders.join(', ') : '';
  const models = Array.isArray(pkg?.allowedModels) ? pkg.allowedModels.join(', ') : '';
  const bodyHtml = `
    <form id="admin-package-form" style="display:grid; gap:16px;">
      <div>
        <label for="package-name" class="required">Paket Adı</label>
        <input type="text" id="package-name" value="${pkg?.name || ''}" placeholder="OpenAI Starter" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <div class="row">
        <div>
          <label for="package-tokens" class="required">Token Sayısı</label>
          <input type="number" id="package-tokens" value="${pkg?.tokens || ''}" min="1" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        </div>
        <div>
          <label for="package-purchaseCostTRY">Alış Fiyatı (₺, KDV Hariç)</label>
          <input type="number" id="package-purchaseCostTRY" value="${pkg?.purchaseCostTRY || 0}" min="0" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        </div>
        <div>
          <label for="package-priceTRY" class="required">Fiyat (₺)</label>
          <input type="number" id="package-priceTRY" value="${pkg?.priceTRY || ''}" min="0" step="0.01" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        </div>
      </div>
      <div id="package-pricing-hint" style="padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; font-size:12px; color:#1e40af;">
        Önerilen satış (KDV dahil): <strong id="package-suggestedPriceTRY">${Number(pkg?.suggestedPriceTRY || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺</strong>
        <div style="margin-top:4px; color:#1e3a8a;">Formül: alış(KDV hariç) x 1.20 (alış KDV) x 1.20 (kâr) x 1.20 (satış KDV)</div>
      </div>
      <div>
        <label for="package-allowedProviders" class="required">Provider'lar (virgülle ayırın)</label>
        <input type="text" id="package-allowedProviders" value="${providers}" placeholder="openai, gemini" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <p class="muted" style="margin-top:6px; font-size:12px;">Örnek: openai, gemini</p>
      </div>
      <div>
        <label for="package-allowedModels">Modeller (virgülle ayırın, boş bırakırsanız tüm modeller açılır)</label>
        <input type="text" id="package-allowedModels" value="${models}" placeholder="gpt-4o-mini, gpt-4" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <p class="muted" style="margin-top:6px; font-size:12px;">Boş bırakırsanız provider'daki tüm modeller açılır</p>
      </div>
      <div>
        <label for="package-planRequired">Plan Gereksinimi</label>
        <input type="text" id="package-planRequired" value="premium_plus" readonly style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; background:#f3f4f6;">
      </div>
      <div>
        <label for="package-sort">Sort (Sıralama)</label>
        <input type="number" id="package-sort" value="${pkg?.sort || 100}" min="0" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
      </div>
      <div>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="package-isActive" ${pkg?.isActive !== false ? 'checked' : ''} style="width:18px; height:18px;">
          <span>Aktif</span>
        </label>
      </div>
      <div id="package-form-error" style="display:none; padding:12px; background:#fee2e2; border-radius:6px; color:#dc2626; font-size:13px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">
        <button type="button" class="btn btn-secondary" id="package-form-cancel" style="padding:10px 20px;">İptal</button>
        <button type="submit" class="btn btn-primary" id="package-form-submit" style="padding:10px 20px;">${isEdit ? 'Güncelle' : 'Ekle'}</button>
      </div>
    </form>
  `;

  showModal(title, bodyHtml);

  const recomputeSuggestedPrice = () => {
    const purchaseCostTRY = Number(el('package-purchaseCostTRY')?.value || 0);
    const suggested = purchaseCostTRY * 1.2 * 1.2 * 1.2;
    const hintEl = el('package-suggestedPriceTRY');
    if (hintEl) {
      hintEl.textContent = `${Number.isFinite(suggested) ? suggested.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '0'} ₺`;
    }
  };
  el('package-purchaseCostTRY')?.addEventListener('input', recomputeSuggestedPrice);
  recomputeSuggestedPrice();

  el('package-form-cancel')?.addEventListener('click', hideModal);
  el('admin-package-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePackage(pkg?.id);
  });
}

function validateModelForm() {
  const provider = String(el('model-provider')?.value || '').trim();
  const model = String(el('model-model')?.value || '').trim();
  const label = String(el('model-label')?.value || '').trim();
  const sort = Number(el('model-sort')?.value || 100);

  const errors = [];
  if (!provider) errors.push('Provider gerekli');
  if (!model) errors.push('Model gerekli');
  if (isNaN(sort)) errors.push('Sort sayı olmalı');

  return { errors, data: { provider, model, label, sort } };
}

function validatePackageForm() {
  const name = String(el('package-name')?.value || '').trim();
  const tokens = Number(el('package-tokens')?.value || 0);
  const purchaseCostTRY = Number(el('package-purchaseCostTRY')?.value || 0);
  const priceTRY = Number(el('package-priceTRY')?.value || 0);
  const allowedProvidersStr = String(el('package-allowedProviders')?.value || '').trim();
  const allowedModelsStr = String(el('package-allowedModels')?.value || '').trim();
  const sort = Number(el('package-sort')?.value || 100);

  const errors = [];
  if (!name) errors.push('Paket adı gerekli');
  if (!tokens || tokens <= 0) errors.push('Token sayısı 0\'dan büyük olmalı');
  if (purchaseCostTRY < 0) errors.push('Alış fiyatı negatif olamaz');
  if (priceTRY < 0) errors.push('Fiyat negatif olamaz');

  const allowedProviders = allowedProvidersStr.split(',').map(s => s.trim()).filter(Boolean);
  if (allowedProviders.length === 0) errors.push('En az bir provider gerekli');

  const allowedModels = allowedModelsStr ? allowedModelsStr.split(',').map(s => s.trim()).filter(Boolean) : null;
  if (isNaN(sort)) errors.push('Sort sayı olmalı');

  return { errors, data: { name, tokens, purchaseCostTRY, priceTRY, allowedProviders, allowedModels, sort } };
}

async function saveModel(id) {
  const errorEl = el('model-form-error');
  const submitBtn = el('model-form-submit');

  try {
    const validation = validateModelForm();
    if (validation.errors.length > 0) {
      if (errorEl) {
        errorEl.textContent = validation.errors.join(', ');
        errorEl.style.display = 'block';
      }
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Kaydediliyor...';
    }

    const { authFetch } = await import('../../utils/api-helpers.js');
    const inputCostPer1MValue = parseFloat(el('model-inputCostPer1MTokensUSD')?.value || '0');
    const outputCostPer1MValue = parseFloat(el('model-outputCostPer1MTokensUSD')?.value || '0');

    const body = {
      provider: validation.data.provider,
      model: validation.data.model,
      label: validation.data.label || undefined,
      freeEligible: !!el('model-freeEligible')?.checked,
      isActive: !!el('model-isActive')?.checked,
      sort: validation.data.sort,
      inputCostPer1MTokensUSD: isNaN(inputCostPer1MValue) || inputCostPer1MValue < 0 ? 0 : inputCostPer1MValue,
      outputCostPer1MTokensUSD: isNaN(outputCostPer1MValue) || outputCostPer1MValue < 0 ? 0 : outputCostPer1MValue,
    };

    const url = id ? `/api/admin/ai-models/${id}` : '/api/admin/ai-models';
    const method = id ? 'PATCH' : 'POST';
    const resp = await authFetch(url, {
      method,
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Yetkiniz yok');
      }
      throw new Error(data?.message || data?.error || 'Kaydetme başarısız');
    }

    toast.success(id ? 'Model güncellendi' : 'Model eklendi');
    await syncPackagePricesFromModelCosts();
    hideModal();
    await loadTab('models');
  } catch (e) {
    logger.error('Model save error', e);
    if (errorEl) {
      errorEl.textContent = e?.message || 'Kaydetme başarısız';
      errorEl.style.display = 'block';
    }
    toast.error(e?.message || 'Kaydetme başarısız');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = id ? 'Güncelle' : 'Ekle';
    }
  }
}

async function syncPackagePricesFromModelCosts() {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    toast.info('Token paket fiyatları maliyete göre güncelleniyor...');
    const cfg = pricingConfigCache || { usdTry: 40, marginMultiplier: 2.2, minMarginMultiplier: 1.15, vatPercent: 20, useLiveUsdTry: true };
    const resp = await authFetch('/api/admin/ai-token-packages/reprice-from-model-costs', {
      method: 'POST',
      body: JSON.stringify({
        usdTry: Number(cfg.usdTry || 0),
        marginMultiplier: Number(cfg.marginMultiplier || 0),
        minMarginMultiplier: Number(cfg.minMarginMultiplier || 0),
        vatPercent: Number(cfg.vatPercent || 0),
        useLiveUsdTry: cfg.useLiveUsdTry !== false,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'Paket fiyat senkronu başarısız');
    }
    toast.success(`Paket fiyatları güncellendi (${Number(data?.updatedCount || 0)} paket)`);
  } catch (e) {
    logger.error('Package repricing sync error', e);
    toast.warn(e?.message || 'Paket fiyat senkronu yapılamadı');
  }
}

async function savePackage(id) {
  const errorEl = el('package-form-error');
  const submitBtn = el('package-form-submit');

  try {
    const validation = validatePackageForm();
    if (validation.errors.length > 0) {
      if (errorEl) {
        errorEl.textContent = validation.errors.join(', ');
        errorEl.style.display = 'block';
      }
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Kaydediliyor...';
    }

    const { authFetch } = await import('../../utils/api-helpers.js');
    const body = {
      name: validation.data.name,
      tokens: validation.data.tokens,
      purchaseCostTRY: validation.data.purchaseCostTRY,
      priceTRY: validation.data.priceTRY,
      planRequired: 'premium_plus',
      isActive: !!el('package-isActive')?.checked,
      sort: validation.data.sort,
      allowedProviders: validation.data.allowedProviders,
      allowedModels: validation.data.allowedModels,
    };

    const url = id ? `/api/admin/ai-token-packages/${id}` : '/api/admin/ai-token-packages';
    const method = id ? 'PATCH' : 'POST';
    const resp = await authFetch(url, {
      method,
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Yetkiniz yok');
      }
      throw new Error(data?.message || data?.error || 'Kaydetme başarısız');
    }

    toast.success(id ? 'Paket güncellendi' : 'Paket eklendi');
    hideModal();
    await loadTab('packages');
  } catch (e) {
    logger.error('Package save error', e);
    if (errorEl) {
      errorEl.textContent = e?.message || 'Kaydetme başarısız';
      errorEl.style.display = 'block';
    }
    toast.error(e?.message || 'Kaydetme başarısız');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = id ? 'Güncelle' : 'Ekle';
    }
  }
}

async function toggleModelActive(id, currentActive) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/ai-models/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !currentActive }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Yetkiniz yok');
      }
      throw new Error(data?.message || data?.error || 'Güncelleme başarısız');
    }

    toast.success(currentActive ? 'Model pasif yapıldı' : 'Model aktif yapıldı');
    await loadTab('models');
  } catch (e) {
    logger.error('Model toggle error', e);
    toast.error(e?.message || 'Güncelleme başarısız');
  }
}

async function addSuggestedModelFromAction(actionEl) {
  const provider = String(actionEl?.getAttribute('data-provider') || '').trim();
  const model = String(actionEl?.getAttribute('data-model') || '').trim();
  const label = String(actionEl?.getAttribute('data-label') || '').trim();
  const freeEligible = actionEl?.getAttribute('data-free-eligible') === 'true';
  const sort = Number(actionEl?.getAttribute('data-sort') || 100) || 100;

  if (!provider || !model) {
    toast.error('Öneri verisi eksik');
    return;
  }

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/admin/ai-models', {
      method: 'POST',
      body: JSON.stringify({
        provider,
        model,
        label: label || `${provider}/${model}`,
        freeEligible,
        isActive: true,
        sort,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'Öneri modeli eklenemedi');
    }
    toast.success('Öneri modeli kataloğa eklendi');
    await loadTab('models');
  } catch (e) {
    logger.error('Suggested model add error', e);
    toast.error(e?.message || 'Öneri modeli eklenemedi');
  }
}

async function togglePackageActive(id, currentActive) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/ai-token-packages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !currentActive }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Yetkiniz yok');
      }
      throw new Error(data?.message || data?.error || 'Güncelleme başarısız');
    }

    toast.success(currentActive ? 'Paket pasif yapıldı' : 'Paket aktif yapıldı');
    await loadTab('packages');
  } catch (e) {
    logger.error('Package toggle error', e);
    toast.error(e?.message || 'Güncelleme başarısız');
  }
}

async function loadTab(tabName) {
  const content = el('admin-catalog-tab-content');
  if (!content) return;

  content.innerHTML = '<div style="padding:20px; text-align:center; color:#6b7280;">Yükleniyor...</div>';

  try {
    if (tabName === 'models') {
      const [models, suggestions, pricingConfig, priceWatch] = await Promise.all([
        fetchModels(),
        fetchModelSuggestions(),
        fetchPricingConfig(),
        fetchPriceWatch(),
      ]);
      modelsCache = models || [];
      pricingConfigCache = pricingConfig;
      priceWatchCache = priceWatch;
      renderModelsTable(models, suggestions);
    } else if (tabName === 'packages') {
      const [packages, models, pricingConfig] = await Promise.all([
        fetchPackages(),
        fetchModels(),
        fetchPricingConfig(),
      ]);
      modelsCache = models || [];
      pricingConfigCache = pricingConfig;
      renderPackagesTable(packages);
    } else if (tabName === 'upgrade-leads') {
      const leads = await fetchUpgradeLeads();
      renderUpgradeLeadsTable(leads);
    }
  } catch (e) {
    logger.error('Admin AI catalog tab load error', e);
    toast.error(e?.message || 'Yükleme başarısız');
    // Teklifbul Rule v1.0 - XSS koruma: e.message kontrol edilemez
    content.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'padding:20px; color:#dc2626;';
    errDiv.textContent = `Hata: ${e?.message || 'Yükleme başarısız'}`;
    content.appendChild(errDiv);
  }
}

async function deleteModel(id) {
  if (!confirm('Bu modeli silmek istediğinizden emin misiniz?')) return;

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/ai-models/${id}`, { method: 'DELETE' });
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Yetkiniz yok');
      }
      throw new Error(data?.message || data?.error || 'Silme başarısız');
    }

    toast.success('Model silindi');
    await loadTab('models');
  } catch (e) {
    logger.error('Model delete error', e);
    toast.error(e?.message || 'Silme başarısız');
  }
}

async function deletePackage(id) {
  if (!confirm('Bu paketi silmek istediğinizden emin misiniz? (Pasif yapılacak)')) return;

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch(`/api/admin/ai-token-packages/${id}`, { method: 'DELETE' });
    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Yetkiniz yok');
      }
      throw new Error(data?.message || data?.error || 'Silme başarısız');
    }

    toast.success('Paket silindi (pasif yapıldı)');
    await loadTab('packages');
  } catch (e) {
    logger.error('Package delete error', e);
    toast.error(e?.message || 'Silme başarısız');
  }
}

async function editModel(id) {
  try {
    const models = await fetchModels();
    const model = models.find(m => m.id === id);
    if (!model) {
      toast.error('Model bulunamadı');
      return;
    }
    showModelForm(model);
  } catch (e) {
    logger.error('Edit model load error', e);
    toast.error(e?.message || 'Model yüklenemedi');
  }
}

async function editPackage(id) {
  try {
    const packages = await fetchPackages();
    const pkg = packages.find(p => p.id === id);
    if (!pkg) {
      toast.error('Paket bulunamadı');
      return;
    }
    showPackageForm(pkg);
  } catch (e) {
    logger.error('Edit package load error', e);
    toast.error(e?.message || 'Paket yüklenemedi');
  }
}

function bindHandlersOnce() {
  const root = getRoot();
  if (!root) return;

  // Tab switching
  root.addEventListener('click', async (e) => {
    const tab = e.target.closest('.admin-catalog-tab');
    if (tab) {
      const tabName = tab.getAttribute('data-tab');
      if (tabName) {
        setTabActive(tabName);
        await loadTab(tabName);
      }
      return;
    }

    // Add buttons
    if (e.target.id === 'btn-add-model') {
      showModelForm();
      return;
    }

    if (e.target.id === 'btn-edit-pricing-config') {
      showPricingConfigForm();
      return;
    }

    if (e.target.id === 'btn-add-package') {
      showPackageForm();
      return;
    }

    // Actions
    const action = e.target.closest('[data-action]');
    if (action) {
      const actionType = action.getAttribute('data-action');
      const id = action.getAttribute('data-id');

      if (actionType === 'edit-model') {
        await editModel(id);
      } else if (actionType === 'toggle-model') {
        const currentActive = action.getAttribute('data-active') === 'true';
        await toggleModelActive(id, currentActive);
      } else if (actionType === 'delete-model') {
        await deleteModel(id);
      } else if (actionType === 'add-suggested-model') {
        await addSuggestedModelFromAction(action);
      } else if (actionType === 'edit-package') {
        await editPackage(id);
      } else if (actionType === 'toggle-package') {
        const currentActive = action.getAttribute('data-active') === 'true';
        await togglePackageActive(id, currentActive);
      } else if (actionType === 'delete-package') {
        await deletePackage(id);
      }
    }
  });
}

function ensureInit() {
  if (initialized) return;
  renderShell();
  bindHandlersOnce();
  initialized = true;
}

export async function loadAdminAiCatalogPage() {
  ensureInit();
  setTabActive('models');
  await loadTab('models');
}
