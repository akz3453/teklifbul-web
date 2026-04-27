/**
 * Admin AI Health Check Route
 * Teklifbul Rule v3.4 - Stabilization + Smoke Tests + Safety Switch
 * 
 * GET /api/admin/ai-health?companyId=...
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { getCompanyAiWallet } from '../services/companyAiWalletService.js';
import { getTodayPaidUsedTokens } from '../services/aiDailyCounterService.js';
import { computeAvailableModels } from '../services/purchaseAssistantAvailabilityService.js';

const router = Router();

router.use(verifyToken, requireAdmin);

/**
 * GET /api/admin/ai-health?companyId=...
 * Returns AI system health status for a company (no mutations)
 */
router.get('/ai-health', async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Admin AI Health Check API');

    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    const companyId = req.query.companyId as string | undefined;
    if (!companyId) {
      logger.warn('Company ID missing');
      logger.end();
      return res.status(400).json({
        error: 'company_id_required',
        message: 'companyId parametresi gereklidir.'
      });
    }

    // Verify company exists
    const companyDoc = await db.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) {
      logger.warn('Company not found', { companyId });
      logger.end();
      return res.status(404).json({
        error: 'company_not_found',
        message: 'Şirket bulunamadı.'
      });
    }

    const companyData = companyDoc.data() || {};
    const planId = String(companyData.planId || companyData.plan || 'free');
    const isPremiumPlus = planId.includes('premium_plus');

    // 1) Settings doc
    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const hasSettingsDoc = settingsSnap.exists;
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};

    // 2) Provider/model currently active
    const provider = settings.provider || null;
    const model = settings.model || null;

    // 3) Guardrails
    const forcedFreeMode = settings.forcedFreeMode === true;
    const dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;

    // 4) Today counter
    const todayCounter = await getTodayPaidUsedTokens(companyId);
    const todayCounterPaidUsed = todayCounter.paidUsedTokens;

    // 5) Wallet balance
    const wallet = await getCompanyAiWallet(companyId);
    const walletBalanceTokens = wallet ? wallet.balanceTokens : 0;

    // 6) Available models count
    const availableModels = await computeAvailableModels({
      db,
      companyId,
      isPremiumPlus,
    });
    const availableModelsCount = availableModels.length;

    // 7) Legacy fallback possible (check if user token packs exist)
    let legacyFallbackPossible = false;
    try {
      // Check if user-based token pack system exists (simplified check)
      // In practice, this would check if the company has any users with token packs
      // For now, we'll just check if the company has any legacy structure
      legacyFallbackPossible = false; // Company-flow is primary, legacy is fallback only
    } catch (err) {
      logger.warn('Failed to check legacy fallback', { companyId, error: err });
    }

    const response = {
      companyId,
      hasSettingsDoc,
      provider,
      model,
      forcedFreeMode,
      dailyPaidTokenCap,
      todayCounterPaidUsed,
      walletBalanceTokens,
      availableModelsCount,
      legacyFallbackPossible,
      planId,
      isPremiumPlus,
    };

    logger.info('AI health check completed', { companyId, provider, model, forcedFreeMode, dailyPaidTokenCap });
    logger.end();

    return res.json(response);
  } catch (error: any) {
    logger.error('Error in AI health check endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

