import type { AuthUser } from '../auth/admin-check.js';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/** Yalnız env: ADMIN_PREMIUM_BYPASS_EMAILS — hardcoded default yok */
function getConfiguredBypassEmails(): Set<string> {
  const raw = String(process.env.ADMIN_PREMIUM_BYPASS_EMAILS || '').trim();
  const configured = raw
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return new Set(configured);
}

export function isPremiumBypassEmail(email: unknown): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getConfiguredBypassEmails().has(normalized);
}

export function isPremiumBypassUser(user: AuthUser | null | undefined): boolean {
  return isPremiumBypassEmail(user?.email);
}
