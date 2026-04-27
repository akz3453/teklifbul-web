/**
 * UI Error Handling and Empty State Components
 * Provides consistent error handling and empty state rendering across the application
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';

/**
 * Handle errors with consistent UI feedback
 * @param {Error} error - The error object
 * @param {Object} options - Additional options
 * @param {string} options.context - Context where error occurred
 * @param {boolean} options.showToast - Whether to show toast notification
 * @param {Function} options.onRetry - Retry function
 */
export function handleError(error, options = {}) {
  const {
    context = 'Unknown',
    showToast = true,
    onRetry = null
  } = options;

  logger.error(`Error in ${context}`, error);

  // Extract meaningful error message
  let errorMessage = 'Beklenmeyen bir hata oluştu';
  
  // Teklifbul Rule v1.0 - Network error handling
  // Check for network/internet connection errors first
  if (error.message && (
    error.message.includes('Network Error') || 
    error.message.includes('Failed to fetch') || 
    error.message.includes('ECONNABORTED') ||
    error.message.includes('timeout') ||
    error.message.includes('ERR_NETWORK') ||
    error.code === 'ECONNABORTED' ||
    error.code === 'ERR_NETWORK'
  )) {
    errorMessage = 'İnternet bağlantısı hatası. Lütfen bağlantınızı kontrol edin ve tekrar deneyin.';
  } else if (error.userMessage) {
    // Use user-friendly message from API interceptor
    errorMessage = error.userMessage;
  } else if (error.code) {
    switch (error.code) {
      case 'permission-denied':
        errorMessage = 'Bu işlem için yetkiniz bulunmuyor';
        break;
      case 'not-found':
        errorMessage = 'Aranan kayıt bulunamadı';
        break;
      case 'unavailable':
        errorMessage = 'Servis geçici olarak kullanılamıyor';
        break;
      case 'failed-precondition':
        errorMessage = 'İşlem için gerekli koşullar sağlanamadı';
        break;
      case 'resource-exhausted':
        errorMessage = 'Sistem yoğunluğu nedeniyle işlem gerçekleştirilemedi';
        break;
      case 'unauthenticated':
        errorMessage = 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın';
        break;
      default:
        errorMessage = error.message || 'Beklenmeyen bir hata oluştu';
    }
  } else if (error.message) {
    errorMessage = error.message;
  }

  // Check for Firestore index errors
  if (error.message && error.message.includes('index')) {
    return handleIndexError(error, context);
  }

  // Show toast notification if enabled
  if (showToast) {
    showToastNotification(errorMessage, 'error');
  }

  // Return error info for further handling
  return {
    message: errorMessage,
    code: error.code,
    context,
    onRetry
  };
}

/**
 * Handle Firestore index errors with helpful instructions
 * @param {Error} error - The index error
 * @param {string} context - Context where error occurred
 */
function handleIndexError(error, context) {
  const errorMessage = 'Veritabanı indeksi eksik. Lütfen aşağıdaki adımları takip edin:';
  
  const indexInstructions = `
    <div style="text-align: left; margin: 16px 0;">
      <h4>🔧 İndeks Oluşturma Adımları:</h4>
      <ol style="margin: 8px 0; padding-left: 20px;">
        <li>Firebase Console'a gidin</li>
        <li>Firestore Database > Indexes bölümüne gidin</li>
        <li>Hata mesajındaki indeksi oluşturun</li>
        <li>İndeks oluştuktan sonra sayfayı yenileyin</li>
      </ol>
      <p style="margin: 8px 0; font-size: 12px; color: #6b7280;">
        İndeks oluşturma işlemi birkaç dakika sürebilir.
      </p>
    </div>
  `;

  showModal('İndeks Hatası', errorMessage + indexInstructions, [
    {
      text: 'Tamam',
      class: 'btn-primary',
      action: () => closeModal()
    },
    {
      text: 'Firebase Console\'a Git',
      class: 'btn-secondary',
      action: () => {
        window.open('https://console.firebase.google.com/', '_blank');
        closeModal();
      }
    }
  ]);

  return {
    message: errorMessage,
    code: 'index-missing',
    context,
    isIndexError: true
  };
}

/**
 * Render empty state with consistent styling
 * @param {HTMLElement} target - Target element to render into
 * @param {string} message - Empty state message
 * @param {Object} options - Additional options
 * @param {string} options.icon - Icon to display
 * @param {string} options.actionText - Action button text
 * @param {Function} options.onAction - Action button callback
 */
