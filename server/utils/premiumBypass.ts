import type { AuthUser } from '../auth/admin-check.js';

const DEFAULT_PREMIUM_BYPASS_EMAILS = ['akyildizfaruk@gmail.com'];

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getConfiguredBypassEmails(): Set<string> {
  const raw = String(process.env.ADMIN_PREMIUM_BYPASS_EMAILS || '').trim();
  const configured = raw
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return new Set([...DEFAULT_PREMIUM_BYPASS_EMAILS, ...configured].map((email) => normalizeEmail(email)));
}

export function isPremiumBypassEmail(email: unknown): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getConfiguredBypassEmails().has(normalized);
}

export function isPremiumBypassUser(user: AuthUser | null | undefined): boolean {
  return isPremiumBypassEmail(user?.email);
}

