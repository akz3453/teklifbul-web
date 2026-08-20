import admin from 'firebase-admin';
import { logger } from '../../src/shared/log/logger.js';
const SKIP_PREFIXES = [
    '/health',
    '/api/health',
    '/metrics',
    '/api/metrics',
    '/api/payments/webhook',
    '/api/bid-invites',
    '/api/submit-bid',
];
export function isAppCheckSkippedPath(path) {
    const normalized = String(path || '').split('?')[0];
    return SKIP_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}
export function isAppCheckEnforced() {
    const raw = String(process.env.APP_CHECK_ENFORCE || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}
function readAppCheckToken(req) {
    const header = req.headers['x-firebase-appcheck'] || req.headers['X-Firebase-AppCheck'];
    if (Array.isArray(header))
        return String(header[0] || '').trim();
    return String(header || '').trim();
}
export async function verifyAppCheck(req, res, next) {
    if (req.method === 'OPTIONS') {
        return next();
    }
    if (isAppCheckSkippedPath(req.path) || isAppCheckSkippedPath(req.originalUrl || '')) {
        return next();
    }
    const token = readAppCheckToken(req);
    const enforce = isAppCheckEnforced();
    if (!token) {
        if (enforce) {
            logger.warn('App Check missing (enforced)', { path: req.path });
            return res.status(401).json({
                error: 'APP_CHECK_REQUIRED',
                message: 'App Check token gerekli',
            });
        }
        return next();
    }
    try {
        if (!admin.apps.length) {
            throw new Error('firebase-admin not initialized');
        }
        await admin.appCheck().verifyToken(token);
        return next();
    }
    catch (error) {
        logger.warn('App Check invalid', { path: req.path, error: error?.message });
        return res.status(401).json({
            error: 'APP_CHECK_INVALID',
            message: 'App Check token geçersiz',
        });
    }
}
