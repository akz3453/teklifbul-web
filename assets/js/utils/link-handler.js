// Teklifbul Rule v1.0 - Middle Click / New Tab Intent Helper
// Bu helper, middle click, Ctrl+Click, Cmd+Click gibi yeni sekme açma niyetlerini tespit eder
// Link handler'larda kullanılmalı: eğer yeni sekme niyeti varsa preventDefault yapılmamalı

/**
 * Kullanıcının yeni sekme açma niyetinde olup olmadığını kontrol eder
 * @param {MouseEvent|PointerEvent} event - Click event
 * @returns {boolean} - true ise yeni sekme niyeti var, preventDefault yapılmamalı
 */
export function isNewTabIntent(event) {
  // Middle click detection:
  // - auxclick event'inde button === 1
  // - click event'inde button === 0 olabilir ama which === 2 olabilir (eski API)
  // - mousedown event'inde button === 1
  // - buttons property'de 4 (middle button) bit set edilmiş olabilir
  const isMiddleClick = event.type === 'auxclick' ||
    event.button === 1 ||
    event.which === 2 ||
    (event.buttons !== undefined && (event.buttons & 4) === 4);

  if (isMiddleClick) {
    return true;
  }

  // Ctrl+Click (Windows/Linux) veya Cmd+Click (Mac)
  if (event.ctrlKey || event.metaKey) {
    return true;
  }

  // Shift+Click (yeni pencere)
  if (event.shiftKey) {
    return true;
  }

  // Alt+Click (bazı tarayıcılarda yeni sekme)
  if (event.altKey) {
    return true;
  }

  return false;
}

/**
 * Link'in tarayıcı tarafından işlenmesi gerekip gerekmediğini kontrol eder
 * @param {HTMLAnchorElement} link - Link elementi
 * @returns {boolean} - true ise tarayıcı işlemeli, preventDefault yapılmamalı
 */
export function shouldLetBrowserHandle(link) {
  if (!link) return false;

  // target="_blank" linkler
  if (link.target === '_blank') return true;

  // Download attribute'u olan linkler
  if (link.hasAttribute('download')) return true;

  // External linkler (http/https)
  const href = link.getAttribute('href') || '';
  if (href.startsWith('http://') || href.startsWith('https://')) return true;

  // Mailto/Tel linkler
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return true;

  return false;
}

/**
 * Link handler için guard fonksiyonu
 * Yeni sekme niyeti varsa veya tarayıcı işlemeli ise true döner (preventDefault yapılmamalı)
 * @param {MouseEvent|PointerEvent} event - Click event
 * @param {HTMLAnchorElement} link - Link elementi (opsiyonel, event.target.closest('a') ile bulunabilir)
 * @returns {boolean} - true ise preventDefault yapılmamalı
 */
export function shouldSkipPreventDefault(event, link = null) {
  // Yeni sekme niyeti kontrolü
  const isNewTab = isNewTabIntent(event);
  if (isNewTab) {
    return true;
  }

  // Link bulunamadıysa false döndür (normal işlem yapılabilir)
  if (!link) {
    link = event.target?.closest?.('a[href]');
    if (!link) {
      return false;
    }
  }

  // Tarayıcı işlemeli mi kontrolü
  const shouldLetBrowser = shouldLetBrowserHandle(link);
  if (shouldLetBrowser) {
    return true;
  }

  return false;
}
