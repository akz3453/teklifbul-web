/**
 * Admin Logs Route
 * Teklifbul Rule v1.0 - Güvenlik & Sistem Logları
 *
 * Kaynaklar:
 * - security_logs (authFailure, rateLimitHit, adminAction, serverError)
 * - error_logs (uygulama hataları → serverError / clientError)
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
const router = Router();
router.use(verifyToken, requireAdmin);
function periodToMs(period) {
    if (period === '7d')
        return 7 * 24 * 60 * 60 * 1000;
    if (period === '30d')
        return 30 * 24 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
}
function toIso(value) {
    if (!value)
        return null;
    if (typeof value === 'string') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (value?.toDate) {
        try {
            return value.toDate().toISOString();
        }
        catch {
            return null;
        }
    }
    if (value instanceof Timestamp) {
        return value.toDate().toISOString();
    }
    if (typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}
/**
 * GET /api/admin/logs
 */
router.get('/logs', validateRequest({
    query: z.object({
        limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
        eventType: z
            .enum(['all', 'authFailure', 'rateLimitHit', 'adminAction', 'serverError', 'clientError'])
            .optional()
            .default('all'),
        period: z.enum(['24h', '7d', '30d']).optional().default('24h'),
    }),
}), async (req, res) => {
    logger.group('Admin logs fetch');
    try {
        const { limit, eventType, period } = req.query;
        const { getAdminDb } = await import('../utils/firestore.js');
        const db = await getAdminDb();
        if (!db) {
            logger.end();
            return res.status(500).json({ error: 'db_unavailable', message: 'Veritabanı bağlantısı yok' });
        }
        const maxLimit = Math.min(Number(limit) || 200, 500);
        const startTime = new Date(Date.now() - periodToMs(period));
        const startTimestamp = Timestamp.fromDate(startTime);
        const logs = [];
        // 1) security_logs
        try {
            let securityQuery = db
                .collection('security_logs')
                .where('timestamp', '>=', startTimestamp)
                .orderBy('timestamp', 'desc')
                .limit(maxLimit);
            if (eventType && eventType !== 'all' && eventType !== 'clientError') {
                securityQuery = db
                    .collection('security_logs')
                    .where('eventType', '==', eventType)
                    .where('timestamp', '>=', startTimestamp)
                    .orderBy('timestamp', 'desc')
                    .limit(maxLimit);
            }
            if (eventType !== 'clientError') {
                const snap = await securityQuery.get();
                snap.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    const ts = toIso(data.timestamp) ||
                        toIso(data.createdAt) ||
                        new Date().toISOString();
                    logs.push({
                        id: doc.id,
                        timestamp: ts,
                        eventType: String(data.eventType || 'unknown'),
                        userId: data.userId || null,
                        email: data.email || null,
                        method: data.method || null,
                        path: data.path || null,
                        ip: data.ip || null,
                        message: String(data.message || data.reason || data.action || 'Security event'),
                        level: String(data.level || 'info'),
                        source: 'security_logs',
                    });
                });
            }
        }
        catch (securityErr) {
            logger.warn('security_logs query failed, fallback', securityErr?.message || securityErr);
            try {
                const fallback = await db.collection('security_logs').orderBy('timestamp', 'desc').limit(maxLimit).get();
                fallback.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    const ts = toIso(data.timestamp) || toIso(data.createdAt);
                    if (!ts || new Date(ts).getTime() < startTime.getTime())
                        return;
                    const rowType = String(data.eventType || 'unknown');
                    if (eventType && eventType !== 'all' && rowType !== eventType)
                        return;
                    logs.push({
                        id: doc.id,
                        timestamp: ts,
                        eventType: rowType,
                        userId: data.userId || null,
                        email: data.email || null,
                        method: data.method || null,
                        path: data.path || null,
                        ip: data.ip || null,
                        message: String(data.message || data.reason || data.action || 'Security event'),
                        level: String(data.level || 'info'),
                        source: 'security_logs',
                    });
                });
            }
            catch (fallbackErr) {
                logger.warn('security_logs fallback failed', fallbackErr?.message || fallbackErr);
            }
        }
        // 2) error_logs (panel Hatalar sekmesinden ayrı; log özetine de ekle)
        if (!eventType || eventType === 'all' || eventType === 'serverError' || eventType === 'clientError') {
            try {
                const errorSnap = await db
                    .collection('error_logs')
                    .where('timestamp', '>=', startTimestamp)
                    .orderBy('timestamp', 'desc')
                    .limit(maxLimit)
                    .get();
                errorSnap.docs.forEach((doc) => {
                    const data = doc.data() || {};
                    const mappedType = data.type === 'frontend' ? 'clientError' : 'serverError';
                    if (eventType && eventType !== 'all' && mappedType !== eventType)
                        return;
                    const ts = toIso(data.timestamp) ||
                        toIso(data.lastOccurred) ||
                        toIso(data.createdAt) ||
                        new Date().toISOString();
                    logs.push({
                        id: `err_${doc.id}`,
                        timestamp: ts,
                        eventType: mappedType,
                        userId: data.userId || null,
                        email: data.userEmail || null,
                        method: data.method || null,
                        path: data.path || data.url || null,
                        ip: data.ip || null,
                        message: String(data.message || data.error || 'Error log'),
                        level: String(data.severity || 'info'),
                        source: 'error_logs',
                    });
                });
            }
            catch (errorLogsErr) {
                logger.warn('error_logs for admin logs failed', errorLogsErr?.message || errorLogsErr);
            }
        }
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const limited = logs.slice(0, maxLimit);
        logger.info('Admin logs fetched', {
            count: limited.length,
            eventType,
            period,
            securityCount: limited.filter((l) => l.source === 'security_logs').length,
            errorCount: limited.filter((l) => l.source === 'error_logs').length,
        });
        logger.end();
        return res.json({
            ok: true,
            logs: limited,
            meta: {
                count: limited.length,
                period,
                eventType,
                note: limited.length === 0
                    ? 'Bu dönemde kayıt yok. Yeni güvenlik olayları (auth, rate limit, admin aksiyon) otomatik kaydedilir.'
                    : null,
            },
        });
    }
    catch (error) {
        logger.error('Admin logs fetch error', error);
        logger.end();
        return res.status(500).json({ error: 'LOGS_ERROR', message: error.message || 'Loglar yüklenemedi' });
    }
});
export default router;
