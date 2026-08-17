/**
 * Purchase Assistant Settings (Company-based)
 * Teklifbul Rule v1.0
 *
 * GET/POST /api/settings/purchase-assistant
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAccountSubscriptionSummary } from '../services/subscriptionService.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { computeAvailableModels } from '../services/purchaseAssistantAvailabilityService.js';
import { isPremiumBypassUser } from '../utils/premiumBypass.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';

async function getCompanyContext(req: AuthenticatedRequest) {
  const userId = req.user?.uid;
  if (!userId) return { userId: null, companyId: null, userData: null as any };

  const db = await getAdminDb();
  if (!db) return { userId, companyId: null, userData: null as any };

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? (userDoc.data() || {}) : {};
  const headerCompanyId = req.headers['x-company-id'] as string | undefined;
  const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
    userId,
    path: req.path,
  });
  return { userId, companyId: companyId || null, userData };
}

function computePlanFlags(planId: string | null | undefined) {
  const pid = String(planId || 'free');
  const isPremiumPlus = pid.includes('premium_plus');
  const isPremium = isPremiumPlus || pid.includes('premium');
  return { planId: pid, isPremium, isPremiumPlus };
}

function computeModelAccessHints(params: {
  catalog: any[];
  availableModels: any[];
  isPremiumPlus: boolean;
}) {
  const { catalog, availableModels, isPremiumPlus } = params;
  const activeCatalog = (catalog || [])
    .filter((m: any) => m && m.isActive !== false && m.provider !== 'ollama');
  const availableSet = new Set(
    (availableModels || []).map((m: any) => `${String(m.provider || '')}::${String(m.model || '')}`)
  );

  const lockedModels = activeCatalog
    .filter((m: any) => !availableSet.has(`${String(m.provider || '')}::${String(m.model || '')}`))
    .map((m: any) => ({
      provider: String(m.provider || ''),
      model: String(m.model || ''),
      label: String(m.label || `${m.provider}/${m.model}`),
      reason: !isPremiumPlus
        ? 'Premium Plus plan gerekli'
        : (m.freeEligible === true ? 'Geçici erişim kısıtı' : 'Paket/entitlement gerekli'),
    }));

  return {
    totalActiveModels: activeCatalog.length,
    availableModelsCount: (availableModels || []).length,
    lockedModelsCount: lockedModels.length,
    lockedModels: lockedModels.slice(0, 20),
  };
}

const router = Router();

const postSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(['openai', 'gemini', 'groq']), // Teklifbul Rule v1.0 - Groq support added, Ollama removed
  model: z.string().min(1),
  profile: z.enum(['fast', 'balanced', 'quality']).optional(),
  dictionaryLearning: z.boolean().optional(),
  customInstructions: z.string().max(2000).optional(), // Teklifbul Rule v1.0 - Added custom instructions
});

router.get('/', verifyToken, async (req: AuthenticatedRequest, res) => {
  logger.group('purchase-assistant-settings:get');
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

    // Plan flags (company-first) for UI gating
    let planId: string | null = null;
    try {
      const cdoc = await db.collection('companies').doc(companyId).get();
      const cdata = cdoc.exists ? (cdoc.data() || {}) : {};
      planId = cdata.planId || cdata.plan || cdata.subscriptionPlanId || cdata.subscription?.planId || null;
    } catch (e) {
      logger.warn('Company plan read failed, falling back to account summary', { error: (e as any)?.message || e });
    }
    if (!planId && userId) {
      const summary = await getAccountSubscriptionSummary(userId);
      planId = summary.plan.planId;
    }
    const plan = isPremiumBypassUser(req.user)
      ? computePlanFlags('premium_plus_admin')
      : computePlanFlags(planId);

    // Settings doc
    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};

    // Teklifbul Rule v3.12 - Provider-specific wallets
    const { getCompanyAiWallet } = await import('../services/companyAiWalletService.js');
    const openaiWallet = await getCompanyAiWallet(companyId, 'openai');
    const geminiWallet = await getCompanyAiWallet(companyId, 'gemini');
    const legacyWallet = await getCompanyAiWallet(companyId); // Legacy wallet (no providerKey)

    // Aggregate total for backward compatibility
    const totalBalance = (openaiWallet?.balanceTokens || 0) + (geminiWallet?.balanceTokens || 0) + (legacyWallet?.balanceTokens || 0);

    const wallet = {
      balanceTokens: totalBalance, // Backward compatibility
      providerWallets: {
        openai: openaiWallet?.balanceTokens || 0,
        gemini: geminiWallet?.balanceTokens || 0,
        legacy: legacyWallet?.balanceTokens || 0,
      },
    };

    // Packages (use /api/ai/token-packages separately in UI; here we can return empty)
    // Keep as empty; frontend will call /api/ai/token-packages adapter endpoint.

    const availableModels = await computeAvailableModels({
      db,
      companyId,
      isPremiumPlus: plan.isPremiumPlus,
    });
    const catalogSnap = await db.collection('ai_model_catalog').get();
    const catalogModels = catalogSnap.docs.map((d: any) => ({ ...(d.data() || {}) }));
    const modelAccessHints = computeModelAccessHints({
      catalog: catalogModels,
      availableModels,
      isPremiumPlus: plan.isPremiumPlus,
    });

    // Teklifbul Rule v3.1 - Get today's paid token usage
    const { getTodayPaidUsedTokens } = await import('../services/aiDailyCounterService.js');
    const todayPaidUsage = await getTodayPaidUsedTokens(companyId);

    logger.info('purchase-assistant-settings:get ok', {
      companyId,
      planId: plan.planId,
      availableModelsCount: availableModels.length,
    });
    logger.end();
    return res.json({
      plan,
      settings: {
        enabled: settings.enabled !== false,
        // Teklifbul Rule v1.0 - Default provider: ücretsiz Groq (tüm planlar)
        provider: settings.provider || 'groq',
        model: settings.model || 'llama-3.3-70b-versatile',
        profile: settings.profile || 'balanced',
        dictionaryLearning: settings.dictionaryLearning === true,
        customInstructions: settings.customInstructions || '', // Teklifbul Rule v1.0
        // Teklifbul Rule v2.8 - Guardrails visibility
        forcedFreeMode: settings.forcedFreeMode === true,
        forcedFreeModeReason: settings.forcedFreeModeReason || null,
        dailyPaidTokenCap: typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null,
        dailyPaidTokenCapReason: settings.dailyPaidTokenCapReason || null,
      },
      wallet: {
        balanceTokens: Number(wallet.balanceTokens || 0),
        providerWallets: wallet.providerWallets || {}, // Teklifbul Rule v3.12
      },
      packages: [],
      availableModels,
      modelAccessHints,
      // Teklifbul Rule v3.1 - Today paid usage
      todayPaidUsage,
    });
  } catch (e: any) {
    logger.error('purchase-assistant-settings:get error', e);
    logger.end();
    return res.status(500).json({ error: 'internal_error', message: e?.message || 'Bilinmeyen hata' });
  }
});

router.post('/', verifyToken, validateRequest({ body: postSchema }), async (req: AuthenticatedRequest, res) => {
  logger.group('purchase-assistant-settings:post');
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
    } catch { }
    if (!planId && userId) {
      const summary = await getAccountSubscriptionSummary(userId);
      planId = summary.plan.planId;
    }
    const plan = isPremiumBypassUser(req.user)
      ? computePlanFlags('premium_plus_admin')
      : computePlanFlags(planId);

    const body = req.body as any;
    const provider = String(body.provider || '').trim();
    const model = String(body.model || '').trim();

    // HARD VALIDATION: provider/model must be in computed availableModels
    const availableModels = await computeAvailableModels({
      db,
      companyId,
      isPremiumPlus: plan.isPremiumPlus,
    });
    const allowed = availableModels.some(m => m.provider === provider && m.model === model);
    if (!allowed) {
      logger.warn('purchase-assistant-settings: invalid provider/model', { companyId, provider, model });
      logger.end();
      return res.status(400).json({
        error: 'invalid_provider_model',
        message: 'Seçilen sağlayıcı/model bu plan için uygun değil.',
      });
    }

    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
    const beforeSnap = await settingsRef.get();
    const before = beforeSnap.exists ? (beforeSnap.data() || {}) : null;

    // Teklifbul Rule v3.5.2 - Track lastPaidProvider/lastPaidModel if selected model is paid
    const isFreeEligible = availableModels.find(m => m.provider === provider && m.model === model)?.freeEligible === true;
    const nextSettings: any = {
      enabled: body.enabled !== false,
      provider,
      model,
      profile: body.profile || 'balanced',
      dictionaryLearning: body.dictionaryLearning === true,
      customInstructions: body.customInstructions?.trim() || '', // Teklifbul Rule v1.0
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user.uid,
    };

    // If selected model is NOT freeEligible, track it as lastPaid
    if (!isFreeEligible) {
      nextSettings.lastPaidProvider = provider;
      nextSettings.lastPaidModel = model;
    }
    // If freeEligible, don't touch lastPaid fields (preserve existing)

    await settingsRef.set(nextSettings, { merge: true });

    // Teklifbul Rule v1.3 - Invalidate availableModels cache (settings change may affect model availability)
    const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
    invalidateAvailableModelsCache(companyId);

    // Teklifbul Rule v1.2 - Optional audit log (company scoped)
    try {
      const auditRef = db.collection('companies').doc(companyId).collection('auditLogs').doc();
      await auditRef.set({
        type: 'purchaseAssistant.settings.update',
        entity: 'purchaseAssistant',
        before,
        after: {
          enabled: nextSettings.enabled,
          provider,
          model,
          profile: nextSettings.profile,
          dictionaryLearning: nextSettings.dictionaryLearning,
          customInstructions: nextSettings.customInstructions, // Teklifbul Rule v1.0
        },
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        createdBy: req.user.uid,
      });
    } catch (auditErr: any) {
      logger.warn('purchase-assistant-settings audit log write failed', { error: auditErr?.message || auditErr });
    }

    logger.info('purchase-assistant-settings saved', { companyId, provider, model });
    logger.end();
    return res.json({ ok: true });
  } catch (e: any) {
    logger.error('purchase-assistant-settings:post error', e);
    logger.end();
    return res.status(500).json({ error: 'internal_error', message: e?.message || 'Bilinmeyen hata' });
  }
});

export default router;


