/**
 * Premium Link Interceptor
 * Teklifbul Rule v1.0 - Kilitli özelliklere tıklanınca Premium sayfasına yönlendir
 *
 * Menü herkese görünür; erişim yoksa settings.html#premium + uyarı.
 */

import { logger } from '../../../src/shared/log/logger.js';

// Feature -> required plan mapping
const FEATURE_PLAN_MAP = {
  sales: 'premium',
  customers: 'premium',
  inventory: 'premium',
  interim_payments: 'premium_plus',
  token_packages: 'premium_plus',
  ai_paid_models: 'premium_plus',
  menu_customization: 'premium',
};

const FEATURE_LABELS = {
  sales: 'Satışlar',
  customers: 'Müşteriler',
  inventory: 'Stok Takip',
  interim_payments: 'Hakedişler',
  token_packages: 'Token paketleri',
  ai_paid_models: 'Ücretli AI modelleri',
  menu_customization: 'Menü özelleştirme',
};

const FEATURE_UPGRADE_MESSAGES = {
  sales: 'Satışlar sekmesini kullanabilmek için hesabınızı Premium veya Premium Plus’a yükseltmeniz gerekmektedir.',
  customers: 'Müşteriler sekmesini kullanabilmek için hesabınızı Premium veya Premium Plus’a yükseltmeniz gerekmektedir.',
  inventory: 'Stok Takip sekmesini kullanabilmek için hesabınızı Premium veya Premium Plus’a yükseltmeniz gerekmektedir.',
  interim_payments: 'Hakedişler sekmesini kullanabilmek için hesabınızı Premium Plus’a yükseltmeniz gerekmektedir.',
  token_packages: 'Token paketlerini kullanabilmek için hesabınızı Premium Plus’a yükseltmeniz gerekmektedir.',
  ai_paid_models: 'Ücretli AI modellerini kullanabilmek için hesabınızı Premium Plus’a yükseltmeniz gerekmektedir.',
  menu_customization: 'Üst menü özelleştirmesini kullanabilmek için hesabınızı Premium veya Premium Plus’a yükseltmeniz gerekmektedir.',
};

// URL -> feature mapping
const URL_FEATURE_MAP = {
  '/pages/sales.html': 'sales',
  '/pages/sale-new.html': 'sales',
  '/pages/sale-detail.html': 'sales',
  './pages/sales.html': 'sales',
  './pages/sale-new.html': 'sales',
  '/pages/customers.html': 'customers',
  '/pages/customer-detail.html': 'customers',
  './pages/customers.html': 'customers',
  './pages/customer-detail.html': 'customers',
  '/inventory-index.html': 'inventory',
  './inventory-index.html': 'inventory',
  '/pages/stock-list.html': 'inventory',
  '/pages/stock-new.html': 'inventory',
  '/pages/stock-import.html': 'inventory',
  '/pages/stock-movements.html': 'inventory',
  '/pages/stock-count.html': 'inventory',
  '/pages/stock-groups.html': 'inventory',
  '/pages/sku-merge.html': 'inventory',
  '/pages/price-update.html': 'inventory',
  '/interim-payments.html': 'interim_payments',
  '/interim-payment-edit.html': 'interim_payments',
  '/interim-payment-suggestions.html': 'interim_payments',
  './interim-payments.html': 'interim_payments',
  './interim-payment-edit.html': 'interim_payments',
  '/contracts.html': 'interim_payments',
  './contracts.html': 'interim_payments',
};

// Plan cache (per session)
let planCache = null;
let planCacheTimestamp = 0;
const PLAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get company plan (cached)
 */
async function getCompanyPlan() {
  const now = Date.now();
  if (planCache && (now - planCacheTimestamp) < PLAN_CACHE_TTL) {
    return planCache;
  }

  try {
    const { authFetch } = await import('./api-helpers.js');
    const resp = await authFetch('/api/billing/plan');
    if (!resp.ok) {
      logger.warn('Failed to fetch plan for link interceptor', { status: resp.status });
      return null;
    }
    const data = await resp.json();
    planCache = data.plan;
    planCacheTimestamp = now;
    return planCache;
  } catch (err) {
    logger.warn('Error fetching plan for link interceptor', err);
    return null;
  }
}

/**
 * Check if plan has access to feature
 */
function hasPlanAccess(planId, requiredPlan) {
  const id = String(planId || 'free').toLowerCase();
  if (!id || id === 'free') return false;
  if (requiredPlan === 'premium') {
    return id.includes('premium') || id === 'premium_admin';
  }
  if (requiredPlan === 'premium_plus') {
    return id.includes('premium_plus');
  }
  return false;
}

