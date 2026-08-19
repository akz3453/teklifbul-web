/**
 * POST /api/settings/purchase-assistant/restore-paid
 * Restore to paid model (multi-provider safe)
 * Teklifbul Rule v3.5.2
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAccountSubscriptionSummary } from '../services/subscriptionService.js';
import { FieldValue } from 'firebase-admin/firestore';
import { computeAvailableModels, loadAiModelCatalog } from '../services/purchaseAssistantAvailabilityService.js';
import { computeRestorePaidStatus } from '../services/restorePaidStatusHelper.js'; // Teklifbul Rule v3.7 - DRY helper
import { AI_ERROR_CODES } from '../constants/aiMeta.js';
import { mapAiError } from '../utils/aiErrorMapper.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';

async function getCompanyContext(req: AuthenticatedRequest): Promise<{ userId: string; companyId: string | null }> {
  const userId = req.user?.uid || '';
  if (!userId) return { userId: '', companyId: null };

  const db = await getAdminDb();
  if (!db) return { userId, companyId: null };

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? (userDoc.data() || {}) : {};
  const headerCompanyId = req.headers['x-company-id'] as string | undefined;
  const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
    userId,
    path: req.path,
  });
  return { userId, companyId };
}

function computePlanFlags(planId: string | null): { planId: string; isPremiumPlus: boolean; isPremium: boolean } {
  const id = planId || 'free';
  return {
    planId: id,
    isPremiumPlus: id === 'premium_plus',
    isPremium: id === 'premium' || id === 'premium_plus',
  };
}

const router = Router();

router.post('/restore-paid', verifyToken, async (req: AuthenticatedRequest, res) => {
  logger.group('purchase-assistant-restore-paid:post');
  try {
    if (!req.user?.uid) {
      logger.end();
      return res.status(401).json({ error: 'auth_required', message: 'Bu işlem için giriş yapmalısınız.' });
    }
    const { userId, companyId } = await getCompanyContext(req);
    if (!companyId) {
      logger.end();
      return res.status(400).json({ error: 'company_required', message: 'Şirket bilgisi bulunamadı.' });
    }

    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'db_unavailable', message: 'Veritabanı bağlantısı kurulamadı.' });
    }

    // Determine plan
    let planId: string | null = null;
    try {
      const cdoc = await db.collection('companies').doc(companyId).get();
      const cdata = cdoc.exists ? (cdoc.data() || {}) : {};
      planId = cdata.planId || cdata.plan || cdata.subscriptionPlanId || cdata.subscription?.planId || null;
    } catch {}
    if (!planId && userId) {
      const summary = await getAccountSubscriptionSummary(userId);
      planId = summary.plan.planId;
    }
    const plan = computePlanFlags(planId);

    // Read current settings
    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};

    // Teklifbul Rule v3.5.2 - Check forcedFreeMode
    if (settings.forcedFreeMode === true) {
      logger.warn('Restore blocked: forcedFreeMode active', { companyId });
      logger.end();
      const errorMap = mapAiError(AI_ERROR_CODES.FORCED_FREE_MODE_ACTIVE);
      return res.status(errorMap.status).json({
        error: errorMap.code,
        message: errorMap.userMessage,
      });
    }

    // Compute available models
    const availableModels = await computeAvailableModels({
      db,
      companyId,
      isPremiumPlus: plan.isPremiumPlus,
    });

    // Filter paid candidates (freeEligible !== true and isActive)
    const paidCandidates = availableModels.filter(m => m.freeEligible !== true);

    if (paidCandidates.length === 0) {
      logger.warn('Restore blocked: no paid models available', { companyId });
      logger.end();
      const errorMap = mapAiError(AI_ERROR_CODES.NO_PAID_MODEL_AVAILABLE);
      return res.status(errorMap.status).json({
        error: errorMap.code,
        message: errorMap.userMessage,
      });
    }

    // Load catalog for sort information
    const catalog = await loadAiModelCatalog(db);
    const catalogMap = new Map<string, { sort?: number }>();
    catalog.forEach(m => {
      const key = `${m.provider}::${m.model}`;
      catalogMap.set(key, { sort: m.sort });
    });

    // Teklifbul Rule v3.12 - Selection logic with provider wallet preference
    // 1) Try lastPaidProvider/lastPaidModel if exists, in paidCandidates, AND has wallet balance
    let targetProvider: string | null = null;
    let targetModel: string | null = null;
    let usedFallback = false;

    const { getCompanyAiWallet } = await import('../services/companyAiWalletService.js');
    const { getAiMinTokens } = await import('../services/aiMinTokens.js');
    const MIN_TOKENS = getAiMinTokens();

    const lastPaidProvider = settings.lastPaidProvider;
    const lastPaidModel = settings.lastPaidModel;

    if (lastPaidProvider && lastPaidModel) {
      const found = paidCandidates.find(
        m => m.provider === lastPaidProvider && m.model === lastPaidModel
      );
      if (found) {
        // Check wallet balance for lastPaid provider
        const providerKey = lastPaidProvider === 'openai' || lastPaidProvider.startsWith('openai') ? 'openai' : 
                            lastPaidProvider === 'gemini' || lastPaidProvider.startsWith('gemini') ? 'gemini' : 
                            lastPaidProvider.toLowerCase();
        const providerWallet = await getCompanyAiWallet(companyId, providerKey);
        const walletBalance = providerWallet?.balanceTokens || 0;
        
        if (walletBalance >= MIN_TOKENS) {
          targetProvider = lastPaidProvider;
          targetModel = lastPaidModel;
        } else {
          logger.warn('LastPaid provider has insufficient wallet', { 
            provider: lastPaidProvider, 
            providerKey, 
            walletBalance, 
            min: MIN_TOKENS 
          });
        }
      }
    }

    // 2) If lastPaid not found/available or insufficient wallet, select best candidate with wallet
    if (!targetProvider || !targetModel) {
      usedFallback = true;
      
      // Sort by: sort (ascending, default 9999), then provider (alphabetical), then model (alphabetical)
      paidCandidates.sort((a, b) => {
        const keyA = `${a.provider}::${a.model}`;
        const keyB = `${b.provider}::${b.model}`;
        const sortA = catalogMap.get(keyA)?.sort ?? 9999;
        const sortB = catalogMap.get(keyB)?.sort ?? 9999;
        if (sortA !== sortB) return sortA - sortB;
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider, 'en');
        return a.model.localeCompare(b.model, 'en');
      });
      
      // Find first candidate with sufficient wallet balance
      for (const candidate of paidCandidates) {
        const providerKey = candidate.provider === 'openai' || candidate.provider.startsWith('openai') ? 'openai' : 
                            candidate.provider === 'gemini' || candidate.provider.startsWith('gemini') ? 'gemini' : 
                            candidate.provider.toLowerCase();
        const providerWallet = await getCompanyAiWallet(companyId, providerKey);
        const walletBalance = providerWallet?.balanceTokens || 0;
        
        if (walletBalance >= MIN_TOKENS) {
          targetProvider = candidate.provider;
          targetModel = candidate.model;
          break;
        }
      }
      
      // If no candidate has sufficient wallet, use first candidate anyway (will fail at consumption with clear error)
      if (!targetProvider || !targetModel) {
        const best = paidCandidates[0];
        targetProvider = best.provider;
        targetModel = best.model;
        logger.warn('No paid candidate has sufficient wallet, using first candidate', { 
          provider: targetProvider, 
          model: targetModel 
        });
      }
    }

    // Update settings
    const nextSettings = {
      provider: targetProvider,
      model: targetModel,
      profile: settings.profile || 'fast', // Preserve existing profile or default to fast
      dictionaryLearning: settings.dictionaryLearning !== undefined ? settings.dictionaryLearning : true,
      lastPaidProvider: targetProvider, // Update lastPaid tracking
      lastPaidModel: targetModel,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId,
    };

    await settingsRef.set(nextSettings, { merge: true });

    // Invalidate cache
    const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
    invalidateAvailableModelsCache(companyId);

    logger.info('Restore paid successful', {
      companyId,
      restoredTo: { provider: targetProvider, model: targetModel },
      usedFallback,
    });
    logger.end();

    return res.json({
      ok: true,
      provider: targetProvider,
      model: targetModel,
      meta: {
        restoredPaid: true,
        restoredTo: { provider: targetProvider, model: targetModel },
        usedFallback,
      },
    });
  } catch (e: any) {
    logger.error('purchase-assistant-restore-paid:post error', e);
    logger.end();
    return res.status(500).json({ error: 'internal_error', message: e?.message || 'Bilinmeyen hata' });
  }
});

/**
 * GET /api/settings/purchase-assistant/restore-paid/status
 * Read-only status check for restore paid eligibility
 * Teklifbul Rule v3.7
 */