export function renderEmptyState(target, message, options = {}) {
  const {
    icon = '📭',
    actionText = null,
    onAction = null,
    subMessage = null
  } = options;

  if (!target) {
    logger.warn('Empty state target element not found');
    return;
  }

  const emptyStateHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3 class="empty-state-title">${message}</h3>
      ${subMessage ? `<p class="empty-state-subtitle">${subMessage}</p>` : ''}
      ${actionText && onAction ? `
        <button class="btn btn-primary empty-state-action" onclick="(${onAction.toString()})()">
          ${actionText}
        </button>
      ` : ''}
    </div>
  `;

  target.innerHTML = emptyStateHTML;
}

/**
 * Show loading state
 * @param {HTMLElement} target - Target element
 * @param {string} message - Loading message
 */
export function showLoadingState(target, message = 'Yükleniyor...') {
  if (!target) return;

  target.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p class="loading-message">${message}</p>
    </div>
  `;
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds
 */
export function showToastNotification(message, type = 'info', duration = 5000) {
  // Remove existing toasts
  const existingToasts = document.querySelectorAll('.toast');
  existingToasts.forEach(toast => toast.remove());

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${getToastIcon(type)}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  // Add styles if not already added
  if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 300px;
        max-width: 500px;
        animation: slideInRight 0.3s ease-out;
      }
      .toast-content {
        display: flex;
        align-items: center;
        padding: 16px;
        gap: 12px;
      }
      .toast-icon {
        font-size: 20px;
      }
      .toast-message {
        flex: 1;
        font-size: 14px;
        color: #374151;
      }
      .toast-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .toast-close:hover {
        color: #374151;
      }
      .toast-success {
        border-left: 4px solid #10b981;
      }
      .toast-error {
        border-left: 4px solid #ef4444;
      }
      .toast-warning {
        border-left: 4px solid #f59e0b;
      }
      .toast-info {
        border-left: 4px solid #3b82f6;
      }
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Auto remove after duration
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

/**
 * Get appropriate icon for toast type
 * @param {string} type - Toast type
 * @returns {string} Icon
 */
function getToastIcon(type) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  return icons[type] || icons.info;
}

/**
 * Show modal dialog
 * @param {string} title - Modal title
 * @param {string} content - Modal content (HTML)
 * @param {Array} buttons - Array of button objects
 */
export function showModal(title, content, buttons = []) {
  // Remove existing modals
  const existingModals = document.querySelectorAll('.modal-overlay');
  existingModals.forEach(modal => modal.remove());

  // Teklifbul Rule v1.0 - A11Y: Unique ID for modal
  const modalId = `modal-${Date.now()}`;
  const titleId = `modal-title-${Date.now()}`;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', titleId);
  modal.innerHTML = `
    <div class="modal" id="${modalId}">
      <div class="modal-header">
        <h3 class="modal-title" id="${titleId}">${title}</h3>
        <button class="modal-close" onclick="closeModal()" aria-label="Modalı kapat">×</button>
      </div>
      <div class="modal-content">
        ${content}
      </div>
      <div class="modal-footer">
        ${buttons.map(btn => `
          <button class="btn ${btn.class || 'btn-secondary'}" onclick="(${btn.action.toString()})()">
            ${btn.text}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Add styles if not already added
  if (!document.querySelector('#modal-styles')) {
    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .modal {
        background: white;
        border-radius: 8px;
        max-width: 500px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
      }
      .modal-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #111827;
      }
      .modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-close:hover {
        color: #374151;
      }
      .modal-content {
        padding: 20px;
      }
      .modal-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        padding: 20px;
        border-top: 1px solid #e5e7eb;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);

  // Teklifbul Rule v1.0 - A11Y: Focus trap ve ESC tuşu desteği
  const modalContent = modal.querySelector('.modal');
  const focusableElements = modalContent.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // İlk focusable element'e focus et
  if (firstFocusable) {
    setTimeout(() => firstFocusable.focus(), 100);
  }

  // ESC tuşu ile kapatma
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // Tab tuşu ile focus trap
  const handleTab = (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab (geri)
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      // Tab (ileri)
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  };
  modalContent.addEventListener('keydown', handleTab);

  // Overlay tıklama ile kapatma
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Make closeModal globally available
  window.closeModal = () => {
    document.removeEventListener('keydown', handleEsc);
    modal.remove();
    delete window.closeModal;
  };
}

/**
 * Add error handling to data loading functions
 * @param {Function} loadFunction - Function that loads data
 * @param {HTMLElement} targetElement - Element to show errors in
 * @param {Object} options - Additional options
 */
export function withErrorHandling(loadFunction, targetElement, options = {}) {
  return async (...args) => {
    try {
      showLoadingState(targetElement, options.loadingMessage);
      const result = await loadFunction(...args);
      return result;
    } catch (error) {
      const errorInfo = handleError(error, {
        context: options.context || 'Data loading',
        showToast: options.showToast !== false
      });

      if (targetElement) {
        renderEmptyState(targetElement, errorInfo.message, {
          icon: '❌',
          actionText: errorInfo.onRetry ? 'Tekrar Dene' : null,
          onAction: errorInfo.onRetry
        });
      }

      throw error;
    }
  };
}
