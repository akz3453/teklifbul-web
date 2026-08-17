import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { logger } from '../../../src/shared/log/logger.js';
import { checkIncomingInvoices } from '../services/efaturaService.js';
import { getCompanyIdFromRequest } from '../services/permissionService.js';
const router = express.Router();
// Tüm route'lar authentication gerektirir
router.use(verifyToken);
/**
 * GET /api/efatura/check-incoming
 * Entegratörden gelen yeni faturaları havuzuna çeker
 * Teklifbul Rule v1.0 — trusted companyId (query spoof engelli)
 */
router.get('/check-incoming', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Geçersiz veya yetkisiz şirket bilgisi' });
        }
        const result = await checkIncomingInvoices(companyId, userId);
        return res.json({
            ok: true,
            processedCount: result.processedCount,
            errors: result.errors
        });
    }
    catch (error) {
        logger.error('Gelen fatura senkronizasyon hatası', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});
export default router;
