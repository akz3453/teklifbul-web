/**
 * Metrics Endpoint
 * Teklifbul Rule v1.0 - Observability v1
 * 
 * GET /metrics - Request metrics snapshot (JSON)
 * 
 * Security: ENABLE_METRICS=true AND METRICS_ACCESS_SECRET header required
 */

import express from 'express';
import { metricsStore } from '../metrics/metricsStore.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';
import { logger } from '../../../src/shared/log/logger.js';

const router = express.Router();

/**
 * GET /metrics
 */
router.get('/', (req, res) => {
  try {
    if (process.env.ENABLE_METRICS !== 'true') {
      return res.status(200).json({
        ok: false,
        disabled: true,
        reason: 'ENABLE_METRICS'
      });
    }

    const secret = String(process.env.METRICS_ACCESS_SECRET || '').trim();
    if (!secret) {
      logger.warn('ENABLE_METRICS=true but METRICS_ACCESS_SECRET missing — denying');
      return res.status(403).json({
        ok: false,
        error: 'metrics_misconfigured',
        message: 'METRICS_ACCESS_SECRET tanımlı değil.',
      });
    }

    const provided = String(req.headers['x-metrics-secret'] || '').trim();
    if (!provided || provided !== secret) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Geçersiz metrics erişimi.',
      });
    }

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
