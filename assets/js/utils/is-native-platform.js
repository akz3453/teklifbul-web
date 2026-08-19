/**
 * Teklifbul Rule v1.0 — Capacitor native WebView tespiti
 */
export function isNativePlatform() {
  try {
    if (typeof window === 'undefined') return false;
    // Live-url shell: bridge inject edilir. isNativePlatform() false dönebilir; global yeter.
    if (window.Capacitor) return true;
    const ua = String(navigator.userAgent || '');
    if (/CapacitorAndroid|CapacitoriOS|\bCapacitor\b/i.test(ua)) return true;
    if (/\bNEFISOFTApp\b/.test(ua)) return true;
    if (/;\s*wv\b/i.test(ua)) return true;
    if (/Version\/4\.0\s+Chrome\//i.test(ua) && /Android/i.test(ua)) return true;
    return false;
  } catch {
    return false;
  }
}
