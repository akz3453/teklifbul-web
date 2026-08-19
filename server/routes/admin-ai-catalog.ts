/**
 * Admin AI Catalog Route
 * Teklifbul Rule v1.4 - AI Model Catalog + Token Packages CRUD
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { invalidateAvailableModelsCacheAll } from '../services/purchaseAssistantAvailabilityService.js';

const router = Router();

router.use(verifyToken, requireAdmin);

// ==================== AI MODEL CATALOG ====================
type SuggestedModel = {
  provider: string;
  model: string;
  label: string;
  freeEligible: boolean;
  sort: number;
};

// Teklifbul Rule v1.0 - Admin onayli yarı-otomatik model öneri havuzu
const SUGGESTED_MODELS_CANDIDATES: SuggestedModel[] = [
  { provider: 'openai', model: 'gpt-5.5-pro', label: 'OpenAI - GPT 5.5 Pro', freeEligible: false, sort: 4 },
  { provider: 'openai', model: 'gpt-5.5', label: 'OpenAI - GPT 5.5', freeEligible: false, sort: 5 },
  { provider: 'openai', model: 'gpt-5.5-mini', label: 'OpenAI - GPT 5.5 Mini', freeEligible: false, sort: 6 },
  { provider: 'openai', model: 'gpt-4.1', label: 'OpenAI - GPT 4.1', freeEligible: false, sort: 8 },
  { provider: 'openai', model: 'gpt-4.1-mini', label: 'OpenAI - GPT 4.1 Mini', freeEligible: false, sort: 9 },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI - GPT 4o', freeEligible: false, sort: 10 },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - GPT 4o Mini', freeEligible: false, sort: 11 },
  { provider: 'gemini', model: 'gemini-pro', label: 'Google Gemini Pro', freeEligible: false, sort: 17 },
  { provider: 'gemini', model: 'gemini-3.0-pro', label: 'Google Gemini 3.0 Pro', freeEligible: false, sort: 18 },
  { provider: 'gemini', model: 'gemini-3.0-flash', label: 'Google Gemini 3.0 Flash', freeEligible: false, sort: 19 },
  { provider: 'gemini', model: 'gemini-3.5-flash', label: 'Google Gemini 3.5 Flash', freeEligible: false, sort: 20 },
  { provider: 'gemini', model: 'gemini-3.5-flash-lite', label: 'Google Gemini 3.5 Flash Lite', freeEligible: false, sort: 21 },
  { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro', freeEligible: false, sort: 22 },
  { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash', freeEligible: false, sort: 23 },
  { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Google Gemini 3.6 Flash', freeEligible: false, sort: 24 },
  { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Google Gemini 2.0 Flash', freeEligible: false, sort: 25 },
];

const aiModelSchema = z.object({
  provider: z.string().min(1, 'Provider gerekli'),
  model: z.string().min(1, 'Model gerekli'),
  label: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  freeEligible: z.boolean().optional().default(false),
  sort: z.number().int().optional().default(100),
  inputCostPer1MTokensUSD: z.number().min(0, 'Input maliyet negatif olamaz').optional(),
  outputCostPer1MTokensUSD: z.number().min(0, 'Output maliyet negatif olamaz').optional(),
  costPer1kTokensUSD: z.number().min(0, 'Maliyet negatif olamaz').optional().default(0),
  currency: z.string().optional().default('USD'),
});

/**
 * GET /api/admin/ai-models
 * List all AI models
 */
router.get('/ai-models', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin AI models list');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const snap = await db.collection('ai_model_catalog').orderBy('sort', 'asc').get();
    const models = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as any));

    // Secondary sort in memory to avoid complex index requirement
    models.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return (a.provider || '').localeCompare(b.provider || '');
    });

    logger.info('AI models listed', { count: models.length });
    logger.end();
    return res.json({ models });
  } catch (error: any) {
    logger.error('AI models list error', error);
    logger.end();
    return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
  }
});

/**
 * GET /api/admin/ai-model-suggestions
 * Yarı-otomatik öneri: katalogda olmayan güncel aday modeller
 */
