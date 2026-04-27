/**
 * Admin Finance Snapshots Route
 * Teklifbul Rule v3.18 - FX Drift Guard
 * 
 * POST /api/admin/finance/snapshot-usdtry
 * Body: { month: "YYYY-MM" }
 * 
 * Creates or updates a monthly USD/TRY rate snapshot to prevent FX drift in historical reports.
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getUsdTryRate } from '../services/aiCostAccountingService.js';

const router = Router();

router.use(verifyToken, requireAdmin);

/**
 * Write audit log entry
 */
async function writeAuditLog(db: any, action: string, data: any) {
  try {
    const auditRef = db.collection('system_auditLogs').doc();
    await auditRef.set({
      type: `finance.${action}`,
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    });
  } catch (e: any) {
    logger.warn('[FinanceSnapshots] Failed to write audit log', { error: e.message });
  }
}

/**
 * POST /api/admin/finance/snapshot-usdtry
 * Create or update monthly USD/TRY snapshot
 */
router.post('/snapshot-usdtry', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin Finance Snapshot USD/TRY');
  
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.',
      });
    }

    const { month } = req.body;
    
    // Validate month format
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      logger.warn('Invalid month format', { month });
      logger.end();
      return res.status(400).json({
        error: 'invalid_month',
        message: 'month parametresi YYYY-MM formatında olmalıdır (örn: 2024-01).',
      });
    }

    // Get current USD/TRY rate
    const currentRate = await getUsdTryRate(db);
    
    // Check if snapshot already exists
    const snapshotRef = db.collection('system_settings').doc('financeMonthly').collection('snapshots').doc(month);
    const snapshotSnap = await snapshotRef.get();
    
    const existingSnapshot = snapshotSnap.exists ? snapshotSnap.data() : null;
    const existingRate = existingSnapshot?.usdTryRateSnapshot;
    
    // Idempotent: if snapshot exists with same rate, return success
    if (existingSnapshot && existingRate === currentRate) {
      logger.info('Snapshot already exists with same rate', { month, rate: currentRate });
      logger.end();
      return res.json({
        ok: true,
        month,
        usdTryRateSnapshot: currentRate,
        action: 'no_change',
        message: 'Snapshot zaten mevcut ve aynı kur değerine sahip.',
      });
    }

    // Write snapshot
    await snapshotRef.set({
      month,
      usdTryRateSnapshot: currentRate,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedBy: req.user!.uid,
      updatedByEmail: req.user!.email || null,
    }, { merge: true });

    // Audit log
    await writeAuditLog(db, 'snapshot_usdtry', {
      month,
      usdTryRateSnapshot: currentRate,
      previousRate: existingRate || null,
      actorUid: req.user!.uid,
      actorEmail: req.user!.email || null,
      action: existingSnapshot ? 'updated' : 'created',
    });

    logger.info('USD/TRY snapshot created/updated', {
      month,
      rate: currentRate,
      previousRate: existingRate,
      action: existingSnapshot ? 'updated' : 'created',
    });
    logger.end();

    return res.json({
      ok: true,
      month,
      usdTryRateSnapshot: currentRate,
      action: existingSnapshot ? 'updated' : 'created',
      previousRate: existingRate || null,
      message: existingSnapshot
        ? `Snapshot güncellendi: ${existingRate} → ${currentRate}`
        : `Snapshot oluşturuldu: ${currentRate}`,
    });
  } catch (error: any) {
    logger.error('Error in finance snapshot endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

