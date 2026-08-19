/**
 * Teklifbul Rule v1.0 — Analytics params must never include PII.
 */

const BLOCKED_PARAM_KEY =
  /^(email|e-mail|phone|tel|password|uid|userId|user_id|displayName|name|fullName|vkn|tax|token|authorization|idToken|refreshToken)$/i;

export function sanitizeEventParams(params) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (BLOCKED_PARAM_KEY.test(key)) continue;
    if (typeof value === 'string') {
      if (value.includes('@')) continue;
      if (value.length > 80) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}
