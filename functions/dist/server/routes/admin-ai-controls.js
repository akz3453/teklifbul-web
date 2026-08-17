/**
 * Admin AI Controls Route (v3.11)
 * Teklifbul Rule v3.11 - Emergency controls for AI system
 *
 * Endpoints:
 * - GET /api/admin/ai-controls - Get global controls
 * - POST /api/admin/ai-controls/set-global - Toggle global AI disable
 * - POST /api/admin/ai-controls/set-panic - Toggle panic mode
 * - GET /api/admin/ai-controls/company?companyId=... - Get company controls
 * - POST /api/admin/ai-controls/company - Toggle company AI disable
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { validateRequest } from '../utils/input-validation.js';
import { clearKillSwitchCache } from '../services/aiKillSwitchService.js';
const router = Router();
router.use(verifyToken, requireAdmin);
/**
 * Write audit log for system-level AI controls
 * Teklifbul Rule v3.11 - Audit logging
 */
async function writeSystemAuditLog(db, data) {
    try {
        const auditRef = db.collection('system_auditLogs').doc();
        await auditRef.set({
            type: data.type,
            action: data.action,
            reason: data.reason,
            actorUid: data.actorUid,
            actorEmail: data.actorEmail || null,
            actorName: data.actorName || null,
            before: data.before,
            after: data.after,
            createdAt: FieldValue.serverTimestamp(),
        });
        logger.info('System audit log written', { type: data.type, action: data.action, actorUid: data.actorUid });
    }
    catch (err) {
        logger.warn('Failed to write system audit log', { type: data.type, action: data.action, error: err });
        // Don't throw - audit log failure shouldn't break the main operation
    }
}
/**
 * Write audit log for company-level AI controls
 * Teklifbul Rule v3.11 - Audit logging
 */
async function writeCompanyAuditLog(db, companyId, data) {
    try {
        const auditRef = db.collection('companies').doc(companyId).collection('auditLogs').doc();
        await auditRef.set({
            type: 'aiControls.company',
            action: data.action,
            reason: data.reason,
            actorUid: data.actorUid,
            actorEmail: data.actorEmail || null,
            actorName: data.actorName || null,
            before: data.before,
            after: data.after,
            createdAt: FieldValue.serverTimestamp(),
        });
        logger.info('Company audit log written', { companyId, action: data.action, actorUid: data.actorUid });
    }
    catch (err) {
        logger.warn('Failed to write company audit log', { companyId, action: data.action, error: err });
        // Don't throw - audit log failure shouldn't break the main operation
    }
}
/**
 * Get actor info (email/name from user doc)
 */
async function getActorInfo(db, userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data() || {};
            return {
                email: userData.email || null,
                name: userData.displayName || userData.name || null,
            };
        }
    }
    catch (err) {
        logger.warn('Failed to fetch user info for audit', { userId, error: err });
    }
    return { email: null, name: null };
}
/**
 * GET /api/admin/ai-controls
 * Get global AI controls
 */
