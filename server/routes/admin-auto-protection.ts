/**
 * Admin Auto-Protection Route
 * Teklifbul Rule v3.20 - Auto-Protection Layer (DRY RUN default, Safe Apply)
 * 
 * POST /api/admin/auto-protection/run
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { runAutoProtection } from '../services/aiAutoProtectionService.js';
import { z } from 'zod';
import { validateRequest } from '../utils/input-validation.js';

const router = Router();

router.use(verifyToken, requireAdmin);

const runSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM format'),
  dryRun: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(50),
  confirm: z.string().optional(),
});

/**
 * POST /api/admin/auto-protection/run
 * Run auto-protection analysis and optionally apply actions
 */
router.post('/run', validateRequest({ body: runSchema }), async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Admin Auto-Protection Run API');

    const { month, dryRun = true, limit = 50, confirm } = req.body as any;
    const userId = req.user?.uid;

    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.',
      });
    }

    // Teklifbul Rule v3.20 - Require confirm string when dryRun=false
    if (dryRun === false) {
      if (confirm !== 'YES_I_UNDERSTAND') {
        logger.warn('Apply mode requires confirm string', { confirm });
        logger.end();
        return res.status(400).json({
          error: 'confirm_required',
          message: 'Apply modu için confirm="YES_I_UNDERSTAND" gereklidir.',
        });
      }
    }

    // Get actor info
    const { getAdminDb } = await import('../utils/firestore.js');
    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.',
      });
    }

    let actorEmail: string | null = null;
    let actorName: string | null = null;
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        actorEmail = userData.email || null;
        actorName = userData.displayName || userData.name || null;
      }
    } catch (err) {
      logger.warn('Failed to fetch user info for auto-protection', { userId, error: err });
    }

    // Run auto-protection
    const result = await runAutoProtection({
      month,
      dryRun,
      limit,
      actor: {
        uid: userId,
        email: actorEmail,
        name: actorName,
      },
    });

    logger.info('Auto-protection run completed', {
      month,
      dryRun,
      totals: result.totals,
    });
    logger.end();

    // Teklifbul Rule v3.20 - Add dryRun to response meta
    return res.json({
      ...result,
      meta: {
        dryRun,
      },
    });
  } catch (error: any) {
    logger.error('Error in auto-protection run endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

