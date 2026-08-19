/**
 * Purchase Assistant Settings Page (Settings.html)
 * Teklifbul Rule v1.0
 *
 * Init guard: UI/handlers are attached once; subsequent visits only reload data.
 */

import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let isReloading = false;
let lastFetchedData = null; // Teklifbul Rule v1.0 - Cache last fetched data to avoid UI resets

function el(id) {
  return document.getElementById(id);
}

function getRoot() {
  return el('purchaseAssistantSettingsRoot');
}

function renderShell() {
  const root = getRoot();
  if (!root) return;

  root.innerHTML = `
    <div style="display:grid; gap:16px;">
      <!-- Teklifbul Rule v2.8 - Guardrails Visibility Banner -->
      <div id="pa_guardrails_banner" style="display:none;">
        <!-- Banners will be dynamically inserted here -->
      </div>

      <div id="pa_card_active" style="padding:20px; background:#f9fafb; border-radius:8px; border:1px solid #e5e7eb;">
        <h4 style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#1f2937;">Aktif Yapay Zeka Asistanı</h4>
        <p class="muted" style="margin:0 0 14px 0; font-size:12px;">Değişiklikler yeni mesajlardan itibaren geçerli olur.</p>
        <div class="row">
          <div>
            <label for="pa_provider" class="required" title="Önce asistan ailesini seçin">1) Asistan Sağlayıcısı</label>
            <select id="pa_provider">
              <option value="">Seçiniz</option>
            </select>
            <p id="pa_provider_helper" class="muted" style="margin:6px 0 0; font-size:11px;">Önce sağlayıcıyı seçin, sonra model listesi otomatik gelir.</p>
          </div>
          <div>
            <label for="pa_model" class="required" title="Seçilen sağlayıcıya ait model listesi">2) Model</label>
            <select id="pa_model">
              <option value="">Seçiniz</option>
            </select>
            <p id="pa_model_helper" class="muted" style="margin:6px 0 0; font-size:11px;">Modeli seçip kaydettiğinizde yeni konuşmalarda aktif olur.</p>
          </div>
        </div>

        <div class="row">
          <div class="full">
            <label>Profil</label>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
                <input type="radio" name="pa_profile" value="fast"> Hızlı
              </label>
              <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
                <input type="radio" name="pa_profile" value="balanced" checked> Dengeli
              </label>
              <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
                <input type="radio" name="pa_profile" value="quality"> Kalite
              </label>
            </div>
            <p class="muted" style="margin-top:8px; font-size:12px;">Hızlı: en hızlı yanıt, Dengeli: önerilen, Kalite: daha detaylı yanıt.</p>
          </div>
        </div>

        <div class="row">
          <div class="full">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="pa_dictionaryLearning" style="width:18px; height:18px;">
              <span style="font-weight:600; color:#1f2937;">Sözlük öğrenme (önerilen)</span>
            </label>
            <p class="muted" style="margin-top:8px; font-size:12px;">Ürün/kalem adlarını daha iyi anlaması için şirket sözlüğünden öğrenme.</p>
          </div>
        </div>

        <div class="row">
          <div class="full">
            <label for="pa_customInstructions">Özel Talimatlar / Kurallar (Opsiyonel)</label>
            <textarea id="pa_customInstructions" rows="4" style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:6px; font-size:13px; resize:vertical;" placeholder="Örn: Daima kibar bir üslup kullan. Teklifleri kıyaslarken teslim süresini fiyattan daha öncelikli tut. Cevaplarını 3 cümleyi geçmeyecek şekilde kısa tut."></textarea>
            <p class="muted" style="margin-top:8px; font-size:12px;">Asistanın davranışlarını, üslubunu veya firmaya özel kurallarını buradan belirleyebilirsiniz.</p>
          </div>
        </div>

        <!-- Teklifbul Rule v3.5.0 - Model Status Line -->
        <div id="pa_model_status" style="margin-top:12px; padding:10px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb; font-size:12px; color:#374151; display:none;">
          <span id="pa_model_status_text">—</span>
        </div>
        <!-- Teklifbul Rule v3.9 - Auto-resolve warning -->
        <div id="pa_model_resolve_warning" style="margin-top:8px; padding:10px; background:#eff6ff; border-radius:6px; border:1px solid #93c5fd; font-size:12px; color:#1e40af; display:none;">
          <span id="pa_model_resolve_warning_text">—</span>
        </div>
        <!-- Teklifbul Rule v3.13 + v3.15 - Entitlement warning -->
        <div id="pa_model_entitlement_warning" style="margin-top:8px; padding:10px; background:#fef3c7; border-radius:6px; border:1px solid #fbbf24; font-size:12px; color:#92400e; display:none;">
          <div style="display:flex; align-items:flex-start; gap:8px;">
            <span style="font-size:16px;">⚠️</span>
            <div style="flex:1;">
              <div id="pa_model_entitlement_warning_text" style="font-weight:600; margin-bottom:4px;">—</div>
              <div style="font-size:11px; color:#78350f; margin-top:4px;">
                Paketiniz bazı modelleri kısıtlayabilir. <a href="#pa_packages_list" style="color:#92400e; text-decoration:underline; font-weight:600;">Paket Yükselt</a>
              </div>
            </div>
          </div>
        </div>
        <!-- Teklifbul Rule v3.15 - Provider funds warning -->
        <div id="pa_model_funds_warning" style="margin-top:8px; padding:10px; background:#dbeafe; border-radius:6px; border:1px solid #60a5fa; font-size:12px; color:#1e40af; display:none;">
          <div style="display:flex; align-items:flex-start; gap:8px;">
            <span style="font-size:16px;">💳</span>
            <div style="flex:1;">
              <div id="pa_model_funds_warning_text" style="font-weight:600; margin-bottom:4px;">—</div>
              <div style="font-size:11px; color:#1e3a8a; margin-top:4px;">
                <button id="pa_btn_view_provider_packages" type="button" class="btn btn-primary" style="padding:4px 12px; font-size:11px; margin-top:4px;">
                  İlgili Provider Paketlerini Gör
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:16px;">
          <div>
            <!-- Teklifbul Rule v3.5.2 - Restore Paid Button -->
            <button type="button" id="pa_btn_restore_paid" class="btn btn-secondary" style="display:none; padding:8px 16px; font-size:13px;">
              Ücretliye Dön
            </button>
            <span id="pa_restore_paid_hint" style="display:none; margin-left:8px; font-size:11px; color:#6b7280;">
              Satın aldığınız paketle açılan ücretli modellere geri döner.
            </span>
          </div>
          <button type="button" id="pa_btn_save" class="btn btn-primary">💾 Kaydet</button>
        </div>
        <!-- Teklifbul Rule v1.3 - Active model source info -->
        <div id="pa_model_source" style="margin-top:12px; padding:10px; background:#f0f9ff; border-radius:6px; border:1px solid #bae6fd; font-size:12px; color:#0c4a6e;">
          <span id="pa_model_source_text">—</span>
        </div>
        <div id="pa_model_access_hints" style="display:none; margin-top:12px; padding:12px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; font-size:12px; color:#334155;">
          <div id="pa_model_access_hints_summary" style="font-weight:700; color:#1e293b;">—</div>
          <div id="pa_model_access_hints_text" style="margin-top:6px; color:#475569;">—</div>
          <div id="pa_model_access_hints_list" style="margin-top:8px;"></div>
          <div style="margin-top:10px;">
            <button type="button" id="pa_btn_open_billing_for_models" class="btn btn-secondary" style="padding:6px 12px; font-size:12px;">
              Paketleri Gör / Yükselt
            </button>
          </div>
        </div>
      </div>

      <div id="pa_card_tokens" style="padding:20px; background:#f9fafb; border-radius:8px; border:1px solid #e5e7eb;">
        <h4 style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#1f2937;">Token Durumu</h4>
        <!-- Teklifbul Rule v3.12 - Provider-specific wallets -->
        <div id="pa_provider_wallets" style="display:none; margin-bottom:12px; padding:12px; background:white; border-radius:6px; border:1px solid #e5e7eb;">
          <div style="font-size:13px; font-weight:600; color:#6b7280; margin-bottom:8px;">Provider Bazlı Bakiye</div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:8px; font-size:12px;">
            <div>
              <div style="color:#6b7280;">OpenAI:</div>
              <div style="font-weight:700; color:#1f2937;" id="pa_wallet_openai">0</div>
            </div>
            <div>
              <div style="color:#6b7280;">Gemini:</div>
              <div style="font-weight:700; color:#1f2937;" id="pa_wallet_gemini">0</div>
            </div>
          </div>
        </div>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div style="font-size:28px; font-weight:800; color:#1f2937;" id="pa_balanceTokens">—</div>
          <div class="muted" style="font-size:13px;">Toplam kalan token</div>
        </div>
        <!-- Teklifbul Rule v3.7 - Post-Purchase Restore Banner -->
        <div id="pa_post_purchase_banner" style="display:none; margin-top:16px; padding:16px; background:#f0f9ff; border-radius:8px; border:1px solid #bfdbfe;">
          <div style="font-weight:700; color:#1e40af; margin-bottom:8px; font-size:14px;">
            Token paketi alındı. Ücretli modele geçmek ister misiniz?
          </div>
          <div id="pa_post_purchase_suggested" style="font-size:12px; color:#3b82f6; margin-bottom:12px; font-style:italic;">
            Önerilen: <span id="pa_post_purchase_model">—</span>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <button type="button" id="pa_btn_post_purchase_restore" class="btn btn-primary" style="padding:8px 16px; font-size:13px;">
              Ücretliye Dön
            </button>
          </div>
          <div style="font-size:11px; color:#6b7280; margin-top:8px; padding-top:8px; border-top:1px solid #e5e7eb;">
            <div>ℹ️ Aldığınız paket bazı modelleri açabilir/kapatabilir (OpenAI/Gemini).</div>
            <div id="pa_post_purchase_daily_cap_note" style="display:none; margin-top:4px; color:#f59e0b;">
              ⚠️ Günlük kota varsa ücretli kullanım durabilir.
            </div>
          </div>
        </div>
        <!-- Teklifbul Rule v3.5.0 - Working Status Badge -->
        <div id="pa_working_status" style="margin-top:12px; display:none;">
          <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600;" id="pa_working_status_badge">
            <span id="pa_working_status_text">—</span>
          </div>
        </div>
        <!-- Teklifbul Rule v3.5.0 - Inline CTA (when stopped) -->
        <div id="pa_stopped_cta" style="margin-top:12px; display:none;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" id="pa_btn_switch_free" class="btn btn-secondary" style="padding:8px 16px; font-size:13px;">Ücretsiz Modele Geç</button>
          </div>
        </div>
        <!-- Teklifbul Rule v2.3 - Token Runway -->
        <div id="pa_runway_info" style="margin-top:12px; padding:10px; background:#f0f9ff; border-radius:6px; border:1px solid #bae6fd; font-size:13px; color:#0c4a6e; display:none;">
          <span id="pa_runway_text">—</span>
        </div>
        <p class="muted" style="margin-top:10px; font-size:12px;">
          Tokenlar şirket bazlıdır. Kullanım arttıkça düşer; yeni paket satın alarak artırabilirsiniz.
        </p>
        <!-- Teklifbul Rule v1.3 - Low token banner -->
        <div id="pa_low_token_banner" style="display:none; margin-top:12px; padding:12px; background:#fff7ed; border-radius:8px; border:1px solid #f59e0b; color:#92400e;">
          <div id="pa_low_token_banner_title" style="font-weight:700; margin-bottom:4px;">⚠️ Token bakiyeniz azalıyor</div>
          <div id="pa_low_token_banner_text" style="font-size:12px;">Paket satın alarak devam edebilirsiniz.</div>
        </div>
      </div>

      <!-- Teklifbul Rule v2.3 - Recommended Package Card -->
      <div id="pa_card_recommended" style="display:none; padding:20px; background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius:8px; border:2px solid #3b82f6;">
        <h4 style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#1e40af;">💡 Önerilen Paket</h4>
        <div id="pa_recommended_content" style="display:grid; gap:12px;">
          <!-- Content will be populated by renderRecommendedPackage -->
        </div>
      </div>

      <div id="pa_card_packages" style="padding:20px; background:#f9fafb; border-radius:8px; border:1px solid #e5e7eb;">
        <div style="display:flex; flex-direction:column; align-items:center; margin:0 0 18px 0;">
          <h3 id="pa_token_packages_heading" style="margin:0; font-size:30px; line-height:1.1; font-weight:900; color:#0f172a; text-align:center; letter-spacing:0.3px;">Token Paketleri</h3>
          <div style="margin-top:8px; width:120px; height:4px; border-radius:999px; background:linear-gradient(90deg,#2563eb 0%, #10b981 100%);"></div>
        </div>
        <div id="pa_packages_locked" style="display:none; padding:14px; background:#fff7ed; border-radius:8px; border:1px solid #f59e0b; color:#92400e;">
          <div style="font-weight:700; margin-bottom:6px;">Bu bölüm kilitli</div>
          <div style="font-size:13px;">Token paketleri için Premium Plus gerekir.</div>
          <div style="margin-top:12px;">
            <button type="button" id="pa_btn_upgrade" class="btn btn-primary" style="padding:8px 16px; font-size:13px;">⭐ Premium Sayfasına Git</button>
          </div>
        </div>
        <div id="pa_packages_list" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px;"></div>
      </div>

      <!-- Teklifbul Rule v3.19 - AI Debug Meta Panel (Admin Only) -->
      ${typeof window !== 'undefined' && window.__TB_IS_ADMIN === true ? `
      <div id="pa_debug_meta_panel" style="background:#f9fafb; border-radius:8px; padding:16px; border:1px solid #e5e7eb; margin-top:16px; display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:pointer;" id="pa_debug_meta_toggle">
          <h4 style="margin:0; font-size:14px; font-weight:700; color:#6b7280;">🔍 AI Debug Meta (Admin)</h4>
          <span id="pa_debug_meta_icon" style="font-size:14px; color:#6b7280;">▼</span>
        </div>
        <div id="pa_debug_meta_content" style="display:none; font-family:monospace; font-size:11px; color:#374151; background:white; padding:12px; border-radius:6px; border:1px solid #d1d5db; max-height:400px; overflow-y:auto;">
          <div style="text-align:center; padding:20px; color:#9ca3af;">Son AI yanıtı yok</div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

function setLoading(root, isLoading) {
  if (!root) return;
  root.style.opacity = isLoading ? '0.6' : '1';
  root.style.pointerEvents = isLoading ? 'none' : 'auto';
}

function getSelectedProfile() {
  const checked = document.querySelector('input[name="pa_profile"]:checked');
  return checked ? checked.value : 'balanced';
}

// Teklifbul Rule v3.17 - Use shared helper for provider packages navigation
async function scrollToProviderPackages(providerKey) {
  if (!providerKey) return;
  const { scrollToProviderPackages: scrollHelper } = await import('../../utils/providerPackagesNav.js');
  scrollHelper(providerKey);
}

function groupModels(availableModels) {
  const byProvider = new Map();
  for (const m of availableModels || []) {
    const arr = byProvider.get(m.provider) || [];
    arr.push(m);
    byProvider.set(m.provider, arr);
  }
  for (const [k, arr] of byProvider.entries()) {
    arr.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'tr'));
    byProvider.set(k, arr);
  }
  return byProvider;
}

