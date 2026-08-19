/**
 * Teklifbul Rule v1.0 — Public GA4 measurement id (never a secret).
 */
export const FIREBASE_WEB_MEASUREMENT_ID = 'G-ZNSPR4H9LF';

export function resolveMeasurementId(env = import.meta.env) {
  try {
    const fromEnv = String(env?.VITE_GA_MEASUREMENT_ID || env?.VITE_FIREBASE_MEASUREMENT_ID || '').trim();
    const fallback = env?.PROD ? FIREBASE_WEB_MEASUREMENT_ID : '';
    const id = fromEnv || fallback;
    return /^G-[A-Z0-9]+$/i.test(id) ? id : '';
  } catch {
    return '';
  }
}
