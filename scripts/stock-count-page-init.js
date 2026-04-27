/**
 * Stock Count Page Initialization
 * Teklifbul Rule v1.0 - CSP uyumlu header initialization
 */

// Global error handlers
window.addEventListener('error', (e) => {
  // Error logging handled by logger module
});
window.addEventListener('unhandledrejection', (e) => {
  // Error logging handled by logger module
});

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Toast Notification System
import { toast } from '../src/shared/ui/toast.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '../src/shared/constants/messages.js';
// Teklifbul Rule v1.0 - Auth Guard (tek kaynaktan yönlendirme)
import { initGlobalHeader } from '../assets/js/ui/header.js';

// Teklifbul Rule v1.0 - Toast'u global scope'a ekle (onclick attribute'ları için)
window.toast = toast;

// Initialize global header
initGlobalHeader({ mount: '#app-header', activeRoute: 'inventory' });
