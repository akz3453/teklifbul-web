/**
 * E-Document Settings Routes
 * Teklifbul Rule v1.0 - E-Belge Ayarları Yönetimi
 *
 * Company e-belge ayarları ve credentials yönetimi
 */
import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { edocSettingsGetLimiter, edocSettingsUpdateLimiter, edocCredentialsUpdateLimiter } from '../middleware/rateLimit.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getEdocSettingsQuerySchema, updateEdocSettingsBodySchema, updateEdocCredentialsBodySchema } from '../schemas/edocSchemas.js';
import { userBelongsToCompanyAsync } from '../../utils/companyAccess.js';
const router = express.Router();
// Tüm route'lar authentication gerektirir
router.use(verifyToken);
/**
 * GET /api/edoc/settings
 * Company e-belge ayarlarını getir (credentials hariç)
 * Permission: edoc.settings.manage
 */
router.get('/settings', validate({ query: getEdocSettingsQuerySchema }), edocSettingsGetLimiter, requirePermission('edoc.settings.manage'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const companyId = req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ ok: false, error: 'companyId zorunludur' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        // Company kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        // Company doc'u al
        const companyDoc = await db.collection('companies').doc(companyId).get();
        if (!companyDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Şirket bulunamadı' });
        }
        const companyData = companyDoc.data();
        const edoc = companyData?.edoc || null;
        // Credentials'ı response'a dahil etme (güvenlik)
        const response = {
            ok: true,
            edoc: edoc ? {
                providerKey: edoc.providerKey || null,
                sender: edoc.sender || null,
                defaults: edoc.defaults || null,
                credentialsRef: edoc.credentialsRef || null, // Sadece referans
                updatedAt: edoc.updatedAt || null,
                updatedBy: edoc.updatedBy || null
            } : null
        };
        logger.info('E-belge ayarları getirildi', { companyId });
        return res.json(response);
    }
    catch (error) {
        logger.error('E-belge ayarları getirme hatası', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Ayarlar getirilemedi'
        });
    }
});
/**
 * PUT /api/edoc/settings
 * Company e-belge ayarlarını güncelle (credentials hariç)
 * Permission: edoc.settings.manage
 */
router.put('/settings', validate({ body: updateEdocSettingsBodySchema }), edocSettingsUpdateLimiter, requirePermission('edoc.settings.manage'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const body = req.body;
        if (!body.companyId || !body.edoc) {
            return res.status(400).json({ ok: false, error: 'companyId ve edoc zorunludur' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        // Company kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        // Company doc'u al
        const companyRef = db.collection('companies').doc(body.companyId);
        const companyDoc = await companyRef.get();
        if (!companyDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Şirket bulunamadı' });
        }
        const companyData = companyDoc.data();
        const existingEdoc = companyData?.edoc || {};
        // Mevcut credentialsRef'i koru
        const credentialsRef = existingEdoc.credentialsRef || null;
        // E-belge ayarlarını güncelle
        const updateData = {
            'edoc.providerKey': body.edoc.providerKey !== undefined ? body.edoc.providerKey : existingEdoc.providerKey,
            'edoc.sender': body.edoc.sender !== undefined ? body.edoc.sender : existingEdoc.sender,
            'edoc.defaults': body.edoc.defaults !== undefined ? body.edoc.defaults : existingEdoc.defaults,
            'edoc.credentialsRef': credentialsRef, // Koru
            'edoc.updatedAt': FieldValue.serverTimestamp(),
            'edoc.updatedBy': userId
        };
        await companyRef.update(updateData);
        logger.info('E-belge ayarları güncellendi', { companyId: body.companyId });
        return res.json({
            ok: true,
            message: 'E-belge ayarları güncellendi'
        });
    }
    catch (error) {
        logger.error('E-belge ayarları güncelleme hatası', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Ayarlar güncellenemedi'
        });
    }
});
/**
 * PUT /api/edoc/credentials
 * Company e-belge credentials'larını kaydet (server-only collection)
 * Permission: edoc.settings.manage
 *
 * Response asla credential değerlerini dönmez, sadece {ok:true}
 */
router.put('/credentials', validate({ body: updateEdocCredentialsBodySchema }), edocCredentialsUpdateLimiter, requirePermission('edoc.settings.manage'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const body = req.body;
        if (!body.companyId || !body.providerKey || !body.credentials) {
            return res.status(400).json({ ok: false, error: 'companyId, providerKey ve credentials zorunludur' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        // Company kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        // Company doc'u kontrol et
        const companyDoc = await db.collection('companies').doc(body.companyId).get();
        if (!companyDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Şirket bulunamadı' });
        }
        // Credentials doc'unu bul veya oluştur
        const credentialsQuery = await db.collection('company_edoc_credentials')
            .where('companyId', '==', body.companyId)
            .where('providerKey', '==', body.providerKey)
            .limit(1)
            .get();
        let credentialsRef;
        const now = FieldValue.serverTimestamp();
        if (!credentialsQuery.empty) {
            // Mevcut credentials'ı güncelle
            credentialsRef = credentialsQuery.docs[0].ref;
            await credentialsRef.update({
                credentials: body.credentials,
                updatedAt: now,
                updatedBy: userId
            });
        }
        else {
            // Yeni credentials oluştur
            const newCredentialsRef = await db.collection('company_edoc_credentials').add({
                companyId: body.companyId,
                providerKey: body.providerKey,
                credentials: body.credentials,
                createdAt: now,
                createdBy: userId,
                updatedAt: now,
                updatedBy: userId
            });
            credentialsRef = newCredentialsRef;
        }
        // Company doc'undaki credentialsRef'i güncelle
        await db.collection('companies').doc(body.companyId).update({
            'edoc.credentialsRef': credentialsRef.id,
            'edoc.updatedAt': now,
            'edoc.updatedBy': userId
        });
        logger.info('E-belge credentials kaydedildi', {
            companyId: body.companyId,
            providerKey: body.providerKey,
            credentialsRefId: credentialsRef.id
        });
        // Güvenlik: Response'da credential değerlerini döndürme
        return res.json({
            ok: true,
            message: 'Credentials kaydedildi'
        });
    }
    catch (error) {
        logger.error('E-belge credentials kaydetme hatası', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Credentials kaydedilemedi'
        });
    }
});
export default router;
