/**
 * Admin Guardrails Route
 * Teklifbul Rule v2.7.1 - Force Free Mode (Admin action)
 * Teklifbul Rule v2.7.2 - Daily Paid Token Cap (Admin action)
 *
 * POST /api/admin/guardrails/apply
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { validateRequest } from '../utils/input-validation.js';
const router = Router();
router.use(verifyToken, requireAdmin);
/**
 * Teklifbul Rule v3.3 - Write audit log for guardrails actions
 */
async function writeAuditLog(db, companyId, data) {
    try {
        const auditRef = db.collection('companies').doc(companyId).collection('auditLogs').doc();
        await auditRef.set({
            type: 'guardrails.apply',
            action: data.action,
            reason: data.reason,
            actorUid: data.actorUid,
            actorEmail: data.actorEmail || null,
            actorName: data.actorName || null,
            before: data.before,
            after: data.after,
            createdAt: FieldValue.serverTimestamp(),
        });
        logger.info('Audit log written', { companyId, action: data.action, actorUid: data.actorUid });
    }
    catch (err) {
        logger.warn('Failed to write audit log', { companyId, action: data.action, error: err });
        // Don't throw - audit log failure shouldn't break the main operation
    }
}
const applySchema = z.object({
    companyId: z.string().min(1),
    action: z.enum(['force_free_on', 'force_free_off', 'set_daily_cap', 'clear_daily_cap', 'reset_guardrails']), // Teklifbul Rule v3.5.1
    reason: z.string().optional(),
    dailyPaidTokenCap: z.number().min(0).optional(), // Teklifbul Rule v2.7.2
});
/**
 * POST /api/admin/guardrails/apply
 * Apply guardrail action (force free mode on/off)
 */
