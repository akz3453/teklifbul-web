/**
 * Purchase Assistant availability + active model validity guards
 * Teklifbul Rule v1.1 + v1.3 (Cache)
 */

import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getCompanyEntitlements, isModelAllowed, getProviderKey } from './aiEntitlementService.js'; // Teklifbul Rule v3.13

// Teklifbul Rule v1.3 - Cache for availableModels
const CACHE_TTL_SEC = Number(process.env.AI_AVAILABLE_MODELS_CACHE_SEC) || 60;
const cache = new Map<string, { data: AvailableModel[]; expiresAt: number }>();

// Cleanup expired cache entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt < now) {
      cache.delete(key);
    }
  }
}, 2 * 60 * 1000);

function getCacheKey(companyId: string, planId: string): string {
  return `availableModels:${companyId}:${planId}:v1`;
}

function invalidateCache(companyId: string) {
  // Invalidate all entries for this company
  for (const key of cache.keys()) {
    if (key.startsWith(`availableModels:${companyId}:`)) {
      cache.delete(key);
    }
  }
  logger.info('[AI] cache invalidated', { companyId });
}

export type CatalogModel = {
  provider: string;
  model: string;
  label?: string;
  isActive?: boolean;
  freeEligible?: boolean;
  sort?: number;
  costPer1kTokensUSD?: number; // Teklifbul Rule v1.9 - Cost per 1k tokens in USD
  currency?: string; // Default: "USD"
};

export type AvailableModel = {
  provider: string;
  model: string;
  label: string;
  source: 'free' | 'purchase';
  freeEligible: boolean;
  unlockedBy?: { packageId: string; packageName: string };
  lockedReason?: string; // Teklifbul Rule v3.13 - Why model is locked (for UI)
};

function uniqKey(provider: string, model: string) {
  return `${provider}::${model}`;
}