router.get('/ai-model-suggestions', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin AI model suggestions');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const snap = await db.collection('ai_model_catalog').get();
    const existingKeys = new Set(
      snap.docs.map((d) => {
        const data = d.data() || {};
        return `${String(data.provider || '').toLowerCase()}::${String(data.model || '').toLowerCase()}`;
      })
    );

    const suggestions = SUGGESTED_MODELS_CANDIDATES.filter((m) => {
      const key = `${m.provider.toLowerCase()}::${m.model.toLowerCase()}`;
      return !existingKeys.has(key);
    });

    logger.info('AI model suggestions listed', { count: suggestions.length });
    logger.end();
    return res.json({
      updatedAt: new Date().toISOString(),
      source: 'curated_candidates_v1',
      suggestions,
    });
  } catch (error: any) {
    logger.error('AI model suggestions error', error);
    logger.end();
    return res.status(500).json({ error: 'SUGGESTIONS_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/ai-models
 * Create new AI model
 */
router.post('/ai-models',
  validateRequest({ body: aiModelSchema }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin AI model create');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const {
        provider,
        model,
        label,
        isActive,
        freeEligible,
        sort,
        inputCostPer1MTokensUSD,
        outputCostPer1MTokensUSD,
        costPer1kTokensUSD,
        currency
      } = req.body;

      const normalizedInputPer1M = typeof inputCostPer1MTokensUSD === 'number' ? Math.max(0, inputCostPer1MTokensUSD) : 0;
      const normalizedOutputPer1M = typeof outputCostPer1MTokensUSD === 'number' ? Math.max(0, outputCostPer1MTokensUSD) : 0;
      const blendedCostPer1k =
        normalizedInputPer1M > 0 || normalizedOutputPer1M > 0
          ? (((normalizedInputPer1M * 0.7) + (normalizedOutputPer1M * 0.3)) / 1000)
          : (typeof costPer1kTokensUSD === 'number' ? Math.max(0, costPer1kTokensUSD) : 0);

      // Check uniqueness: provider+model
      const existingSnap = await db
        .collection('ai_model_catalog')
        .where('provider', '==', provider)
        .where('model', '==', model)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        logger.warn('AI model already exists', { provider, model });
        logger.end();
        return res.status(400).json({ error: 'DUPLICATE', message: 'Bu provider+model kombinasyonu zaten mevcut' });
      }

      const docRef = db.collection('ai_model_catalog').doc();
      await docRef.set({
        provider,
        model,
        label: label || `${provider}/${model}`,
        isActive: isActive !== false,
        freeEligible: freeEligible === true,
        sort: sort || 100,
        inputCostPer1MTokensUSD: normalizedInputPer1M,
        outputCostPer1MTokensUSD: normalizedOutputPer1M,
        costPer1kTokensUSD: blendedCostPer1k,
        currency: currency || 'USD',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      });

      // Teklifbul Rule v1.4 - Invalidate cache (catalog changed)
      invalidateAvailableModelsCacheAll();

      logger.info('AI model created', { id: docRef.id, provider, model });
      logger.end();
      return res.json({ ok: true, id: docRef.id });
    } catch (error: any) {
      logger.error('AI model create error', error);
      logger.end();
      return res.status(500).json({ error: 'CREATE_ERROR', message: error.message });
    }
  }
);

/**
 * PATCH /api/admin/ai-models/:id
 * Update AI model
 */