router.get('/', async (req, res) => {
    try {
        logger.group('Admin AI Controls GET');
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database connection failed');
            logger.end();
            return res.status(500).json({
                error: 'database_error',
                message: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const docRef = db.collection('system_settings').doc('aiControls');
        const snap = await docRef.get();
        if (!snap.exists) {
            logger.end();
            return res.json({
                global: {
                    globalAiDisabled: false,
                    globalAiDisabledReason: null,
                    panicMode: false,
                    panicModeReason: null,
                    updatedAtISO: null,
                    updatedBy: null,
                },
            });
        }
        const data = snap.data() || {};
        const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null;
        logger.end();
        return res.json({
            global: {
                globalAiDisabled: data.globalAiDisabled === true,
                globalAiDisabledReason: data.globalAiDisabledReason || null,
                panicMode: data.panicMode === true,
                panicModeReason: data.panicModeReason || null,
                updatedAtISO: updatedAt,
                updatedBy: data.updatedBy || null,
            },
        });
    }
    catch (error) {
        logger.error('Error in GET /api/admin/ai-controls', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
/**
 * POST /api/admin/ai-controls/set-global
 * Toggle global AI disable
 */
const setGlobalSchema = z.object({
    globalAiDisabled: z.boolean(),
    reason: z.string().optional(),
});
router.post('/set-global', validateRequest({ body: setGlobalSchema }), async (req, res) => {
    try {
        logger.group('Admin AI Controls Set Global');
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database connection failed');
            logger.end();
            return res.status(500).json({
                error: 'database_error',
                message: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const { globalAiDisabled, reason } = req.body;
        const userId = req.user?.uid;
        if (!userId) {
            logger.warn('User ID missing');
            logger.end();
            return res.status(401).json({
                error: 'auth_required',
                message: 'Bu işlem için giriş yapmalısınız.'
            });
        }
        const docRef = db.collection('system_settings').doc('aiControls');
        const snap = await docRef.get();
        const currentData = snap.exists ? (snap.data() || {}) : {};
        // Capture "before" state
        const beforeState = {
            globalAiDisabled: currentData.globalAiDisabled === true,
            globalAiDisabledReason: currentData.globalAiDisabledReason || null,
            panicMode: currentData.panicMode === true,
            panicModeReason: currentData.panicModeReason || null,
        };
        // Get actor info
        const actorInfo = await getActorInfo(db, userId);
        // Update document
        const updateData = {
            globalAiDisabled: globalAiDisabled === true,
            globalAiDisabledReason: globalAiDisabled ? (reason || 'admin') : null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        // Preserve panic mode if exists
        if (currentData.panicMode !== undefined) {
            updateData.panicMode = currentData.panicMode;
            updateData.panicModeReason = currentData.panicModeReason || null;
        }
        await docRef.set(updateData, { merge: true });
        // Capture "after" state
        const afterState = {
            globalAiDisabled: globalAiDisabled === true,
            globalAiDisabledReason: globalAiDisabled ? (reason || 'admin') : null,
            panicMode: beforeState.panicMode,
            panicModeReason: beforeState.panicModeReason,
        };
        // Write audit log
        await writeSystemAuditLog(db, {
            type: 'aiControls.global',
            action: globalAiDisabled ? 'global_disable_on' : 'global_disable_off',
            reason: reason || 'admin',
            actorUid: userId,
            actorEmail: actorInfo.email,
            actorName: actorInfo.name,
            before: beforeState,
            after: afterState,
        });
        // Clear cache
        clearKillSwitchCache();
        logger.info('Global AI controls updated', { globalAiDisabled, reason: reason || 'admin', adminId: userId });
        logger.end();
        return res.json({ ok: true });
    }
    catch (error) {
        logger.error('Error in POST /api/admin/ai-controls/set-global', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
/**
 * POST /api/admin/ai-controls/set-panic
 * Toggle panic mode
 */
const setPanicSchema = z.object({
    panicMode: z.boolean(),
    reason: z.string().optional(),
});
router.post('/set-panic', validateRequest({ body: setPanicSchema }), async (req, res) => {
    try {
        logger.group('Admin AI Controls Set Panic');
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database connection failed');
            logger.end();
            return res.status(500).json({
                error: 'database_error',
                message: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const { panicMode, reason } = req.body;
        const userId = req.user?.uid;
        if (!userId) {
            logger.warn('User ID missing');
            logger.end();
            return res.status(401).json({
                error: 'auth_required',
                message: 'Bu işlem için giriş yapmalısınız.'
            });
        }
        const docRef = db.collection('system_settings').doc('aiControls');
        const snap = await docRef.get();
        const currentData = snap.exists ? (snap.data() || {}) : {};
        // Capture "before" state
        const beforeState = {
            globalAiDisabled: currentData.globalAiDisabled === true,
            globalAiDisabledReason: currentData.globalAiDisabledReason || null,
            panicMode: currentData.panicMode === true,
            panicModeReason: currentData.panicModeReason || null,
        };
        // Get actor info
        const actorInfo = await getActorInfo(db, userId);
        // Update document
        const updateData = {
            panicMode: panicMode === true,
            panicModeReason: panicMode ? (reason || 'admin') : null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        // Preserve global disable if exists
        if (currentData.globalAiDisabled !== undefined) {
            updateData.globalAiDisabled = currentData.globalAiDisabled;
            updateData.globalAiDisabledReason = currentData.globalAiDisabledReason || null;
        }
        await docRef.set(updateData, { merge: true });
        // Capture "after" state
        const afterState = {
            globalAiDisabled: beforeState.globalAiDisabled,
            globalAiDisabledReason: beforeState.globalAiDisabledReason,
            panicMode: panicMode === true,
            panicModeReason: panicMode ? (reason || 'admin') : null,
        };
        // Write audit log
        await writeSystemAuditLog(db, {
            type: 'aiControls.panic',
            action: panicMode ? 'panic_mode_on' : 'panic_mode_off',
            reason: reason || 'admin',
            actorUid: userId,
            actorEmail: actorInfo.email,
            actorName: actorInfo.name,
            before: beforeState,
            after: afterState,
        });
        // Clear cache
        clearKillSwitchCache();
        logger.info('Panic mode updated', { panicMode, reason: reason || 'admin', adminId: userId });
        logger.end();
        return res.json({ ok: true });
    }
    catch (error) {
        logger.error('Error in POST /api/admin/ai-controls/set-panic', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
/**
 * GET /api/admin/ai-controls/company?companyId=...
 * Get company AI controls
 */
router.get('/company', async (req, res) => {
    try {
        logger.group('Admin AI Controls GET Company');
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
        if (!companyId) {
            logger.warn('Company ID missing');
            logger.end();
            return res.status(400).json({
                error: 'company_id_required',
                message: 'companyId parametresi gereklidir.'
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
        const docRef = db.collection('companies').doc(companyId).collection('settings').doc('aiControls');
        const snap = await docRef.get();
        if (!snap.exists) {
            logger.end();
            return res.json({
                companyId,
                companyAiDisabled: false,
                companyAiDisabledReason: null,
                updatedAtISO: null,
                updatedBy: null,
            });
        }
        const data = snap.data() || {};
        const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null;
        logger.end();
        return res.json({
            companyId,
            companyAiDisabled: data.companyAiDisabled === true,
            companyAiDisabledReason: data.companyAiDisabledReason || null,
            updatedAtISO: updatedAt,
            updatedBy: data.updatedBy || null,
        });
    }
    catch (error) {
        logger.error('Error in GET /api/admin/ai-controls/company', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
/**
 * POST /api/admin/ai-controls/company
 * Toggle company AI disable
 */
const setCompanySchema = z.object({
    companyId: z.string().min(1),
    companyAiDisabled: z.boolean(),
    reason: z.string().optional(),
});
router.post('/company', validateRequest({ body: setCompanySchema }), async (req, res) => {
    try {
        logger.group('Admin AI Controls Set Company');
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database connection failed');
            logger.end();
            return res.status(500).json({
                error: 'database_error',
                message: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const { companyId, companyAiDisabled, reason } = req.body;
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
        const docRef = db.collection('companies').doc(companyId).collection('settings').doc('aiControls');
        const snap = await docRef.get();
        const currentData = snap.exists ? (snap.data() || {}) : {};
        // Capture "before" state
        const beforeState = {
            companyAiDisabled: currentData.companyAiDisabled === true,
            companyAiDisabledReason: currentData.companyAiDisabledReason || null,
        };
        // Get actor info
        const actorInfo = await getActorInfo(db, userId);
        // Update document
        const updateData = {
            companyAiDisabled: companyAiDisabled === true,
            companyAiDisabledReason: companyAiDisabled ? (reason || 'admin') : null,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        await docRef.set(updateData, { merge: true });
        // Capture "after" state
        const afterState = {
            companyAiDisabled: companyAiDisabled === true,
            companyAiDisabledReason: companyAiDisabled ? (reason || 'admin') : null,
        };
        // Write audit log
        await writeCompanyAuditLog(db, companyId, {
            action: companyAiDisabled ? 'company_disable_on' : 'company_disable_off',
            reason: reason || 'admin',
            actorUid: userId,
            actorEmail: actorInfo.email,
            actorName: actorInfo.name,
            before: beforeState,
            after: afterState,
        });
        // Clear cache for this company
        clearKillSwitchCache(companyId);
        logger.info('Company AI controls updated', { companyId, companyAiDisabled, reason: reason || 'admin', adminId: userId });
        logger.end();
        return res.json({ ok: true });
    }
    catch (error) {
        logger.error('Error in POST /api/admin/ai-controls/company', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
export default router;
