/**
 * Teklifbul Cookie Consent Banner
 * Handles cookie consent display, storage, and granular preferences
 */

import { logger } from '../../src/shared/log/logger.js';
import { getLegalCatalog } from './utils/legal-consent.js';

const COOKIE_CONSENT_KEY = 'cookieConsent';
const COOKIE_CONSENT_EVENT = 'cookie-consent-updated';

/**
 * Get current cookie preferences
 * @returns {Object|null}
 */
export function getCookiePreferences() {
  const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
  if (!stored) return null;

  try {
    // Check if it's the old format ('accepted'/'rejected')
    if (stored === 'accepted') {
      return {
        necessary: true,
        functional: true,
        analytics: true,
        marketing: true,
        timestamp: new Date().toISOString()
      };
    }
    if (stored === 'rejected') {
      return {
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString()
      };
    }

    // Parse JSON format
    return JSON.parse(stored);
  } catch (e) {
    logger.error('Error parsing cookie preferences', e);
    return null;
  }
}

/**
 * Check if user has given consent (any valid preference saved)
 * @returns {boolean}
 */
export function hasConsent() {
  return !!getCookiePreferences();
}

/**
 * Check if consent should be shown
 * @returns {boolean}
 */
export function shouldShowBanner() {
  return !hasConsent();
}

/**
 * Check if a specific category is allowed
 * @param {string} category - 'necessary', 'functional', 'analytics', 'marketing'
 * @returns {boolean}
 */
export function isCategoryAllowed(category) {
  if (category === 'necessary') return true;
  const prefs = getCookiePreferences();
  return prefs ? !!prefs[category] : false;
}

/**
 * Should load non-essential cookies (analytics, etc.)
 * Backward compatibility wrapper
 * @returns {boolean}
 */
export function shouldLoadNonEssentialCookies() {
  return isCategoryAllowed('analytics') || isCategoryAllowed('marketing');
}

/**
 * Create and show cookie banner
 */
