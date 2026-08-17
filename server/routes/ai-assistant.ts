/**
 * AI Assistant Routes
 * Teklifbul Rule v1.0 - AI-powered purchase assistance endpoints
 * Teklifbul Rule v3.10 - Stabilized: Uses resolver (no mutations), constants, error mapper
 * 
 * POST /api/ai/generate-purchase-request
 * POST /api/ai/analyze-offers
 * POST /api/ai/autofill-request-fields
 * POST /api/ai/validate-request
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { requireAiAccess } from '../middleware/requireAiAccess.js';
import { getUserAIProvider } from '../services/userService.js';
import { getUserPlan } from '../services/userService.js';
import {
  consumeTokensTransactional,
} from '../services/aiTokenPackService.js';
import {
  logAiUsage,
} from '../services/aiUsageService.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { consumeCompanyTokensTransactional, getCompanyAiWallet } from '../services/companyAiWalletService.js';
import { getCompanyPlanFlags } from '../services/purchaseAssistantAvailabilityService.js';
import { getAiMinTokens } from '../services/aiMinTokens.js';
import { resolveCompanyAiModelForRequest } from '../services/aiModelResolverService.js';
import { AI_ERROR_CODES, AI_META_KEYS } from '../constants/aiMeta.js'; // Teklifbul Rule v3.17
import { mapAiError, mapAiDisabledError } from '../utils/aiErrorMapper.js';
import { evaluateAiAvailability } from '../services/aiKillSwitchService.js';
import {
  generatePurchaseRequestText,
  analyzeOfferComparison,
  autofillRequestFields,
  validateRequestForErrors,
  type GeneratePurchaseRequestInput,
  type AnalyzeOfferComparisonInput,
  type AutofillRequestFieldsInput,
  type ValidateRequestForErrorsInput,
} from '../ai/purchaseAssistantService.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
import { DEFAULT_FREE_AI } from '../constants/aiFreeDefaults.js';
import { z } from 'zod';

const router = Router();

// Teklifbul Rule v1.2 - Token pre-check (hard limit) via env (AI_MIN_TOKENS, default 200)
const MIN_TOKENS = getAiMinTokens();

/** Teklifbul Rule v1.0 — Ücretsiz Groq token cüzdanı istemez */
function shouldSkipWalletPrecheck(provider: string, isFreeEligible?: boolean): boolean {
  return isFreeEligible === true || provider === 'groq' || provider === 'free_local';
}

function forceFreeResolved(resolved: any) {
  return {
    ...resolved,
    provider: DEFAULT_FREE_AI.provider,
    model: DEFAULT_FREE_AI.model,
    isFreeEligible: true,
    modelAutoResolved: true,
    resolvedBy: 'FALLBACK_FREE',
    reason: 'NO_FUNDS_FOR_PAID',
    suggestedPaid: resolved?.suggestedPaid || {
      provider: resolved?.provider,
      model: resolved?.model,
    },
  };
}

async function tryGetCompanyPurchaseAssistantSettings(params: { userId: string; headerCompanyId?: string }) {
  const { userId, headerCompanyId } = params;
  const db = await getAdminDb();
  if (!db) return null;
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? (userDoc.data() || {}) : {};
  const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
    userId,
    path: 'ai-assistant',
  });
  if (!companyId) return null;
  const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
  const snap = await settingsRef.get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return {
    companyId,
    provider: String(data.provider || DEFAULT_FREE_AI.provider),
    model: String(data.model || DEFAULT_FREE_AI.model),
    enabled: data.enabled !== false,
    forcedFreeMode: data.forcedFreeMode === true,
  };
}

// Validation schemas
const GeneratePurchaseRequestSchema = z.object({
  companyName: z.string().optional(),
  requesterName: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    technicalSpec: z.string().optional(),
  })).min(1),
  deliveryLocation: z.string().optional(),
  deliveryDate: z.string().optional(),
  priority: z.enum(['fiyat', 'hız', 'kalite']).optional(),
  notes: z.string().optional(),
  language: z.enum(['tr', 'en']).optional(),
});

const AnalyzeOfferComparisonSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    offers: z.array(z.object({
      supplierName: z.string(),
      price: z.number(),
      currency: z.string().optional(),
      leadTimeDays: z.number().optional(),
      warrantyMonths: z.number().optional(),
      paymentTerms: z.string().optional(),
      qualityNotes: z.string().optional(),
    })).min(1),
  })).min(1),
  decisionCriteria: z.array(z.enum(['fiyat', 'hız', 'kalite', 'garanti', 'ödeme'])).optional(),
  language: z.enum(['tr', 'en']).optional(),
});

const AutofillRequestFieldsSchema = z.object({
  rawText: z.string().optional(),
  previousRequests: z.array(z.any()).optional(),
  knownMaterials: z.array(z.object({
    code: z.string(),
    name: z.string(),
    defaultUnit: z.string().optional(),
    defaultSpec: z.string().optional(),
  })).optional(),
  language: z.enum(['tr', 'en']).optional(),
});

const ValidateRequestForErrorsSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    technicalSpec: z.string().optional(),
  })).min(1),
  deliveryDate: z.string().optional(),
  budgetLimit: z.number().optional(),
  currency: z.string().optional(),
  language: z.enum(['tr', 'en']).optional(),
});

/**
 * POST /api/ai/generate-purchase-request
 * Talep yazdırma - Satın alma talebi metni oluşturma
 */
router.post('/generate-purchase-request', verifyToken, requireAiAccess, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('AI: Generate Purchase Request API');
    
    // Validation
    const validationResult = GeneratePurchaseRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      logger.warn('Invalid request body', validationResult.error);
      logger.end();
      return res.status(400).json({
        error: 'Geçersiz istek',
        details: validationResult.error.issues,
      });
    }

    const input: GeneratePurchaseRequestInput = validationResult.data;
    const userId = req.user?.uid;

    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
    }

    // Teklifbul Rule v1.0 - Kırmadan geçiş: company settings+wallet varsa onu kullan, yoksa legacy user token pack
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    const companySettings = await tryGetCompanyPurchaseAssistantSettings({ userId, headerCompanyId });
    const companyId = companySettings?.companyId || null;
    
    // Teklifbul Rule v3.11 - Kill-switch enforcement (BEFORE resolver/token checks)
    const availability = await evaluateAiAvailability(companyId);
    if (!availability.enabled) {
      logger.warn('[KillSwitch] AI disabled', { companyId, reason: availability.disabledReason, route: '/api/ai/generate-purchase-request' });
      logger.end();
      const errorMap = mapAiDisabledError(availability.disabledReason || 'GLOBAL');
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        meta: errorMap.meta,
      });
    }

    const companyWallet = companySettings?.companyId ? await getCompanyAiWallet(companySettings.companyId) : { balanceTokens: 0 };
    // Ücretsiz Groq cüzdan istemez
    const useCompanyFlow = !!companySettings?.companyId && companySettings.enabled !== false;

    let provider = useCompanyFlow ? (companySettings!.provider as any) : await getUserAIProvider(userId);
    let modelAutoDowngraded = false;
    let resolved: any = null; // Teklifbul Rule v3.9

    if (useCompanyFlow) {
      // Teklifbul Rule v3.9 - Runtime Model Resolver (NO MUTATION)
      const planFlags = await getCompanyPlanFlags(companySettings!.companyId);
      resolved = await resolveCompanyAiModelForRequest({
        companyId: companySettings!.companyId,
        settings: companySettings!,
        planFlags,
      });

      // Log auto-resolution if occurred
      if (resolved.modelAutoResolved === true) {
        logger.warn('[AI] model auto-resolved', {
          companyId: companySettings!.companyId,
          route: '/api/ai/generate-purchase-request',
          from: { provider: companySettings!.provider, model: companySettings!.model },
          to: { provider: resolved.provider, model: resolved.model },
          reason: resolved.reason,
        });
      }

      provider = resolved.provider as any;
      modelAutoDowngraded = resolved.modelAutoResolved ?? false;

      // Teklifbul Rule v3.12 - Ücretli cüzdan yetersizse ücretsiz Groq (402 engeli yok)
      const providerKey = provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                          provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                          provider.toLowerCase();
      if (!shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible)) {
      const providerWallet = await getCompanyAiWallet(companySettings!.companyId, providerKey);
      if ((providerWallet?.balanceTokens || 0) < MIN_TOKENS) {
        logger.warn('Company provider wallet low → free Groq', { 
          companyId: companySettings!.companyId, 
          providerKey,
          balanceTokens: providerWallet?.balanceTokens, 
          min: MIN_TOKENS,
          route: '/api/ai/generate-purchase-request',
        });
        resolved = forceFreeResolved(resolved);
        provider = resolved.provider as any;
        modelAutoDowngraded = true;
      }
      }
    } else {
      // Legacy: varsayılan ücretsiz Groq
      logger.info('[AI] legacy free Groq', { route: '/api/ai/generate-purchase-request' });
      provider = DEFAULT_FREE_AI.provider as any;
      resolved = {
        provider: DEFAULT_FREE_AI.provider,
        model: DEFAULT_FREE_AI.model,
        isFreeEligible: true,
        modelAutoResolved: true,
        resolvedBy: 'FALLBACK_FREE',
      };
    }

    logger.info('Generating purchase request text', { userId, itemsCount: input.items.length });

    const result = await generatePurchaseRequestText(input, userId, {
      provider,
      model: resolved?.model || DEFAULT_FREE_AI.model,
    });

    // Teklifbul Rule v1.0 - Token tüketimi - purchaseAssistantService'den gerçek token bilgisini kullan
    const actualTokens = result.tokenUsage?.totalTokens || 500; // Fallback tahmini
    const promptTokens = result.tokenUsage?.promptTokens || Math.floor(actualTokens * 0.7);
    const completionTokens = result.tokenUsage?.completionTokens || Math.floor(actualTokens * 0.3);
    const isFreeRun = shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible);
    
    try {
      if (isFreeRun) {
        logger.info('Free Groq usage (zero consume)', { userId, provider, usedTokens: actualTokens });
      } else if (useCompanyFlow && resolved) {
        const model = resolved.model;
        
        const after = await consumeCompanyTokensTransactional({
          companyId: companySettings!.companyId,
          usedTokens: actualTokens,
          provider,
          model,
          userId,
          reason: 'ai.generatePurchaseRequest',
          freeEligible: resolved.isFreeEligible, // Teklifbul Rule v1.4.2 (from resolver)
          meta: {
            promptTokens,
            completionTokens,
            totalTokens: actualTokens,
            route: '/api/ai/generate-purchase-request',
            requestId: req.headers['x-request-id'] as string | undefined,
            itemsCount: input.items.length,
            demandId: (input as any).demandId || null,
            resolvedProvider: provider, // Teklifbul Rule v3.12 - Provider for wallet lookup
            resolvedModel: model, // Teklifbul Rule v3.12
          },
        });
        logger.info('Company tokens consumed', { companyId: companySettings!.companyId, provider, usedTokens: actualTokens, remainingTokens: after.balanceTokens });
      } else {
        const tokenPack = await consumeTokensTransactional(userId, provider, actualTokens);
        logger.info('Tokens consumed', { userId, provider, usedTokens: actualTokens, remainingTokens: tokenPack.remainingTokens });
      }
    } catch (tokenError: any) {
      const msg = String(tokenError?.message || tokenError || '');
      logger.warn('Token consumption failed', { userId, provider, error: msg });
      // Teklifbul Rule v2.7.2 + v3.0 + v3.10 - Handle DAILY_CAP_REACHED and DAILY_CAP_CHECK_FAILED
      if (useCompanyFlow && tokenError?.code === AI_ERROR_CODES.DAILY_CAP_REACHED) {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.DAILY_CAP_REACHED);
        return res.status(errorMap.status).json({
          code: errorMap.code,
          message: errorMap.userMessage,
          cap: tokenError.cap,
          used: tokenError.used,
        });
      }
      if (useCompanyFlow && tokenError?.code === AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED) {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED);
        return res.status(errorMap.status).json({
          code: errorMap.code,
          message: errorMap.userMessage,
        });
      }
      // Teklifbul Rule v1.2 - Consume race guard: yetersiz token ise 402 dön
      if (useCompanyFlow && msg.toLowerCase().includes('yeterli token')) {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS, {
          providerKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                   provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                   provider.toLowerCase()) : undefined,
          resolvedProvider: provider,
          requiredProviderKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                            provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                            provider.toLowerCase()) : undefined,
        });
        return res.status(errorMap.status).json({
          code: errorMap.code,
          message: errorMap.userMessage,
          provider,
          meta: errorMap.meta, // Teklifbul Rule v3.17 - Includes requiredProviderKey
        });
      }
      // Legacy akışta token tüketimi başarısız olsa bile sonucu döndür (mevcut davranış)
    }

    // Kullanım logunu kaydet
    const plan = await getUserPlan(userId);
    await logAiUsage({
      userId,
      plan,
      provider,
      promptTokens,
      completionTokens
    }).catch(err => {
      logger.warn('Failed to log AI usage', err);
    });

    logger.info('Purchase request text generated successfully');
    logger.end();

    return res.json({
      ...result,
      meta: {
        modelAutoDowngraded, // Backward compatibility
        modelAutoResolved: useCompanyFlow && resolved ? resolved.modelAutoResolved ?? false : false, // Teklifbul Rule v3.9
        modelResolvedBy: useCompanyFlow && resolved ? resolved.resolvedBy : undefined, // Teklifbul Rule v3.9
        modelResolveReason: useCompanyFlow && resolved ? resolved.reason || null : null, // Teklifbul Rule v3.9
        resolvedProvider: useCompanyFlow && resolved ? resolved.provider : undefined, // Teklifbul Rule v3.9
        resolvedModel: useCompanyFlow && resolved ? resolved.model : undefined, // Teklifbul Rule v3.9
        requiredProviderKey: useCompanyFlow && resolved ? resolved.requiredProviderKey : undefined, // Teklifbul Rule v3.17
        suggestedPaid: useCompanyFlow && resolved ? resolved.suggestedPaid : undefined, // Teklifbul Rule v3.17
      },
    });
  } catch (error: any) {
    logger.error('Error in generate-purchase-request endpoint', error);
    logger.end();

    // AI servisi devre dışı kontrolü
    if (error.message?.includes('API key') || error.message?.includes('not configured')) {
      return res.status(503).json({
        error: 'AI servisi geçici olarak kullanılamıyor',
        message: 'Lütfen daha sonra tekrar deneyin.',
      });
    }

    return res.status(500).json({
      error: 'Satın alma talebi metni oluşturulurken hata oluştu',
      message: error.message || 'Bilinmeyen hata',
    });
  }
});