function renderModelOptions({ availableModels, currentProvider, currentModel, forcedFreeMode = false }) {
  const providerSelect = el('pa_provider');
  const modelSelect = el('pa_model');
  const providerHelper = el('pa_provider_helper');
  const modelHelper = el('pa_model_helper');
  const saveBtn = el('pa_btn_save');
  if (!providerSelect || !modelSelect) return;

  const grouped = groupModels(availableModels);
  const providers = Array.from(grouped.keys()).sort((a, b) => {
    // Teklifbul Rule v1.0 - Provider order: groq first, then openai, then gemini
    const order = { 'groq': 1, 'openai': 2, 'gemini': 3 };
    return (order[a] || 99) - (order[b] || 99);
  });

  // Teklifbul Rule v1.0 - Provider labels with plan info
  const providerLabels = {
    'groq': 'Llama (Hızlı/Bulut AI - Dahil)',
    'openai': 'OpenAI (Pro - Token Paketi gerekir)',
    'gemini': 'Gemini (Pro - Token Paketi gerekir)',
  };

  // Teklifbul Rule v1.0 - Provider list always sync with current available models
  // (özellikle paket/izin değiştiğinde yeni sağlayıcıların hemen görünmesi için)
  const previousProvider = String(providerSelect.value || '').trim();
  providerSelect.innerHTML = `<option value="">Seçiniz</option>` + providers.map(p => {
    const label = providerLabels[p] || p;
    const modelCount = (grouped.get(p) || []).length;
    return `<option value="${p}">${label} (${modelCount} model)</option>`;
  }).join('');
  const providerToSelect = [currentProvider, previousProvider].find(p => p && providers.includes(p)) || '';
  if (providerToSelect) providerSelect.value = providerToSelect;

  // Tek sağlayıcı varsa kullanıcıyı yormamak için otomatik seç
  if (!providerSelect.value && providers.length === 1) {
    providerSelect.value = providers[0];
  }

  const effectiveProvider = providerSelect.value || currentProvider || '';
  const models = grouped.get(effectiveProvider) || [];
  modelSelect.innerHTML =
    `<option value="">${effectiveProvider ? 'Seçiniz' : 'Önce sağlayıcı seçin'}</option>` +
    models
      .map(m => {
        const baseLabel = m.label || m.model;
        const pkgName = m.unlockedBy?.packageName;
        const suffix = m.freeEligible === false ? ` (${pkgName ? `${pkgName} ile açıldı` : 'Paket ile açıldı'})` : '';
        return `<option value="${m.model}">${baseLabel}${suffix}</option>`;
      })
      .join('');
  modelSelect.disabled = !effectiveProvider || forcedFreeMode;

  // Teklifbul Rule v3.13 - Add note about entitlements (only once)
  if (models.length > 0 && models.some(m => m.freeEligible === false)) {
    const existingNote = modelSelect.parentElement?.querySelector('.pa-entitlement-note');
    if (!existingNote && modelSelect.parentElement) {
      const note = document.createElement('div');
      note.className = 'pa-entitlement-note';
      note.style.cssText = 'margin-top:6px; font-size:11px; color:#6b7280; font-style:italic;';
      note.textContent = 'Paketiniz bazı modelleri kısıtlayabilir.';
      modelSelect.parentElement.appendChild(note);
    }
  } else {
    // Remove note if no paid models
    const existingNote = modelSelect.parentElement?.querySelector('.pa-entitlement-note');
    if (existingNote) existingNote.remove();
  }

  // Set values safely
  if (currentProvider && Array.from(providerSelect.options).some(opt => opt.value === currentProvider)) {
    providerSelect.value = currentProvider;
  }
  if (currentModel && models.some(m => m.model === currentModel)) {
    modelSelect.value = currentModel;
  }

  if (providerHelper) {
    providerHelper.textContent = providers.length
      ? `Toplam ${providers.length} sağlayıcı kullanılabilir.`
      : 'Kullanılabilir sağlayıcı bulunamadı.';
  }
  if (modelHelper) {
    modelHelper.textContent = effectiveProvider
      ? `Bu sağlayıcı için ${models.length} model bulundu.`
      : 'Model listesi için önce sağlayıcı seçin.';
  }

  // Teklifbul Rule v1.0 - Populate custom instructions
  if (lastFetchedData?.settings?.customInstructions !== undefined) {
    const customInstEl = el('pa_customInstructions');
    if (customInstEl) customInstEl.value = lastFetchedData.settings.customInstructions || '';
  }

  // Teklifbul Rule v2.8 - Disable dropdowns and save button if forcedFreeMode
  if (forcedFreeMode) {
    providerSelect.disabled = true;
    modelSelect.disabled = true;
    if (saveBtn) saveBtn.disabled = true;

    // Add tooltip/help text
    const providerLabel = document.querySelector('label[for="pa_provider"]');
    const modelLabel = document.querySelector('label[for="pa_model"]');
    if (providerLabel && !providerLabel.querySelector('.pa-disabled-hint')) {
      const hint = document.createElement('span');
      hint.className = 'pa-disabled-hint';
      hint.style.cssText = 'font-size:11px; color:#dc2626; margin-left:8px; font-weight:600;';
      hint.textContent = '(Admin tarafından ücretsiz mod zorunlu)';
      providerLabel.appendChild(hint);
    }
    if (modelLabel && !modelLabel.querySelector('.pa-disabled-hint')) {
      const hint = document.createElement('span');
      hint.className = 'pa-disabled-hint';
      hint.style.cssText = 'font-size:11px; color:#dc2626; margin-left:8px; font-weight:600;';
      hint.textContent = '(Admin tarafından ücretsiz mod zorunlu)';
      modelLabel.appendChild(hint);
    }
  } else {
    providerSelect.disabled = false;
    modelSelect.disabled = false;
    if (saveBtn) saveBtn.disabled = false;

    // Remove tooltips
    document.querySelectorAll('.pa-disabled-hint').forEach(hint => hint.remove());
  }
}

