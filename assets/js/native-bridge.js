/**
 * Teklifbul Rule v1.0 — Capacitor native bridge
 * Native (Android/iOS) ortamda StatusBar, SplashScreen, App back-button,
 * Network offline overlay, Push init vb.
 */
import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';
import { MESSAGES } from '../../src/shared/constants/messages.js';
import { ROBOTO_IDLE_TIMEOUT_MS } from '../../src/shared/constants/timing.js';
import { APP_VERSION, APP_BUILD, NATIVE_SHELL_MODE } from '../../src/shared/constants/app-version.js';
import { resolveDeepLinkPath } from './utils/native-deep-link.js';

let nativeBridgeReady = false;
let lastBackPressAt = 0;
const BACK_EXIT_WINDOW_MS = 2000;
const LIVE_LOGIN_URL = 'https://teklifbul.web.app/login.html';

function isNativePlatform() {
  try {
    return typeof window !== 'undefined' && !!window.Capacitor;
  } catch {
    return false;
  }
}

/** Teklifbul Rule v1.0 — Roboto idle'da yüklenir; ilk boya system-ui ile yapılır */
function ensureRobotoFont() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('tb-roboto-font')) return;

  const load = () => {
    if (document.getElementById('tb-roboto-font')) return;
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    const link = document.createElement('link');
    link.id = 'tb-roboto-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap';
    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(link);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(load, { timeout: ROBOTO_IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(load, ROBOTO_IDLE_TIMEOUT_MS);
  }
}

function canNavigateBack() {
  try {
    const path = (window.location.pathname || '').toLowerCase();
    const isAppHome =
      path === '/' ||
      path === '/index.html' ||
      path === '/login.html' ||
      path === '/login' ||
      path === '/dashboard.html' ||
      path === '/dashboard' ||
      path === '/offline.html';
    if (isAppHome) return false;

    if (window.history.length > 1) return true;
    return false;
  } catch {
    return false;
  }
}

function ensureViewportFitCover() {
  try {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    const content = meta.getAttribute('content') || 'width=device-width, initial-scale=1';
    if (!/viewport-fit\s*=/.test(content)) {
      meta.setAttribute('content', `${content}, viewport-fit=cover`);
    }
  } catch {
    // ignore
  }
}

/** Teklifbul Rule v1.0 — Açık overlay / klavye varsa geri ile kapat */
function dismissNativeUiLayer() {
  try {
    const header = document.getElementById('app-header');
    if (header?.classList.contains('is-mobile-open')) {
      header.querySelector('#mobileMenuToggle')?.click();
      return true;
    }
    const openMenu = header?.querySelector('.nav-item.has-dropdown.is-open');
    if (openMenu) {
      openMenu.classList.remove('is-open');
      const parentLink = openMenu.querySelector(':scope > .nav-link');
      parentLink?.setAttribute('aria-expanded', 'false');
      return true;
    }

    const offline = document.getElementById('tb-native-offline');
    if (offline && offline.style.display !== 'none') {
      // Geri: offline kapat (bağlantı yoksa yeniden gösterilir); çıkışı engelle
      offline.style.display = 'none';
      document.documentElement.classList.remove('is-native-offline');
      return true;
    }

    const aiPanel = document.getElementById('ai-assistant-panel');
    if (aiPanel && aiPanel.classList.contains('open')) {
      aiPanel.classList.remove('open');
      document.getElementById('ai-assistant-toggle')?.classList.remove('active');
      if (window.__TB_AI_ASSISTANT__) {
        window.__TB_AI_ASSISTANT__.isOpen = false;
      }
      document.activeElement?.blur?.();
      return true;
    }

    const tokensModal = document.getElementById('tb-insufficient-tokens-modal');
    if (tokensModal && tokensModal.getAttribute('aria-hidden') !== 'true') {
      const isVisible =
        tokensModal.classList.contains('open') ||
        tokensModal.classList.contains('show') ||
        (tokensModal.style.display && tokensModal.style.display !== 'none');
      if (isVisible) {
        tokensModal.classList.remove('open', 'show');
        tokensModal.style.display = 'none';
        tokensModal.setAttribute('aria-hidden', 'true');
        document.activeElement?.blur?.();
        return true;
      }
    }

    const openModal = document.querySelector(
      '.modal.open, .modal.show, [data-modal].open, dialog[open], .tb-modal.open'
    );
    if (openModal) {
      openModal.classList?.remove('open', 'show');
      if (typeof openModal.close === 'function') {
        openModal.close();
      } else if (openModal instanceof HTMLElement) {
        openModal.style.display = 'none';
        openModal.setAttribute('aria-hidden', 'true');
      }
      document.activeElement?.blur?.();
      return true;
    }

    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable)
    ) {
      active.blur();
      return true;
    }
  } catch (err) {
    logger.warn('dismissNativeUiLayer hata', err);
  }
  return false;
}

