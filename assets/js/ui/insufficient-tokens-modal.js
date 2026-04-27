/**
 * Insufficient Tokens Modal Component
 * Teklifbul Rule v2.2 - INSUFFICIENT_TOKENS UX (402 handler + Free fallback)
 * 
 * Global modal that shows when token balance is insufficient for paid AI models.
 * Provides actions: "Token Paketleri" (go to settings) or "Ücretsiz Modele Geç" (switch to free).
 */

import { logger } from '/src/shared/log/logger.js';
import { toast } from '/src/shared/ui/toast.js';

let modalInitialized = false;
let modalElement = null;

function el(id) {
  return document.getElementById(id);
}

function createModalHTML() {
  // Teklifbul Rule v1.0 - Template literal içinde nested template literal Vite parse hatası veriyor
  // Bu yüzden admin panel HTML'ini ayrı bir değişkende oluşturuyoruz
  const isAdmin = typeof window !== 'undefined' && window.__TB_IS_ADMIN === true;
  const adminPanelHTML = isAdmin ? `
        <div id="tb-debug-meta-panel" style="margin-top:16px; padding:12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb; display:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; cursor:pointer;" id="tb-debug-meta-toggle">
            <h4 style="margin:0; font-size:12px; font-weight:700; color:#6b7280;">🔍 AI Debug Meta (Admin)</h4>
            <span id="tb-debug-meta-icon" style="font-size:12px; color:#6b7280;">▼</span>
          </div>
          <div id="tb-debug-meta-content" style="display:none; font-family:monospace; font-size:10px; color:#374151; background:white; padding:8px; border-radius:4px; border:1px solid #d1d5db; max-height:300px; overflow-y:auto;">
            <div style="text-align:center; padding:10px; color:#9ca3af;">Son AI yanıtı yok</div>
          </div>
        </div>
        ` : '';
  
  return `
    <div id="tb-insufficient-tokens-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; align-items:center; justify-content:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:500px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <h3 id="tb-modal-title" style="margin:0 0 16px 0; font-size:20px; font-weight:700; color:#1f2937;">Token Bakiyeniz Yetersiz</h3>
        <p id="tb-modal-message" style="margin:0 0 24px 0; font-size:14px; color:#6b7280; line-height:1.6;">
          Ücretli yapay zeka modeli için token gerekiyor. Paket satın alabilir veya ücretsiz modele geçebilirsiniz.
        </p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button id="tb-modal-token-packages" class="btn btn-primary" style="flex:1; min-width:140px; padding:12px 20px; font-size:14px; font-weight:600;">
            Token Paketleri
          </button>
          <!-- Teklifbul Rule v3.7 - Restore Paid Button -->
          <button id="tb-btn-restore-paid" class="btn btn-secondary" style="flex:1; min-width:140px; padding:12px 20px; font-size:14px; font-weight:600; display:none;">
            Ücretliye Dön
          </button>
          <button id="tb-modal-switch-free" class="btn btn-secondary" style="flex:1; min-width:140px; padding:12px 20px; font-size:14px; font-weight:600;">
            Ücretsiz Modele Geç
          </button>
          <button id="tb-modal-close" class="btn" style="flex:1; min-width:140px; padding:12px 20px; font-size:14px; font-weight:600; background:#f3f4f6; color:#374151; border:1px solid #d1d5db;">
            Kapat
          </button>
        </div>
        <!-- Teklifbul Rule v3.7 - Restore Paid Hint -->
        <div id="tb-restore-paid-hint" style="display:none; margin-top:8px; font-size:12px; color:#6b7280; font-style:italic;"></div>
        <!-- Teklifbul Rule v3.7 - Token Packages Hint -->
        <div style="margin-top:12px; padding:8px; background:#f0f9ff; border-radius:6px; border:1px solid #bfdbfe;">
          <div style="font-size:11px; color:#1e40af;">
            ℹ️ Paketler modele göre kısıtlı olabilir (OpenAI/Gemini).
          </div>
        </div>
        <!-- Teklifbul Rule v3.19 - AI Debug Meta Panel (Admin Only) -->
        ${adminPanelHTML}
      </div>
    </div>
  `;
}

function showModal() {
  if (modalElement) {
    modalElement.style.display = 'flex';
    logger.info('Insufficient tokens modal shown');
  }
}

function hideModal() {
  if (modalElement) {
    modalElement.style.display = 'none';
    logger.info('Insufficient tokens modal hidden');
  }
}

