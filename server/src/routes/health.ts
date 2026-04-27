/**
 * Health Check Endpoint
 * Teklifbul Rule v1.0 - Observability v1
 * 
 * GET /health - Uptime, version, environment bilgisi
 */

import express from 'express';
import { logger } from '../../../src/shared/log/logger.js';

const router = express.Router();

/**
 * GET /health
 * Health check endpoint - uptime, version, environment
 */
router.get('/', async (_req, res) => {
  try {
    const response = {
      ok: true,
      status: 'ok',
      service: 'teklifbul-api',
      version: process.env.APP_VERSION || 'dev',
      environment: process.env.NODE_ENV || 'development',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };

    // Teklifbul Rule v1.0 - Firestore ping opsiyonel (çok maliyetliyse yapma)
    // Şimdilik basit health check, ileride Firestore ping eklenebilir
    // if (process.env.HEALTH_CHECK_FIRESTORE === 'true') {
    //   try {
    //     const { getAdminDb } = await import('../../utils/firestore.js');
    //     const db = await getAdminDb();
    //     if (db) {
    //       // Ping test (basit bir read)
    //       await db.collection('_health').limit(1).get();
    //       response.firestore = 'ok';
    //     }
    //   } catch (err) {
    //     response.firestore = 'error';
    //     logger.warn('Health check: Firestore ping failed', err);
    //   }
    // }

    return res.json(response);
  } catch (error: any) {
    logger.error('Health check error', error);
    return res.status(500).json({
      ok: false,
      status: 'error',
      service: 'teklifbul-api',
      error: error.message || 'Health check failed'
    });
  }
});

export default router;