function ensureOfflineOverlay() {
  let el = document.getElementById('tb-native-offline');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'tb-native-offline';
  el.className = 'tb-native-offline';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  el.style.display = 'none';
  el.innerHTML = `
    <div class="tb-native-offline__card">
      <img class="tb-native-offline__logo" src="/assets/images/brand/nefisoft-web-stacked.png" alt="NEFISOFT" width="160" height="160" decoding="async" onerror="this.style.display='none'" />
      <div class="tb-native-offline__icon" aria-hidden="true">📡</div>
      <h2 class="tb-native-offline__title">İnternet bağlantısı yok</h2>
      <p class="tb-native-offline__text">Bağlantınızı kontrol edip tekrar deneyin.</p>
      <button type="button" class="tb-native-offline__btn" id="tb-native-offline-retry" aria-label="Tekrar dene">Tekrar Dene</button>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('#tb-native-offline-retry')?.addEventListener('click', () => {
    if (navigator.onLine) {
      el.style.display = 'none';
      window.location.reload();
      return;
    }
    toast.info(MESSAGES.INFO_STILL_OFFLINE);
  });
  return el;
}

function setOfflineVisible(visible) {
  const el = ensureOfflineOverlay();
  el.style.display = visible ? 'flex' : 'none';
  document.documentElement.classList.toggle('is-native-offline', !!visible);
}

async function initNetworkGuard() {
  try {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    setOfflineVisible(!status.connected);

    Network.addListener('networkStatusChange', (s) => {
      setOfflineVisible(!s.connected);
      if (s.connected) {
        logger.info('Network online');
      } else {
        logger.warn('Network offline');
      }
    });
  } catch (err) {
    logger.warn('Network plugin kullanılamadı', err);
    window.addEventListener('offline', () => setOfflineVisible(true));
    window.addEventListener('online', () => setOfflineVisible(false));
    if (!navigator.onLine) setOfflineVisible(true);
  }
}

async function initKeyboardPolish() {
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    Keyboard.addListener('keyboardWillShow', () => {
      document.documentElement.classList.add('is-keyboard-open');
    });
    Keyboard.addListener('keyboardDidHide', () => {
      document.documentElement.classList.remove('is-keyboard-open');
    });
  } catch (err) {
    logger.warn('Keyboard plugin kullanılamadı', err);
  }
}

export async function initNativeBridge() {
  if (!isNativePlatform()) {
    return;
  }

  if (nativeBridgeReady) {
    return;
  }
  nativeBridgeReady = true;

  logger.group('Native Bridge');
  try {
    logger.info('Native shell', { version: APP_VERSION, build: APP_BUILD, mode: NATIVE_SHELL_MODE });
    ensureRobotoFont();
    ensureViewportFitCover();

    const path = (window.location.pathname || '').toLowerCase();
    if (path === '/' || path === '/index.html' || path === '') {
      logger.info('Native: marketing → login yönlendirmesi');
      window.location.replace('/login.html');
      return;
    }

    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { SplashScreen } = await import('@capacitor/splash-screen');
    const { App } = await import('@capacitor/app');
    let toastApi = null;
    try {
      const mod = await import('../../src/shared/ui/toast.js');
      toastApi = mod.toast;
    } catch (_e) {
      toastApi = null;
    }

    document.documentElement.classList.add('is-native-app');
    if (document.body) {
      document.body.classList.add('is-native-app');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body?.classList.add('is-native-app');
      });
    }

    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    } catch (err) {
      logger.warn('StatusBar ayarlanamadı', err);
    }

    try {
      await SplashScreen.hide();
    } catch (err) {
      logger.warn('SplashScreen gizlenemedi', err);
    }

    await initNetworkGuard();
    await initKeyboardPolish();

    try {
      // Teklifbul Rule v1.0 — FirebaseApp native init bitsin diye kısa gecikme
      const { initNativePush } = await import('./native-push.js');
      setTimeout(() => {
        initNativePush().catch((e) => logger.warn('Push init', e));
      }, 800);
    } catch (err) {
      logger.warn('Push modülü yüklenemedi', err);
    }

    App.addListener('backButton', async ({ canGoBack }) => {
      try {
        if (dismissNativeUiLayer()) {
          return;
        }

        if (canGoBack || canNavigateBack()) {
          window.history.back();
          return;
        }

        const now = Date.now();
        if (now - lastBackPressAt < BACK_EXIT_WINDOW_MS) {
          await App.exitApp();
          return;
        }

        lastBackPressAt = now;
        if (toastApi?.info) {
          toastApi.info('Çıkmak için tekrar geri tuşuna basın');
        }
      } catch (err) {
        logger.warn('backButton islenemedi', err);
      }
    });

    App.addListener('appStateChange', ({ isActive }) => {
      logger.info('App state', { isActive });
      try {
        window.dispatchEvent(new CustomEvent('tb:nativeAppState', { detail: { isActive: !!isActive } }));
      } catch {
        // ignore
      }
    });

    const openDeepLink = (url) => {
      const path = resolveDeepLinkPath(url);
      if (!path) {
        logger.warn('Güvenilmeyen native deep link reddedildi', { url });
        return;
      }
      try {
        const incoming = new URL(path, window.location.origin);
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const nextPath = `${incoming.pathname}${incoming.search}${incoming.hash}`;
        if (nextPath === currentPath) return;
        window.location.href = nextPath;
      } catch (err) {
        logger.warn('Deep link açılamadı', err);
      }
    };

    App.addListener('appUrlOpen', ({ url }) => {
      openDeepLink(url);
    });
    try {
      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        openDeepLink(launch.url);
      }
    } catch (err) {
      logger.warn('Launch URL okunamadı', err);
    }

    logger.info('Native bridge hazır', {
      platform: window.Capacitor?.getPlatform?.(),
      liveLogin: LIVE_LOGIN_URL,
    });
  } catch (err) {
    nativeBridgeReady = false;
    logger.error('Native bridge hatası', err);
  } finally {
    logger.end();
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initNativeBridge();
    });
  } else {
    initNativeBridge();
  }
}