router.patch('/ai-models/:id',
  validateRequest({
    body: aiModelSchema.partial(),
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin AI model update');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const { id } = req.params;
      const updateData: any = {
        ...req.body,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      };

      // Teklifbul Rule v1.9 - Handle Input/Output ve fallback cost alanları
      if (req.body.inputCostPer1MTokensUSD !== undefined) {
        updateData.inputCostPer1MTokensUSD = typeof req.body.inputCostPer1MTokensUSD === 'number'
          ? Math.max(0, req.body.inputCostPer1MTokensUSD)
          : 0;
      }
      if (req.body.outputCostPer1MTokensUSD !== undefined) {
        updateData.outputCostPer1MTokensUSD = typeof req.body.outputCostPer1MTokensUSD === 'number'
          ? Math.max(0, req.body.outputCostPer1MTokensUSD)
          : 0;
      }
      if (req.body.costPer1kTokensUSD !== undefined) {
        updateData.costPer1kTokensUSD = typeof req.body.costPer1kTokensUSD === 'number' 
          ? Math.max(0, req.body.costPer1kTokensUSD) 
          : 0;
      }
      if (req.body.inputCostPer1MTokensUSD !== undefined || req.body.outputCostPer1MTokensUSD !== undefined) {
        const inputPer1M = Number(updateData.inputCostPer1MTokensUSD ?? 0);
        const outputPer1M = Number(updateData.outputCostPer1MTokensUSD ?? 0);
        if (inputPer1M > 0 || outputPer1M > 0) {
          updateData.costPer1kTokensUSD = ((inputPer1M * 0.7) + (outputPer1M * 0.3)) / 1000;
        }
      }
      if (req.body.currency !== undefined) {
        updateData.currency = req.body.currency || 'USD';
      }

      // If provider or model is being changed, check uniqueness
      if (updateData.provider || updateData.model) {
        const docSnap = await db.collection('ai_model_catalog').doc(id).get();
        if (!docSnap.exists) {
          logger.end();
          return res.status(404).json({ error: 'NOT_FOUND', message: 'Model bulunamadı' });
        }

        const existing = docSnap.data() || {};
        const newProvider = updateData.provider || existing.provider;
        const newModel = updateData.model || existing.model;

        const existingSnap = await db
          .collection('ai_model_catalog')
          .where('provider', '==', newProvider)
          .where('model', '==', newModel)
          .limit(1)
          .get();

        // Check if another document (not this one) has the same provider+model
        const conflict = existingSnap.docs.find(d => d.id !== id);
        if (conflict) {
          logger.warn('AI model conflict', { provider: newProvider, model: newModel });
          logger.end();
          return res.status(400).json({ error: 'DUPLICATE', message: 'Bu provider+model kombinasyonu zaten mevcut' });
        }
      }

      await db.collection('ai_model_catalog').doc(id).update(updateData);

      // Teklifbul Rule v1.4 - Invalidate cache (catalog changed)
      invalidateAvailableModelsCacheAll();

      logger.info('AI model updated', { id });
      logger.end();
      return res.json({ ok: true });
    } catch (error: any) {
      logger.error('AI model update error', error);
      logger.end();
      return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
  }
);

/**
 * DELETE /api/admin/ai-models/:id
 * Delete AI model (hard delete)
 */
router.delete('/ai-models/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin AI model delete');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const { id } = req.params;

    await db.collection('ai_model_catalog').doc(id).delete();

    // Teklifbul Rule v1.4 - Invalidate cache (catalog changed)
    invalidateAvailableModelsCacheAll();

    logger.info('AI model deleted (hard)', { id });
    logger.end();
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error('AI model delete error', error);
    logger.end();
    return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
  }
});

// ==================== TOKEN PACKAGES ====================

const tokenPackageSchema = z.object({
  name: z.string().min(1, 'Paket adı gerekli'),
  tokens: z.number().int().positive('Token sayısı pozitif olmalı'),
  priceTRY: z.number().min(0, 'Fiyat negatif olamaz'),
  purchaseCostTRY: z.number().min(0, 'Alış fiyatı negatif olamaz').optional(),
  planRequired: z.string().optional().default('premium_plus'),
  isActive: z.boolean().optional().default(true),
  sort: z.number().int().optional().default(100),
  allowedProviders: z.array(z.string()).min(1, 'En az bir provider gerekli'),
  allowedModels: z.array(z.string()).nullable().optional(),
  description: z.string().optional(),
});

function computeSuggestedSalePriceTRY(purchaseCostTRY: number, marginPercent = 20, vatPercent = 20): number {
  const normalizedCost = Number(purchaseCostTRY || 0);
  if (!Number.isFinite(normalizedCost) || normalizedCost < 0) return 0;
  // Teklifbul Rule v1.0
  // purchaseCostTRY KDV HARIC alis olarak kabul edilir.
  // 1) Tedarikci KDV eklenir (alis KDV)
  // 2) Kar marji eklenir
  // 3) Musteri satis KDV eklenir
  const purchaseWithVat = normalizedCost * (1 + (vatPercent / 100));
  const withMargin = purchaseWithVat * (1 + (marginPercent / 100));
  const withSalesVat = withMargin * (1 + (vatPercent / 100));
  return Math.round(withSalesVat * 100) / 100;
}

const repricePackagesSchema = z.object({
  usdTry: z.number().positive().optional(),
  marginMultiplier: z.number().positive().optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  useLiveUsdTry: z.boolean().optional(),
});

const pricingConfigSchema = z.object({
  usdTry: z.number().positive(),
  marginMultiplier: z.number().positive(),
  minMarginMultiplier: z.number().positive().default(1.15),
  vatPercent: z.number().min(0).max(100),
  useLiveUsdTry: z.boolean().default(true),
});

