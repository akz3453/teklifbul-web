/**
 * Metrics Endpoint
 * Teklifbul Rule v1.0 - Observability v1
 * 
 * GET /metrics - Request metrics snapshot (JSON)
 * 
 * Security: Only enabled when ENABLE_METRICS=true
 */

import express from 'express';
import { metricsStore } from '../metrics/metricsStore.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';
import { logger } from '../../../src/shared/log/logger.js';

const router = express.Router();

/**
 * GET /metrics
 * Returns metrics snapshot as JSON
 * 
 * Security: Requires ENABLE_METRICS=true environment variable
 */
router.get('/', (_req, res) => {
  try {
    // Teklifbul Rule v1.0 - Metrics kapalıyken 200 + JSON (404 yerine; istemci ve konsol gürültüsü azalır)
    if (process.env.ENABLE_METRICS !== 'true') {
      return res.status(200).json({
        ok: false,
        disabled: true,
        reason: 'ENABLE_METRICS'
      });
    }

    // Get metrics snapshot
    const snapshot = metricsStore.getSnapshot();

    return res.json({
      ok: true,
      ...snapshot
    });
  } catch (error: any) {
    logger.error('Metrics endpoint error', error);
    return respondError(
      res,
      Errors.internal('Metrics alınamadı')
    );
  }
});

export default router;