function createCookieBanner() {
  // Check if banner already exists
  if (document.getElementById('cookie-banner')) {
    return;
  }

  // Check if consent already given
  if (!shouldShowBanner()) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.className = 'cookie-banner';

  banner.innerHTML = `
    <div class="cookie-banner-content">
      <div class="cookie-banner-text">
        <p data-i18n="cookie.text"></p>
      </div>
      <div class="cookie-banner-actions">
        <button class="btn btn-primary btn-sm" id="cookie-accept" data-i18n="cookie.accept"></button>
        <button class="btn btn-outline btn-sm" id="cookie-settings" data-i18n="cookie.settings"></button>
        <button class="btn btn-outline btn-sm" id="cookie-reject" data-i18n="cookie.reject"></button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Apply translations
  setTimeout(() => {
    import('./i18n.js').then(({ setLanguage }) => {
      const currentLang = localStorage.getItem('lang') || 'tr';
      setLanguage(currentLang);
    });
  }, 50);

  // Show banner with animation
  setTimeout(() => {
    banner.classList.add('show');
    syncBannerOffset();
  }, 200);

  // Accept button
  document.getElementById('cookie-accept').addEventListener('click', () => {
    acceptAllCookies();
  });

  // Reject button
  document.getElementById('cookie-reject').addEventListener('click', () => {
    rejectAllCookies();
  });

  // Settings button
  document.getElementById('cookie-settings').addEventListener('click', () => {
    showCookieSettingsModal();
  });
}

/**
 * Show Cookie Settings Modal
 */
function showCookieSettingsModal() {
  // Check if modal already exists
  if (document.getElementById('cookie-modal')) return;

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'cookie-modal';
  modalOverlay.className = 'cookie-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="cookie-modal">
      <div class="cookie-modal-header">
        <h3 data-i18n="cookie.preferences"></h3>
        <button class="cookie-modal-close">&times;</button>
      </div>
      <div class="cookie-modal-body">
        <p data-i18n="cookie.preferences.desc" class="cookie-modal-desc"></p>
        
        <div class="cookie-category">
          <div class="cookie-cat-info">
            <span class="cookie-cat-title" data-i18n="cookie.necessary"></span>
            <span class="cookie-cat-desc" data-i18n="cookie.necessary.desc"></span>
          </div>
          <div class="cookie-cat-control">
            <label class="toggle-switch disabled">
              <input type="checkbox" checked disabled>
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="cookie-category">
          <div class="cookie-cat-info">
            <span class="cookie-cat-title" data-i18n="cookie.functional"></span>
            <span class="cookie-cat-desc" data-i18n="cookie.functional.desc"></span>
          </div>
          <div class="cookie-cat-control">
            <label class="toggle-switch">
              <input type="checkbox" id="pref-functional">
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="cookie-category">
          <div class="cookie-cat-info">
            <span class="cookie-cat-title" data-i18n="cookie.analytics"></span>
            <span class="cookie-cat-desc" data-i18n="cookie.analytics.desc"></span>
          </div>
          <div class="cookie-cat-control">
            <label class="toggle-switch">
              <input type="checkbox" id="pref-analytics">
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="cookie-category">
          <div class="cookie-cat-info">
            <span class="cookie-cat-title" data-i18n="cookie.marketing"></span>
            <span class="cookie-cat-desc" data-i18n="cookie.marketing.desc"></span>
          </div>
          <div class="cookie-cat-control">
            <label class="toggle-switch">
              <input type="checkbox" id="pref-marketing">
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="cookie-modal-footer">
        <button class="btn btn-primary" id="cookie-save-prefs" data-i18n="cookie.save"></button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Apply translations
  import('./i18n.js').then(({ t }) => {
    // Manual apply because dynamic content might be missed by init
    const elements = modalOverlay.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
  });

  // Close logic
  const closeBtn = modalOverlay.querySelector('.cookie-modal-close');
  closeBtn.addEventListener('click', () => {
    modalOverlay.remove();
  });

  // Save logic
  const saveBtn = document.getElementById('cookie-save-prefs');
  saveBtn.addEventListener('click', () => {
    const preferences = {
      necessary: true,
      functional: document.getElementById('pref-functional').checked,
      analytics: document.getElementById('pref-analytics').checked,
      marketing: document.getElementById('pref-marketing').checked,
      timestamp: new Date().toISOString()
    };
    saveCookiePreferences(preferences);
    modalOverlay.remove();
  });
}

/**
 * Public helper: open cookie settings modal on demand
 */
export function openCookieSettings() {
  showCookieSettingsModal();
}

/**
 * Save preferences and update UI
 * @param {Object} preferences 
 */
function saveCookiePreferences(preferences) {
  const catalog = getLegalCatalog();
  const stored = {
    ...preferences,
    policyVersion: catalog.policyVersion,
    cerezStatus: catalog.documents?.['cerez-politikasi']?.status || 'draft',
  };
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(stored));
  hideBanner();
  document.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: preferences }));

  if (preferences.analytics || preferences.marketing) {
    logger.info('Consent updated: Non-essential cookies allowed', preferences);
  }
}

/**
 * Accept all cookies
 */
function acceptAllCookies() {
  const allEnabled = {
    necessary: true,
    functional: true,
    analytics: true,
    marketing: true,
    timestamp: new Date().toISOString()
  };
  saveCookiePreferences(allEnabled);
}

/**
 * Reject all (except necessary)
 */
function rejectAllCookies() {
  const allDisabled = {
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    timestamp: new Date().toISOString()
  };
  saveCookiePreferences(allDisabled);
}

/**
 * Hide cookie banner
 */
function hideBanner() {
  const banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.classList.remove('show');
    document.body.style.paddingBottom = '';
    setTimeout(() => {
      banner.remove();
      syncBannerOffset();
    }, 300);
  }
}

function syncBannerOffset() {
  const banner = document.getElementById('cookie-banner');
  if (!banner || !banner.classList.contains('show')) {
    document.body.style.paddingBottom = '';
    return;
  }
  document.body.style.paddingBottom = `${banner.offsetHeight}px`;
}

/**
 * Initialize cookie consent system
 */
export function initCookieConsent() {
  if (shouldShowBanner()) {
    createCookieBanner();
    window.addEventListener('resize', syncBannerOffset);
  }
  import('./analytics.js').then(({ initAnalytics }) => initAnalytics()).catch(() => {});
}

/**
 * Subscribe to consent updates
 * @param {(preferences: object) => void} callback
 * @returns {() => void}
 */
export function onCookieConsentChange(callback) {
  if (typeof callback !== 'function') return () => {};

  const handler = (event) => {
    callback(event.detail || getCookiePreferences());
  };
  document.addEventListener(COOKIE_CONSENT_EVENT, handler);
  return () => document.removeEventListener(COOKIE_CONSENT_EVENT, handler);
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieConsent);
} else {
  initCookieConsent();
}