/**
 * POST /api/ai/analyze-offers
 * Teklif/karşılaştırma analizi
 */
router.post('/analyze-offers', verifyToken, requireAiAccess, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('AI: Analyze Offers API');
    
    // Validation
    const validationResult = AnalyzeOfferComparisonSchema.safeParse(req.body);
    if (!validationResult.success) {
      logger.warn('Invalid request body', validationResult.error);
      logger.end();
      return res.status(400).json({
        error: 'Geçersiz istek',
        details: validationResult.error.issues,
      });
    }

    const input: AnalyzeOfferComparisonInput = validationResult.data;
    const userId = req.user?.uid;

    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
    }

    // Teklifbul Rule v1.0 - Kırmadan geçiş: company settings+wallet varsa onu kullan, yoksa legacy user token pack
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    const companySettings = await tryGetCompanyPurchaseAssistantSettings({ userId, headerCompanyId });
    const companyId = companySettings?.companyId || null;
    
    // Teklifbul Rule v3.11 - Kill-switch enforcement (BEFORE resolver/token checks)
    const availability = await evaluateAiAvailability(companyId);
    if (!availability.enabled) {
      logger.warn('[KillSwitch] AI disabled', { companyId, reason: availability.disabledReason, route: '/api/ai/generate-purchase-request' });
      logger.end();
      const errorMap = mapAiDisabledError(availability.disabledReason || 'GLOBAL');
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        meta: errorMap.meta,
      });
    }

    const companyWallet = companySettings?.companyId ? await getCompanyAiWallet(companySettings.companyId) : { balanceTokens: 0 };
    // Ücretsiz Groq cüzdan istemez
    const useCompanyFlow = !!companySettings?.companyId && companySettings.enabled !== false;

    let provider = useCompanyFlow ? (companySettings!.provider as any) : await getUserAIProvider(userId);
    let modelAutoDowngraded = false;
    let resolved: any = null; // Teklifbul Rule v3.9

    if (useCompanyFlow) {
      // Teklifbul Rule v3.9 - Runtime Model Resolver (NO MUTATION)
      const planFlags = await getCompanyPlanFlags(companySettings!.companyId);
      resolved = await resolveCompanyAiModelForRequest({
        companyId: companySettings!.companyId,
        settings: companySettings!,
        planFlags,
      });

      // Log auto-resolution if occurred
      if (resolved.modelAutoResolved === true) {
        logger.warn('[AI] model auto-resolved', {
          companyId: companySettings!.companyId,
          route: '/api/ai/analyze-offers',
          from: { provider: companySettings!.provider, model: companySettings!.model },
          to: { provider: resolved.provider, model: resolved.model },
          reason: resolved.reason,
        });
      }

      provider = resolved.provider as any;
      modelAutoDowngraded = resolved.modelAutoResolved ?? false;

      // Teklifbul Rule v3.12 - Check provider-specific wallet (ücretsiz Groq atlanır)
      const providerKey = provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                          provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                          provider.toLowerCase();
      if (!shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible)) {
      const providerWallet = await getCompanyAiWallet(companySettings!.companyId, providerKey);
      if ((providerWallet?.balanceTokens || 0) < MIN_TOKENS) {
        logger.warn('Company provider wallet low → free Groq', { 
          companyId: companySettings!.companyId, 
          providerKey,
          balanceTokens: providerWallet?.balanceTokens, 
          min: MIN_TOKENS,
        });
        resolved = forceFreeResolved(resolved);
        provider = resolved.provider as any;
        modelAutoDowngraded = true;
      }
      }
    } else {
      logger.info('[AI] legacy free Groq');
      provider = DEFAULT_FREE_AI.provider as any;
      resolved = {
        provider: DEFAULT_FREE_AI.provider,
        model: DEFAULT_FREE_AI.model,
        isFreeEligible: true,
        modelAutoResolved: true,
        resolvedBy: 'FALLBACK_FREE',
      };
    }

    logger.info('Analyzing offer comparison', { userId, itemsCount: input.items.length });

    const result = await analyzeOfferComparison(input, userId, {
      provider,
      model: resolved?.model || DEFAULT_FREE_AI.model,
    });

    // Token tüketimi
    const estimatedTokens = 800; // Tahmini token miktarı
    const isFreeRun = shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible);
    try {
      if (isFreeRun) {
        logger.info('Free Groq usage (zero consume)', { userId, provider, usedTokens: estimatedTokens });
      } else if (useCompanyFlow && resolved) {
        const model = resolved.model;
        
        const after = await consumeCompanyTokensTransactional({
          companyId: companySettings!.companyId,
          usedTokens: estimatedTokens,
          provider,
          model,
          userId,
          reason: 'ai.analyzeOffers',
          freeEligible: resolved.isFreeEligible, // Teklifbul Rule v1.4.2 (from resolver)
          meta: { itemsCount: input.items.length },
        });
        logger.info('Company tokens consumed', { companyId: companySettings!.companyId, provider, usedTokens: estimatedTokens, remainingTokens: after.balanceTokens });
      } else {
        const tokenPack = await consumeTokensTransactional(userId, provider, estimatedTokens);
        logger.info('Tokens consumed', { userId, provider, usedTokens: estimatedTokens, remainingTokens: tokenPack.remainingTokens });
      }
    } catch (tokenError: any) {
      const msg = String(tokenError?.message || tokenError || '');
      logger.warn('Token consumption failed', { userId, provider, error: msg });
      if (useCompanyFlow && msg.toLowerCase().includes('yeterli token')) {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS, {
          providerKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                   provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                   provider.toLowerCase()) : undefined,
          resolvedProvider: provider,
          requiredProviderKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                            provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                            provider.toLowerCase()) : undefined,
        });
        return res.status(errorMap.status).json({
          code: errorMap.code,
          message: errorMap.userMessage,
          provider,
          meta: errorMap.meta, // Teklifbul Rule v3.17 - Includes requiredProviderKey
        });
      }
    }

    // Kullanım logunu kaydet
    const plan = await getUserPlan(userId);
    await logAiUsage({
      userId,
      plan,
      provider,
      promptTokens: Math.floor(estimatedTokens * 0.7),
      completionTokens: Math.floor(estimatedTokens * 0.3)
    }).catch(err => {
      logger.warn('Failed to log AI usage', err);
    });

    logger.info('Offer comparison analyzed successfully');
    logger.end();

    return res.json({
      ...result,
      meta: {
        modelAutoDowngraded, // Backward compatibility
        modelAutoResolved: useCompanyFlow && resolved ? resolved.modelAutoResolved ?? false : false, // Teklifbul Rule v3.9
        modelResolvedBy: useCompanyFlow && resolved ? resolved.resolvedBy : undefined, // Teklifbul Rule v3.9
        modelResolveReason: useCompanyFlow && resolved ? resolved.reason || null : null, // Teklifbul Rule v3.9
        resolvedProvider: useCompanyFlow && resolved ? resolved.provider : undefined, // Teklifbul Rule v3.9
        resolvedModel: useCompanyFlow && resolved ? resolved.model : undefined, // Teklifbul Rule v3.9
        requiredProviderKey: useCompanyFlow && resolved ? resolved.requiredProviderKey : undefined, // Teklifbul Rule v3.17
        suggestedPaid: useCompanyFlow && resolved ? resolved.suggestedPaid : undefined, // Teklifbul Rule v3.17
      },
    });
  } catch (error: any) {
    logger.error('Error in analyze-offers endpoint', error);
    logger.end();

    if (error.message?.includes('API key') || error.message?.includes('not configured')) {
      return res.status(503).json({
        error: 'AI servisi geçici olarak kullanılamıyor',
        message: 'Lütfen daha sonra tekrar deneyin.',
      });
    }

    return res.status(500).json({
      error: 'Teklif analizi sırasında hata oluştu',
      message: error.message || 'Bilinmeyen hata',
    });
  }
});