async function handleSwitchToFree() {
  const btn = el('tb-modal-switch-free');
  if (!btn) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Geçiliyor...';

  try {
    const { authFetch } = await import('/assets/js/utils/api-helpers.js');
    const resp = await authFetch('/api/settings/purchase-assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'free_local',
        model: 'basic',
        profile: 'fast',
        dictionaryLearning: true,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const errorMsg = data?.message || data?.error || 'Ayarlar güncellenemedi';
      toast.error(errorMsg);
      logger.error('Failed to switch to free model', { status: resp.status, error: data });
      return;
    }

    toast.success('Ücretsiz modele geçildi.');
    hideModal();
    logger.info('Switched to free model successfully');
  } catch (err) {
    logger.error('Error switching to free model', err);
    toast.error(err.message || 'Bir hata oluştu');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleRestorePaid() {
  const btn = el('tb-btn-restore-paid');
  if (!btn || btn.disabled) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Dönülüyor...';

  try {
    const { authFetch } = await import('/assets/js/utils/api-helpers.js');
    const resp = await authFetch('/api/settings/purchase-assistant/restore-paid', {
      method: 'POST',
    });

    const data = await resp.json();

    if (!resp.ok) {
      if (resp.status === 402) {
        // Still insufficient tokens after restore - update message but don't loop
        const messageEl = el('tb-modal-message');
        if (messageEl) {
          messageEl.textContent = 'Token yetersiz. Lütfen token paketi satın alın veya ücretsiz modele geçin.';
        }
        btn.disabled = true;
        btn.textContent = 'Token Yetersiz';
        toast.warn('Token yetersiz. Paket satın alın veya ücretsiz modele geçin.');
        return;
      }
      // Teklifbul Rule v3.10 - Use constants
      const { AI_ERROR_CODES } = await import('/assets/js/constants/aiMeta.js');
      if (data?.error === AI_ERROR_CODES.FORCED_FREE_MODE_ACTIVE) {
        toast.error('Admin zorunlu ücretsiz mod aktif.');
        btn.disabled = true;
        return;
      } else if (data?.error === AI_ERROR_CODES.NO_PAID_MODEL_AVAILABLE) {
        toast.warn('Ücretli model yok. Önce token paketi alın.');
        btn.disabled = true;
        return;
      } else {
        throw new Error(data?.message || data?.error || 'İşlem başarısız');
      }
    }

    const restoredTo = data.meta?.restoredTo || { provider: data.provider, model: data.model };
    const providerLabel = restoredTo.provider || data.provider || '';
    const modelLabel = restoredTo.model || data.model || '';
    
    if (data.meta?.usedFallback) {
      toast.info(`Önceki ücretli modeliniz uygun değildi, mevcut paket modeline geçildi: ${providerLabel}/${modelLabel}`);
    } else {
      toast.success(`Ücretliye dönüldü: ${providerLabel}/${modelLabel}`);
    }
    
    hideModal();
    logger.info('Restored to paid model successfully', { provider: providerLabel, model: modelLabel });
  } catch (err) {
    logger.error('Error restoring to paid model', err);
    toast.error(err?.message || 'İşlem başarısız');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Teklifbul Rule v3.17 - Use shared helper for provider packages navigation
async function handleTokenPackages(providerKey) {
  // Teklifbul Rule v2.2.1 + v3.17 - Navigate to purchase assistant settings, optionally scroll to provider
  const currentPath = window.location.pathname;
  
  if (currentPath.includes('settings.html')) {
    // Already on settings page, switch to purchase assistant tab
    // Use hash navigation (settings.html supports hashchange listener)
    const hash = providerKey ? `purchase-assistant-settings?providerKey=${encodeURIComponent(providerKey)}` : 'purchase-assistant-settings';
    window.location.hash = hash;
    
    // Also trigger button click to ensure navigation works immediately
    setTimeout(async () => {
      const navBtn = document.querySelector('.settings-nav-btn[data-page="purchase-assistant-settings"]');
      if (navBtn) {
        navBtn.click();
      }
      // Teklifbul Rule v3.17 - Use shared helper to scroll to provider section
      if (providerKey) {
        const { scrollToProviderPackages } = await import('/assets/js/utils/providerPackagesNav.js');
        scrollToProviderPackages(providerKey);
      }
    }, 50);
  } else {
    // Navigate to settings page with hash and query param
    const hash = providerKey ? `purchase-assistant-settings?providerKey=${encodeURIComponent(providerKey)}` : 'purchase-assistant-settings';
    window.location.href = `/settings.html#${hash}`;
  }
  hideModal();
  logger.info('Navigated to token packages', { providerKey });
}

// Teklifbul Rule v3.7 + v3.15 - Fetch restore paid status and update UI
async function fetchRestorePaidStatus(restorePaidBtn, restorePaidHint, titleEl, messageEl, detail = {}) {
  if (!restorePaidBtn) return;

  try {
    const { authFetch } = await import('/assets/js/utils/api-helpers.js');
    const resp = await authFetch('/api/settings/purchase-assistant/restore-paid/status');
    
    if (!resp.ok) {
      // Status fetch failed - hide restore button
      restorePaidBtn.style.display = 'none';
      if (restorePaidHint) restorePaidHint.style.display = 'none';
      return;
    }

    const status = await resp.json();
    
    // Update title/message if forcedFreeMode
    if (status.forcedFreeMode === true) {
      if (titleEl) {
        titleEl.textContent = 'Admin Ücretsiz Mod Zorunlu';
      }
      if (messageEl) {
        messageEl.textContent = 'Admin ücretsiz modu zorunlu kıldı. Ücretli modeller kullanılamaz.';
      }
      restorePaidBtn.style.display = 'none';
      if (restorePaidHint) restorePaidHint.style.display = 'none';
      return;
    }

    // Check if restore is possible
    if (status.canRestore === true && status.suggestedPaid) {
      // Show restore button
      restorePaidBtn.style.display = 'inline-block';
      restorePaidBtn.disabled = false;
      restorePaidBtn.title = '';
      
      // Show hint with suggested model (include providerKey if available)
      if (restorePaidHint) {
        const providerLabel = status.suggestedPaid.provider || '';
        const modelLabel = status.suggestedPaid.model || '';
        const providerKey = status.suggestedPaid.providerKey || '';
        const providerKeyLabel = providerKey ? ` (${providerKey})` : '';
        restorePaidHint.textContent = `Önerilen: ${providerLabel}/${modelLabel}${providerKeyLabel}`;
        restorePaidHint.style.display = 'block';
      }
    } else {
      // Cannot restore - hide or disable button
      // Teklifbul Rule v3.10 + v3.15 - Use constants and handle new reasons
      const { AI_RESOLVE_REASON } = await import('/assets/js/constants/aiMeta.js');
      if (status.reason === AI_RESOLVE_REASON.NO_PAID_MODEL_AVAILABLE) {
        // Show but disable with tooltip
        restorePaidBtn.style.display = 'inline-block';
        restorePaidBtn.disabled = true;
        restorePaidBtn.title = 'Ücretli model yok. Önce token paketi satın alın.';
        if (restorePaidHint) restorePaidHint.style.display = 'none';
      } else if (status.reason === AI_RESOLVE_REASON.NO_FUNDS_FOR_PAID) {
        // Teklifbul Rule v3.15 - Show disabled with provider-specific message
        restorePaidBtn.style.display = 'inline-block';
        restorePaidBtn.disabled = true;
        const providerKey = status.suggestedPaid?.providerKey || '';
        const providerLabel = providerKey === 'openai' ? 'OpenAI' : providerKey === 'gemini' ? 'Gemini' : providerKey || 'Bu provider';
        restorePaidBtn.title = `${providerLabel} için token bakiyesi yetersiz. ${providerLabel} paketi satın alın.`;
        if (restorePaidHint && status.suggestedPaid) {
          restorePaidHint.textContent = `Önerilen: ${status.suggestedPaid.provider}/${status.suggestedPaid.model} (${providerLabel} token gerekli)`;
          restorePaidHint.style.display = 'block';
        }
      } else if (status.reason === AI_RESOLVE_REASON.NOT_ENTITLED) {
        // Teklifbul Rule v3.15 - Show disabled with entitlement message
        restorePaidBtn.style.display = 'inline-block';
        restorePaidBtn.disabled = true;
        restorePaidBtn.title = 'Mevcut paketiniz bu modeli desteklemiyor. Paket yükseltin.';
        if (restorePaidHint) restorePaidHint.style.display = 'none';
      } else if (status.reason === 'ALREADY_PAID') {
        // Already on paid model - hide button
        restorePaidBtn.style.display = 'none';
        if (restorePaidHint) restorePaidHint.style.display = 'none';
      } else {
        // Other reasons - hide button
        restorePaidBtn.style.display = 'none';
        if (restorePaidHint) restorePaidHint.style.display = 'none';
      }
    }
  } catch (err) {
    logger.error('Failed to fetch restore paid status', err);
    // On error, hide restore button
    restorePaidBtn.style.display = 'none';
    if (restorePaidHint) restorePaidHint.style.display = 'none';
  }
}

function setupEventListeners() {
  // Token Packages button
  const tokenPackagesBtn = el('tb-modal-token-packages');
  if (tokenPackagesBtn) {
    tokenPackagesBtn.addEventListener('click', handleTokenPackages);
  }

  // Teklifbul Rule v3.7 - Restore Paid button
  const restorePaidBtn = el('tb-btn-restore-paid');
  if (restorePaidBtn) {
    restorePaidBtn.addEventListener('click', handleRestorePaid);
  }

  // Switch to Free button
  const switchFreeBtn = el('tb-modal-switch-free');
  if (switchFreeBtn) {
    switchFreeBtn.addEventListener('click', handleSwitchToFree);
  }

  // Close button
  const closeBtn = el('tb-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideModal);
  }

  // Close on backdrop click
  if (modalElement) {
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        hideModal();
      }
    });
  }

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalElement && modalElement.style.display === 'flex') {
      hideModal();
    }
  });
}

