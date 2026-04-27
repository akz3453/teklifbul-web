import type { Request } from 'express';

export type AuthUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  isAdmin?: boolean;
  isPremium?: boolean;
  plan?: string | null;
  activeCompanyId?: string; // Add this field
  // mevcut yapıda varsa ek alanlar korunabilir
  [key: string]: unknown;
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Varsayılan admin e-postası (istenirse env ile override edilir)
if (!ADMIN_EMAILS.length) {
  ADMIN_EMAILS.push('akyildizfaruk@gmail.com');
}

/**
 * req.user içindeki kullanıcıyı admin olarak kabul etme kuralları:
 * 1) isAdmin === true
 * 2) role === "admin"
 * 3) email, ADMIN_EMAILS environment değişkeninde tanımlı liste içinde
 */
export function isAdminUser(user: AuthUser | undefined | null): boolean {
  if (!user) return false;

  if (user.isAdmin === true) return true;
  if (user.role === 'admin') return true;

  const email = (user.email || '').toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return true;

  return false;
}

/**
 * Request içinden user çekip admin olup olmadığını kontrol eden yardımcı.
 */
export function isAdminRequest(req: Request): boolean {
  const user = (req as any).user as AuthUser | undefined;
  return isAdminUser(user);
}

