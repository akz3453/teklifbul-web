/**
 * Provider Packages Navigation Helper
 * Teklifbul Rule v3.17 - Shared helper for scrolling to provider-specific package sections
 * 
 * Usage:
 *   import { scrollToProviderPackages } from './utils/providerPackagesNav.js';
 *   scrollToProviderPackages('openai', { highlightMs: 2000 });
 */

import { logger } from '../../../src/shared/log/logger.js';

/**
 * Scroll to provider packages section and highlight it
 * Teklifbul Rule v3.17 - Provider-aware navigation
 * 
 * @param {string} providerKey - Provider key (e.g., 'openai', 'gemini')
 * @param {Object} options - Options
 * @param {number} options.highlightMs - Highlight duration in milliseconds (default: 2000)
 */
export function scrollToProviderPackages(providerKey, { highlightMs = 2000 } = {}) {
  if (!providerKey) {
    logger.warn('[ProviderNav] No providerKey provided');
    return;
  }
  
  // Normalize providerKey
  const normalizedKey = String(providerKey || '').toLowerCase().trim();
  if (!normalizedKey) {
    logger.warn('[ProviderNav] Invalid providerKey', { providerKey });
    return;
  }
  
  // Find provider section by data attribute
  const selector = `[data-provider-key="${normalizedKey}"], [data-provider="${normalizedKey}"]`;
  const section = document.querySelector(selector);
  
  if (!section) {
    logger.warn('[ProviderNav] Provider section not found', { providerKey: normalizedKey, selector });
    // Fallback: scroll to packages list
    const packagesList = document.getElementById('pa_packages_list');
    if (packagesList) {
      packagesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      logger.info('[ProviderNav] Scrolled to packages list (fallback)');
    }
    return;
  }
  
  // Scroll to section
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  logger.info('[ProviderNav] Scrolled to provider section', { providerKey: normalizedKey });
  
  // Add temporary highlight
  const originalBg = section.style.backgroundColor;
  const originalTransition = section.style.transition;
  
  section.style.transition = 'background-color 0.3s ease';
  section.style.backgroundColor = '#fef3c7'; // Yellow highlight
  
  // Remove highlight after delay
  setTimeout(() => {
    section.style.backgroundColor = originalBg || '';
    if (highlightMs > 0) {
      // Restore transition after highlight
      setTimeout(() => {
        section.style.transition = originalTransition || '';
      }, 300);
    }
  }, highlightMs);
}

