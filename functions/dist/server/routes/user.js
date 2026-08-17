/**
 * User Settings Routes
 * Teklifbul Rule v1.0 - User Profile Management
 *
 * Kullanıcı profil ve ayar güncellemeleri
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
const router = Router();
/**
 * GET /api/user
 * Kullanıcı bilgilerini döndürür (companyId, activeCompanyId vb.)
 *
 * Headers:
 * Authorization: Bearer <firebase-id-token>
 *
 * Response: {
 *   uid: string,
 *   email: string,
 *   companyId?: string,
 *   activeCompanyId?: string,
 *   ...
 * }
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        logger.group('Get User Info');
        const userId = req.user.uid;
        const db = await getAdminDb();
        if (!db) {
            logger.error('Firestore unavailable');
            logger.end();
            return res.status(500).json({
                error: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            logger.warn('User not found', { userId });
            logger.end();
            return res.status(404).json({
                error: 'Kullanıcı bulunamadı.'
            });
        }
        const userData = userDoc.data() || {};
        // Teklifbul Rule v1.0 - Eğer companyId bulunamadıysa ve companyCode varsa, companyJoinRequests'ten kontrol et
        // Bu, şirket kodunu girerek kayıt olan kullanıcılar için companyId'nin görünmesini sağlar
        let companyId = userData.companyId || null;
        if (!companyId && userData.companyCode) {
            try {
                const joinRequestsQuery = db.collection('companyJoinRequests')
                    .where('userId', '==', userId)
                    .where('status', 'in', ['pending', 'accepted']);
                const joinRequestsSnapshot = await joinRequestsQuery.get();
                if (!joinRequestsSnapshot.empty) {
                    // En son isteği al (pending veya accepted)
                    const latestRequest = joinRequestsSnapshot.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => {
                        const aTime = a.createdAt?.toMillis?.() || 0;
                        const bTime = b.createdAt?.toMillis?.() || 0;
                        return bTime - aTime;
                    })[0];
                    if (latestRequest?.companyId) {
                        companyId = latestRequest.companyId;
                        logger.info('CompanyId companyJoinRequests\'ten bulundu', {
                            companyId,
                            requestId: latestRequest.id,
                            status: latestRequest.status
                        });
                    }
                }
            }
            catch (joinRequestError) {
                logger.warn('companyJoinRequests kontrolü sırasında hata', joinRequestError);
            }
        }
        // Kullanıcı bilgilerini döndür
        const response = {
            uid: userId,
            email: req.user.email,
            companyId: companyId || null,
            activeCompanyId: userData.activeCompanyId || companyId || null,
            ...userData
        };
        logger.info('User info retrieved', { userId, hasCompanyId: !!response.companyId });
        logger.end();
        return res.json(response);
    }
    catch (error) {
        logger.error('Get user info error', error);
        logger.end();
        return res.status(500).json({
            error: 'Kullanıcı bilgileri alınırken bir hata oluştu.',
            details: error.message
        });
    }
});
/**
 * POST /api/user/sync-company-context
 * Kullanıcının companyId / activeCompanyId alanlarını güvenli fallback ile senkronlar.
 */