/**
 * Initialize insufficient tokens modal
 * Teklifbul Rule v2.2 - Global modal component
 */
export function initInsufficientTokensModal() {
  if (modalInitialized) {
    logger.warn('Insufficient tokens modal already initialized');
    return;
  }

  // Inject modal HTML
  const modalHTML = createModalHTML();
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  modalElement = el('tb-insufficient-tokens-modal');

  if (!modalElement) {
    logger.error('Failed to create insufficient tokens modal element');
    return;
  }

  // Setup event listeners
  setupEventListeners();

  // Listen for global insufficient tokens event
  window.addEventListener('tb:insufficientTokens', async (event) => {
    logger.info('tb:insufficientTokens event received', event.detail);
    
    // Teklifbul Rule v2.7.2 - Handle DAILY_CAP_REACHED
    const detail = event.detail || {};
    const titleEl = el('tb-modal-title');
    const messageEl = el('tb-modal-message');
    
    // Teklifbul Rule v3.7 - Handle restore paid button visibility
    const restorePaidBtn = el('tb-btn-restore-paid');
    const restorePaidHint = el('tb-restore-paid-hint');
    
    // Hide restore button by default, will show if eligible
    if (restorePaidBtn) {
      restorePaidBtn.style.display = 'none';
      restorePaidBtn.disabled = false;
      restorePaidBtn.title = '';
    }
    if (restorePaidHint) {
      restorePaidHint.style.display = 'none';
    }

    // Teklifbul Rule v3.10 - Use constants
    const { AI_ERROR_CODES, AI_DISABLED_REASONS } = await import('/assets/js/constants/aiMeta.js');
    
    // Teklifbul Rule v3.11 - Handle AI_DISABLED
    if (detail.code === AI_ERROR_CODES.AI_DISABLED) {
      const reason = detail.meta?.aiDisabledReason || AI_DISABLED_REASONS.GLOBAL;
      
      if (reason === AI_DISABLED_REASONS.PANIC || reason === AI_DISABLED_REASONS.GLOBAL) {
        if (titleEl) {
          titleEl.textContent = 'AI Geçici Olarak Kapalı';
        }
        if (messageEl) {
          messageEl.textContent = 'AI geçici olarak kapalı (sistem bakımı). Lütfen daha sonra tekrar deneyin.';
        }
      } else if (reason === AI_DISABLED_REASONS.COMPANY) {
        if (titleEl) {
          titleEl.textContent = 'AI Erişimi Kapatıldı';
        }
        if (messageEl) {
          messageEl.textContent = 'Bu firma için AI erişimi admin tarafından kapatıldı.';
        }
      }
      
      // Hide action buttons (they won't help)
      if (tokenPackagesBtn) tokenPackagesBtn.style.display = 'none';
      if (restorePaidBtn) restorePaidBtn.style.display = 'none';
      if (switchFreeBtn) switchFreeBtn.style.display = 'none';
      
      showModal();
      return;
    }
    
    if (detail.code === AI_ERROR_CODES.DAILY_CAP_REACHED) {
      // Teklifbul Rule v3.7 - DAILY_CAP_REACHED: hide restore button
      if (titleEl) {
        titleEl.textContent = 'Günlük Kota Doldu';
      }
      if (messageEl) {
        const used = typeof detail.used === 'number' ? detail.used.toLocaleString('tr-TR') : '0';
        const cap = typeof detail.cap === 'number' ? detail.cap.toLocaleString('tr-TR') : '0';
        messageEl.textContent = `Bugün ücretli token kotanız doldu (Kullanılan: ${used} / Limit: ${cap}). Ücretsiz modele geçebilir veya yarın tekrar deneyebilirsiniz.`;
      }
    } else if (detail.code === 'DAILY_CAP_CHECK_FAILED') {
      // Teklifbul Rule v3.0 - Daily cap check failed
      if (titleEl) {
        titleEl.textContent = 'Kota Kontrolü Yapılamadı';
      }
      if (messageEl) {
        messageEl.textContent = 'Günlük kota kontrolü yapılamadı. Lütfen tekrar deneyin veya ücretsiz modele geçin.';
      }
    } else if (detail.code === AI_ERROR_CODES.INSUFFICIENT_TOKENS) {
      // Teklifbul Rule v3.7 + v3.12 + v3.15 - INSUFFICIENT_TOKENS: check restore eligibility and show provider-specific message
      const { AI_RESOLVE_REASON } = await import('/assets/js/constants/aiMeta.js');
      const reason = detail.meta?.reason || '';
      const providerKey = detail.meta?.providerKey || detail.meta?.resolvedProvider || detail.meta?.requiredProviderKey || '';
      const resolvedProvider = detail.meta?.resolvedProvider || '';
      
      // Teklifbul Rule v3.17 + v3.20.4 - Handle NO_FUNDS_FOR_PAID with requiredProviderKey
      const requiredProviderKey = detail.meta?.requiredProviderKey || providerKey;
      if (reason === AI_RESOLVE_REASON.NO_FUNDS_FOR_PAID && requiredProviderKey) {
        const providerLabel = requiredProviderKey === 'openai' ? 'OpenAI' : requiredProviderKey === 'gemini' ? 'Gemini' : requiredProviderKey;
        if (titleEl) {
          // Teklifbul Rule v3.20.4 - Provider adını başlıkta göster
          titleEl.textContent = `${providerLabel} Token Gerekli`;
        }
        if (messageEl) {
          // Teklifbul Rule v3.20.4 - Net mesaj: "(Provider) bakiyesi yok"
          messageEl.textContent = `${providerLabel} bakiyesi yok. Seçili/önerilen ücretli model için ${providerLabel} paketinden satın alın.`;
        }
        // Update token packages button to scroll to provider section
        if (tokenPackagesBtn) {
          tokenPackagesBtn.onclick = () => {
            handleTokenPackages(requiredProviderKey);
          };
        }
      } else if (reason === AI_RESOLVE_REASON.NOT_ENTITLED) {
        // Teklifbul Rule v3.17 + v3.20.4 - Handle NOT_ENTITLED with requiredProviderKey
        const requiredProviderKeyForEntitlement = detail.meta?.requiredProviderKey || providerKey;
        const providerLabel = requiredProviderKeyForEntitlement ? 
          (requiredProviderKeyForEntitlement === 'openai' ? 'OpenAI' : requiredProviderKeyForEntitlement === 'gemini' ? 'Gemini' : requiredProviderKeyForEntitlement) : 
          '';
        if (titleEl) {
          // Teklifbul Rule v3.20.4 - Provider adını başlıkta göster (varsa)
          titleEl.textContent = providerLabel ? `${providerLabel} Paketi Modeli Desteklemiyor` : 'Paket Modeli Desteklemiyor';
        }
        if (messageEl) {
          // Teklifbul Rule v3.20.4 - Net mesaj: "(Provider) paketiniz bu modeli desteklemiyor"
          messageEl.textContent = providerLabel ? 
            `${providerLabel} paketiniz bu modeli desteklemiyor. ${providerLabel} paketini yükseltin.` :
            'Mevcut paketiniz bu modeli desteklemiyor. Uygun paketi seçin/yükseltin.';
        }
        // Update token packages button to scroll to packages (with providerKey if available)
        if (tokenPackagesBtn) {
          tokenPackagesBtn.onclick = () => {
            handleTokenPackages(requiredProviderKeyForEntitlement);
          };
        }
      } else {
        // Default INSUFFICIENT_TOKENS message
        // Teklifbul Rule v3.20.4 - Provider adını başlıkta göster (varsa)
        const requiredProviderKeyForDefault = detail.meta?.requiredProviderKey || providerKey;
        if (titleEl) {
          if (requiredProviderKeyForDefault) {
            const providerLabel = requiredProviderKeyForDefault === 'openai' ? 'OpenAI' : requiredProviderKeyForDefault === 'gemini' ? 'Gemini' : requiredProviderKeyForDefault;
            titleEl.textContent = `${providerLabel} Token Gerekli`;
          } else {
            titleEl.textContent = 'Token Bakiyeniz Yetersiz';
          }
        }
        if (messageEl) {
          if (requiredProviderKeyForDefault && resolvedProvider) {
            const providerLabel = requiredProviderKeyForDefault === 'openai' ? 'OpenAI' : requiredProviderKeyForDefault === 'gemini' ? 'Gemini' : requiredProviderKeyForDefault;
            // Teklifbul Rule v3.20.4 - Net mesaj: "(Provider) bakiyesi yetersiz"
            messageEl.textContent = `${providerLabel} bakiyesi yetersiz. ${providerLabel} paketi satın alabilir veya ücretsiz modele geçebilirsiniz.`;
          } else {
            messageEl.textContent = 'Ücretli yapay zeka modeli için token gerekiyor. Paket satın alabilir veya ücretsiz modele geçebilirsiniz.';
          }
        }
        // Update token packages button if requiredProviderKey available
        if (tokenPackagesBtn && detail.meta?.requiredProviderKey) {
          tokenPackagesBtn.onclick = () => {
            handleTokenPackages(detail.meta.requiredProviderKey);
          };
        }
      }
      
      // Fetch restore status
      fetchRestorePaidStatus(restorePaidBtn, restorePaidHint, titleEl, messageEl, detail);
    } else {
      // Default INSUFFICIENT_TOKENS message (no specific reason)
      if (titleEl) {
        titleEl.textContent = 'Token Bakiyeniz Yetersiz';
      }
      if (messageEl) {
        // Teklifbul Rule v3.20.4 - Net mesaj: "Hiç ücretli model yok / paket yok" durumu için
        messageEl.textContent = 'Ücretli yapay zeka modeli için token gerekiyor. Paket satın alabilir veya ücretsiz modele geçebilirsiniz.';
      }
      
      // Fetch restore status for any 402 error
      fetchRestorePaidStatus(restorePaidBtn, restorePaidHint, titleEl, messageEl);
    }
    
    // Teklifbul Rule v3.19 - Render debug meta panel (admin only)
    if (typeof window !== 'undefined' && window.__TB_IS_ADMIN === true) {
      const debugPanel = el('tb-debug-meta-panel');
      const debugContent = el('tb-debug-meta-content');
      const debugToggle = el('tb-debug-meta-toggle');
      const debugIcon = el('tb-debug-meta-icon');
      
      if (debugPanel && debugContent) {
        const { getLastAiResponseMeta } = await import('/assets/js/utils/aiResponseMetaStorage.js');
        const lastMeta = getLastAiResponseMeta();
        
        if (lastMeta) {
          const debugData = {
            resolvedProvider: lastMeta.resolvedProvider,
            resolvedModel: lastMeta.resolvedModel,
            modelResolvedBy: lastMeta.modelResolvedBy,
            modelResolveReason: lastMeta.modelResolveReason,
            requiredProviderKey: lastMeta.requiredProviderKey,
            suggestedPaid: lastMeta.suggestedPaid,
            errorDetail: detail,
            capturedAt: lastMeta.capturedAt,
          };
          
          // Teklifbul Rule v1.0 - XSS koruma: JSON kullanici girdisi icerebilir, textContent ile guvenli
          debugContent.textContent = '';
          const pre = document.createElement('pre');
          pre.style.cssText = 'margin:0; white-space:pre-wrap; word-break:break-all;';
          pre.textContent = JSON.stringify(debugData, null, 2);
          debugContent.appendChild(pre);
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
    
    showModal();
  });

  modalInitialized = true;
  logger.info('Insufficient tokens modal initialized');
}

