// Teklifbul Rule v1.0 - Toast Bildirim Sistemi
// Tüm async işlemler (try/catch) kullanıcıya toast bildirimi verecek

// Teklifbul Rule v1.0 - Constants import
import { TOAST_COLORS } from '../constants/colors.js';
import { TOAST_TIMING } from '../constants/timing.js';
import { TOAST_UI } from '../constants/ui.js';
import { MESSAGES } from '../constants/messages.js';
// Teklifbul Rule v1.0 - Bundle Size: Dynamic import for confirm modal (lazy loading)

// Teklifbul Rule v1.0 - Stacking support
let toastContainer = null;

const getToastContainer = () => {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: ${TOAST_UI.POSITION.TOP};
    right: ${TOAST_UI.POSITION.RIGHT};
    z-index: ${TOAST_UI.Z_INDEX};
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    max-width: ${TOAST_UI.MAX_WIDTH};
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
};

// Basit toast implementasyonu
const createToast = (messageOrKey, type = 'info') => {
  const message = (typeof messageOrKey === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, messageOrKey))
    ? MESSAGES[messageOrKey]
    : messageOrKey;

  if (typeof document === 'undefined') return;
  
  const container = getToastContainer();
  
  const backgroundColor = type === 'error' ? TOAST_COLORS.ERROR 
    : type === 'success' ? TOAST_COLORS.SUCCESS 
    : type === 'warn' ? TOAST_COLORS.WARNING 
    : TOAST_COLORS.INFO;
  
  const toast = document.createElement('div');
  toast.className = `teklifbul-toast toast-${type}`;
  toast.style.cssText = `
    padding: ${TOAST_UI.PADDING};
    background: ${backgroundColor};
    color: white;
    border-radius: ${TOAST_UI.BORDER_RADIUS};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: ${TOAST_UI.FONT_SIZE};
    pointer-events: auto;
    animation: toast-slide-in ${TOAST_UI.ANIMATION_DURATION} ease-out forwards;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 200px;
    border-left: 4px solid rgba(0,0,0,0.2);
  `;

  // Add icon based on type
  const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
  const safeMessage = message || '';
  toast.innerHTML = `<span>${icon}</span><span style="flex: 1;">${safeMessage}</span>`;
  
  container.appendChild(toast);
  
  // Dynamic duration based on message length (min 4s, max 8s)
  const baseDuration = TOAST_TIMING.DURATION || 3000;
  const extraDuration = Math.min(safeMessage.length * 50, 5000);
  const totalDuration = baseDuration + extraDuration + 1000; // Added extra second for readability
  
  setTimeout(() => {
    toast.style.animation = `toast-slide-out ${TOAST_UI.ANIMATION_DURATION} ease-in forwards`;
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
        // If container is empty, we could remove it, but keeping it is fine
      }
    }, TOAST_TIMING.ANIMATION_DURATION || 300);
  }, totalDuration);
};

// CSS animasyonları ekle (sadece bir kez)
if (typeof document !== 'undefined' && !document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes toast-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toast-slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export const toast = {
  success: (msg) => createToast(msg, 'success'),
  error: (msg) => createToast(msg, 'error'),
  info: (msg) => createToast(msg, 'info'),
  warn: (msg) => createToast(msg, 'warn'),
  // Teklifbul Rule v1.0 - Bundle Size: Dynamic import for confirm modal
  confirm: async (message, confirmText, cancelText) => {
    const { showConfirmModal } = await import('./confirm-modal.js');
    return showConfirmModal(message, confirmText, cancelText);
  }
};