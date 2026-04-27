/**
 * Admin AI Catalog Management Page
 * Teklifbul Rule v1.4 + v1.4.1 (Add/Edit/Toggle)
 */

import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let currentTab = 'models';

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
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });
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

function renderModelsTable(models) {
  const content = el('admin-catalog-tab-content');
  if (!content) return;

  const rows = models.map(m => `
    <tr>
      <td>${m.provider || ''}</td>
      <td>${m.model || ''}</td>
      <td>${m.label || `${m.provider}/${m.model}`}</td>
      <td>${m.freeEligible ? '✅' : '❌'}</td>
      <td>${m.isActive !== false ? '✅' : '❌'}</td>
      <td>${Number(m.costPer1kTokensUSD || 0).toFixed(4)} USD</td>
      <td>${m.sort || 100}</td>
      <td>
        <button type="button" class="btn btn-secondary" data-action="edit-model" data-id="${m.id}" style="padding:6px 12px; font-size:13px; margin-right:6px;">Düzenle</button>
        <button type="button" class="btn ${m.isActive !== false ? 'btn-warning' : 'btn-primary'}" data-action="toggle-model" data-id="${m.id}" data-active="${m.isActive !== false}" style="padding:6px 12px; font-size:13px; margin-right:6px;">${m.isActive !== false ? 'Pasif Yap' : 'Aktif Yap'}</button>
        <button type="button" class="btn btn-danger" data-action="delete-model" data-id="${m.id}" style="padding:6px 12px; font-size:13px;">Sil</button>
      </td>
    </tr>
  `).join('');

  content.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h4 style="margin:0; font-size:16px; font-weight:700;">AI Modelleri</h4>
        <button type="button" class="btn btn-primary" id="btn-add-model" style="padding:8px 16px; font-size:14px;">+ Yeni Model</button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Model</th>
            <th>Label</th>
            <th>Ücretsiz</th>
            <th>Aktif</th>
            <th>Cost/1k (USD)</th>
            <th>Sort</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8" style="text-align:center; padding:20px; color:#6b7280;">Model bulunamadı</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderPackagesTable(packages) {
  const content = el('admin-catalog-tab-content');
  if (!content) return;

  const rows = packages.map(p => {
    const providers = Array.isArray(p.allowedProviders) ? p.allowedProviders.join(', ') : '';
    const models = Array.isArray(p.allowedModels) ? p.allowedModels.join(', ') : (p.allowedModels === null ? 'Tümü' : '');
    return `
      <tr>
        <td>${p.name || ''}</td>
        <td>${Number(p.tokens || 0).toLocaleString('tr-TR')}</td>
        <td>${Number(p.priceTRY || 0).toLocaleString('tr-TR')} ₺</td>
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
      <table class="table">
        <thead>
          <tr>
            <th>Ad</th>
            <th>Token</th>
            <th>Fiyat</th>
            <th>Provider'lar</th>
            <th>Modeller</th>
            <th>Aktif</th>
            <th>Sort</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8" style="text-align:center; padding:20px; color:#6b7280;">Paket bulunamadı</td></tr>'}
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
      </div>
      <div>
        <label for="model-costPer1kTokensUSD">Maliyet / 1k Token (USD)</label>
        <input type="number" id="model-costPer1kTokensUSD" value="${model?.costPer1kTokensUSD || 0}" min="0" step="0.0001" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        <small style="color:#6b7280; font-size:12px;">1000 token başına USD maliyeti (örn: 0.15)</small>
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
          <label for="package-priceTRY" class="required">Fiyat (₺)</label>
          <input type="number" id="package-priceTRY" value="${pkg?.priceTRY || ''}" min="0" step="0.01" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
        </div>
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
  const priceTRY = Number(el('package-priceTRY')?.value || 0);
  const allowedProvidersStr = String(el('package-allowedProviders')?.value || '').trim();
  const allowedModelsStr = String(el('package-allowedModels')?.value || '').trim();
  const sort = Number(el('package-sort')?.value || 100);

  const errors = [];
  if (!name) errors.push('Paket adı gerekli');
  if (!tokens || tokens <= 0) errors.push('Token sayısı 0\'dan büyük olmalı');
  if (priceTRY < 0) errors.push('Fiyat negatif olamaz');

  const allowedProviders = allowedProvidersStr.split(',').map(s => s.trim()).filter(Boolean);
  if (allowedProviders.length === 0) errors.push('En az bir provider gerekli');

  const allowedModels = allowedModelsStr ? allowedModelsStr.split(',').map(s => s.trim()).filter(Boolean) : null;
  if (isNaN(sort)) errors.push('Sort sayı olmalı');

  return { errors, data: { name, tokens, priceTRY, allowedProviders, allowedModels, sort } };
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
    const costInput = el('model-costPer1kTokensUSD');
    const costValue = costInput ? parseFloat(costInput.value) : 0;

    const body = {
      provider: validation.data.provider,
      model: validation.data.model,
      label: validation.data.label || undefined,
      freeEligible: !!el('model-freeEligible')?.checked,
      isActive: !!el('model-isActive')?.checked,
      sort: validation.data.sort,
      costPer1kTokensUSD: isNaN(costValue) || costValue < 0 ? 0 : costValue,
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
      const models = await fetchModels();
      renderModelsTable(models);
    } else if (tabName === 'packages') {
      const packages = await fetchPackages();
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
  if (!confirm('Bu modeli silmek istediğinizden emin misiniz? (Pasif yapılacak)')) return;

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

    toast.success('Model silindi (pasif yapıldı)');
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
