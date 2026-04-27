/**
 * Frontend Error Reporter Utility
 * Teklifbul Rule v1.0 - Client Error Reporting v1
 * 
 * Frontend runtime hataları otomatik yakalar ve POST /api/client-errors'a gönderir
 */

import { logger } from '../../../src/shared/log/logger.js';

/**
 * Get or create session ID
 */
function getSessionId() {
  const STORAGE_KEY = 'tb_session_id';
  let sessionId = localStorage.getItem(STORAGE_KEY);
  
  if (!sessionId) {
    // Generate new session ID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      // Fallback: random string
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  
  return sessionId;
}

/**
 * Generate fingerprint (SHA256 hash)
 */
async function generateFingerprint(message, stack, route) {
  try {
    const input = `${message}|${stack || ''}|${route || ''}`;
    
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex.substring(0, 32); // First 32 chars
    } else {
      // Fallback: simple hash
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36).substring(0, 32);
    }
  } catch (error) {
    logger.warn('Fingerprint generation failed', error);
    // Fallback: simple hash
    const input = `${message}|${stack || ''}|${route || ''}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 32);
  }
}

/**
 * Check if error should be reported (throttle/dedupe)
 */
function shouldReportError(fingerprint) {
  const STORAGE_KEY = `tb_err_last_${fingerprint}`;
  const THROTTLE_MS = 60 * 1000; // 60 seconds
  
  const lastReported = localStorage.getItem(STORAGE_KEY);
  if (lastReported) {
    const lastReportedTime = parseInt(lastReported, 10);
    const now = Date.now();
    if (now - lastReportedTime < THROTTLE_MS) {
      return false; // Too soon, skip
    }
  }
  
  // Update timestamp
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
  
  // Clean old entries (optional, to prevent localStorage bloat)
  // This is a simple cleanup - could be improved
  try {
    const keys = Object.keys(localStorage);
    const oldKeys = keys.filter(k => k.startsWith('tb_err_last_') && 
      (Date.now() - parseInt(localStorage.getItem(k) || '0', 10)) > (24 * 60 * 60 * 1000)); // 24 hours
    oldKeys.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    // Ignore cleanup errors
  }
  
  return true;
}

/**
 * Check if error should be sampled (production sampling)
 */
function shouldSample() {
  // Check if dev mode
  const isDev = 
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    (typeof window !== 'undefined' && window.__ENV && window.__ENV === 'development') ||
    (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development');
  
  if (isDev) {
    return true; // Always report in dev
  }
  
  // Production: sample rate
  const sampleRate = parseFloat(window.ERROR_REPORT_SAMPLE || '0.3');
  return Math.random() < sampleRate;
}

/**
 * Report error to backend
 */
async function reportError(error, source = 'window.onerror') {
  try {
    // Get error details
    const message = error.message || String(error) || 'Unknown error';
    const stack = error.stack || error.error?.stack || null;
    const pageUrl = window.location.href;
    const route = window.location.pathname;
    const userAgent = navigator.userAgent;
    const release = window.APP_VERSION || 'dev';
    
    // Generate fingerprint
    const fingerprint = await generateFingerprint(message, stack, route);
    
    // Check throttle/dedupe
    if (!shouldReportError(fingerprint)) {
      logger.debug('Error report throttled', { fingerprint, message });
      return;
    }
    
    // Check sampling
    if (!shouldSample()) {
      logger.debug('Error report sampled out', { fingerprint, message });
      return;
    }
    
    // Get session ID
    const sessionId = getSessionId();
    
    // Prepare payload
    const payload = {
      sessionId,
      severity: 'error',
      message: message.substring(0, 500), // Max 500 chars
      stack: stack ? stack.substring(0, 4000) : null, // Max 4000 chars
      pageUrl: pageUrl.substring(0, 800), // Max 800 chars
      route: route.substring(0, 200), // Max 200 chars
      userAgent: userAgent.substring(0, 400), // Max 400 chars
      release: release.substring(0, 50), // Max 50 chars
      meta: {
        source: source
      },
      fingerprint
    };
    
    // Send to backend (plain fetch, no authFetch to avoid loop)
    const response = await fetch('/api/client-errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      logger.warn('Error report failed', {
        status: response.status,
        statusText: response.statusText
      });
    } else {
      logger.debug('Error reported successfully', { fingerprint, message });
    }
  } catch (reportError) {
    // Silent fail - don't break user experience
    logger.warn('Error reporting failed', reportError);
  }
}

/**
 * Initialize error reporter
 * Teklifbul Rule v1.0 - Client Error Reporting v1
 */
export function initErrorReporter() {
  // Guard: only init once
  if (window.__errorReporterInited) {
    return;
  }
  window.__errorReporterInited = true;
  
  logger.info('Error reporter initialized');
  
  // Window error handler
  window.addEventListener('error', (event) => {
    const error = {
      message: event.message || 'Unknown error',
      stack: event.error?.stack || null,
      error: event.error
    };
    reportError(error, 'window.onerror');
  });
  
  // Unhandled rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const error = {
      message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
      stack: event.reason?.stack || null,
      error: event.reason
    };
    reportError(error, 'unhandledrejection');
  });
  
  logger.info('Error reporter event listeners attached');
}

