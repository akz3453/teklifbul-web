import type { Request } from 'express';

export type AuthUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  emailVerified?: boolean;
  role?: string | null;
  isAdmin?: boolean;
  isPremium?: boolean;
  plan?: string | null;
  activeCompanyId?: string; // Add this field
  customClaims?: Record<string, unknown>;
  // mevcut yapıda varsa ek alanlar korunabilir
  [key: string]: unknown;
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function tokenClaims(user: AuthUser): Record<string, unknown> {
  const raw = user.customClaims;
  if (raw && typeof raw === 'object') return raw;
  return {};
}

/**
 * Platform admin: yalnız ID token custom claims + ADMIN_EMAILS.
 * Firestore users.isAdmin / role yükseltmez (zehirlenmiş doküman / Admin SDK kalıntısı).
 */
export function isAdminUser(user: AuthUser | undefined | null): boolean {
  if (!user) return false;

  const claims = tokenClaims(user);
  if (claims.superAdmin === true) return true;
  if (claims.admin === true) return true;
  if (claims.isAdmin === true) return true;
  if (claims.role === 'admin') return true;

  const email = (user.email || '').toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return true;

  return false;
}

/** Ops araçları — admin API’lerine otomatik geçmez */
export function isOpsUser(user: AuthUser | undefined | null): boolean {
  if (!user) return false;
  const claims = tokenClaims(user);
  return claims.ops === true || claims.role === 'ops';
}

/**
 * Request içinden user çekip admin olup olmadığını kontrol eden yardımcı.
 */
export function isAdminRequest(req: Request): boolean {
  const user = (req as Request & { user?: AuthUser }).user;
  return isAdminUser(user);
}
