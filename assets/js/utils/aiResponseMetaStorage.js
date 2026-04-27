/**
 * AI Response Meta Storage
 * Teklifbul Rule v3.19 - Store last AI response meta for debug visibility
 * 
 * Admin-only utility to track last AI response metadata for debugging
 */

// Global storage for last AI response meta (admin only)
let lastAiResponseMeta = null;

/**
 * Store last AI response meta
 * Teklifbul Rule v3.19 - Capture response meta
 */
export function storeLastAiResponseMeta(meta) {
  if (typeof window !== 'undefined' && window.__TB_IS_ADMIN === true) {
    lastAiResponseMeta = {
      ...meta,
      capturedAt: new Date().toISOString(),
    };
  }
}

/**
 * Get last AI response meta
 * Teklifbul Rule v3.19 - Retrieve stored meta
 */
export function getLastAiResponseMeta() {
  return lastAiResponseMeta;
}

/**
 * Clear stored meta
 */
export function clearLastAiResponseMeta() {
  lastAiResponseMeta = null;
}