function normalizeAllowedModels(val: any): string[] | null {
  if (val === null || val === undefined) return null;
  if (!Array.isArray(val)) return null;
  const cleaned = val.map(v => String(v || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : [];
}

export async function loadAiModelCatalog(db: any): Promise<CatalogModel[]> {
  try {
    const snap = await db.collection('ai_model_catalog').get();
    const items = snap.docs.map((d: any) => ({ ...(d.data() || {}) })) as CatalogModel[];
    const active = items.filter(m => m && m.provider && m.model && m.provider !== 'ollama');
    if (active.length) return active;
  } catch (e) {
    logger.warn('ai_model_catalog load failed, using fallback list', { error: (e as any)?.message || e });
  }

  // Fallback catalog (dev safety). TODO: Admin panel + Firestore management.
  // TODO: catalog changes should invalidate availableModels cache (all companies)
  // Teklifbul Rule v1.0 - Ollama support added
  return [
    { provider: 'free_local', model: 'basic', label: 'Ücretsiz Asistan (Basic)', isActive: true, freeEligible: true, sort: 1 },
    { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Güçlü/Dengeli)', isActive: true, freeEligible: true, sort: 2 },
    { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Çok Hızlı / Anlık)', isActive: true, freeEligible: true, sort: 3 },
    { provider: 'groq', model: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Alternatif)', isActive: true, freeEligible: true, sort: 4 },
    { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - gpt-4o-mini (Pro AI)', isActive: true, freeEligible: false, sort: 10 },
    { provider: 'gemini', model: 'gemini-pro', label: 'Google Gemini - Pro (Pro AI)', isActive: true, freeEligible: false, sort: 20 },
  ];
}

/**
 * Teklifbul Rule v1.4.2 - Check if model is freeEligible from catalog
 */
export async function isModelFreeEligible(provider: string, model: string): Promise<boolean> {
  try {
    const db = await getAdminDb();
    if (!db) return false;
    const catalog = await loadAiModelCatalog(db);
    const found = catalog.find(m => m.provider === provider && m.model === model);
    return found?.freeEligible === true && found?.isActive !== false;
  } catch (e) {
    logger.warn('isModelFreeEligible check failed', { provider, model, error: (e as any)?.message || e });
    return false;
  }
}

export async function computeAvailableModels(params: { db: any; companyId: string; isPremiumPlus: boolean }): Promise<AvailableModel[]> {
  const { db, companyId, isPremiumPlus } = params;

  // Teklifbul Rule v1.3 - Cache lookup
  const plan = await getCompanyPlanFlags(companyId);
  const cacheKey = getCacheKey(companyId, plan.planId);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info('[AI] availableModels cache hit', { companyId, planId: plan.planId });
    return cached.data;
  }

  const catalog = await loadAiModelCatalog(db);

  const byKey = new Map<string, AvailableModel>();

  // Teklifbul Rule v1.4.2 - Free eligible models available to all plans (Free/Premium/PremiumPlus)
  // 1) Free eligible models for everyone (Free/Premium/PremiumPlus)
  catalog
    .filter(m => m.isActive !== false && m.freeEligible === true)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .forEach(m => {
      const key = uniqKey(m.provider, m.model);
      byKey.set(key, {
        provider: m.provider,
        model: m.model,
        label: m.label || `${m.provider}/${m.model}`,
        source: 'free',
        freeEligible: true,
      });
    });

  // Free/Premium plans: only freeEligible models
  if (!isPremiumPlus) {
    const result = Array.from(byKey.values());
    logger.info('[AI] availableModels (restricted)', { count: result.length, models: result.map(m => m.provider) });
    return result;
  }


  // Premium Plus: Add ALL active models from catalog (including paid ones like OpenAI/Gemini)
  // They will be visible in the list, but chat will check for tokens.
  catalog
    .filter(m => m.isActive !== false && m.provider !== 'ollama')
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .forEach(m => {
      const key = uniqKey(m.provider, m.model);
      if (!byKey.has(key)) {
        byKey.set(key, {
          provider: m.provider,
          model: m.model,
          label: m.label || `${m.provider}/${m.model}`,
          source: m.freeEligible ? 'free' : 'purchase',
          freeEligible: !!m.freeEligible,
        });
      }
    });

  // 2) Purchases unlocks (paid) - Teklifbul Rule v3.13 - With entitlement filtering
  let purchaseDocs: any[] = [];
  try {
    const snap = await db
      .collection('companies')
      .doc(companyId)
      .collection('aiTokenPurchases')
      .where('status', '==', 'paid')
      .get();
    purchaseDocs = snap.docs.map((d: any) => d.data() || {});
  } catch (e) {
    logger.warn('aiTokenPurchases load failed (premium_plus)', { error: (e as any)?.message || e });
  }

  // Teklifbul Rule v3.13 - Get company entitlements
  const companyEntitlements = await getCompanyEntitlements(companyId);

  const paidCatalogByProvider = new Map<string, CatalogModel[]>();
  catalog
    .filter(m => m.isActive !== false && m.freeEligible !== true)
    .forEach(m => {
      const arr = paidCatalogByProvider.get(m.provider) || [];
      arr.push(m);
      paidCatalogByProvider.set(m.provider, arr);
    });

  // Teklifbul Rule v3.13 - Process purchases with entitlement checks
  // Group purchases by provider and check entitlements
  for (const p of purchaseDocs) {
    const snap = p.packageSnapshot || {};
    const unlockedBy =
      snap?.id && snap?.name
        ? { packageId: String(snap.id), packageName: String(snap.name) }
        : p?.packageId
          ? { packageId: String(p.packageId), packageName: String(p.packageId) }
          : undefined;
    const allowedProviders: string[] = Array.isArray(snap.allowedProviders)
      ? snap.allowedProviders.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];

    // Get providerKey from purchase (v3.12)
    const purchaseProviderKey = p.providerKey || (allowedProviders.length > 0 ? getProviderKey(allowedProviders[0]) : null);

    for (const provider of allowedProviders) {
      const providerKey = purchaseProviderKey || getProviderKey(provider);
      const entitlements = companyEntitlements.get(providerKey) || null;

      // If no entitlements for this provider, skip (no purchases for this provider)
      if (!entitlements) {
        continue;
      }

      // Legacy behavior: if provider-wide allow, unlock all paid models for provider
      if (entitlements && entitlements.isProviderWide) {
        const models = (paidCatalogByProvider.get(provider) || []).filter(m => m.isActive !== false);
        for (const m of models) {
          const key = uniqKey(provider, m.model);
          // Update or add
          byKey.set(key, {
            provider,
            model: m.model,
            label: m.label || `${provider}/${m.model}`,
            source: 'purchase',
            freeEligible: false,
            unlockedBy,
          });
        }
        continue;
      }

      // Teklifbul Rule v3.13 - Entitlement-based unlock
      // Check each paid model against entitlements
      const models = paidCatalogByProvider.get(provider) || [];
      for (const m of models) {
        if (m.isActive === false) continue;

        // Check if model is allowed by entitlements
        const modelTier = (m as any).tier || undefined; // Optional tier from catalog
        const isAllowed = isModelAllowed(entitlements, provider, m.model, modelTier);

        if (entitlements && isAllowed) {
          const key = uniqKey(provider, m.model);
          // Update or add
          byKey.set(key, {
            provider,
            model: m.model,
            label: m.label || `${provider}/${m.model}`,
            source: 'purchase',
            freeEligible: false,
            unlockedBy,
          });
        }
      }
    }
  }

  const finalResult = Array.from(byKey.values());
  logger.info('[AI] availableModels final', { count: finalResult.length, planId: plan.planId });

  // Teklifbul Rule v1.3 - Cache store
  cache.set(cacheKey, {
    data: finalResult,
    expiresAt: Date.now() + CACHE_TTL_SEC * 1000,
  });

  return finalResult;
}

// Teklifbul Rule v1.3 - Cache invalidation helper
export function invalidateAvailableModelsCache(companyId: string) {
  invalidateCache(companyId);
}

// Teklifbul Rule v1.4 - Global cache invalidation (for admin catalog changes)
export function invalidateAvailableModelsCacheAll() {
  cache.clear();
  logger.info('[AI] cache invalidated (all companies)');
}

// Teklifbul Rule v1.4 - Company-specific cache invalidation
export function invalidateAvailableModelsCacheForCompany(companyId: string) {
  invalidateCache(companyId);
}

export async function getCompanyPlanFlags(companyId: string): Promise<{ isPremiumPlus: boolean; planId: string }> {
  const db = await getAdminDb();
  if (!db) return { isPremiumPlus: false, planId: 'free' };
  const cdoc = await db.collection('companies').doc(companyId).get();
  const cdata = cdoc.exists ? (cdoc.data() || {}) : {};
  const planId = String(cdata.planId || cdata.plan || cdata.subscriptionPlanId || cdata.subscription?.planId || 'free');
  return { planId, isPremiumPlus: planId.includes('premium_plus') };
}

/**
 * Active model validity guard.
 * - If current provider/model not in computed availableModels, auto-downgrade to free_local/basic.
 * - Returns { provider, model, modelAutoDowngraded }.
 * 
 * @deprecated v3.10 - This function MUTATES settings. Use resolveCompanyAiModelForRequest instead (no mutations).
 * This function is kept for backward compatibility but should not be used in new code.
 */
export async function ensureActiveCompanyModelValid(params: {
  companyId: string;
  provider: string;
  model: string;
  userId: string;
}): Promise<{ provider: string; model: string; modelAutoDowngraded: boolean }> {
  const { companyId, provider, model, userId } = params;
  const db = await getAdminDb();
  if (!db) return { provider, model, modelAutoDowngraded: false };

  const plan = await getCompanyPlanFlags(companyId);
  const availableModels = await computeAvailableModels({ db, companyId, isPremiumPlus: plan.isPremiumPlus });
  const ok = availableModels.some(m => m.provider === provider && m.model === model);
  if (ok) return { provider, model, modelAutoDowngraded: false };

  // Auto downgrade
  const fallbackProvider = 'free_local';
  const fallbackModel = 'basic';
  const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
  await settingsRef.set(
    {
      provider: fallbackProvider,
      model: fallbackModel,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId,
    },
    { merge: true }
  );

  logger.warn('[AI] active model revoked, fallback applied', { companyId, from: { provider, model }, to: { provider: fallbackProvider, model: fallbackModel } });
  return { provider: fallbackProvider, model: fallbackModel, modelAutoDowngraded: true };
}