/**
 * POST /api/ai/autofill-request-fields
 * Otomatik form doldurma / öneri
 */
router.post('/autofill-request-fields', verifyToken, requireAiAccess, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('AI: Autofill Request Fields API');
    
    // Validation
    const validationResult = AutofillRequestFieldsSchema.safeParse(req.body);
    if (!validationResult.success) {
      logger.warn('Invalid request body', validationResult.error);
      logger.end();
      return res.status(400).json({
        error: 'Geçersiz istek',
        details: validationResult.error.issues,
      });
    }

    const input: AutofillRequestFieldsInput = validationResult.data;
    const userId = req.user?.uid;

    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
    }

    // Teklifbul Rule v1.0 - Kırmadan geçiş: company settings+wallet varsa onu kullan, yoksa legacy user token pack
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    const companySettings = await tryGetCompanyPurchaseAssistantSettings({ userId, headerCompanyId });
    const companyId = companySettings?.companyId || null;
    
    // Teklifbul Rule v3.11 - Kill-switch enforcement (BEFORE resolver/token checks)
    const availability = await evaluateAiAvailability(companyId);
    if (!availability.enabled) {
      logger.warn('[KillSwitch] AI disabled', { companyId, reason: availability.disabledReason, route: '/api/ai/generate-purchase-request' });
      logger.end();
      const errorMap = mapAiDisabledError(availability.disabledReason || 'GLOBAL');
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        meta: errorMap.meta,
      });
    }

    const companyWallet = companySettings?.companyId ? await getCompanyAiWallet(companySettings.companyId) : { balanceTokens: 0 };
    // Ücretsiz Groq cüzdan istemez
    const useCompanyFlow = !!companySettings?.companyId && companySettings.enabled !== false;

    let provider = useCompanyFlow ? (companySettings!.provider as any) : await getUserAIProvider(userId);
    let modelAutoDowngraded = false;
    let resolved: any = null; // Teklifbul Rule v3.9

    if (useCompanyFlow) {
      // Teklifbul Rule v3.9 - Runtime Model Resolver (NO MUTATION)
      const planFlags = await getCompanyPlanFlags(companySettings!.companyId);
      resolved = await resolveCompanyAiModelForRequest({
        companyId: companySettings!.companyId,
        settings: companySettings!,
        planFlags,
      });

      // Log auto-resolution if occurred
      if (resolved.modelAutoResolved === true) {
        logger.warn('[AI] model auto-resolved', {
          companyId: companySettings!.companyId,
          route: '/api/ai/autofill-request-fields',
          from: { provider: companySettings!.provider, model: companySettings!.model },
          to: { provider: resolved.provider, model: resolved.model },
          reason: resolved.reason,
        });
      }

      provider = resolved.provider as any;
      modelAutoDowngraded = resolved.modelAutoResolved ?? false;

      // Teklifbul Rule v3.12 - Check provider-specific wallet (ücretsiz Groq atlanır)
      const providerKey = provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                          provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                          provider.toLowerCase();
      if (!shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible)) {
      const providerWallet = await getCompanyAiWallet(companySettings!.companyId, providerKey);
      if ((providerWallet?.balanceTokens || 0) < MIN_TOKENS) {
        logger.warn('Company provider wallet low → free Groq', { 
          companyId: companySettings!.companyId, 
          providerKey,
          balanceTokens: providerWallet?.balanceTokens, 
          min: MIN_TOKENS,
        });
        resolved = forceFreeResolved(resolved);
        provider = resolved.provider as any;
        modelAutoDowngraded = true;
      }
      }
    } else {
      logger.info('[AI] legacy free Groq');
      provider = DEFAULT_FREE_AI.provider as any;
      resolved = {
        provider: DEFAULT_FREE_AI.provider,
        model: DEFAULT_FREE_AI.model,
        isFreeEligible: true,
        modelAutoResolved: true,
        resolvedBy: 'FALLBACK_FREE',
      };
    }

    logger.info('Autofilling request fields', { userId });

    const result = await autofillRequestFields(input, userId, {
      provider,
      model: resolved?.model || DEFAULT_FREE_AI.model,
    });

    // Token tüketimi
    const estimatedTokens = 400; // Tahmini token miktarı
    const isFreeRun = shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible);
    try {
      if (isFreeRun) {
        logger.info('Free Groq usage (zero consume)', { userId, provider, usedTokens: estimatedTokens });
      } else if (useCompanyFlow && resolved) {
        const model = resolved.model;
        
        const after = await consumeCompanyTokensTransactional({
          companyId: companySettings!.companyId,
          usedTokens: estimatedTokens,
          provider,
          model,
          userId,
          reason: 'ai.autofillRequestFields',
          freeEligible: resolved.isFreeEligible, // Teklifbul Rule v1.4.2 (from resolver)
          meta: {},
        });
        logger.info('Company tokens consumed', { companyId: companySettings!.companyId, provider, usedTokens: estimatedTokens, remainingTokens: after.balanceTokens });
      } else {
        const tokenPack = await consumeTokensTransactional(userId, provider, estimatedTokens);
        logger.info('Tokens consumed', { userId, provider, usedTokens: estimatedTokens, remainingTokens: tokenPack.remainingTokens });
      }
    } catch (tokenError: any) {
      const msg = String(tokenError?.message || tokenError || '');
      logger.warn('Token consumption failed', { userId, provider, error: msg });
      if (useCompanyFlow && msg.toLowerCase().includes('yeterli token')) {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS, {
          providerKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                   provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                   provider.toLowerCase()) : undefined,
          resolvedProvider: provider,
          requiredProviderKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                            provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                            provider.toLowerCase()) : undefined,
        });
        return res.status(errorMap.status).json({
          code: errorMap.code,
          message: errorMap.userMessage,
          provider,
          meta: errorMap.meta, // Teklifbul Rule v3.17 - Includes requiredProviderKey
        });
      }
    }

    // Kullanım logunu kaydet
    const plan = await getUserPlan(userId);
    await logAiUsage({
      userId,
      plan,
      provider,
      promptTokens: Math.floor(estimatedTokens * 0.7),
      completionTokens: Math.floor(estimatedTokens * 0.3)
    }).catch(err => {
      logger.warn('Failed to log AI usage', err);
    });

    logger.info('Request fields autofilled successfully');
    logger.end();

    return res.json({
      ...result,
      meta: {
        modelAutoDowngraded, // Backward compatibility
        modelAutoResolved: useCompanyFlow && resolved ? resolved.modelAutoResolved ?? false : false, // Teklifbul Rule v3.9
        modelResolvedBy: useCompanyFlow && resolved ? resolved.resolvedBy : undefined, // Teklifbul Rule v3.9
        modelResolveReason: useCompanyFlow && resolved ? resolved.reason || null : null, // Teklifbul Rule v3.9
        resolvedProvider: useCompanyFlow && resolved ? resolved.provider : undefined, // Teklifbul Rule v3.9
        resolvedModel: useCompanyFlow && resolved ? resolved.model : undefined, // Teklifbul Rule v3.9
        requiredProviderKey: useCompanyFlow && resolved ? resolved.requiredProviderKey : undefined, // Teklifbul Rule v3.17
        suggestedPaid: useCompanyFlow && resolved ? resolved.suggestedPaid : undefined, // Teklifbul Rule v3.17
      },
    });
  } catch (error: any) {
    logger.error('Error in autofill-request-fields endpoint', error);
    logger.end();

    if (error.message?.includes('API key') || error.message?.includes('not configured')) {
      return res.status(503).json({
        error: 'AI servisi geçici olarak kullanılamıyor',
        message: 'Lütfen daha sonra tekrar deneyin.',
      });
    }

    return res.status(500).json({
      error: 'Form doldurma sırasında hata oluştu',
      message: error.message || 'Bilinmeyen hata',
    });
  }
});

