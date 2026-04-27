/**
 * Page Guard Helper - Teklifbul Rule v1.0
 * Ortak auth/company/permission/plan guard helper
 */

import { requireAuth } from '../../firebase.js';
import { requireCompanyContext } from '../../assets/js/state/company-context.js';
import { initPermissions, can } from '../../assets/js/state/permissions.js';
import { getCompanyPlan, isPremium, isPremiumPlus } from '../../assets/js/state/company-plan.js';
import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';
import { MESSAGES } from '../../src/shared/constants/messages.js';

/**
 * Page Guard Result
 */
export class PageGuardResult {
  constructor({
    success = false,
    userId = null,
    companyId = null,
    permissions = null,
    planId = 'free',
    isPremium = false,
    isPremiumPlus = false,
    error = null,
    errorType = null // 'auth' | 'company' | 'permission' | 'plan'
  } = {}) {
    this.success = success;
    this.userId = userId;
    this.companyId = companyId;
    this.permissions = permissions;
    this.planId = planId;
    this.isPremium = isPremium;
    this.isPremiumPlus = isPremiumPlus;
    this.error = error;
    this.errorType = errorType;
  }
}

/**
 * Page Guard - Auth + Company + Permission + Plan kontrolü
 * Teklifbul Rule v1.0 - Fail-closed yaklaşım
 * 
 * @param {Object} options
 * @param {string|string[]} options.requiredPerms - Zorunlu permission key'leri
 * @param {string|string[]} options.requiredPlans - Zorunlu plan key'leri (örn: 'premium.salesModule')
 * @param {boolean} options.redirectOnFail - Hata durumunda redirect yapılsın mı
 * @param {string} options.redirectTo - Redirect hedefi (default: '/dashboard.html')
 * @returns {Promise<PageGuardResult>}
 */
export async function pageGuard(options = {}) {
  const {
    requiredPerms = null,
    requiredPlans = null,
    redirectOnFail = true,
    redirectTo = '/dashboard.html'
  } = options;

  try {
    logger.group('Page Guard Kontrolü');

    // 1. Auth kontrolü
    const user = await requireAuth();
    if (!user) {
      logger.warn('Page Guard: Auth başarısız');
      if (redirectOnFail) {
        window.location.href = '/index.html';
      }
      return new PageGuardResult({
        success: false,
        error: 'Authentication required',
        errorType: 'auth'
      });
    }

    // 2. Company context
    const companyContext = await requireCompanyContext({ redirectOnPending: true });
    if (!companyContext || !companyContext.companyId) {
      logger.warn('Page Guard: Company context alınamadı');
      if (redirectOnFail) {
        window.location.href = redirectTo;
      }
      return new PageGuardResult({
        success: false,
        error: 'Company context required',
        errorType: 'company'
      });
    }

    // 3. Permissions
    const permState = await initPermissions({ redirectOnPending: true });
    if (!permState) {
      logger.warn('Page Guard: Permissions alınamadı');
      if (redirectOnFail) {
        window.location.href = redirectTo;
      }
      return new PageGuardResult({
        success: false,
        error: 'Permissions required',
        errorType: 'permission'
      });
    }

    // 4. Permission kontrolü
    if (requiredPerms) {
      const permsArray = Array.isArray(requiredPerms) ? requiredPerms : [requiredPerms];
      const hasAllPerms = permsArray.every(permKey => !permKey || can(permKey));
      
      if (!hasAllPerms) {
        logger.warn('Page Guard: Permission yetersiz', { requiredPerms: permsArray });
        toast.error(MESSAGES.ERROR_PERMISSION || 'Bu sayfayı görüntüleme yetkiniz yok');
        if (redirectOnFail) {
          window.location.href = redirectTo;
        }
        return new PageGuardResult({
          success: false,
          userId: user.uid,
          companyId: companyContext.companyId,
          permissions: permState,
          error: 'Permission denied',
          errorType: 'permission'
        });
      }
    }

    // 4.5 Admin & Premium Bypass - Teklifbul Rule v1.0
    const isAdmin = permState.isAdmin === true;
    const hasUserPremium = permState.isPremium === true;
    
    if (isAdmin) {
      logger.info('Page Guard: Admin bypass (plan & perms)');
      return new PageGuardResult({
        success: true,
        userId: user.uid,
        companyId: companyContext.companyId,
        permissions: permState,
        planId: 'premium_admin',
        isPremium: true,
        isPremiumPlus: true
      });
    }

    // 5. Plan kontrolü
    const plan = await getCompanyPlan(companyContext.companyId);
    const premium = hasUserPremium || isPremium(plan.planId);
    const premiumPlus = hasUserPremium || isPremiumPlus(plan.planId);

    if (requiredPlans) {
      const plansArray = Array.isArray(requiredPlans) ? requiredPlans : [requiredPlans];
      const hasRequiredPlan = plansArray.some(planKey => {
        if (planKey === 'premium.salesModule' || planKey === 'premium.inventoryModule') {
          return premium || premiumPlus;
        }
        if (planKey === 'premium.dataTools') {
          return premiumPlus;
        }
        // Diğer plan kontrolleri buraya eklenebilir
        return false;
      });

      if (!hasRequiredPlan) {
        logger.warn('Page Guard: Plan yetersiz', { requiredPlans: plansArray, currentPlan: plan.planId });
        
        // Teklifbul Rule v1.7 - Determine reason from required plan
        let reason = null;
        if (plansArray.includes('premium.salesModule')) {
          reason = 'sales';
        } else if (plansArray.includes('premium.dataTools') || plansArray.some(p => p.includes('premium_plus'))) {
          reason = 'interim_payments'; // Default for premium_plus features
        }
        
        const reasonParam = reason ? `?reason=${reason}` : '';
        const billingUrl = `/settings.html#billing-plan${reasonParam}`;
        
        toast.error('Bu özellik için Premium plan gereklidir');
        // Teklifbul Rule v1.7 - Redirect to billing-plan page with reason
        if (redirectOnFail) {
          setTimeout(() => {
            window.location.href = billingUrl;
          }, 1500);
        }
        return new PageGuardResult({
          success: false,
          userId: user.uid,
          companyId: companyContext.companyId,
          permissions: permState,
          planId: plan.planId,
          isPremium: premium,
          isPremiumPlus: premiumPlus,
          error: 'Plan insufficient',
          errorType: 'plan'
        });
      }
    }

    logger.info('Page Guard: Başarılı', {
      userId: user.uid,
      companyId: companyContext.companyId,
      planId: plan.planId
    });
    logger.end();

    return new PageGuardResult({
      success: true,
      userId: user.uid,
      companyId: companyContext.companyId,
      permissions: permState,
      planId: plan.planId,
      isPremium: premium,
      isPremiumPlus: premiumPlus
    });
  } catch (error) {
    logger.error('Page Guard: Hata', error);
    logger.end();
    
    if (error.message === 'AUTH_REQUIRED' || error.message?.includes('AUTH_REQUIRED')) {
      if (redirectOnFail) {
        window.location.href = '/index.html';
      }
      return new PageGuardResult({
        success: false,
        error: 'Authentication required',
        errorType: 'auth'
      });
    }

    toast.error(`Sayfa yüklenirken hata: ${error.message}`);
    if (redirectOnFail) {
      window.location.href = redirectTo;
    }
    
    return new PageGuardResult({
      success: false,
      error: error.message,
      errorType: 'error'
    });
  }
}