const AI_PRICING_CONFIG_DOC = 'ai_pricing_config';
const FX_PROVIDER_URL = 'https://api.exchangerate-api.com/v4/latest/TRY';

function normalizeLower(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function computePackagePriceTRYFromCosts(params: {
  tokens: number;
  allowedProviders: string[];
  allowedModels: string[] | null;
  catalogModels: Array<{
    provider: string;
    model: string;
    costPer1kTokensUSD: number;
    inputCostPer1MTokensUSD?: number;
    outputCostPer1MTokensUSD?: number;
    isActive: boolean;
  }>;
  usdTry: number;
  marginMultiplier: number;
  vatPercent: number;
}): number | null {
  const { tokens, allowedProviders, allowedModels, catalogModels, usdTry, marginMultiplier, vatPercent } = params;
  if (!Number.isFinite(tokens) || tokens <= 0) return null;

  const providerSet = new Set((allowedProviders || []).map(normalizeLower).filter(Boolean));
  const modelSet = Array.isArray(allowedModels) ? new Set(allowedModels.map(normalizeLower).filter(Boolean)) : null;

  const getEffectiveCostPer1kUsd = (m: {
    costPer1kTokensUSD: number;
    inputCostPer1MTokensUSD?: number;
    outputCostPer1MTokensUSD?: number;
  }) => {
    const inputPer1M = Number(m.inputCostPer1MTokensUSD || 0);
    const outputPer1M = Number(m.outputCostPer1MTokensUSD || 0);
    if (inputPer1M > 0 || outputPer1M > 0) {
      // Varsayım: genel kullanımda 70/30 input-output dağılımı
      const blendedPer1M = (inputPer1M * 0.7) + (outputPer1M * 0.3);
      return blendedPer1M / 1000;
    }
    return Number(m.costPer1kTokensUSD || 0);
  };

  const candidateCosts = catalogModels
    .filter((m) => m.isActive !== false)
    .filter((m) => providerSet.size === 0 || providerSet.has(normalizeLower(m.provider)))
    .filter((m) => !modelSet || modelSet.has(normalizeLower(m.model)))
    .map(getEffectiveCostPer1kUsd)
    .filter((v) => Number.isFinite(v) && v > 0);

  if (candidateCosts.length === 0) return null;
  const minCostPer1kUsd = Math.min(...candidateCosts);
  const baseCostTry = (tokens / 1000) * minCostPer1kUsd * usdTry;
  const vatMultiplier = 1 + (Math.max(0, Number(vatPercent || 0)) / 100);
  const finalPriceTry = baseCostTry * marginMultiplier * vatMultiplier;
  return Math.round(finalPriceTry * 100) / 100;
}

async function fetchLiveUsdTry(req?: AuthenticatedRequest): Promise<number | null> {
  try {
    // Önce dashboard ile aynı kaynağı kullan: /api/fx
    if (req) {
      const host = req.get('host');
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      if (host) {
        const localFxUrl = `${proto}://${host}/api/fx`;
        const localResp = await fetch(localFxUrl, { cache: 'no-store' });
        if (localResp.ok) {
          const localData = await localResp.json() as any;
          const localUsd = Number(localData?.usdRate);
          if (localData?.ok && Number.isFinite(localUsd) && localUsd > 0) {
            return Number(localUsd.toFixed(4));
          }
        }
      }
    }

    // Fallback: harici provider
    const response = await fetch(FX_PROVIDER_URL, {
      headers: { 'User-Agent': 'Teklifbul-AI-Pricing/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    const usdRateRaw = payload?.rates?.USD;
    if (!usdRateRaw) return null;
    const usdTry = Number((1 / Number(usdRateRaw)).toFixed(4));
    return Number.isFinite(usdTry) && usdTry > 0 ? usdTry : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/ai-pricing-config
 */
router.get('/ai-pricing-config', async (_req: AuthenticatedRequest, res) => {
  try {
    const db = await getAdminDb();
    if (!db) return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    const docSnap = await db.collection('system_config').doc(AI_PRICING_CONFIG_DOC).get();
    const defaults = { usdTry: 40, marginMultiplier: 2.2, minMarginMultiplier: 1.15, vatPercent: 20, useLiveUsdTry: true };
    const data = docSnap.exists ? (docSnap.data() || {}) : {};
    const storedUsdTry = Number(data.usdTry || defaults.usdTry);
    const useLiveUsdTry = data.useLiveUsdTry !== false;
    const liveUsdTry = useLiveUsdTry ? await fetchLiveUsdTry(_req) : null;
    const effectiveUsdTry = Number(liveUsdTry || storedUsdTry);
    return res.json({
      config: {
        usdTry: effectiveUsdTry,
        storedUsdTry,
        liveUsdTry,
        effectiveUsdTry,
        usdTrySource: liveUsdTry ? 'live' : 'stored',
        marginMultiplier: Number(data.marginMultiplier || defaults.marginMultiplier),
        minMarginMultiplier: Number(data.minMarginMultiplier || defaults.minMarginMultiplier),
        vatPercent: Number(data.vatPercent ?? defaults.vatPercent),
        useLiveUsdTry,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'CONFIG_READ_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/ai-pricing-config
 */
router.post('/ai-pricing-config',
  validateRequest({ body: pricingConfigSchema }),
  async (req: AuthenticatedRequest, res) => {
    try {
      const db = await getAdminDb();
      if (!db) return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      const body = req.body;
      await db.collection('system_config').doc(AI_PRICING_CONFIG_DOC).set({
        usdTry: Number(body.usdTry),
        marginMultiplier: Number(body.marginMultiplier),
        minMarginMultiplier: Number(body.minMarginMultiplier || 1.15),
        vatPercent: Number(body.vatPercent),
        useLiveUsdTry: body.useLiveUsdTry !== false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      }, { merge: true });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'CONFIG_SAVE_ERROR', message: error.message });
    }
  }
);

/**
 * GET /api/admin/ai-token-packages
 * List all token packages
 */
router.get('/ai-token-packages', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin token packages list');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const snap = await db.collection('ai_token_packages').orderBy('sort', 'asc').get();
    const packages = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as any));

    // Secondary sort in memory to avoid complex index requirement
    packages.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return (a.name || '').localeCompare(b.name || '');
    });

    logger.info('Token packages listed', { count: packages.length });
    logger.end();
    return res.json({ packages });
  } catch (error: any) {
    logger.error('Token packages list error', error);
    logger.end();
    return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/ai-token-packages
 * Create new token package
 */
router.post('/ai-token-packages',
  validateRequest({ body: tokenPackageSchema }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin token package create');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const body = req.body;
      // Normalize allowedModels: empty array => null
      const allowedModels = Array.isArray(body.allowedModels) && body.allowedModels.length > 0
        ? body.allowedModels
        : null;

      const docRef = db.collection('ai_token_packages').doc();
      await docRef.set({
        name: body.name,
        tokens: body.tokens,
        priceTRY: body.priceTRY,
        purchaseCostTRY: Number(body.purchaseCostTRY || 0),
        suggestedPriceTRY: computeSuggestedSalePriceTRY(Number(body.purchaseCostTRY || 0), 20, 20),
        pricingFormula: 'purchaseCostTRY(KDV haric) x 1.20(alis KDV) x 1.20(kar) x 1.20(satis KDV)',
        planRequired: body.planRequired || 'premium_plus',
        isActive: body.isActive !== false,
        sort: body.sort || 100,
        allowedProviders: body.allowedProviders,
        allowedModels,
        description: body.description || null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      });

      // Teklifbul Rule v1.4 - Invalidate cache (packages affect availableModels)
      invalidateAvailableModelsCacheAll();

      logger.info('Token package created', { id: docRef.id, name: body.name });
      logger.end();
      return res.json({ ok: true, id: docRef.id });
    } catch (error: any) {
      logger.error('Token package create error', error);
      logger.end();
      return res.status(500).json({ error: 'CREATE_ERROR', message: error.message });
    }
  }
);

/**
 * POST /api/admin/ai-token-packages/reprice-from-model-costs
 * Model maliyetlerine gore token paket satis fiyatlarini otomatik gunceller.
 */
router.post('/ai-token-packages/reprice-from-model-costs',
  validateRequest({ body: repricePackagesSchema.optional() }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin token package reprice from model costs');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const cfgSnap = await db.collection('system_config').doc(AI_PRICING_CONFIG_DOC).get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      const configuredUsdTry = Number(cfg.usdTry || process.env.AI_PRICING_USDTRY || 40);
      const configuredMargin = Number(cfg.marginMultiplier || process.env.AI_PRICING_MARGIN || 2.2);
      const configuredMinMargin = Number(cfg.minMarginMultiplier || process.env.AI_PRICING_MIN_MARGIN || 1.15);
      const configuredVat = Number(cfg.vatPercent ?? process.env.AI_PRICING_VAT_PERCENT ?? 20);
      const configuredUseLive = cfg.useLiveUsdTry !== false;

      let usdTry = Number(req.body?.usdTry || configuredUsdTry);
      const marginMultiplier = Number(req.body?.marginMultiplier || configuredMargin);
      const minMarginMultiplier = Number(req.body?.minMarginMultiplier || configuredMinMargin);
      const effectiveMarginMultiplier = Math.max(marginMultiplier, minMarginMultiplier);
      const vatPercent = Number(req.body?.vatPercent ?? configuredVat);
      const useLiveUsdTry = req.body?.useLiveUsdTry ?? configuredUseLive;
      if (useLiveUsdTry) {
        const liveUsdTry = await fetchLiveUsdTry(req);
        if (liveUsdTry) usdTry = liveUsdTry;
      }

      if (!Number.isFinite(usdTry) || usdTry <= 0 || !Number.isFinite(marginMultiplier) || marginMultiplier <= 0 || !Number.isFinite(minMarginMultiplier) || minMarginMultiplier <= 0 || !Number.isFinite(vatPercent) || vatPercent < 0) {
        logger.end();
        return res.status(400).json({ error: 'INVALID_PRICING_PARAMS', message: 'Geçersiz fiyatlandırma parametreleri' });
      }

      const [modelsSnap, packagesSnap] = await Promise.all([
        db.collection('ai_model_catalog').get(),
        db.collection('ai_token_packages').get(),
      ]);

      const catalogModels = modelsSnap.docs.map((d) => {
        const data = d.data() || {};
        return {
          provider: String(data.provider || ''),
          model: String(data.model || ''),
          costPer1kTokensUSD: Number(data.costPer1kTokensUSD || 0),
          inputCostPer1MTokensUSD: Number(data.inputCostPer1MTokensUSD || 0),
          outputCostPer1MTokensUSD: Number(data.outputCostPer1MTokensUSD || 0),
          isActive: data.isActive !== false,
        };
      });

      let updatedCount = 0;
      for (const pkgDoc of packagesSnap.docs) {
        const pkg = pkgDoc.data() || {};
        const nextPrice = computePackagePriceTRYFromCosts({
          tokens: Number(pkg.tokens || 0),
          allowedProviders: Array.isArray(pkg.allowedProviders) ? pkg.allowedProviders : [],
          allowedModels: Array.isArray(pkg.allowedModels) ? pkg.allowedModels : null,
          catalogModels,
          usdTry,
          marginMultiplier: effectiveMarginMultiplier,
          vatPercent,
        });
        if (nextPrice === null) continue;

        await pkgDoc.ref.update({
          priceTRY: nextPrice,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: req.user!.uid,
          pricingMeta: {
            source: 'model_cost_sync_v1',
            usdTry,
            marginMultiplier,
            minMarginMultiplier,
            effectiveMarginMultiplier,
            vatPercent,
            useLiveUsdTry,
            syncedAt: new Date().toISOString(),
          },
        });
        updatedCount += 1;
      }

      invalidateAvailableModelsCacheAll();
      logger.info('Token package repricing done', { updatedCount, usdTry, marginMultiplier, minMarginMultiplier, effectiveMarginMultiplier, vatPercent, useLiveUsdTry });
      logger.end();
      return res.json({ ok: true, updatedCount, usdTry, marginMultiplier, minMarginMultiplier, effectiveMarginMultiplier, vatPercent, useLiveUsdTry });
    } catch (error: any) {
      logger.error('Token package repricing error', error);
      logger.end();
      return res.status(500).json({ error: 'REPRICE_ERROR', message: error.message });
    }
  }
);

/**
 * GET /api/admin/ai-price-watch
 * Zam takibi icin maliyet inceleme durumu.
 */
router.get('/ai-price-watch', async (_req: AuthenticatedRequest, res) => {
  try {
    const db = await getAdminDb();
    if (!db) return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });

    const snap = await db.collection('ai_model_catalog').get();
    const now = Date.now();
    const staleAfterMs = 14 * 24 * 60 * 60 * 1000; // 14 gun
    const staleModels: Array<{ provider: string; model: string; daysSinceReview: number }> = [];
    const missingCostModels: Array<{ provider: string; model: string }> = [];

    snap.docs.forEach((doc) => {
      const d = doc.data() || {};
      const provider = String(d.provider || '');
      const model = String(d.model || '');
      if (!provider || !model || d.isActive === false) return;

      const inputPer1M = Number(d.inputCostPer1MTokensUSD || 0);
      const outputPer1M = Number(d.outputCostPer1MTokensUSD || 0);
      if (inputPer1M <= 0 && outputPer1M <= 0) {
        missingCostModels.push({ provider, model });
      }

      const updatedAtMs =
        typeof d.updatedAtMs === 'number' ? d.updatedAtMs :
          (d.updatedAt?.toMillis ? d.updatedAt.toMillis() : 0);
      if (!updatedAtMs) {
        staleModels.push({ provider, model, daysSinceReview: 999 });
        return;
      }
      const ageMs = now - updatedAtMs;
      if (ageMs > staleAfterMs) {
        staleModels.push({ provider, model, daysSinceReview: Math.floor(ageMs / (24 * 60 * 60 * 1000)) });
      }
    });

    return res.json({
      staleReviewCount: staleModels.length,
      missingCostCount: missingCostModels.length,
      staleModels,
      missingCostModels,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'PRICE_WATCH_ERROR', message: error.message });
  }
});

/**
 * PATCH /api/admin/ai-token-packages/:id
 * Update token package
 */
router.patch('/ai-token-packages/:id',
  validateRequest({
    body: tokenPackageSchema.partial(),
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin token package update');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const { id } = req.params;
      const body = req.body;

      const updateData: any = {
        ...body,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      };

      if ('purchaseCostTRY' in body) {
        const purchaseCostTRY = Number(body.purchaseCostTRY || 0);
        updateData.purchaseCostTRY = purchaseCostTRY;
        updateData.suggestedPriceTRY = computeSuggestedSalePriceTRY(purchaseCostTRY, 20, 20);
        updateData.pricingFormula = 'purchaseCostTRY(KDV haric) x 1.20(alis KDV) x 1.20(kar) x 1.20(satis KDV)';
      }

      // Normalize allowedModels if present
      if ('allowedModels' in body) {
        updateData.allowedModels = Array.isArray(body.allowedModels) && body.allowedModels.length > 0
          ? body.allowedModels
          : null;
      }

      await db.collection('ai_token_packages').doc(id).update(updateData);

      // Teklifbul Rule v1.4 - Invalidate cache (packages affect availableModels)
      invalidateAvailableModelsCacheAll();

      logger.info('Token package updated', { id });
      logger.end();
      return res.json({ ok: true });
    } catch (error: any) {
      logger.error('Token package update error', error);
      logger.end();
      return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
  }
);

/**
 * DELETE /api/admin/ai-token-packages/:id
 * Delete token package (soft delete: set isActive=false)
 */
router.delete('/ai-token-packages/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin token package delete');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const { id } = req.params;

    // Soft delete: set isActive=false
    await db.collection('ai_token_packages').doc(id).update({
      isActive: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user!.uid,
    });

    // Teklifbul Rule v1.4 - Invalidate cache (packages affect availableModels)
    invalidateAvailableModelsCacheAll();

    logger.info('Token package deleted (soft)', { id });
    logger.end();
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error('Token package delete error', error);
    logger.end();
    return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
  }
});

/**
 * GET /api/admin/upgrade-leads
 * Returns last 50 upgrade leads across all companies (admin only)
 */
router.get('/upgrade-leads', verifyToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Admin Upgrade Leads API');
    
    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    // Fetch leads from all companies (last 50)
    // TODO: Optimize with composite query if needed
    const companiesSnap = await db.collection('companies').limit(100).get(); // Limit companies for performance
    const allLeads: any[] = [];

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;
      const leadsSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('upgradeLeads')
        .orderBy('createdAtMs', 'desc')
        .limit(10)
        .get();
      
      leadsSnap.docs.forEach(doc => {
        const data = doc.data();
        allLeads.push({
          id: doc.id,
          companyId,
          ...data,
        });
      });
    }

    // Sort by createdAtMs descending and take last 50
    allLeads.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    const last50 = allLeads.slice(0, 50);

    logger.info('Upgrade leads fetched', { count: last50.length });
    logger.end();

    return res.json({
      leads: last50,
    });
  } catch (error: any) {
    logger.error('Error in upgrade leads endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