/**
 * POST /api/ai/validate-request
 * Hata yakalama - Eksik zorunlu alanlar, çelişkili veriler, mantık hataları
 */
router.post('/validate-request', verifyToken, requireAiAccess, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('AI: Validate Request API');
    
    // Validation
    const validationResult = ValidateRequestForErrorsSchema.safeParse(req.body);
    if (!validationResult.success) {
      logger.warn('Invalid request body', validationResult.error);
      logger.end();
      return res.status(400).json({
        error: 'Geçersiz istek',
        details: validationResult.error.issues,
      });
    }

    const input: ValidateRequestForErrorsInput = validationResult.data;
    const userId = req.user?.uid;

    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
    }

    // Teklifbul Rule v1.0 - Kırmadan geçiş: company settings+wallet varsa onu kullan, yoksa legacy user token pack
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    const companySettings = await tryGetCompanyPurchaseAssistantSettings({ userId, headerCompanyId });
    const companyId = companySettings?.companyId || null;
    
    // Teklifbul Rule v3.11 - Kill-switch enforcement (BEFORE resolver/token checks)
    const availability = await evaluateAiAvailability(companyId);
    if (!availability.enabled) {
      logger.warn('[KillSwitch] AI disabled', { companyId, reason: availability.disabledReason, route: '/api/ai/generate-purchase-request' });
      logger.end();
      const errorMap = mapAiDisabledError(availability.disabledReason || 'GLOBAL');
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        meta: errorMap.meta,
      });
    }

    const companyWallet = companySettings?.companyId ? await getCompanyAiWallet(companySettings.companyId) : { balanceTokens: 0 };
    // Ücretsiz Groq cüzdan istemez
    const useCompanyFlow = !!companySettings?.companyId && companySettings.enabled !== false;

    let provider = useCompanyFlow ? (companySettings!.provider as any) : await getUserAIProvider(userId);
    let modelAutoDowngraded = false;
    let resolved: any = null; // Teklifbul Rule v3.9

    if (useCompanyFlow) {
      // Teklifbul Rule v3.9 - Runtime Model Resolver (NO MUTATION)
      const planFlags = await getCompanyPlanFlags(companySettings!.companyId);
      resolved = await resolveCompanyAiModelForRequest({
        companyId: companySettings!.companyId,
        settings: companySettings!,
        planFlags,
      });

      // Log auto-resolution if occurred
      if (resolved.modelAutoResolved === true) {
        logger.warn('[AI] model auto-resolved', {
          companyId: companySettings!.companyId,
          route: '/api/ai/validate-request',
          from: { provider: companySettings!.provider, model: companySettings!.model },
          to: { provider: resolved.provider, model: resolved.model },
          reason: resolved.reason,
        });
      }

      provider = resolved.provider as any;
      modelAutoDowngraded = resolved.modelAutoResolved ?? false;

      // Teklifbul Rule v3.12 - Check provider-specific wallet (ücretsiz Groq atlanır)
      const providerKey = provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                          provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                          provider.toLowerCase();
      if (!shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible)) {
      const providerWallet = await getCompanyAiWallet(companySettings!.companyId, providerKey);
      if ((providerWallet?.balanceTokens || 0) < MIN_TOKENS) {
        logger.warn('Company provider wallet low → free Groq', { 
          companyId: companySettings!.companyId, 
          providerKey,
          balanceTokens: providerWallet?.balanceTokens, 
          min: MIN_TOKENS,
        });
        resolved = forceFreeResolved(resolved);
        provider = resolved.provider as any;
        modelAutoDowngraded = true;
      }
      }
    } else {
      logger.info('[AI] legacy free Groq');
      provider = DEFAULT_FREE_AI.provider as any;
      resolved = {
        provider: DEFAULT_FREE_AI.provider,
        model: DEFAULT_FREE_AI.model,
        isFreeEligible: true,
        modelAutoResolved: true,
        resolvedBy: 'FALLBACK_FREE',
      };
    }

    logger.info('Validating request', { userId, itemsCount: input.items.length });

    const result = await validateRequestForErrors(input, userId, {
      provider,
      model: resolved?.model || DEFAULT_FREE_AI.model,
    });

    // Token tüketimi
    const estimatedTokens = 300; // Tahmini token miktarı
    const isFreeRun = shouldSkipWalletPrecheck(provider, resolved?.isFreeEligible);
    try {
      if (isFreeRun) {
        logger.info('Free Groq usage (zero consume)', { userId, provider, usedTokens: estimatedTokens });
      } else if (useCompanyFlow && resolved) {
        const model = resolved.model;
        
        const after = await consumeCompanyTokensTransactional({
          companyId: companySettings!.companyId,
          usedTokens: estimatedTokens,
          provider,
          model,
          userId,
          reason: 'ai.validateRequest',
          freeEligible: resolved.isFreeEligible, // Teklifbul Rule v1.4.2 (from resolver)
          meta: { itemsCount: input.items.length },
        });
        logger.info('Company tokens consumed', { companyId: companySettings!.companyId, provider, usedTokens: estimatedTokens, remainingTokens: after.balanceTokens });
      } else {
        const tokenPack = await consumeTokensTransactional(userId, provider, estimatedTokens);
        logger.info('Tokens consumed', { userId, provider, usedTokens: estimatedTokens, remainingTokens: tokenPack.remainingTokens });
      }
    } catch (tokenError: any) {
      const msg = String(tokenError?.message || tokenError || '');
      logger.warn('Token consumption failed', { userId, provider, error: msg });
      if (useCompanyFlow && msg.toLowerCase().includes('yeterli token')) {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS, {
          providerKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                   provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                   provider.toLowerCase()) : undefined,
          resolvedProvider: provider,
          requiredProviderKey: provider ? (provider === 'openai' || provider.startsWith('openai') ? 'openai' : 
                                            provider === 'gemini' || provider.startsWith('gemini') ? 'gemini' : 
                                            provider.toLowerCase()) : undefined,
        });
        return res.status(errorMap.status).json({
          code: errorMap.code,
          message: errorMap.userMessage,
          provider,
          meta: errorMap.meta, // Teklifbul Rule v3.17 - Includes requiredProviderKey
        });
      }
    }

    // Kullanım logunu kaydet
    const plan = await getUserPlan(userId);
    await logAiUsage({
      userId,
      plan,
      provider,
      promptTokens: Math.floor(estimatedTokens * 0.7),
      completionTokens: Math.floor(estimatedTokens * 0.3)
    }).catch(err => {
      logger.warn('Failed to log AI usage', err);
    });

    logger.info('Request validated successfully', { isValid: result.isValid });
    logger.end();

    return res.json({
      ...result,
      meta: {
        modelAutoDowngraded, // Backward compatibility
        modelAutoResolved: useCompanyFlow && resolved ? resolved.modelAutoResolved ?? false : false, // Teklifbul Rule v3.9
        modelResolvedBy: useCompanyFlow && resolved ? resolved.resolvedBy : undefined, // Teklifbul Rule v3.9
        modelResolveReason: useCompanyFlow && resolved ? resolved.reason || null : null, // Teklifbul Rule v3.9
        resolvedProvider: useCompanyFlow && resolved ? resolved.provider : undefined, // Teklifbul Rule v3.9
        resolvedModel: useCompanyFlow && resolved ? resolved.model : undefined, // Teklifbul Rule v3.9
        requiredProviderKey: useCompanyFlow && resolved ? resolved.requiredProviderKey : undefined, // Teklifbul Rule v3.17
        suggestedPaid: useCompanyFlow && resolved ? resolved.suggestedPaid : undefined, // Teklifbul Rule v3.17
      },
    });
  } catch (error: any) {
    logger.error('Error in validate-request endpoint', error);
    logger.end();

    if (error.message?.includes('API key') || error.message?.includes('not configured')) {
      return res.status(503).json({
        error: 'AI servisi geçici olarak kullanılamıyor',
        message: 'Lütfen daha sonra tekrar deneyin.',
      });
    }

    return res.status(500).json({
      error: 'Doğrulama sırasında hata oluştu',
      message: error.message || 'Bilinmeyen hata',
    });
  }
});

export default router;