/**
 * UI State Machine Helper
 * Teklifbul Rule v1.0 - Standard UI state yönetimi
 */
export class UIState {
  constructor(initialState = 'idle') {
    this.state = initialState;
    this.listeners = [];
  }

  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.listeners.forEach(listener => listener(newState, oldState));
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  is(state) {
    return this.state === state;
  }

  isOneOf(...states) {
    return states.includes(this.state);
  }
}

/**
 * Standard UI State Renderer
 * Teklifbul Rule v1.0 - State'e göre UI render
 */
export function renderUIState(state, container, options = {}) {
  const {
    loadingMessage = 'Yükleniyor...',
    emptyMessage = 'Kayıt bulunamadı',
    errorMessage = 'Bir hata oluştu',
    permissionDeniedMessage = 'Bu sayfayı görüntüleme yetkiniz yok',
    premiumDeniedMessage = 'Bu özellik için Premium plan gereklidir',
    onRetry = null
  } = options;

  if (!container) return;

  if (state === 'loading') {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#6b7280">
        <div style="margin-bottom:12px">⏳</div>
        <div>${loadingMessage}</div>
      </div>
    `;
    return;
  }

  if (state === 'empty') {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#6b7280">
        <div style="margin-bottom:12px">📭</div>
        <div>${emptyMessage}</div>
      </div>
    `;
    return;
  }

  if (state === 'error') {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#dc2626">
        <div style="margin-bottom:12px">❌</div>
        <div>${errorMessage}</div>
        ${onRetry ? `<button class="btn btn-primary" style="margin-top:16px" onclick="${onRetry}">Tekrar Dene</button>` : ''}
      </div>
    `;
    return;
  }

  if (state === 'permissionDenied') {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#dc2626">
        <div style="margin-bottom:12px">🔒</div>
        <div>${permissionDeniedMessage}</div>
      </div>
    `;
    return;
  }

  if (state === 'premiumDenied') {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#f59e0b">
        <div style="margin-bottom:12px">⭐</div>
        <div>${premiumDeniedMessage}</div>
      </div>
    `;
    return;
  }
}

















