/**
 * Teklifbul Rule v1.0 — CORS origin listesi (web + Capacitor)
 */
export const DEFAULT_WEB_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://teklifbul.web.app',
    'https://teklifbul.firebaseapp.com',
    'https://nefisoft.com',
    'https://www.nefisoft.com',
];
/** Bundle WebView origin'leri (server.url kullanılmasa bile) */
export const CAPACITOR_ORIGINS = [
    'capacitor://localhost',
    'ionic://localhost',
    'https://localhost',
    'http://localhost',
];
export function parseEnvOrigins() {
    return (process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}
export function resolveAllowedOrigins() {
    const fromEnv = parseEnvOrigins();
    const base = fromEnv.length > 0 ? fromEnv : DEFAULT_WEB_ORIGINS;
    return [...new Set([...base, ...CAPACITOR_ORIGINS, 'https://nefisoft.com', 'https://www.nefisoft.com'])];
}
/**
 * cors origin callback: deny unknown hosts without throwing (avoids 500 INTERNAL_ERROR).
 * Same-origin / non-browser clients send no Origin → allow.
 */
export function corsOriginDelegate(allowedOrigins) {
    return (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    };
}
