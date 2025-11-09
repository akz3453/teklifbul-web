/**
 * Firestore Listener Manager
 * Centralized listener management with automatic cleanup
 * Teklifbul Rule v1.0 - Performance optimization
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';

let activeListeners = new Map();
let isPageVisible = true;

// Track page visibility to pause listeners when tab is hidden
document.addEventListener('visibilitychange', () => {
  isPageVisible = !document.hidden;
  if (!isPageVisible) {
    logger.info('Page hidden - listeners paused');
  } else {
    logger.info('Page visible - listeners resumed');
  }
});

/**
 * Register a listener with automatic cleanup
 * @param {string} id - Unique identifier for the listener
 * @param {Function} unsubscribe - Function to call to unsubscribe
 */
export function registerListener(id, unsubscribe) {
  // Cleanup existing listener with same ID
  if (activeListeners.has(id)) {
    const oldUnsubscribe = activeListeners.get(id);
    try {
      oldUnsubscribe();
    } catch (e) {
      logger.warn(`Error cleaning up old listener ${id}`, e);
    }
  }
  
  activeListeners.set(id, unsubscribe);
  logger.info(`Listener registered: ${id}`, { total: activeListeners.size });
}

/**
 * Unregister a specific listener
 * @param {string} id - Unique identifier for the listener
 */
export function unregisterListener(id) {
  if (activeListeners.has(id)) {
    const unsubscribe = activeListeners.get(id);
    try {
      unsubscribe();
      activeListeners.delete(id);
      logger.info(`Listener unregistered: ${id}`, { total: activeListeners.size });
    } catch (e) {
      logger.warn(`Error unregistering listener ${id}`, e);
      activeListeners.delete(id);
    }
  }
}

/**
 * Cleanup all active listeners
 */
export function cleanupAllListeners() {
  logger.info(`Cleaning up ${activeListeners.size} listeners...`);
  activeListeners.forEach((unsubscribe, id) => {
    try {
      unsubscribe();
      logger.info(`Cleaned up listener: ${id}`);
    } catch (e) {
      logger.warn(`Error cleaning up listener ${id}`, e);
    }
  });
  activeListeners.clear();
  logger.info('All listeners cleaned up');
}

/**
 * Get count of active listeners
 */
export function getListenerCount() {
  return activeListeners.size;
}

// Auto-cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupAllListeners();
});

// Cleanup on page hide (for SPA navigation)
window.addEventListener('pagehide', () => {
  cleanupAllListeners();
});

// Export for debugging
window.__listenerManager = {
  getCount: getListenerCount,
  cleanup: cleanupAllListeners,
  list: () => Array.from(activeListeners.keys())
};

