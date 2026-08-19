/**
 * PWA Install Prompt
 * Teklifbul Rule v1.0 - PWA yükleme bildirimi ve yönetimi
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';
import { MESSAGES } from '../../src/shared/constants/messages.js';
import { isNativePlatform } from './utils/is-native-platform.js';

let deferredPrompt = null;
let installPromptShown = false;
const PWA_INSTALL_MOUNT_TIMEOUT_MS = 15000;

/**
 * PWA install prompt'u başlatır
 */
export function initPWAInstall() {
  // Teklifbul Rule v1.0 - PWA install prompt yönetimi
  if (isNativePlatform()) {
    return;
  }

  // beforeinstallprompt event'i dinle
  window.addEventListener('beforeinstallprompt', (e) => {
    deferredPrompt = e;
    logger.debug('PWA install prompt hazır');

    if (!installPromptShown && !isPWAInstalled()) {
      showInstallPrompt();
    }
  });

  // PWA yüklendikten sonra
  window.addEventListener('appinstalled', () => {
    logger.debug('PWA başarıyla yüklendi');
    toast.success(MESSAGES.SUCCESS_PWA_INSTALLED);
    deferredPrompt = null;
    installPromptShown = true;

    // Install butonunu gizle
    hideInstallButton();
  });
}

function findInstallButtonMount() {
  return document.querySelector('.topbar-right')
    || document.querySelector('.header-actions')
    || document.querySelector('#app-header .topbar');
}

function mountInstallButton(installBtn) {
  const mount = findInstallButtonMount();
  if (!mount) return false;
  if (installBtn.parentElement !== mount) {
    mount.insertBefore(installBtn, mount.firstChild);
  }
  return true;
}

/**
 * PWA yükleme butonunu gösterir
 */
function showInstallPrompt() {
  let installBtn = document.getElementById('pwa-install-btn');

  if (!installBtn) {
    installBtn = document.createElement('button');
    installBtn.id = 'pwa-install-btn';
    installBtn.type = 'button';
    installBtn.className = 'pwa-install-btn';
    installBtn.innerHTML = `
      <span class="pwa-install-icon">📱</span>
      <span class="pwa-install-text">Uygulamayı Yükle</span>
    `;
    installBtn.setAttribute('aria-label', 'Teklifbul uygulamasını yükle');
    installBtn.setAttribute('title', 'Teklifbul uygulamasını yükle');
    installBtn.addEventListener('click', handleInstallClick);
  }

  if (!mountInstallButton(installBtn)) {
    const observer = new MutationObserver(() => {
      if (mountInstallButton(installBtn)) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), PWA_INSTALL_MOUNT_TIMEOUT_MS);
  }

  installBtn.style.display = 'flex';
  installPromptShown = true;
}

/**
 * Install butonunu gizler
 */
function hideInstallButton() {
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
}

/**
 * Install butonuna tıklama işleyicisi
 */
async function handleInstallClick() {
  if (!deferredPrompt) {
    logger.debug('Install prompt mevcut değil');
    toast.info(MESSAGES.INFO_PWA_ALREADY_INSTALLED);
    return;
  }

  try {
    // Prompt'u göster
    deferredPrompt.prompt();

    // Kullanıcının seçimini bekle
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      logger.debug('Kullanıcı PWA yüklemeyi kabul etti');
      toast.success(MESSAGES.INFO_PWA_INSTALLING);
    } else {
      logger.debug('Kullanıcı PWA yüklemeyi reddetti');
      toast.info(MESSAGES.INFO_PWA_INSTALL_CANCELLED);
    }

    deferredPrompt = null;
    hideInstallButton();
  } catch (error) {
    logger.error('PWA install hatası', error);
    toast.error(MESSAGES.ERROR_PWA_INSTALL);
  }
}

/**
 * PWA'nın yüklü olup olmadığını kontrol eder
 * @returns {boolean}
 */
export function isPWAInstalled() {
  // Standalone modda mı çalışıyor?
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  
  // iOS Safari için kontrol
  if (window.navigator.standalone === true) {
    return true;
  }
  
  return false;
}

/**
 * Manuel install butonu gösterir (kullanıcı isterse)
 */
export function showManualInstallButton() {
  if (isPWAInstalled()) {
    toast.info(MESSAGES.INFO_PWA_ALREADY_INSTALLED_ALT);
    return;
  }
  
  showInstallPrompt();
}

// CSS stilleri (inline veya ayrı dosyada)
const style = document.createElement('style');
style.textContent = `
  .pwa-install-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-accent, #2563EB);
    color: white;
    border: none;
    border-radius: var(--radius-md, 0.5rem);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast, 0.2s);
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
  }
  
  .pwa-install-btn:hover {
    background: var(--color-accent-dark, #1d4ed8);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(37, 99, 235, 0.3);
  }
  
  .pwa-install-btn:active {
    transform: translateY(0);
  }
  
  .pwa-install-icon {
    font-size: 1.125rem;
  }
  
  .pwa-install-text {
    white-space: nowrap;
  }
  
  @media (max-width: 768px) {
    .pwa-install-btn {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }
    
    .pwa-install-text {
      display: none;
    }
  }
`;

document.head.appendChild(style);

