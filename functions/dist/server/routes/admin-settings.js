/**
 * Admin Settings Route
 * Teklifbul Rule v1.0 - Sistem Ayarları Yönetimi
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { serverLogger } from '../utils/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
const router = Router();
router.use(verifyToken, requireAdmin);
const SETTINGS_COLLECTION = 'system_settings';
const SETTINGS_DOC_ID = 'main';
/**
 * GET /api/admin/settings
 * Sistem ayarlarını döndürür
 */
router.get('/settings', async (req, res) => {
    logger.group('Admin settings get');
    try {
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        const settingsDoc = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
        if (!settingsDoc.exists) {
            // Varsayılan ayarlar
            // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
            const defaultSettings = {
                free: {
                    maxOffersPerMonth: 10
                },
                premium: {
                    maxOffersPerMonth: 1000
                },
                premiumPlus: {
                    maxOffersPerMonth: 10000
                }
            };
            logger.info('Settings not found, returning defaults');
            logger.end();
            return res.json(defaultSettings);
        }
        const settings = settingsDoc.data();
        logger.info('Settings fetched');
        logger.end();
        return res.json(settings);
    }
    catch (error) {
        logger.error('Settings fetch error', error);
        logger.end();
        return res.status(500).json({ error: 'SETTINGS_ERROR', message: error.message });
    }
});
/**
 * PUT /api/admin/settings
 * Sistem ayarlarını günceller
 */
router.put('/settings', validateRequest({
    body: z.object({
        free: z.object({
            maxOffersPerMonth: z.number().int().min(0)
            // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
        }).optional(),
        premium: z.object({
            maxOffersPerMonth: z.number().int().min(0)
            // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
        }).optional(),
        premiumPlus: z.object({
            maxOffersPerMonth: z.number().int().min(0)
            // Teklifbul Rule v1.0 - aiTokenLimit kaldırıldı (token paketi sistemi kullanılıyor)
        }).optional()
    })
}), async (req, res) => {
    logger.group('Admin settings update');
    try {
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        const settings = req.body;
        // Mevcut ayarları al
        const settingsDoc = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
        const existingSettings = settingsDoc.exists ? settingsDoc.data() : {};
        // Ayarları güncelle
        const updatedSettings = {
            ...existingSettings,
            ...settings,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: req.user?.uid
        };
        await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(updatedSettings, { merge: true });
        // Teklifbul Rule v1.0 - Security: Admin aksiyonlarını logla
        serverLogger.security.adminAction(req, 'update_settings', 'system');
        logger.info('Settings updated', { updatedBy: req.user?.uid });
        logger.end();
        return res.json({ ok: true, settings: updatedSettings });
    }
    catch (error) {
        logger.error('Settings update error', error);
        logger.end();
        return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
});
export default router;
