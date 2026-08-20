/**
 * Teklifbul Rule v1.0 — Recursively strip secrets/PII from Sentry events.
 * DSN is never hardcoded; empty DSN must no-op at the caller.
 */
const SENSITIVE_KEY = /^(authorization|cookie|password|passwd|token|secret|api[-_]?key|refresh[-_]?token|id[-_]?token|x-company-id|email|phone|taxnumber|vkn|mersis|creditcard|cardnumber|cvv)$/i;
function redactValue(value, depth) {
    if (depth > 6 || value == null)
        return value;
    if (typeof value === 'string') {
        if (value.length > 500)
            return `${value.slice(0, 80)}…[truncated]`;
        return value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 30).map((item) => redactValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [key, nested] of Object.entries(value)) {
            if (SENSITIVE_KEY.test(key)) {
                out[key] = '[FILTERED]';
            }
            else {
                out[key] = redactValue(nested, depth + 1);
            }
        }
        return out;
    }
    return value;
}
export function scrubSentryEvent(event) {
    if (!event)
        return null;
    const next = { ...event };
    const request = next.request;
    if (request && typeof request === 'object') {
        const headers = request.headers;
        if (headers && typeof headers === 'object') {
            const cleanHeaders = { ...headers };
            delete cleanHeaders.authorization;
            delete cleanHeaders.Authorization;
            delete cleanHeaders.cookie;
            delete cleanHeaders.Cookie;
            delete cleanHeaders['x-firebase-appcheck'];
            delete cleanHeaders['X-Firebase-AppCheck'];
            delete cleanHeaders['x-company-id'];
            delete cleanHeaders['X-Company-Id'];
            request.headers = cleanHeaders;
        }
        if ('data' in request) {
            request.data = redactValue(request.data, 0);
        }
        next.request = request;
    }
    if (next.extra)
        next.extra = redactValue(next.extra, 0);
    if (next.contexts)
        next.contexts = redactValue(next.contexts, 0);
    if (next.user && typeof next.user === 'object') {
        const user = { ...next.user };
        delete user.email;
        delete user.ip_address;
        delete user.username;
        next.user = user;
    }
    next.extra = redactValue(next.extra || {}, 0);
    return next;
}
