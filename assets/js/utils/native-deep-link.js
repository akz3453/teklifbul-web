/**
 * Teklifbul Rule v1.0 — Native deep link allowlist (push + appUrlOpen)
 */
const TRUSTED_HOSTS = [
  'nefisoft.com',
  'www.nefisoft.com',
  'nefisoft.com.tr',
  'www.nefisoft.com.tr',
  'teklifbul.web.app',
  'teklifbul.firebaseapp.com',
];

const CUSTOM_SCHEME = 'com.nefisoft.app:';

export function isAllowedDeepLink(deepLink) {
  if (!deepLink || typeof deepLink !== 'string') return false;
  if (deepLink.startsWith('/') && !deepLink.startsWith('//')) return true;

  try {
    const targetUrl = new URL(deepLink);
    if (String(deepLink).toLowerCase().startsWith(CUSTOM_SCHEME)) {
      return true;
    }
    const trustedHosts = new Set([
      ...(typeof window !== 'undefined' && window.location?.hostname ? [window.location.hostname] : []),
      ...TRUSTED_HOSTS,
    ]);
    return targetUrl.protocol === 'https:' && trustedHosts.has(targetUrl.hostname);
  } catch {
    return false;
  }
}

export function resolveDeepLinkPath(deepLink) {
  if (!deepLink || typeof deepLink !== 'string') return null;
  if (deepLink.startsWith('/') && !deepLink.startsWith('//')) return deepLink;

  try {
    if (deepLink.toLowerCase().startsWith(CUSTOM_SCHEME)) {
      const parsed = new URL(deepLink);
      const next = parsed.searchParams.get('redirect')
        || parsed.searchParams.get('url')
        || parsed.searchParams.get('path');
      if (next && isAllowedDeepLink(next)) {
        return next.startsWith('/') ? next : new URL(next).pathname + new URL(next).search + new URL(next).hash;
      }
      return '/login.html';
    }
    if (!isAllowedDeepLink(deepLink)) return null;
    const target = new URL(deepLink);
    return `${target.pathname}${target.search}${target.hash}` || '/';
  } catch {
    return null;
  }
}
