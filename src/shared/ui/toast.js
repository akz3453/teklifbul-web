// Teklifbul Rule v1.0 - Toast Bildirim Sistemi
// Tüm async işlemler (try/catch) kullanıcıya toast bildirimi verecek

// Teklifbul Rule v1.0 - Constants import
import { TOAST_COLORS } from '../constants/colors.js';
import { TOAST_TIMING } from '../constants/timing.js';
import { TOAST_UI } from '../constants/ui.js';
import { MESSAGES } from '../constants/messages.js';

// Basit toast implementasyonu
const createToast = (messageOrKey, type = 'info') => {
  // Resolve message: allow passing either a message string or a MESSAGES key
  const message = (typeof messageOrKey === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, messageOrKey))
    ? MESSAGES[messageOrKey]
    : messageOrKey;

  if (typeof document === 'undefined') {
    // SSR ortamında logger kullan (eğer mevcut değilse sessizce geç)
    // Not: toast.js logger'dan bağımsız olmalı (circular dependency önlemek için)
    // Bu durumda SSR'da toast gösterilemez, bu normal
    return;
  }
  
  // Teklifbul Rule v1.0 - Renk seçimi constants'tan
  const backgroundColor = type === 'error' ? TOAST_COLORS.ERROR 
    : type === 'success' ? TOAST_COLORS.SUCCESS 
    : type === 'warn' ? TOAST_COLORS.WARNING 
    : TOAST_COLORS.INFO;
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: ${TOAST_UI.POSITION.TOP};
    right: ${TOAST_UI.POSITION.RIGHT};
    padding: ${TOAST_UI.PADDING};
    background: ${backgroundColor};
    color: white;
    border-radius: ${TOAST_UI.BORDER_RADIUS};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: ${TOAST_UI.Z_INDEX};
    font-size: ${TOAST_UI.FONT_SIZE};
    max-width: ${TOAST_UI.MAX_WIDTH};
    animation: slideIn ${TOAST_UI.ANIMATION_DURATION} ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = `slideOut ${TOAST_UI.ANIMATION_DURATION} ease-in`;
    setTimeout(() => toast.remove(), TOAST_TIMING.ANIMATION_DURATION);
  }, TOAST_TIMING.DURATION);
};

// CSS animasyonları ekle (sadece bir kez)
if (typeof document !== 'undefined' && !document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
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
  warn: (msg) => createToast(msg, 'warn')
};