router.get('/restore-paid/status', verifyToken, async (req: AuthenticatedRequest, res) => {
  logger.group('purchase-assistant-restore-paid-status:get');
  try {
    if (!req.user?.uid) {
      logger.end();
      return res.status(401).json({ error: 'auth_required', message: 'Bu işlem için giriş yapmalısınız.' });
    }
    const { userId, companyId } = await getCompanyContext(req);
    if (!companyId) {
      logger.end();
      return res.status(400).json({ error: 'company_required', message: 'Şirket bilgisi bulunamadı.' });
    }

    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'db_unavailable', message: 'Veritabanı bağlantısı kurulamadı.' });
    }

    // Determine plan
    let planId: string | null = null;
    try {
      const cdoc = await db.collection('companies').doc(companyId).get();
      const cdata = cdoc.exists ? (cdoc.data() || {}) : {};
      planId = cdata.planId || cdata.plan || cdata.subscriptionPlanId || cdata.subscription?.planId || null;
    } catch {}
    if (!planId && userId) {
      const summary = await getAccountSubscriptionSummary(userId);
      planId = summary.plan.planId;
    }
    const plan = computePlanFlags(planId);

    // Read current settings
    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};

    // Teklifbul Rule v3.7 - Use shared helper
    const status = await computeRestorePaidStatus({
      db,
      companyId,
      userId,
      settings,
      planId,
    });

    logger.info('Restore paid status', {
      companyId,
      ...status,
    });
    logger.end();

    return res.json(status);
  } catch (e: any) {
    logger.error('purchase-assistant-restore-paid-status:get error', e);
    logger.end();
    return res.status(500).json({ error: 'internal_error', message: e?.message || 'Bilinmeyen hata' });
  }
});

export default router;



