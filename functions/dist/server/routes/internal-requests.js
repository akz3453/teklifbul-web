// Teklifbul Rule v1.0 — İç talep onay/red (Admin SDK; client APPROVED/REJECTED yazamaz)
import { Router } from 'express';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { getAdminDb } from '../utils/firestore.js';
import { validateRequest } from '../utils/input-validation.js';
import { canTransitionInternalRequestStatus } from '../utils/internal-request-status.js';
import { logger } from '../../src/shared/log/logger.js';
const router = Router();
router.use(verifyToken);
router.use(requirePremium);
const statusBodySchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED', 'cancelled', 'CANCELLED']),
    rejectionReason: z.string().max(2000).optional(),
    forwardedToPurchasing: z.boolean().optional(),
});
const idParamsSchema = z.object({
    id: z.string().min(1).max(128),
});
router.patch('/:id/status', validateRequest({ params: idParamsSchema, body: statusBodySchema }), async (req, res) => {
    try {
        logger.group('İç talep status');
        const userId = req.user?.uid;
        if (!userId) {
            logger.end();
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            logger.warn('İç talep status: trusted company yok', { userId });
            logger.end();
            res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
            return;
        }
        const db = await getAdminDb();
        if (!db) {
            logger.end();
            res.status(500).json({ ok: false, error: 'Veritabanı bağlantısı yok' });
            return;
        }
        const requestId = String(req.params.id);
        const body = req.body;
        const ref = db.collection('internal_requests').doc(requestId);
        const snap = await ref.get();
        if (!snap.exists) {
            logger.end();
            res.status(404).json({ ok: false, error: 'Talep bulunamadı' });
            return;
        }
        const data = snap.data() || {};
        if (data.companyId !== companyId) {
            logger.warn('İç talep status: şirket uyuşmazlığı', { requestId, companyId });
            logger.end();
            res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
            return;
        }
        const currentStatus = typeof data.status === 'string' ? data.status : 'DRAFT';
        if (!canTransitionInternalRequestStatus(currentStatus, body.status)) {
            logger.warn('İç talep status: geçiş yasak', { currentStatus, next: body.status });
            logger.end();
            res.status(400).json({ ok: false, error: 'Bu duruma geçiş yapılamaz' });
            return;
        }
        const patch = {
            status: body.status,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        if (body.status === 'APPROVED') {
            patch.approvedAt = FieldValue.serverTimestamp();
            patch.approvedBy = userId;
            if (body.forwardedToPurchasing === true) {
                patch.forwardedToPurchasing = true;
                patch.forwardedAt = FieldValue.serverTimestamp();
                patch.forwardedBy = userId;
            }
        }
        if (body.status === 'REJECTED') {
            patch.rejectedAt = FieldValue.serverTimestamp();
            patch.rejectedBy = userId;
            if (body.rejectionReason) {
                patch.rejectionReason = body.rejectionReason;
            }
        }
        await ref.update(patch);
        logger.info('İç talep status güncellendi', { requestId, status: body.status });
        logger.end();
        res.json({ ok: true, id: requestId, status: body.status });
    }
    catch (err) {
        logger.error('İç talep status hatası', err);
        logger.end();
        res.status(500).json({ ok: false, error: 'Sunucu hatası' });
    }
});
export default router;