router.post('/apply', validateRequest({ body: applySchema }), async (req, res) => {
    try {
        logger.group('Admin Guardrails Apply API');
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database connection failed');
            logger.end();
            return res.status(500).json({
                error: 'database_error',
                message: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const { companyId, action, reason, dailyPaidTokenCap } = req.body;
        const userId = req.user?.uid;
        if (!userId) {
            logger.warn('User ID missing');
            logger.end();
            return res.status(401).json({
                error: 'auth_required',
                message: 'Bu işlem için giriş yapmalısınız.'
            });
        }
        // Verify company exists
        const companyDoc = await db.collection('companies').doc(companyId).get();
        if (!companyDoc.exists) {
            logger.warn('Company not found', { companyId });
            logger.end();
            return res.status(404).json({
                error: 'company_not_found',
                message: 'Şirket bulunamadı.'
            });
        }
        const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
        const settingsSnap = await settingsRef.get();
        const currentSettings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
        // Teklifbul Rule v3.3 - Capture "before" state for audit
        const beforeState = {
            forcedFreeMode: currentSettings.forcedFreeMode === true,
            dailyPaidTokenCap: typeof currentSettings.dailyPaidTokenCap === 'number' ? currentSettings.dailyPaidTokenCap : null,
            provider: currentSettings.provider || null,
            model: currentSettings.model || null,
        };
        // Get actor info (email/name from user doc if available)
        let actorEmail = null;
        let actorName = null;
        try {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data() || {};
                actorEmail = userData.email || null;
                actorName = userData.displayName || userData.name || null;
            }
        }
        catch (err) {
            logger.warn('Failed to fetch user info for audit', { userId, error: err });
        }
        if (action === 'force_free_on') {
            // Force free mode: set provider/model to free_local/basic
            const nextSettings = {
                provider: 'free_local',
                model: 'basic',
                profile: currentSettings.profile || 'fast', // Preserve profile if exists
                dictionaryLearning: currentSettings.dictionaryLearning !== undefined ? currentSettings.dictionaryLearning : true, // Preserve if exists
                forcedFreeMode: true,
                forcedFreeModeReason: reason || 'admin',
                forcedFreeModeAt: FieldValue.serverTimestamp(),
                forcedFreeModeBy: userId,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: userId,
            };
            await settingsRef.set(nextSettings, { merge: true });
            // Teklifbul Rule v2.7.1 - Invalidate availableModels cache
            const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
            invalidateAvailableModelsCache(companyId);
            // Teklifbul Rule v3.3 - Write audit log
            const afterState = {
                forcedFreeMode: true,
                dailyPaidTokenCap: beforeState.dailyPaidTokenCap,
                provider: 'free_local',
                model: 'basic',
            };
            await writeAuditLog(db, companyId, {
                action: 'force_free_on',
                reason: reason || 'admin',
                actorUid: userId,
                actorEmail,
                actorName,
                before: beforeState,
                after: afterState,
            });
            logger.info('Forced free mode ON', { companyId, reason: reason || 'admin', adminId: userId });
        }
        else if (action === 'force_free_off') {
            // Remove forced free mode (user can choose their own model)
            const nextSettings = {
                forcedFreeMode: false,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: userId,
            };
            await settingsRef.set(nextSettings, { merge: true });
            // Invalidate cache
            const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
            invalidateAvailableModelsCache(companyId);
            // Teklifbul Rule v3.3 - Write audit log
            const afterSettingsSnap = await settingsRef.get();
            const afterSettings = afterSettingsSnap.exists ? (afterSettingsSnap.data() || {}) : {};
            const afterState = {
                forcedFreeMode: false,
                dailyPaidTokenCap: typeof afterSettings.dailyPaidTokenCap === 'number' ? afterSettings.dailyPaidTokenCap : null,
                provider: afterSettings.provider || null,
                model: afterSettings.model || null,
            };
            await writeAuditLog(db, companyId, {
                action: 'force_free_off',
                reason: reason || 'admin',
                actorUid: userId,
                actorEmail,
                actorName,
                before: beforeState,
                after: afterState,
            });
            logger.info('Forced free mode OFF', { companyId, adminId: userId });
        }
        else if (action === 'set_daily_cap') {
            // Teklifbul Rule v2.7.2 - Set daily paid token cap
            if (typeof dailyPaidTokenCap !== 'number' || dailyPaidTokenCap < 0) {
                logger.warn('Invalid dailyPaidTokenCap', { dailyPaidTokenCap });
                logger.end();
                return res.status(400).json({
                    error: 'invalid_cap',
                    message: 'Günlük kota 0 veya daha büyük bir sayı olmalıdır.'
                });
            }
            const nextSettings = {
                dailyPaidTokenCap: dailyPaidTokenCap,
                dailyPaidTokenCapReason: reason || 'admin',
                dailyPaidTokenCapAt: FieldValue.serverTimestamp(),
                dailyPaidTokenCapBy: userId,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: userId,
            };
            await settingsRef.set(nextSettings, { merge: true });
            // Teklifbul Rule v3.3 - Write audit log
            const afterState = {
                forcedFreeMode: beforeState.forcedFreeMode,
                dailyPaidTokenCap: dailyPaidTokenCap,
                provider: beforeState.provider,
                model: beforeState.model,
            };
            await writeAuditLog(db, companyId, {
                action: 'set_daily_cap',
                reason: reason || 'admin',
                actorUid: userId,
                actorEmail,
                actorName,
                before: beforeState,
                after: afterState,
            });
            logger.info('Daily paid token cap set', { companyId, cap: dailyPaidTokenCap, reason: reason || 'admin', adminId: userId });
        }
        else if (action === 'clear_daily_cap') {
            // Teklifbul Rule v2.7.2 - Clear daily paid token cap
            const nextSettings = {
                dailyPaidTokenCap: null,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: userId,
            };
            await settingsRef.set(nextSettings, { merge: true });
            // Teklifbul Rule v3.3 - Write audit log
            const afterState = {
                forcedFreeMode: beforeState.forcedFreeMode,
                dailyPaidTokenCap: null,
                provider: beforeState.provider,
                model: beforeState.model,
            };
            await writeAuditLog(db, companyId, {
                action: 'clear_daily_cap',
                reason: reason || 'admin',
                actorUid: userId,
                actorEmail,
                actorName,
                before: beforeState,
                after: afterState,
            });
            logger.info('Daily paid token cap cleared', { companyId, adminId: userId });
        }
        else if (action === 'reset_guardrails') {
            // Teklifbul Rule v3.5.1 - Reset all guardrails (forcedFreeMode + dailyCap)
            const nextSettings = {
                forcedFreeMode: false,
                forcedFreeModeReason: null,
                dailyPaidTokenCap: null,
                dailyPaidTokenCapReason: null,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: userId,
            };
            await settingsRef.set(nextSettings, { merge: true });
            // Invalidate cache
            const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
            invalidateAvailableModelsCache(companyId);
            // Teklifbul Rule v3.3 - Write audit log
            const afterState = {
                forcedFreeMode: false,
                dailyPaidTokenCap: null,
                provider: beforeState.provider, // IMPORTANT: provider/model unchanged
                model: beforeState.model, // IMPORTANT: provider/model unchanged
            };
            await writeAuditLog(db, companyId, {
                action: 'reset_guardrails',
                reason: reason || 'admin_reset',
                actorUid: userId,
                actorEmail,
                actorName,
                before: beforeState,
                after: afterState,
            });
            logger.info('Guardrails reset', { companyId, adminId: userId, reason: reason || 'admin_reset' });
        }
        logger.end();
        return res.json({ ok: true });
    }
    catch (error) {
        logger.error('Error in guardrails apply endpoint', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
/**
 * Teklifbul Rule v3.3 - GET /api/admin/guardrails/logs?companyId=...&limit=50
 * List guardrails audit logs for a company
 */
router.get('/logs', async (req, res) => {
    try {
        logger.group('Admin Guardrails Logs API');
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database connection failed');
            logger.end();
            return res.status(500).json({
                error: 'database_error',
                message: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const companyId = req.query.companyId;
        const limitParam = req.query.limit;
        const limit = limitParam ? parseInt(limitParam, 10) : 50;
        if (!companyId) {
            logger.warn('Company ID missing');
            logger.end();
            return res.status(400).json({
                error: 'company_id_required',
                message: 'companyId parametresi gereklidir.'
            });
        }
        if (isNaN(limit) || limit < 1 || limit > 100) {
            logger.warn('Invalid limit', { limit });
            logger.end();
            return res.status(400).json({
                error: 'invalid_limit',
                message: 'limit parametresi 1-100 arasında olmalıdır.'
            });
        }
        // Verify company exists
        const companyDoc = await db.collection('companies').doc(companyId).get();
        if (!companyDoc.exists) {
            logger.warn('Company not found', { companyId });
            logger.end();
            return res.status(404).json({
                error: 'company_not_found',
                message: 'Şirket bulunamadı.'
            });
        }
        // Fetch audit logs
        const logsSnap = await db
            .collection('companies')
            .doc(companyId)
            .collection('auditLogs')
            .where('type', '==', 'guardrails.apply')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        const logs = logsSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                action: data.action,
                reason: data.reason || null,
                actorUid: data.actorUid,
                actorEmail: data.actorEmail || null,
                actorName: data.actorName || null,
                before: data.before || {},
                after: data.after || {},
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAtMs ? new Date(data.createdAtMs).toISOString() : new Date().toISOString()),
            };
        });
        logger.info('Guardrails logs fetched', { companyId, logCount: logs.length });
        logger.end();
        return res.json({
            companyId,
            logs,
        });
    }
    catch (error) {
        logger.error('Error in guardrails logs endpoint', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
export default router;
