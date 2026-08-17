/**
 * Teklifbul Rule v1.0 — GCF CORS origin listesi (web + Capacitor)
 */
export const GCF_CORS_ORIGINS: string[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://teklifbul.web.app',
  'https://teklifbul.firebaseapp.com',
  'https://nefisoft.com',
  'https://www.nefisoft.com',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
];

type CorsReq = { headers?: { origin?: string | string[] } };
type CorsRes = { set: (name: string, value: string) => unknown };

/** v1 onRequest: yansıyan origin yalnız allowlist’te */
export function applyGcfCors(req: CorsReq, res: CorsRes): void {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (origin && GCF_CORS_ORIGINS.indexOf(origin) !== -1) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
