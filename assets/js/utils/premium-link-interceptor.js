/**
 * Premium Link Interceptor
 * Teklifbul Rule v1.7 - Upgrade Routing for Locked Features
 * 
 * Intercepts clicks on premium feature links and redirects to billing-plan page with reason
 */

import { logger } from '../../../src/shared/log/logger.js';

// Feature -> required plan mapping
const FEATURE_PLAN_MAP = {
  sales: 'premium',
  interim_payments: 'premium_plus',
  token_packages: 'premium_plus',
  ai_paid_models: 'premium_plus',
};

// URL -> feature mapping
const URL_FEATURE_MAP = {
  '/pages/sales.html': 'sales',
  '/pages/sale-new.html': 'sales',
  './pages/sales.html': 'sales',
  './pages/sale-new.html': 'sales',
  '/interim-payments.html': 'interim_payments',
  '/interim-payment-edit.html': 'interim_payments',
  './interim-payments.html': 'interim_payments',
  './interim-payment-edit.html': 'interim_payments',
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
  if (requiredPlan === 'premium') {
    return planId !== 'free' && planId.includes('premium');
  }
  if (requiredPlan === 'premium_plus') {
    return planId.includes('premium_plus');
  }
  return false;
}

/**
 * Get feature from URL
 */
function getFeatureFromUrl(url) {
  // Normalize URL (remove leading/trailing slashes, handle relative paths)
  const normalized = url.replace(/^\.\//, '/').replace(/\/$/, '');

  // Direct URL match
  if (URL_FEATURE_MAP[normalized] || URL_FEATURE_MAP[url]) {
    return URL_FEATURE_MAP[normalized] || URL_FEATURE_MAP[url];
  }

  // Pattern matching - Teklifbul Rule v1.7.1 - Be specific to avoid greedy matches (like sale-detail)
  if (normalized.includes('/pages/sales.html') || normalized.includes('/pages/sale-new.html')) {
    return 'sales';
  }
  if (normalized.includes('interim-payment') || normalized.includes('hakediş') || url.includes('interim-payment') || url.includes('hakediş')) {
    return 'interim_payments';
  }
  if (normalized.includes('purchase-assistant') || normalized.includes('token') || url.includes('purchase-assistant') || url.includes('token')) {
    return 'token_packages';
  }

  return null;
}

/**
 * Intercept link click
 */
export async function interceptPremiumLink(event, href) {
  try {
    // Teklifbul Rule v1.0 - Middle click / new tab intent kontrolü
    // Yeni sekme niyeti varsa (middle click, Ctrl+Click, vb.) intercept yapma
    const { shouldSkipPreventDefault } = await import('./link-handler.js');
    if (shouldSkipPreventDefault(event)) {
      return false; // Yeni sekme niyeti var, normal navigation'a izin ver
    }

    const feature = getFeatureFromUrl(href);
    if (!feature) {
      return false; // Not a premium feature, allow normal navigation
    }

    const requiredPlan = FEATURE_PLAN_MAP[feature];
    if (!requiredPlan) {
      return false; // Unknown feature, allow normal navigation
    }

    const plan = await getCompanyPlan();
    if (!plan) {
      logger.warn('Could not determine plan, allowing navigation', { href });
      return false; // Can't determine plan, allow navigation
    }

    const hasAccess = hasPlanAccess(plan.planId, requiredPlan);
    if (hasAccess) {
      return false; // Has access, allow normal navigation
    }

    // No access - redirect to billing-plan with reason
    event.preventDefault();
    event.stopPropagation();

    const billingUrl = `/settings.html#billing-plan?reason=${feature}`;
    logger.info('Premium link intercepted, redirecting to billing-plan', { href, feature, planId: plan.planId });

    window.location.href = billingUrl;
    return true; // Intercepted
  } catch (err) {
    logger.error('Error intercepting premium link', err);
    return false; // On error, allow normal navigation
  }
}

/**
 * Setup interceptors for all premium links
 */
export async function setupPremiumLinkInterceptors() {
  logger.group('Premium Link Interceptor Setup');

  // Intercept header nav links
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Teklifbul Rule v1.0 - Direkt middle click kontrolü (import bağımsız)
    const isMiddleClickDirect = event.type === 'auxclick' || event.button === 1 || event.which === 2 || (event.buttons !== undefined && (event.buttons & 4) === 4);
    const isNewTabIntent = isMiddleClickDirect || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (isNewTabIntent) {
      return; // Yeni sekme niyeti var, intercept yapma
    }

    // Fallback: shouldSkipPreventDefault kontrolü
    try {
      const { shouldSkipPreventDefault } = await import('./link-handler.js');
      if (shouldSkipPreventDefault && shouldSkipPreventDefault(event, link)) {
        return; // Yeni sekme niyeti var, intercept yapma
      }
    } catch (err) {
      // Import başarısız, devam et
    }

    // Only intercept internal links
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('#')) {
      return;
    }

    const intercepted = await interceptPremiumLink(event, href);
    if (intercepted) {
      logger.info('Link intercepted', { href });
    }
  }, true); // Capture phase

  logger.end();
}