/**
 * Get feature from URL
 */
function getFeatureFromUrl(url) {
  const normalized = String(url || '').replace(/^\.\//, '/').split('?')[0].replace(/\/$/, '') || '/';

  if (URL_FEATURE_MAP[normalized] || URL_FEATURE_MAP[url]) {
    return URL_FEATURE_MAP[normalized] || URL_FEATURE_MAP[url];
  }

  if (
    normalized.includes('/pages/sales') ||
    normalized.includes('/pages/sale-new') ||
    normalized.includes('/pages/sale-detail') ||
    normalized.includes('/pages/invoice') ||
    normalized.includes('/pages/delivery-note')
  ) {
    return 'sales';
  }
  if (normalized.includes('/pages/customer')) {
    return 'customers';
  }
  if (
    normalized.includes('inventory-index') ||
    normalized.includes('/pages/stock-') ||
    normalized.includes('/pages/sku-merge') ||
    normalized.includes('/pages/price-update') ||
    normalized.includes('/pages/purchase-form') ||
    normalized.includes('/pages/request-site') ||
    normalized.includes('/pages/request-list') ||
    normalized.includes('/pages/request-detail') ||
    normalized.includes('/pages/reports.html')
  ) {
    return 'inventory';
  }
  if (normalized.includes('interim-payment') || normalized.includes('/contracts')) {
    return 'interim_payments';
  }
  if (normalized.includes('purchase-assistant') || normalized.includes('token')) {
    return 'token_packages';
  }

  return null;
}

export function getPremiumUpgradeMessage(feature) {
  return FEATURE_UPGRADE_MESSAGES[feature]
    || 'Bu sekmeyi kullanabilmek için hesabınızı Premium veya Premium Plus’a yükseltmeniz gerekmektedir.';
}

export function getPremiumFeatureLabel(feature) {
  return FEATURE_LABELS[feature] || 'Bu özellik';
}

/**
 * Intercept link click
 */
export async function interceptPremiumLink(event, href) {
  try {
    const { shouldSkipPreventDefault } = await import('./link-handler.js');
    if (shouldSkipPreventDefault(event)) {
      return false;
    }

    const feature = getFeatureFromUrl(href);
    if (!feature) {
      return false;
    }

    const requiredPlan = FEATURE_PLAN_MAP[feature];
    if (!requiredPlan) {
      return false;
    }

    const plan = await getCompanyPlan();
    if (!plan) {
      logger.warn('Could not determine plan, allowing navigation', { href });
      return false;
    }

    // Admin / premium_admin her şeye erişebilir
    const planId = plan.planId || 'free';
    if (plan.isAdmin === true || planId === 'premium_admin') {
      return false;
    }

    const hasAccess = hasPlanAccess(planId, requiredPlan);
    if (hasAccess) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    const message = getPremiumUpgradeMessage(feature);
    try {
      const { toast } = await import('../../../src/shared/ui/toast.js');
      toast.warn(`Dikkat: ${message}`);
    } catch (_toastErr) {
      // toast yoksa sessiz devam
    }

    // Teklifbul Rule v1.0 — kullanıcı isteği: settings.html#premium
    const premiumUrl = `/settings.html?reason=${encodeURIComponent(feature)}#premium`;
    logger.info('Premium link intercepted, redirecting to premium page', {
      href,
      feature,
      planId,
    });

    window.location.href = premiumUrl;
    return true;
  } catch (err) {
    logger.error('Error intercepting premium link', err);
    return false;
  }
}

/**
 * Setup interceptors for all premium links
 */
export async function setupPremiumLinkInterceptors() {
  logger.group('Premium Link Interceptor Setup');

  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const isMiddleClickDirect = event.type === 'auxclick' || event.button === 1 || event.which === 2 || (event.buttons !== undefined && (event.buttons & 4) === 4);
    const isNewTabIntent = isMiddleClickDirect || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (isNewTabIntent) {
      return;
    }

    try {
      const { shouldSkipPreventDefault } = await import('./link-handler.js');
      if (shouldSkipPreventDefault && shouldSkipPreventDefault(event, link)) {
        return;
      }
    } catch (_err) {
      // Import başarısız, devam et
    }

    // Only intercept internal links
    if (href.startsWith('http') && !href.includes(window.location.hostname)) {
      return;
    }

    await interceptPremiumLink(event, href);
  });

  logger.info('Premium link interceptors active');
  logger.end();
}
