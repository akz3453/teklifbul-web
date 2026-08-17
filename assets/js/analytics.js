/**
 * Teklifbul Rule v1.0 — GA4 (measurement ID is public; never send PII).
 */
import { isCategoryAllowed, onCookieConsentChange } from './cookieConsent.js';
import { logger } from '../../src/shared/log/logger.js';
import { sanitizeEventParams } from './analytics-params.js';

export const ANALYTICS_EVENTS = {
  PAGE_VIEW: 'page_view',
  SIGNUP: 'signup',
  LOGIN: 'login',
  COMPANY_CREATED: 'company_created',
  DEMAND_CREATED: 'demand_created',
  BID_CREATED: 'bid_created',
  BID_ACCEPTED: 'bid_accepted',
  PREMIUM_CLICK: 'premium_click',
  PRICING_VIEW: 'pricing_view',
  CONTACT: 'contact',
  DEMO_REQUEST: 'demo_request',
};

export { sanitizeEventParams } from './analytics-params.js';

let gtagLoaded = false;
let initStarted = false;
let pricingViewSent = false;

function measurementId() {
  try {
    const id = String(import.meta.env?.VITE_GA_MEASUREMENT_ID || '').trim();
    return /^G-[A-Z0-9]+$/i.test(id) ? id : '';
  } catch {
    return '';
  }
}

function loadGtag() {
  const id = measurementId();
  if (!id || gtagLoaded || typeof document === 'undefined') return;
  if (!isCategoryAllowed('analytics')) return;

  gtagLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    anonymize_ip: true,
    send_page_view: true,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  logger.info('GA4 loaded');
}

export function track(eventName, params = {}) {
  if (!eventName || typeof eventName !== 'string') return;
  if (!measurementId() || !isCategoryAllowed('analytics')) return;
  if (!gtagLoaded) loadGtag();
  if (typeof window.gtag !== 'function') return;
  const safe = sanitizeEventParams(params);
  window.gtag('event', eventName, safe);
}

export function initAnalytics() {
  if (initStarted) return;
  initStarted = true;
  if (!measurementId()) return;

  if (isCategoryAllowed('analytics')) {
    loadGtag();
  }
  onCookieConsentChange((prefs) => {
    if (prefs?.analytics) loadGtag();
  });
}

export function initLandingAnalytics() {
  initAnalytics();
  if (typeof document === 'undefined') return;

  document.querySelectorAll('a[href="/signup.html"], a[href="#premium"]').forEach((el) => {
    el.addEventListener('click', () => {
      const href = el.getAttribute('href') || '';
      if (href === '#premium' || (el.textContent || '').toLowerCase().includes('premium')) {
        track(ANALYTICS_EVENTS.PREMIUM_CLICK, { location: 'landing' });
      }
    });
  });

  const pricing = document.getElementById('premium');
  if (!pricing || typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (pricingViewSent) return;
      const hit = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.4);
      if (!hit) return;
      pricingViewSent = true;
      track(ANALYTICS_EVENTS.PRICING_VIEW);
      observer.disconnect();
    },
    { threshold: [0.4] }
  );
  observer.observe(pricing);
}
