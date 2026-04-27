/**
 * Migration Status API
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * GET /api/migration-status - Migration durumu
 */

import { Router, Request, Response } from 'express';
import { getMigrationStatus } from '../../src/shared/utils/migration-enhanced.js';
import { logger } from '../../src/shared/log/logger.js';

const router = Router();

/**
 * GET /api/migration-status?runId=xxx
 * Migration durumunu döndürür
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { runId } = req.query;

    if (!runId || typeof runId !== 'string') {
      res.status(400).json({
        error: 'runId parameter is required',
        message: 'Query parameter: ?runId=xxx'
      });
      return;
    }

    const status = await getMigrationStatus(runId);

    if (!status) {
      res.status(404).json({
        error: 'Migration not found',
        message: `No migration found with runId: ${runId}`
      });
      return;
    }

    res.json(status);
  } catch (error: any) {
    logger.error('Migration status API error', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Failed to get migration status'
    });
  }
});

export default router;

