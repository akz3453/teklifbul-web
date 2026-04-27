import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { checkIncomingInvoices } from '../services/efaturaService.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(verifyToken);

/**
 * GET /api/efatura/check-incoming
 * Entegratörden gelen yeni faturaları havuzuna çeker
 */
router.get('/check-incoming', async (req: any, res) => {
  try {
    const companyId = req.query.companyId;
    const userId = req.user?.uid;

    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'companyId zorunludur' });
    }

    const result = await checkIncomingInvoices(companyId, userId);

    return res.json({
      ok: true,
      processedCount: result.processedCount,
      errors: result.errors
    });
  } catch (error: any) {
    logger.error('Gelen fatura senkronizasyon hatası', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