function renderPackages({ plan, packages }) {
  const lockedBox = el('pa_packages_locked');
  const listEl = el('pa_packages_list');
  if (!lockedBox || !listEl) return;

  const isPlus = !!plan?.isPremiumPlus;
  lockedBox.style.display = isPlus ? 'none' : 'block';
  listEl.style.display = isPlus ? 'grid' : 'none';

  if (!isPlus) {
    listEl.innerHTML = '';
    return;
  }

  const providerBadge = (k) => {
    if (k === 'openai') return 'OpenAI';
    if (k === 'gemini') return 'Gemini';
    return 'Diğer';
  };
  const providerTheme = (k) => {
    if (k === 'openai') {
      return {
        accent: '#10b981',
        softBg: '#ecfdf5',
        softText: '#065f46',
      };
    }
    if (k === 'gemini') {
      return {
        accent: '#2563eb',
        softBg: '#eff6ff',
        softText: '#1e3a8a',
      };
    }
    return {
      accent: '#7c3aed',
      softBg: '#f5f3ff',
      softText: '#4c1d95',
    };
  };

  const providerSortRank = (provider) => {
    if (provider === 'openai') return 1;
    if (provider === 'gemini') return 2;
    return 99;
  };

  const estimateMessages = (tokens, provider) => {
    const tokenCount = Number(tokens || 0);
    if (tokenCount <= 0) return null;
    const tokensPerMessage = provider === 'gemini' ? 300 : (provider === 'openai' ? 1000 : 700);
    return Math.max(1, Math.round(tokenCount / tokensPerMessage));
  };

  const normalizedPackages = (packages || []).map((pkg) => {
    const providers = Array.isArray(pkg.allowedProviders) && pkg.allowedProviders.length
      ? pkg.allowedProviders.map((p) => String(p || '').toLowerCase())
      : ['diğer'];
    return {
      ...pkg,
      _primaryProvider: providers[0] || 'diğer',
    };
  });

  normalizedPackages.sort((a, b) => {
    const providerDiff = providerSortRank(a._primaryProvider) - providerSortRank(b._primaryProvider);
    if (providerDiff !== 0) return providerDiff;
    return Number(a.sort || 0) - Number(b.sort || 0);
  });

  const cards = normalizedPackages.map((p) => {
    const tokens = Number(p.tokens || 0);
    const price = Number(p.priceTRY || 0);
    const label = p.name || p.id;
    const desc = p.description ? String(p.description) : '';
    const provider = p._primaryProvider || 'diğer';
    const estimatedMessages = estimateMessages(tokens, provider);
    const theme = providerTheme(provider);
    return `
      <div style="position:relative; background:linear-gradient(180deg,#ffffff 0%, #f8fafc 100%); border:1px solid #e2e8f0; border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:12px; box-shadow:0 6px 18px rgba(15,23,42,0.08); overflow:hidden; height:100%;">
        <div style="position:absolute; inset:0 auto auto 0; width:100%; height:4px; background:${theme.accent};"></div>
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-top:2px;">
          <div>
            <div style="font-weight:800; color:#0f172a; font-size:15px; line-height:1.2;">${label}</div>
            <div style="margin-top:8px; display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:${theme.softBg}; color:${theme.softText}; font-weight:700; font-size:11px; border:1px solid rgba(15,23,42,0.08);">
              ${providerBadge(provider)}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b; font-weight:600;">Paket Fiyatı</div>
            <div style="font-weight:900; color:#0f172a; font-size:20px; line-height:1.1;">${price.toLocaleString('tr-TR')} ₺</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div style="padding:8px 10px; border-radius:8px; background:#ffffff; border:1px solid #e2e8f0;">
            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Token</div>
            <div style="font-size:13px; font-weight:700; color:#1e293b;">${tokens.toLocaleString('tr-TR')}</div>
          </div>
          <div style="padding:8px 10px; border-radius:8px; background:#ffffff; border:1px solid #e2e8f0;">
            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Tahmini Mesaj</div>
            <div style="font-size:13px; font-weight:700; color:#1e293b;">${estimatedMessages ? estimatedMessages.toLocaleString('tr-TR') : '-'}</div>
          </div>
        </div>
        ${desc ? `<div class="muted" style="font-size:12px; line-height:1.45; color:#475569;">${desc}</div>` : ''}
        <div style="display:flex; justify-content:flex-end; margin-top:auto; padding-top:6px;">
          <button type="button" class="btn btn-primary" data-action="pa-buy" data-package-id="${p.id}" style="padding:9px 16px; font-size:13px; font-weight:700; border-radius:10px;">Satın Al</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  listEl.innerHTML = cards;
}

async function fetchData() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const r1 = await authFetch('/api/settings/purchase-assistant');
  const data = await r1.json();
  if (!r1.ok) throw new Error(data?.message || data?.error || 'Ayarlar yüklenemedi');

  const r2 = await authFetch('/api/ai/token-packages');
  const data2 = await r2.json();
  if (!r2.ok) throw new Error(data2?.message || data2?.error || 'Paketler yüklenemedi');

  // Teklifbul Rule v2.3 - Fetch usage report for runway calculation
  // Teklifbul Rule v1.0 - 403 hatası durumunda sessizce devam et (yetki yoksa boş data döndür)
  let usageData = null;
  try {
    const r3 = await authFetch('/api/ai/usage-report?days=7');
    if (r3.ok) {
      usageData = await r3.json();
    } else if (r3.status === 403) {
      // Yetki yoksa sessizce devam et, boş data kullan
      logger.info('Usage report permission denied (non-critical)', { status: 403 });
      usageData = null;
    } else {
      // Diğer hatalar için de sessizce devam et
      logger.info('Usage report fetch failed (non-critical)', { status: r3.status });
      usageData = null;
    }
  } catch (e) {
    // Teklifbul Rule v1.0 - 403 hatası catch bloğunda da handle et
    if (e?.status === 403 || e?.message?.includes('403') || e?.message?.includes('Forbidden')) {
      logger.info('Usage report permission denied (non-critical, caught)', { error: e?.message });
      usageData = null;
    } else {
      logger.warn('Usage report fetch failed (non-critical)', e);
      usageData = null;
    }
  }

  return {
    settingsData: data,
    packagesData: data2,
    usageData,
  };
}

async function submitUpgradeLead(params = {}) {
  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const { auth } = await import('../../../../firebase.js');
    const user = auth?.currentUser;
    const email = String(user?.email || '').trim();
    if (!email) return;

    const reason = String(params.reason || 'Token paketleri için yükseltme talebi').trim();
    const source = String(params.source || 'purchase-assistant-settings').trim();
    const note = String(params.note || '').trim();

    // Aynı sebep için kısa sürede tekrar lead açmayı engelle
    const dedupeKey = `upgradeLead:${source}:${reason}`;
    const lastMs = Number(localStorage.getItem(dedupeKey) || 0);
    const nowMs = Date.now();
    if (lastMs > 0 && (nowMs - lastMs) < (12 * 60 * 60 * 1000)) {
      return;
    }

    const resp = await authFetch('/api/leads/upgrade', {
      method: 'POST',
      body: JSON.stringify({
        contactEmail: email,
        contactName: user?.displayName || null,
        reason,
        source,
        note: note || null,
      }),
    });
    if (resp.ok) {
      localStorage.setItem(dedupeKey, String(nowMs));
    }
  } catch (e) {
    logger.warn('Upgrade lead gönderilemedi (non-critical)', e);
  }
}

async function saveSettings() {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const provider = String(el('pa_provider')?.value || '').trim();
  const model = String(el('pa_model')?.value || '').trim();
  const profile = getSelectedProfile();
  const dictionaryLearning = !!el('pa_dictionaryLearning')?.checked;
  const customInstructions = String(el('pa_customInstructions')?.value || '').trim();

  if (!provider || !model) {
    toast.error('Lütfen sağlayıcı ve model seçin.');
    return;
  }

  // Teklifbul Rule v1.0 - Check token pack for OpenAI/Gemini
  if (provider === 'openai' || provider === 'gemini') {
    try {
      // Check if user has active token pack for this provider
      const packagesResp = await authFetch('/api/ai/token-packages');
      const packagesData = await packagesResp.json().catch(() => ({}));

      if (packagesResp.ok && Array.isArray(packagesData.packages)) {
        const hasActivePack = packagesData.packages.some(p => {
          const pProvider = p.provider || p.providerKey || '';
          const matchesProvider = pProvider.toLowerCase() === provider.toLowerCase();
          const hasTokens = Number(p.remainingTokens || 0) > 0;
          return matchesProvider && hasTokens;
        });

        if (!hasActivePack) {
          // Show upsell modal
          const providerName = provider === 'openai' ? 'OpenAI' : 'Gemini';
          const confirmed = confirm(
            `${providerName} kullanmak için token paketi gereklidir. ` +
            `Token paketi satın almak için Premium Hesap sayfasına yönlendirilmek ister misiniz?`
          );

          if (confirmed) {
            window.location.href = '/settings.html#billing-plan?reason=token_packages';
          }
          return; // Don't save settings
        }
      }
    } catch (packError) {
      logger.warn('Token pack check failed during save', packError);
      // Continue with save - backend will validate
    }
  }

  const resp = await authFetch('/api/settings/purchase-assistant', {
    method: 'POST',
    body: JSON.stringify({ provider, model, profile, dictionaryLearning, customInstructions }),
  });
  const data = await resp.json().catch(() => ({}));

  // Teklifbul Rule v1.3 - Rate limit error handling
  if (resp.status === 429) {
    const retryAfterSec = data?.retryAfterSec || 60;
    toast.error(`Çok hızlı istek gönderildi. ${retryAfterSec} sn sonra tekrar deneyin.`);
    throw new Error(`Rate limited: ${retryAfterSec}s`);
  }

  if (!resp.ok) {
    // Teklifbul Rule v1.0 - Handle token pack required error
    if (resp.status === 402 && (data?.error === 'token_pack_required' || data?.code === 'token_pack_required')) {
      const providerName = provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : provider;
      const confirmed = confirm(
        `${providerName} kullanmak için token paketi gereklidir. ` +
        `Token paketi satın almak için Premium Hesap sayfasına yönlendirilmek ister misiniz?`
      );

      if (confirmed) {
        window.location.href = '/settings.html#billing-plan?reason=token_packages';
      }
      return;
    }

    throw new Error(data?.message || data?.error || 'Kaydedilemedi');
  }

  toast.success('Ayarlar kaydedildi');
}

async function buyPackage(packageId) {
  const { authFetch } = await import('../../utils/api-helpers.js');
  const resp = await authFetch('/api/ai/token-purchases/create', {
    method: 'POST',
    body: JSON.stringify({ packageId }),
  });
  const data = await resp.json().catch(() => ({}));

  // Teklifbul Rule v1.3 - Rate limit error handling
  if (resp.status === 429) {
    const retryAfterSec = data?.retryAfterSec || 60;
    toast.error(`Çok hızlı istek gönderildi. ${retryAfterSec} sn sonra tekrar deneyin.`);
    throw new Error(`Rate limited: ${retryAfterSec}s`);
  }

  if (!resp.ok) {
    throw new Error(data?.message || data?.error || 'Satın alma başarısız');
  }

  if (data?.requiresPayment === true && data?.checkoutUrl) {
    toast.info('Ödeme başlatılıyor...');
    window.location.assign(data.checkoutUrl);
    return { ...data, paymentStarted: true };
  }

  return data;
}

// Teklifbul Rule v2.3 - Calculate runway and recommended package
function calculateRunwayAndRecommendation({ balanceTokens, usageData, packages }) {
  const days = 7; // Fixed 7 days for now
  const summary = usageData?.summary || {};
  const totalConsumedPaid = Number(summary.totalConsumedTokensPaid || 0);
  const avgDailyPaid = days > 0 ? totalConsumedPaid / days : 0;

  let daysRemaining = null;
  if (avgDailyPaid > 0) {
    daysRemaining = balanceTokens / avgDailyPaid;
  }

  let recommendedPackage = null;
  if (avgDailyPaid > 0 && Array.isArray(packages) && packages.length > 0) {
    const targetMonthlyTokens = avgDailyPaid * 30;
    // Find smallest package that meets or exceeds target
    const eligible = packages
      .filter(p => p.isActive !== false && Number(p.tokens || 0) >= targetMonthlyTokens)
      .sort((a, b) => Number(a.tokens || 0) - Number(b.tokens || 0));

    if (eligible.length > 0) {
      recommendedPackage = eligible[0];
    } else {
      // If no package meets target, recommend largest package
      const sorted = packages
        .filter(p => p.isActive !== false)
        .sort((a, b) => Number(b.tokens || 0) - Number(a.tokens || 0));
      if (sorted.length > 0) {
        recommendedPackage = sorted[0];
      }
    }
  }

  return { daysRemaining, recommendedPackage, avgDailyPaid };
}

// Teklifbul Rule v3.5.0 - Render working status badge and CTA
function renderWorkingStatus({ forcedFreeMode, currentModel, balanceTokens, minTokens }) {
  const statusEl = el('pa_working_status');
  const badgeEl = el('pa_working_status_badge');
  const statusTextEl = el('pa_working_status_text');
  const ctaEl = el('pa_stopped_cta');

  if (!statusEl || !badgeEl || !statusTextEl || !ctaEl) return;

  let statusText = '';
  let badgeColor = '';
  let badgeBg = '';
  let showCTA = false;

  if (forcedFreeMode) {
    statusText = 'ÜCRETSİZ ZORUNLU';
    badgeColor = '#991b1b';
    badgeBg = '#fee2e2';
  } else if (currentModel && currentModel.freeEligible === true) {
    statusText = 'ÜCRETSİZ';
    badgeColor = '#047857';
    badgeBg = '#d1fae5';
  } else {
    // Paid model
    if (balanceTokens < minTokens) {
      statusText = 'DURDU (Token Yetersiz)';
      badgeColor = '#dc2626';
      badgeBg = '#fee2e2';
      showCTA = true;
    } else {
      statusText = 'AKTİF';
      badgeColor = '#059669';
      badgeBg = '#d1fae5';
    }
  }

  statusTextEl.textContent = statusText;
  badgeEl.style.color = badgeColor;
  badgeEl.style.background = badgeBg;
  statusEl.style.display = 'block';

  // Show/hide CTA based on status and forcedFreeMode
  if (showCTA && !forcedFreeMode) {
    ctaEl.style.display = 'block';
  } else {
    ctaEl.style.display = 'none';
  }
}

// Teklifbul Rule v2.8 + v3.1 - Render guardrails banner
function renderGuardrailsBanner(settings, todayPaidUsage) {
  const bannerEl = el('pa_guardrails_banner');
  if (!bannerEl) return;

  const forcedFreeMode = settings.forcedFreeMode === true;
  const dailyCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
  const forcedFreeReason = settings.forcedFreeModeReason || null;
  const dailyCapReason = settings.dailyPaidTokenCapReason || null;
  const todayUsed = typeof todayPaidUsage?.paidUsedTokens === 'number' ? todayPaidUsage.paidUsedTokens : 0;

  const banners = [];

  // Forced Free Mode banner
  if (forcedFreeMode) {
    banners.push(`
      <div style="padding:16px; background:#fef2f2; border-left:4px solid #dc2626; border-radius:8px; margin-bottom:12px;">
        <div style="font-weight:700; color:#991b1b; margin-bottom:4px; font-size:14px;">
          ⚠️ Bu firmada Ücretsiz Mod zorunlu
        </div>
        <div style="font-size:13px; color:#7f1d1d; margin-bottom:4px;">
          Ücretli modeller devre dışı. Tüm AI çağrıları ücretsiz model kullanır.
        </div>
        <div style="font-size:12px; color:#991b1b; margin-top:4px;">
          Bugün kullanılan paid: <strong>0</strong> (Ücretsiz mod zorunlu)
        </div>
        ${forcedFreeReason ? `<div style="font-size:12px; color:#991b1b; margin-top:4px; font-style:italic;">Sebep: ${forcedFreeReason}</div>` : ''}
      </div>
    `);
  }

  // Daily Cap banner
  if (dailyCap !== null) {
    // Teklifbul Rule v3.1 - Progress calculation
    const percent = dailyCap > 0 ? Math.min(100, (todayUsed / dailyCap) * 100) : 0;
    const progressColor = percent >= 100 ? '#dc2626' : percent >= 70 ? '#f59e0b' : '#10b981';

    banners.push(`
      <div style="padding:16px; background:#fff7ed; border-left:4px solid #f59e0b; border-radius:8px; margin-bottom:12px;">
        <div style="font-weight:700; color:#92400e; margin-bottom:4px; font-size:14px;">
          📊 Günlük Ücretli Token Kotası
        </div>
        <div style="font-size:13px; color:#78350f; margin-bottom:8px;">
          Günlük ücretli token kotası: <strong>${dailyCap.toLocaleString('tr-TR')} token</strong>. Kota dolarsa ücretli model durur, ücretsiz model çalışmaya devam eder.
        </div>
        <div style="margin-top:8px; margin-bottom:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; color:#78350f; font-weight:600;">Bugün kullanılan: <strong>${todayUsed.toLocaleString('tr-TR')} / ${dailyCap.toLocaleString('tr-TR')}</strong></span>
            <span style="font-size:11px; color:#92400e; font-weight:600;">${percent.toFixed(1)}%</span>
          </div>
          <div style="width:100%; height:8px; background:#fef3c7; border-radius:4px; overflow:hidden;">
            <div style="width:${percent}%; height:100%; background:${progressColor}; transition:width 0.3s;"></div>
          </div>
        </div>
        ${dailyCapReason ? `<div style="font-size:12px; color:#92400e; margin-top:4px; font-style:italic;">Sebep: ${dailyCapReason}</div>` : ''}
      </div>
    `);
  } else if (!forcedFreeMode && todayUsed > 0) {
    // Teklifbul Rule v3.1 - Show today usage even if no cap
    banners.push(`
      <div style="padding:12px; background:#f0f9ff; border-left:4px solid #3b82f6; border-radius:8px; margin-bottom:12px;">
        <div style="font-size:13px; color:#1e40af;">
          Bugün kullanılan paid token: <strong>${todayUsed.toLocaleString('tr-TR')}</strong>
        </div>
      </div>
    `);
  }

  if (banners.length > 0) {
    bannerEl.innerHTML = banners.join('');
    bannerEl.style.display = 'block';
  } else {
    bannerEl.style.display = 'none';
  }
}

// Teklifbul Rule v3.5.0 - renderWorkingStatus fonksiyonu yukarıda zaten tanımlı (satır 546), duplicate kaldırıldı

// Teklifbul Rule v3.7 - Check post-purchase restore status and show banner
async function checkPostPurchaseRestoreStatus(settings) {
  const bannerEl = el('pa_post_purchase_banner');
  const suggestedEl = el('pa_post_purchase_suggested');
  const modelEl = el('pa_post_purchase_model');
  const dailyCapNoteEl = el('pa_post_purchase_daily_cap_note');

  if (!bannerEl || !suggestedEl || !modelEl) return;

  // Hide banner by default
  bannerEl.style.display = 'none';

  // forcedFreeMode true ise banner asla görünmesin
  if (settings.forcedFreeMode === true) {
    return;
  }

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    const resp = await authFetch('/api/settings/purchase-assistant/restore-paid/status');

    if (!resp.ok) {
      return;
    }

    const status = await resp.json();

    // Show banner if canRestore is true
    if (status.canRestore === true && status.suggestedPaid) {
      const provider = status.suggestedPaid.provider || '';
      const model = status.suggestedPaid.model || '';
      const providerKey = status.suggestedPaid.providerKey || status.requiredProviderKey;
      // Teklifbul Rule v3.17 - Show provider name if providerKey available
      const providerLabel = providerKey === 'openai' ? 'OpenAI' : providerKey === 'gemini' ? 'Gemini' : provider;
      modelEl.textContent = providerKey ? `${providerLabel}/${model}` : `${provider}/${model}`;

      // Show daily cap note if daily cap exists
      if (typeof settings.dailyPaidTokenCap === 'number' && settings.dailyPaidTokenCap > 0) {
        if (dailyCapNoteEl) dailyCapNoteEl.style.display = 'block';
      } else {
        if (dailyCapNoteEl) dailyCapNoteEl.style.display = 'none';
      }

      bannerEl.style.display = 'block';
    }
  } catch (err) {
    logger.warn('Failed to check post-purchase restore status', err);
    // Non-critical, hide banner
  }
}

function renderRunway({ daysRemaining, balanceTokens }) {
  const runwayEl = el('pa_runway_info');
  const runwayTextEl = el('pa_runway_text');
  if (!runwayEl || !runwayTextEl) return;

  if (daysRemaining === null) {
    runwayEl.style.display = 'none';
    return;
  }

  const daysRounded = Math.round(daysRemaining * 10) / 10; // 1 decimal

  if (daysRounded <= 7) {
    // Red banner
    runwayEl.style.background = '#fef2f2';
    runwayEl.style.borderColor = '#ef4444';
    runwayEl.style.color = '#991b1b';
    runwayTextEl.innerHTML = `🔴 <strong>Tokenlarınız bu hızla ~${daysRounded.toFixed(1)} gün içinde bitecek.</strong>`;
  } else if (daysRounded <= 14) {
    // Amber banner
    runwayEl.style.background = '#fff7ed';
    runwayEl.style.borderColor = '#f59e0b';
    runwayEl.style.color = '#92400e';
    runwayTextEl.innerHTML = `⚠️ <strong>Tokenlarınız bu hızla ~${daysRounded.toFixed(1)} gün içinde bitecek.</strong>`;
  } else {
    // Info banner
    runwayEl.style.background = '#f0f9ff';
    runwayEl.style.borderColor = '#bae6fd';
    runwayEl.style.color = '#0c4a6e';
    runwayTextEl.innerHTML = `ℹ️ Bu hızla tokenlarınız yaklaşık <strong>${daysRounded.toFixed(1)} gün</strong> yetecek.`;
  }

  runwayEl.style.display = 'block';
}

function renderRecommendedPackage({ recommendedPackage, plan }) {
  const cardEl = el('pa_card_recommended');
  const contentEl = el('pa_recommended_content');
  if (!cardEl || !contentEl) return;

  if (!recommendedPackage) {
    cardEl.style.display = 'none';
    return;
  }

  const isPremiumPlus = !!plan?.isPremiumPlus;
  const tokens = Number(recommendedPackage.tokens || 0);
  const priceTRY = Number(recommendedPackage.priceTRY || 0);
  const name = recommendedPackage.name || recommendedPackage.id || 'Paket';

  contentEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <div style="font-weight:800; color:#1e40af; font-size:15px;">${name}</div>
        <div style="margin-top:4px; font-size:13px; color:#475569;">${tokens.toLocaleString('tr-TR')} token</div>
        ${priceTRY > 0 ? `<div style="margin-top:4px; font-size:14px; font-weight:700; color:#1e40af;">${priceTRY.toLocaleString('tr-TR')} ₺</div>` : ''}
      </div>
      <div>
        ${isPremiumPlus ? `
          <button type="button" id="pa_btn_recommended_buy" class="btn btn-primary" data-package-id="${recommendedPackage.id}" style="padding:10px 20px; font-size:14px; font-weight:700;">
            Paketi Satın Al
          </button>
        ` : `
          <button type="button" id="pa_btn_recommended_upgrade" class="btn btn-secondary" style="padding:10px 20px; font-size:14px; font-weight:700;">
            Premium Plus ile açılır
          </button>
        `}
      </div>
    </div>
    <div style="margin-top:8px; font-size:12px; color:#64748b;">
      Bu paket, mevcut kullanım hızınıza göre 30 günlük ihtiyacınızı karşılayacak şekilde önerilmiştir.
    </div>
  `;

  cardEl.style.display = 'block';

  // Bind handlers
  const buyBtn = el('pa_btn_recommended_buy');
  if (buyBtn) {
    buyBtn.addEventListener('click', async () => {
      await handleRecommendedPurchase(recommendedPackage.id);
    });
  }

  const upgradeBtn = el('pa_btn_recommended_upgrade');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', async () => {
      await submitUpgradeLead({
        reason: 'Token paketleri için Premium Plus talebi',
        source: 'purchase-assistant-recommended-upgrade',
        note: 'Önerilen paket kartından yükseltme akışı',
      });
      window.location.href = '/settings.html#billing-plan?reason=token_packages';
    });
  }
}