router.post('/sync-company-context', verifyToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        logger.group('Sync Company Context');
        const userId = req.user.uid;
        const db = await getAdminDb();
        if (!db) {
            logger.error('Firestore unavailable');
            logger.end();
            return res.status(500).json({ error: 'Veritabanı bağlantısı kurulamadı.' });
        }
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            logger.warn('User not found', { userId });
            logger.end();
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
        const userData = userDoc.data() || {};
        const joinStatus = userData.companyJoinStatus || null;
        const isAccepted = joinStatus === 'accepted' || joinStatus === 'approved';
        const isPending = joinStatus === 'pending';
        const existingCompanyId = typeof userData.companyId === 'string' ? userData.companyId : null;
        let resolvedCompanyId = existingCompanyId || userData.activeCompanyId || null;
        let resolvedFrom = existingCompanyId ? 'profile' : 'none';
        if ((!resolvedCompanyId || resolvedCompanyId.startsWith('solo-')) && userData.companyCode) {
            const joinRequestsQuery = db
                .collection('companyJoinRequests')
                .where('userId', '==', userId)
                .where('status', 'in', ['pending', 'accepted', 'approved']);
            const joinRequestsSnapshot = await joinRequestsQuery.get();
            if (!joinRequestsSnapshot.empty) {
                const allRequests = joinRequestsSnapshot.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });
                const acceptedRequest = allRequests.find((r) => r.status === 'accepted' || r.status === 'approved') || null;
                const pendingRequest = allRequests.find((r) => r.status === 'pending') || null;
                const preferred = acceptedRequest || pendingRequest;
                if (preferred?.companyId) {
                    resolvedCompanyId = preferred.companyId;
                    resolvedFrom = 'companyJoinRequests';
                }
            }
        }
        if ((!resolvedCompanyId || resolvedCompanyId.startsWith('solo-')) && userData.companyCode) {
            const companyByCode = await db
                .collection('companies')
                .where('code', '==', userData.companyCode)
                .limit(1)
                .get();
            if (!companyByCode.empty) {
                resolvedCompanyId = companyByCode.docs[0].id;
                resolvedFrom = 'companyCode';
            }
        }
        if (!resolvedCompanyId || resolvedCompanyId.startsWith('solo-') || isPending || !isAccepted) {
            logger.info('Sync skipped: unresolved or not accepted', {
                userId,
                joinStatus,
                hasResolvedCompanyId: !!resolvedCompanyId,
                resolvedFrom
            });
            logger.end();
            return res.status(200).json({
                success: false,
                synced: false,
                reason: 'NO_SYNC_APPLIED',
                joinStatus,
                resolvedFrom
            });
        }
        if (existingCompanyId && existingCompanyId !== resolvedCompanyId) {
            logger.warn('Sync conflict detected', {
                userId,
                existingCompanyId,
                resolvedCompanyId
            });
            logger.end();
            return res.status(409).json({
                success: false,
                synced: false,
                reason: 'COMPANY_ID_CONFLICT'
            });
        }
        const updatePayload = {
            companyId: resolvedCompanyId,
            activeCompanyId: userData.activeCompanyId || resolvedCompanyId,
            updatedAt: new Date()
        };
        if (Array.isArray(userData.companies)) {
            if (!userData.companies.includes(resolvedCompanyId)) {
                updatePayload.companies = Array.from(new Set([...userData.companies, resolvedCompanyId]));
            }
        }
        else {
            updatePayload.companies = [resolvedCompanyId];
        }
        await userRef.update(updatePayload);
        logger.info('Company context synced', { userId, resolvedCompanyId, resolvedFrom });
        logger.end();
        return res.status(200).json({
            success: true,
            synced: true,
            companyId: resolvedCompanyId,
            resolvedFrom
        });
    }
    catch (error) {
        logger.error('Sync company context error', error);
        logger.end();
        return res.status(500).json({
            success: false,
            error: 'Şirket bağlamı senkronlanamadı.',
            details: error.message
        });
    }
});
/**
 * POST /api/user/ai-provider
 * Kullanıcının AI provider tercihini günceller
 *
 * Body: { provider: "gemini" | "openai" }
 * Response: { success: true, provider: "gemini" }
 */
router.post('/ai-provider', verifyToken, validateRequest({
    body: z.object({
        provider: z.enum(['gemini', 'openai']).refine((val) => val === 'gemini' || val === 'openai', { message: 'Geçersiz provider değeri. "gemini" veya "openai" olmalıdır.' })
    })
}), async (req, res) => {
    try {
        if (!req.user) {
            logger.warn('User not authenticated');
            logger.end();
            return res.status(401).json({ error: 'Unauthorized' });
        }
        logger.group('Update AI Provider');
        const userId = req.user.uid;
        const { provider } = req.body;
        // Kullanıcının planını kontrol et (sadece Premium Plus)
        const db = await getAdminDb();
        if (!db) {
            logger.error('Firestore unavailable');
            logger.end();
            return res.status(500).json({
                error: 'Veritabanı bağlantısı kurulamadı.'
            });
        }
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            logger.warn('User not found', { userId });
            logger.end();
            return res.status(404).json({
                error: 'Kullanıcı bulunamadı.'
            });
        }
        const userData = userDoc.data() || {};
        const planId = userData.planId || 'free';
        // Premium Plus kontrolü
        if (planId !== 'premium_plus') {
            logger.warn('AI provider update attempted for non-premium-plus user', { userId, planId });
            logger.end();
            return res.status(403).json({
                error: 'Yapay zekâ motoru seçimi sadece Premium Plus planında kullanılabilir.'
            });
        }
        // AI provider'ı güncelle
        await db.collection('users').doc(userId).update({
            ai_provider: provider,
            updatedAt: new Date()
        });
        logger.info('AI provider updated successfully', { userId, provider });
        logger.end();
        return res.json({
            success: true,
            provider,
            message: 'Yapay zekâ motoru başarıyla güncellendi.'
        });
    }
    catch (error) {
        logger.error('AI provider update error', error);
        logger.end();
        return res.status(500).json({
            error: 'Yapay zekâ motoru güncellenirken bir hata oluştu.',
            details: error.message
        });
    }
});
export default router;
