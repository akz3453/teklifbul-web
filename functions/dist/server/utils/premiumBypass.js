function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}
/** Yalnız env: ADMIN_PREMIUM_BYPASS_EMAILS — hardcoded default yok */
function getConfiguredBypassEmails() {
    const raw = String(process.env.ADMIN_PREMIUM_BYPASS_EMAILS || '').trim();
    const configured = raw
        .split(',')
        .map((email) => normalizeEmail(email))
        .filter(Boolean);
    return new Set(configured);
}
export function isPremiumBypassEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized)
        return false;
    return getConfiguredBypassEmails().has(normalized);
}
export function isPremiumBypassUser(user) {
    return isPremiumBypassEmail(user?.email);
}
