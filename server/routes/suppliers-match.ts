/**
 * Teklifbul Rule v1.0 — POST /api/suppliers/match
 * Talep yayınında kategori bazlı tedarikçi eşleme (Admin SDK)
 */

import { Router } from 'express';
import { logger } from '../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { matchSuppliersByCategories } from '../services/matchSuppliersByCategories.js';

const router = Router();

router.post('/match', async (req: AuthenticatedRequest, res) => {
  logger.group('POST /api/suppliers/match');
  try {
    const userId = req.user?.uid;
    if (!userId) {
      logger.end();
      return res.status(401).json({ ok: false, error: 'auth_required' });
    }

    const body = req.body || {};
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map(String).filter(Boolean) : [];
    const legacySlugs = Array.isArray(body.legacySlugs) ? body.legacySlugs.map(String).filter(Boolean) : [];
    const legacyNames = Array.isArray(body.legacyNames) ? body.legacyNames.map(String).filter(Boolean) : [];

    if (!categoryIds.length && !legacySlugs.length && !legacyNames.length) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'categoryIds_required' });
    }

    if (categoryIds.length > 50 || legacySlugs.length > 50 || legacyNames.length > 50) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'too_many_categories' });
    }

    const suppliers = await matchSuppliersByCategories({ categoryIds, legacySlugs, legacyNames });
    logger.info('Match ok', { userId, count: suppliers.length });
    logger.end();
    return res.json({ ok: true, suppliers });
  } catch (err: any) {
    logger.error('Supplier match failed', err);
    logger.end();
    const code = err?.message === 'firestore_unavailable' ? 503 : 500;
    return res.status(code).json({
      ok: false,
      error: err?.message || 'match_failed',
    });
  }
});

export default router;