async function handleRecommendedPurchase(packageId) {
  const btn = el('pa_btn_recommended_buy');
  if (!btn) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Satın alınıyor...';

  try {
    const { authFetch } = await import('../../utils/api-helpers.js');
    // Teklifbul Rule v2.3 - Generate idempotency key
    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    const resp = await authFetch('/api/ai/token-purchases/create', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ packageId }),
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.status === 429) {
      const retryAfterSec = data?.retryAfterSec || 60;
      toast.error(`Çok hızlı istek gönderildi. ${retryAfterSec} sn sonra tekrar deneyin.`);
      return;
    }

    if (!resp.ok) {
      throw new Error(data?.message || data?.error || 'Satın alma başarısız');
    }

    if (data?.requiresPayment === true && data?.checkoutUrl) {
      toast.info('Ödeme başlatılıyor...');
      window.location.assign(data.checkoutUrl);
      return;
    }

    toast.success('Paket başarıyla satın alındı!');

    // Reload data to update balance, available models, and runway/recommendation
    await reload();
  } catch (e) {
    logger.error('Recommended package purchase failed', e);
    toast.error(e?.message || 'Satın alma başarısız');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function reload() {
  if (isReloading) return;
  isReloading = true;
  const root = getRoot();
  setLoading(root, true);

  try {
    const { settingsData, packagesData, usageData } = await fetchData();

    const plan = settingsData.plan || {};
    const settings = settingsData.settings || {};
    const wallet = settingsData.wallet || {};
    const availableModels = settingsData.availableModels || [];
    const packages = packagesData.packages || [];
    const meta = settingsData.meta || {};

    // Store for local re-renders
    lastFetchedData = { settingsData, packagesData, usageData };

    // Teklifbul Rule v1.3 - Auto-downgrade toast
    if (meta.modelAutoDowngraded === true) {
      toast.warn('Seçili model erişimi kalktığı için ücretsiz modele geçildi.');
    }

    // Teklifbul Rule v2.8 + v3.1 - Render guardrails banner with today usage
    const todayPaidUsage = settingsData.todayPaidUsage || { dateKey: '', paidUsedTokens: 0 };
    renderGuardrailsBanner(settings, todayPaidUsage);

    const balanceTokens = Number(wallet.balanceTokens || 0);
    el('pa_balanceTokens').textContent = balanceTokens.toLocaleString('tr-TR');

    // Teklifbul Rule v3.12 - Show provider-specific wallets
    const providerWallets = wallet.providerWallets || {};
    const providerWalletsEl = el('pa_provider_wallets');
    if (providerWalletsEl) {
      const openaiBalance = Number(providerWallets.openai || 0);
      const geminiBalance = Number(providerWallets.gemini || 0);

      if (openaiBalance > 0 || geminiBalance > 0) {
        el('pa_wallet_openai').textContent = openaiBalance.toLocaleString('tr-TR');
        el('pa_wallet_gemini').textContent = geminiBalance.toLocaleString('tr-TR');
        providerWalletsEl.style.display = 'block';
      } else {
        providerWalletsEl.style.display = 'none';
      }
    }

    // Teklifbul Rule v2.3 - Token runway calculation and display
    const { daysRemaining, recommendedPackage } = calculateRunwayAndRecommendation({
      balanceTokens,
      usageData,
      packages,
    });
    renderRunway({ daysRemaining, balanceTokens });
    renderRecommendedPackage({ recommendedPackage, plan });

    // Teklifbul Rule v1.3 - Low token banner (AI_MIN_TOKENS * 5, default 200 * 5 = 1000)
    const MIN_TOKENS = 200; // Default, should match backend
    const lowTokenThreshold = MIN_TOKENS * 5;
    const lowTokenBanner = el('pa_low_token_banner');
    const lowTokenBannerTitle = el('pa_low_token_banner_title');
    const lowTokenBannerText = el('pa_low_token_banner_text');
    if (lowTokenBanner) {
      if (balanceTokens <= 0) {
        lowTokenBanner.style.display = 'block';
        if (lowTokenBannerTitle) lowTokenBannerTitle.textContent = '⛔ Token bakiyeniz bitti';
        if (lowTokenBannerText) lowTokenBannerText.textContent = 'Token yoksa AI ücretli modeller çalışmaz. Devam etmek için paket satın alın veya ücretsiz modele geçin.';
      } else if (balanceTokens < lowTokenThreshold) {
        lowTokenBanner.style.display = 'block';
        if (lowTokenBannerTitle) lowTokenBannerTitle.textContent = '⚠️ Token bakiyeniz azalıyor';
        if (lowTokenBannerText) lowTokenBannerText.textContent = 'Paket satın alarak kesintisiz devam edebilirsiniz.';
      } else {
        lowTokenBanner.style.display = 'none';
      }
    }

    // Teklifbul Rule v2.8 - Disable dropdowns if forcedFreeMode
    const forcedFreeMode = settings.forcedFreeMode === true;
    renderModelOptions({
      availableModels,
      currentProvider: settings.provider || '',
      currentModel: settings.model || '',
      forcedFreeMode, // Teklifbul Rule v2.8
    });

    // Teklifbul Rule v1.3 - Active model source display
    // Teklifbul Rule v1.4.2 - FreeEligible model info note
    const currentModelForSource = settings.provider && settings.model ? availableModels.find(
      m => m.provider === settings.provider && m.model === settings.model
    ) : null;
    updateModelSourceDisplay(currentModelForSource);
    renderModelAccessHints({
      modelAccessHints: settingsData.modelAccessHints || null,
      plan,
    });

    // Teklifbul Rule v3.5.0 - Model Status Line
    const modelStatusEl = el('pa_model_status');
    const modelStatusTextEl = el('pa_model_status_text');
    if (modelStatusEl && modelStatusTextEl) {
      if (forcedFreeMode) {
        modelStatusTextEl.textContent = 'Admin zorunlu ücretsiz mod: Ücretli modeller devre dışı.';
        modelStatusEl.style.background = '#fef2f2';
        modelStatusEl.style.borderColor = '#dc2626';
        modelStatusEl.style.color = '#991b1b';
        modelStatusEl.style.display = 'block';
      } else if (settings.provider && settings.model) {
        const currentModel = availableModels.find(
          m => m.provider === settings.provider && m.model === settings.model
        );
        if (currentModel) {
          if (currentModel.freeEligible === true) {
            modelStatusTextEl.textContent = 'Ücretsiz Model: Token harcamaz, sınırsız kullanım.';
            modelStatusEl.style.background = '#f0fdf4';
            modelStatusEl.style.borderColor = '#10b981';
            modelStatusEl.style.color = '#047857';
          } else {
            modelStatusTextEl.textContent = 'Ücretli Model: Token gerekir. Token biterse AI durur ve ücretsiz modele geçmeniz gerekir.';
            modelStatusEl.style.background = '#fff7ed';
            modelStatusEl.style.borderColor = '#f59e0b';
            modelStatusEl.style.color = '#92400e';
          }
          modelStatusEl.style.display = 'block';
        } else {
          modelStatusEl.style.display = 'none';
        }
      } else {
        modelStatusEl.style.display = 'none';
      }
    }

    // Teklifbul Rule v3.9 - Auto-resolve warning (selected paid model not available)
    const resolveWarningEl = el('pa_model_resolve_warning');
    const resolveWarningTextEl = el('pa_model_resolve_warning_text');
    if (resolveWarningEl && resolveWarningTextEl && !forcedFreeMode && settings.provider && settings.model) {
      const currentModel = availableModels.find(
        m => m.provider === settings.provider && m.model === settings.model
      );
      // Check if selected model is paid but not in availableModels
      const isSelectedPaid = !currentModel || (currentModel && currentModel.freeEligible !== true);

      if (isSelectedPaid && !currentModel) {
        // Selected model is not in availableModels - check restore paid status
        try {
          const { authFetch } = await import('../../utils/api-helpers.js');
          const resp = await authFetch('/api/settings/purchase-assistant/restore-paid/status');

          if (resp.ok) {
            const status = await resp.json();
            // Teklifbul Rule v3.10 + v3.13 - Use constants
            const { AI_RESOLVE_REASON } = await import('../../constants/aiMeta.js');

            // Teklifbul Rule v3.13 - Show entitlement warning
            const entitlementWarningEl = el('pa_model_entitlement_warning');
            const entitlementWarningTextEl = el('pa_model_entitlement_warning_text');

            // Teklifbul Rule v3.15 - Handle NO_FUNDS_FOR_PAID
            const fundsWarningEl = el('pa_model_funds_warning');
            const fundsWarningTextEl = el('pa_model_funds_warning_text');
            const viewProviderBtn = el('pa_btn_view_provider_packages');

            if (status.reason === AI_RESOLVE_REASON.NOT_ENTITLED) {
              // Teklifbul Rule v3.20.4 - Net mesaj: "(Provider) paketiniz bu modeli desteklemiyor"
              const providerKey = status.suggestedPaid?.providerKey || '';
              const providerLabel = providerKey === 'openai' ? 'OpenAI' : providerKey === 'gemini' ? 'Gemini' : providerKey || '';
              if (entitlementWarningEl && entitlementWarningTextEl) {
                entitlementWarningTextEl.textContent = providerLabel ?
                  `${providerLabel} paketiniz bu modeli desteklemiyor. AI çağrıları ücretsiz modele düşebilir.` :
                  'Mevcut paketiniz bu modeli desteklemiyor. AI çağrıları ücretsiz modele düşebilir.';
                entitlementWarningEl.style.display = 'block';
              }
              if (fundsWarningEl) fundsWarningEl.style.display = 'none';
              resolveWarningEl.style.display = 'none';
            } else if (status.reason === AI_RESOLVE_REASON.NO_FUNDS_FOR_PAID) {
              // Teklifbul Rule v3.15 + v3.20.4 - Show provider-specific funds warning
              const providerKey = status.suggestedPaid?.providerKey || '';
              const providerLabel = providerKey === 'openai' ? 'OpenAI' : providerKey === 'gemini' ? 'Gemini' : providerKey || 'Bu provider';
              if (fundsWarningEl && fundsWarningTextEl) {
                // Teklifbul Rule v3.20.4 - Net mesaj: "(Provider) bakiyesi yok"
                fundsWarningTextEl.textContent = `${providerLabel} bakiyesi yok. Seçili/önerilen ücretli model için ${providerLabel} paketi satın alın.`;
                fundsWarningEl.style.display = 'block';
                // Set up button to scroll to provider packages
                if (viewProviderBtn && providerKey) {
                  viewProviderBtn.onclick = async () => {
                    const { scrollToProviderPackages: scrollHelper } = await import('../../utils/providerPackagesNav.js');
                    scrollHelper(providerKey);
                  };
                }
              }
              if (entitlementWarningEl) entitlementWarningEl.style.display = 'none';
              resolveWarningEl.style.display = 'none';
            } else if (status.reason === AI_RESOLVE_REASON.NO_PAID_MODEL_AVAILABLE) {
              // Teklifbul Rule v3.20.4 - Net mesaj: "Hiç ücretli model yok / paket yok"
              resolveWarningTextEl.textContent = 'Hiç ücretli model yok. Paket satın alın veya ücretsiz modele geçin.';
              if (entitlementWarningEl) entitlementWarningEl.style.display = 'none';
              if (fundsWarningEl) fundsWarningEl.style.display = 'none';
              resolveWarningEl.style.display = 'block';
            } else {
              if (entitlementWarningEl) entitlementWarningEl.style.display = 'none';
              if (fundsWarningEl) fundsWarningEl.style.display = 'none';
              resolveWarningEl.style.display = 'none';
            }
          } else {
            resolveWarningEl.style.display = 'none';
          }
        } catch (err) {
          logger.warn('Failed to check restore paid status for warning', err);
          resolveWarningEl.style.display = 'none';
        }
      } else {
        resolveWarningEl.style.display = 'none';
      }
    } else if (resolveWarningEl) {
      resolveWarningEl.style.display = 'none';
    }

    // Teklifbul Rule v3.5.0 - Working Status Badge + CTA
    const currentModel = settings.provider && settings.model ? availableModels.find(
      m => m.provider === settings.provider && m.model === settings.model
    ) : null;
    renderWorkingStatus({
      forcedFreeMode,
      currentModel,
      balanceTokens,
      minTokens: 200, // Default, should match backend AI_MIN_TOKENS
    });

    // Teklifbul Rule v3.5.2 - Restore Paid Button visibility
    const restorePaidBtn = el('pa_btn_restore_paid');
    const restorePaidHint = el('pa_restore_paid_hint');
    if (restorePaidBtn && restorePaidHint) {
      const hasPaidModels = availableModels.some(m => m.freeEligible !== true);
      const isFreeModel = currentModel && currentModel.freeEligible === true;

      if (forcedFreeMode) {
        // Admin forced free mode: hide button
        restorePaidBtn.style.display = 'none';
        restorePaidHint.style.display = 'none';
      } else if (!hasPaidModels) {
        // No paid models available: disable button
        restorePaidBtn.style.display = 'inline-block';
        restorePaidBtn.disabled = true;
        restorePaidBtn.title = 'Ücretli model yok. Önce token paketi satın alın.';
        restorePaidHint.style.display = 'none';
      } else if (isFreeModel) {
        // Free model selected and paid models available: enable button
        restorePaidBtn.style.display = 'inline-block';
        restorePaidBtn.disabled = false;
        restorePaidBtn.title = '';
        restorePaidHint.style.display = 'inline';
      } else {
        // Paid model already selected: hide button
        restorePaidBtn.style.display = 'none';
        restorePaidHint.style.display = 'none';
      }
    }

    // Profile + dictionary
    const prof = settings.profile || 'balanced';
    const radio = document.querySelector(`input[name="pa_profile"][value="${prof}"]`);
    if (radio) radio.checked = true;
    el('pa_dictionaryLearning').checked = !!settings.dictionaryLearning;

    renderPackages({ plan, packages });

    // Teklifbul Rule v3.19 - Render debug meta panel (admin only)
    if (typeof window !== 'undefined' && window.__TB_IS_ADMIN === true) {
      const debugPanel = el('pa_debug_meta_panel');
      const debugContent = el('pa_debug_meta_content');
      const debugToggle = el('pa_debug_meta_toggle');
      const debugIcon = el('pa_debug_meta_icon');

      if (debugPanel && debugContent) {
        const { getLastAiResponseMeta } = await import('../../utils/aiResponseMetaStorage.js');
        const lastMeta = getLastAiResponseMeta();

        if (lastMeta) {
          // Fetch additional data for debug panel
          let walletSnapshot = null;
          let entitlementSnapshot = null;
          let costMetaSummary = null;

          try {
            // Get wallet balances
            const providerWallets = settingsData.wallets || {};
            walletSnapshot = Object.keys(providerWallets).reduce((acc, key) => {
              acc[key] = { balanceTokens: providerWallets[key]?.balanceTokens || 0 };
              return acc;
            }, {});

            // Get entitlements (from restore-paid status if available)
            try {
              const { authFetch } = await import('../../utils/api-helpers.js');
              const entitlementsResp = await authFetch('/api/admin/entitlements?companyId=' + encodeURIComponent(settingsData.companyId || ''));
              if (entitlementsResp.ok) {
                entitlementSnapshot = await entitlementsResp.json();
              }
            } catch (e) {
              // Non-blocking
            }

            // Cost meta summary (from lastMeta if available)
            if (lastMeta.costUsd !== undefined || lastMeta.costTry !== undefined) {
              costMetaSummary = {
                costUsd: lastMeta.costUsd,
                costTry: lastMeta.costTry,
                costPer1kTokensUsd: lastMeta.costPer1kTokensUsd,
                usdTryRateUsed: lastMeta.usdTryRateUsed,
                costVersion: lastMeta.costVersion,
              };
            }
          } catch (e) {
            logger.warn('Failed to fetch debug data', { error: e });
          }

          const debugData = {
            resolvedProvider: lastMeta.resolvedProvider,
            resolvedModel: lastMeta.resolvedModel,
            modelResolvedBy: lastMeta.modelResolvedBy,
            modelResolveReason: lastMeta.modelResolveReason,
            requiredProviderKey: lastMeta.requiredProviderKey,
            suggestedPaid: lastMeta.suggestedPaid,
            walletBalanceSnapshot: walletSnapshot,
            entitlementSnapshot: entitlementSnapshot,
            costMetaSummary: costMetaSummary,
            capturedAt: lastMeta.capturedAt,
          };

          // Teklifbul Rule v1.0 - XSS koruma: JSON kullanici girdisi icerebilir, textContent guvenli
          debugContent.textContent = '';
          const dbgPre = document.createElement('pre');
          dbgPre.style.cssText = 'margin:0; white-space:pre-wrap; word-break:break-all;';
          dbgPre.textContent = JSON.stringify(debugData, null, 2);
          debugContent.appendChild(dbgPre);
          debugPanel.style.display = 'block';

          // Collapsible toggle
          if (debugToggle && debugIcon) {
            let isExpanded = false;
            debugContent.style.display = 'none';
            debugToggle.addEventListener('click', () => {
              isExpanded = !isExpanded;
              debugContent.style.display = isExpanded ? 'block' : 'none';
              debugIcon.textContent = isExpanded ? '▼' : '▶';
            });
          }
        } else {
          debugPanel.style.display = 'none';
        }
      }
    }

    // Teklifbul Rule v3.17 - Deep-link auto-scroll to provider packages
    // Parse URL hash query params (e.g., #purchase-assistant-settings?providerKey=openai)
    const hash = window.location.hash.replace('#', '');
    const [page, queryString] = hash.split('?');
    if (queryString) {
      const params = new URLSearchParams(queryString);
      const providerKey = params.get('providerKey');
      if (providerKey) {
        // Wait for packages to render, then scroll
        setTimeout(async () => {
          const { scrollToProviderPackages } = await import('../../utils/providerPackagesNav.js');
          scrollToProviderPackages(providerKey);

          // Clean query param from URL to avoid repeated scrolling
          const newHash = page || 'purchase-assistant-settings';
          window.history.replaceState(null, '', `#${newHash}`);
        }, 100);
      }
    }

    // Also check location.search for providerKey (fallback)
    const searchParams = new URLSearchParams(window.location.search);
    const searchProviderKey = searchParams.get('providerKey');
    if (searchProviderKey && !queryString) {
      setTimeout(async () => {
        const { scrollToProviderPackages } = await import('../../utils/providerPackagesNav.js');
        scrollToProviderPackages(searchProviderKey);

        // Clean query param from URL
        searchParams.delete('providerKey');
        const newSearch = searchParams.toString();
        const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
      }, 100);
    }
  } finally {
    setLoading(root, false);
    isReloading = false;
  }
}

function bindHandlersOnce() {
  const root = getRoot();
  if (!root) return;

  const providerSelect = el('pa_provider');
  const modelSelect = el('pa_model');

  providerSelect?.addEventListener('change', () => {
    if (!lastFetchedData) return;
    const selectedProvider = providerSelect.value;
    const settings = lastFetchedData.settingsData.settings || {};
    const availableModels = lastFetchedData.settingsData.availableModels || [];

    // Teklifbul Rule v1.0 - Local re-render without hitting server
    renderModelOptions({
      availableModels,
      currentProvider: selectedProvider,
      currentModel: '', // Reset model on provider change
      forcedFreeMode: settings.forcedFreeMode === true,
    });

    // Update working status and source display locally
    const currentModel = availableModels.find(m => m.provider === selectedProvider && m.model === modelSelect.value);
    renderWorkingStatus({
      forcedFreeMode: settings.forcedFreeMode === true,
      currentModel,
      balanceTokens: Number(lastFetchedData.settingsData.wallet?.balanceTokens || 0),
      minTokens: 200
    });
    updateModelSourceDisplay(currentModel);
  });

  modelSelect?.addEventListener('change', () => {
    if (!lastFetchedData) return;
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const settings = lastFetchedData.settingsData.settings || {};
    const availableModels = lastFetchedData.settingsData.availableModels || [];

    const currentModel = availableModels.find(m => m.provider === provider && m.model === model);
    renderWorkingStatus({
      forcedFreeMode: settings.forcedFreeMode === true,
      currentModel,
      balanceTokens: Number(lastFetchedData.settingsData.wallet?.balanceTokens || 0),
      minTokens: 200
    });
    updateModelSourceDisplay(currentModel);
  });

  el('pa_btn_save')?.addEventListener('click', async () => {
    try {
      await saveSettings();
      toast.success('Ayarlar kaydedildi.');
      await reload();
    } catch (e) {
      toast.error(e?.message || 'Kaydetme başarısız');
      logger.error('Purchase assistant settings save error', e);
    }
  });

  el('pa_btn_upgrade')?.addEventListener('click', () => {
    const btn = document.querySelector('.settings-nav-btn[data-page="premium"]');
    btn?.click();
  });

  el('pa_btn_open_billing_for_models')?.addEventListener('click', async () => {
    await submitUpgradeLead({
      reason: 'AI model erişimi için yükseltme talebi',
      source: 'purchase-assistant-model-access-hint',
      note: 'Model erişim bilgi kutusundan yönlendirildi',
    });
    window.location.href = '/settings.html#billing-plan?reason=token_packages';
  });

  // Teklifbul Rule v3.5.2 - Restore Paid button
  const restorePaidBtn = el('pa_btn_restore_paid');
  if (restorePaidBtn) {
    restorePaidBtn.addEventListener('click', async () => {
      if (restorePaidBtn.disabled) return;

      restorePaidBtn.disabled = true;
      const originalText = restorePaidBtn.textContent;
      restorePaidBtn.textContent = 'Dönülüyor...';

      try {
        const { authFetch } = await import('../../utils/api-helpers.js');
        const resp = await authFetch('/api/settings/purchase-assistant/restore-paid', {
          method: 'POST',
        });

        const data = await resp.json();
        if (!resp.ok) {
          // Teklifbul Rule v3.10 - Use constants
          const { AI_ERROR_CODES } = await import('../../constants/aiMeta.js');
          if (data?.error === AI_ERROR_CODES.FORCED_FREE_MODE_ACTIVE) {
            toast.error('Admin zorunlu ücretsiz mod aktif.');
          } else if (data?.error === AI_ERROR_CODES.NO_PAID_MODEL_AVAILABLE) {
            toast.warn('Ücretli model yok. Önce token paketi alın.');
          } else {
            throw new Error(data?.message || data?.error || 'İşlem başarısız');
          }
          return;
        }

        const restoredTo = data.meta?.restoredTo || { provider: data.provider, model: data.model };
        const providerLabel = restoredTo.provider || data.provider || '';
        const modelLabel = restoredTo.model || data.model || '';

        if (data.meta?.usedFallback) {
          toast.info(`Önceki ücretli modeliniz uygun değildi, mevcut paket modeline geçildi: ${providerLabel}/${modelLabel}`);
        } else {
          toast.success(`Ücretliye dönüldü: ${providerLabel}/${modelLabel}`);
        }

        // Reload data
        await reload();
      } catch (err) {
        logger.error('Restore paid failed', err);
        toast.error(err?.message || 'İşlem başarısız');
      } finally {
        restorePaidBtn.disabled = false;
        restorePaidBtn.textContent = originalText;
      }
    });
  }

  // Teklifbul Rule v3.5.0 - Switch to Free Model button
  const switchFreeBtn = el('pa_btn_switch_free');
  if (switchFreeBtn) {
    switchFreeBtn.addEventListener('click', async () => {
      if (switchFreeBtn.disabled) return;

      switchFreeBtn.disabled = true;
      const originalText = switchFreeBtn.textContent;
      switchFreeBtn.textContent = 'Geçiliyor...';

      try {
        const { authFetch } = await import('../../utils/api-helpers.js');
        const resp = await authFetch('/api/settings/purchase-assistant', {
          method: 'POST',
          body: JSON.stringify({
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            profile: 'fast', // Default for free model
            dictionaryLearning: true,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.message || data?.error || 'Model değiştirilemedi');
        }

        toast.success('Ücretsiz modele geçildi');

        // Reload data
        await reload();
      } catch (err) {
        logger.error('Switch to free model failed', err);
        toast.error(err?.message || 'Model değiştirilemedi');
      } finally {
        switchFreeBtn.disabled = false;
        switchFreeBtn.textContent = originalText;
      }
    });
  }

  root.addEventListener('click', async (evt) => {
    const target = evt.target;
    if (!(target instanceof HTMLElement)) return;
    const actionEl = target.closest('[data-action="pa-buy"]');
    if (!actionEl) return;

    const packageId = actionEl.getAttribute('data-package-id');
    if (!packageId) return;

    try {
      target.setAttribute('disabled', 'true');
      const result = await buyPackage(packageId);
      if (result.alreadyProcessed) {
        toast.info('Satın alma zaten işlendi.');
      } else if (result.paymentStarted) {
        return;
      } else {
        toast.success('Satın alma tamamlandı.');
      }
      await reload();
    } catch (e) {
      toast.error(e?.message || 'Satın alma başarısız');
      logger.error('Token purchase error', e);
    } finally {
      target.removeAttribute('disabled');
    }
  });

  // Teklifbul Rule v3.7 - Post-purchase restore button handler
  const postPurchaseRestoreBtn = el('pa_btn_post_purchase_restore');
  if (postPurchaseRestoreBtn) {
    postPurchaseRestoreBtn.addEventListener('click', async () => {
      if (postPurchaseRestoreBtn.disabled) return;

      postPurchaseRestoreBtn.disabled = true;
      const originalText = postPurchaseRestoreBtn.textContent;
      postPurchaseRestoreBtn.textContent = 'Dönülüyor...';

      try {
        const { authFetch } = await import('../../utils/api-helpers.js');
        const resp = await authFetch('/api/settings/purchase-assistant/restore-paid', {
          method: 'POST',
        });

        const data = await resp.json();
        if (!resp.ok) {
          if (data?.error === 'FORCED_FREE_MODE_ACTIVE') {
            toast.error('Admin zorunlu ücretsiz mod aktif.');
            // Hide banner
            const bannerEl = el('pa_post_purchase_banner');
            if (bannerEl) bannerEl.style.display = 'none';
          } else if (data?.error === 'NO_PAID_MODEL_AVAILABLE') {
            toast.warn('Ücretli model yok. Önce token paketi alın.');
            // Banner stays visible (user might need to buy another package)
          } else {
            throw new Error(data?.message || data?.error || 'İşlem başarısız');
          }
          return;
        }

        const restoredTo = data.meta?.restoredTo || { provider: data.provider, model: data.model };
        const providerLabel = restoredTo.provider || data.provider || '';
        const modelLabel = restoredTo.model || data.model || '';

        if (data.meta?.usedFallback) {
          toast.info(`Önceki ücretli modeliniz uygun değildi, mevcut paket modeline geçildi: ${providerLabel}/${modelLabel}`);
        } else {
          toast.success(`Ücretliye dönüldü: ${providerLabel}/${modelLabel}`);
        }

        // Reload data (banner will disappear after reload)
        await reload();
      } catch (err) {
        logger.error('Post-purchase restore failed', err);
        toast.error(err?.message || 'İşlem başarısız');
      } finally {
        postPurchaseRestoreBtn.disabled = false;
        postPurchaseRestoreBtn.textContent = originalText;
      }
    });
  }
}

function ensureInit() {
  if (initialized) return;
  renderShell();
  bindHandlersOnce();
  initialized = true;
}

export async function loadPurchaseAssistantSettingsPage() {
  ensureInit();
  await reload();
}

// Teklifbul Rule v1.0 - Helper to update source display without full reload
function updateModelSourceDisplay(currentModel) {
  const modelSourceEl = el('pa_model_source');
  const modelSourceTextEl = el('pa_model_source_text');
  if (!modelSourceEl || !modelSourceTextEl) return;

  if (currentModel) {
    if (currentModel.freeEligible === true) {
      modelSourceTextEl.innerHTML = 'Kaynak: Ücretsiz<br><span style="font-size:11px; color:#059669; margin-top:4px; display:block;">✓ Bu model ücretsizdir, token harcamaz.</span>';
    } else if (currentModel.unlockedBy?.packageName) {
      modelSourceTextEl.textContent = `Kaynak: ${currentModel.unlockedBy.packageName}`;
    } else {
      modelSourceTextEl.textContent = 'Kaynak: Premium';
    }
    modelSourceEl.style.display = 'block';
  } else {
    modelSourceEl.style.display = 'none';
  }
}

function renderModelAccessHints({ modelAccessHints, plan }) {
  const root = el('pa_model_access_hints');
  const summaryEl = el('pa_model_access_hints_summary');
  const textEl = el('pa_model_access_hints_text');
  const listEl = el('pa_model_access_hints_list');
  if (!root || !summaryEl || !textEl || !listEl) return;

  const hints = modelAccessHints || {};
  const totalActive = Number(hints.totalActiveModels || 0);
  const availableCount = Number(hints.availableModelsCount || 0);
  const lockedCount = Number(hints.lockedModelsCount || 0);
  const lockedModels = Array.isArray(hints.lockedModels) ? hints.lockedModels : [];

  if (!totalActive || lockedCount <= 0) {
    root.style.display = 'none';
    return;
  }

  summaryEl.textContent = `Model erişim özeti: ${availableCount}/${totalActive} model açık`;
  textEl.textContent = lockedCount > 0
    ? (plan?.isPremiumPlus
      ? `${lockedCount} model paket/entitlement nedeniyle kapalı.`
      : `${lockedCount} model plan/paket nedeniyle kapalı.`)
    : 'Tüm aktif modeller erişilebilir.';

  if (lockedModels.length > 0) {
    listEl.innerHTML = `
      <details>
        <summary style="cursor:pointer; font-weight:600; color:#334155;">Hangi modeller kilitli?</summary>
        <ul style="margin:8px 0 0 16px; padding:0; color:#475569;">
          ${lockedModels.map(item => `<li style="margin:2px 0;">${item.label} — ${item.reason || 'Erişim kısıtı'}</li>`).join('')}
        </ul>
      </details>
    `;
  } else {
    listEl.innerHTML = '';
  }

  root.style.display = 'block';
}


