/**
 * AI Model Resolver Service (v3.10)
 * Teklifbul Rule v3.9 + v3.10 - Runtime Model Resolver (Self-Healing, No-Mutation)
 * 
 * Purpose: Resolve the actual model to use at request time without mutating settings.
 * Handles edge cases:
 * - Selected model not in availableModels
 * - Provider swap (OpenAI -> Gemini)
 * - Model disabled in catalog (isActive=false)
 * - Forced free mode override
 * - No paid packages available
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * RESOLVER CONTRACT (v3.10 - Final Stabilization)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Layer Rules:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ Settings mutations          │ ❌ NEVER - Resolver is read-only              │
 * │ Runtime resolution          │ ✅ ONLY - This resolver is the single source │
 * │ Guardrails enforcement      │ ✅ BEFORE resolver (forcedFreeMode check)    │
 * │ Daily cap                   │ ✅ BEFORE resolver (in consume layer)        │
 * │ Token check                 │ ✅ BEFORE resolver (in route layer)           │
 * │ Resolver                    │ ❌ NEVER mutates DB or settings              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * Execution Order (v3.10):
 * 1. Route receives request
 * 2. Load settings (read-only)
 * 3. Check guardrails (forcedFreeMode, daily cap, token balance)
 * 4. Call resolver (this function) - NO MUTATION
 * 5. Use resolved model for AI call
 * 6. Consume tokens (with freeEligible flag from resolver)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { computeAvailableModels, getCompanyPlanFlags, loadAiModelCatalog } from './purchaseAssistantAvailabilityService.js';
import { computeRestorePaidStatus } from './restorePaidStatusHelper.js';
import { AI_RESOLVE_BY, AI_RESOLVE_REASON, AI_META_KEYS, type AiResolveBy, type AiResolveReason } from '../constants/aiMeta.js';
import { getProviderKey } from './aiEntitlementService.js'; // Teklifbul Rule v3.15 + v3.17
import { DEFAULT_FREE_AI, pickPreferredFreeModel } from '../constants/aiFreeDefaults.js';

export type ResolvedAiModel = {
  provider: string;
  model: string;
  isFreeEligible: boolean;
  resolvedBy: AiResolveBy;
  reason?: AiResolveReason;
  modelAutoResolved?: boolean; // true if not EXACT
  suggestedPaid?: { provider: string; model: string; providerKey?: string } | null; // for UI hints
  requiredProviderKey?: string; // Teklifbul Rule v3.17 - Provider needed for paid model
};

/**
 * Resolve company AI model for request (NO MUTATION)
 * Teklifbul Rule v3.9 - Runtime resolver
 */
export async function resolveCompanyAiModelForRequest(args: {
  companyId: string;
  settings: any; // purchaseAssistant settings doc
  planFlags: any; // getCompanyPlanFlags result
}): Promise<ResolvedAiModel> {
  const { companyId, settings, planFlags } = args;
  
  logger.group('[AI] Model Resolver');
  
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.warn('[AI] Resolver: DB unavailable, fallback to default free Groq');
      logger.end();
      return {
        provider: DEFAULT_FREE_AI.provider,
        model: DEFAULT_FREE_AI.model,
        isFreeEligible: true,
        resolvedBy: AI_RESOLVE_BY.FALLBACK_FREE,
        reason: AI_RESOLVE_REASON.DB_UNAVAILABLE,
        modelAutoResolved: true,
        suggestedPaid: null,
      };
    }

    const forcedFreeMode = settings.forcedFreeMode === true;
    
    // Priority 1: Forced free mode → gerçek ücretsiz Groq (stub free_local değil)
    if (forcedFreeMode) {
      logger.info('[AI] Resolver: FORCED_FREE_MODE active → default free Groq');
      logger.end();
      return {
        provider: DEFAULT_FREE_AI.provider,
        model: DEFAULT_FREE_AI.model,
        isFreeEligible: true,
        resolvedBy: AI_RESOLVE_BY.FORCED_FREE,
        reason: AI_RESOLVE_REASON.FORCED_FREE_MODE,
        modelAutoResolved: true,
        suggestedPaid: null,
      };
    }

    // Build available models
    const availableModels = await computeAvailableModels({
      db,
      companyId,
      isPremiumPlus: planFlags.isPremiumPlus,
    });

    // Determine current settings selection (yoksa ücretsiz Groq)
    const selectedProvider = settings.provider || DEFAULT_FREE_AI.provider;
    const selectedModel = settings.model || DEFAULT_FREE_AI.model;

    // Check if selected model exists in availableModels
    const selectedModelObj = availableModels.find(
      m => m.provider === selectedProvider && m.model === selectedModel
    );

    // Teklifbul Rule v1.0 — Ücretsiz model her zaman hemen kullanılır; ücretli EXACT için cüzdan şart
    let paidExactUnusable: {
      provider: string;
      model: string;
      providerKey: string;
      reason: typeof AI_RESOLVE_REASON.NO_FUNDS_FOR_PAID | typeof AI_RESOLVE_REASON.NOT_ENTITLED;
    } | null = null;

    if (selectedModelObj) {
      const isFreeEligible = selectedModelObj.freeEligible === true;

      if (isFreeEligible) {
        logger.info('[AI] Resolver: EXACT match (free)', {
          provider: selectedProvider,
          model: selectedModel,
        });
        logger.end();
        return {
          provider: selectedProvider,
          model: selectedModel,
          isFreeEligible: true,
          resolvedBy: AI_RESOLVE_BY.EXACT,
          reason: AI_RESOLVE_REASON.NORMAL,
          modelAutoResolved: false,
          suggestedPaid: null,
        };
      }

      // Paid model selected — only use if wallet + entitlement allow; else free Groq
      const { getCompanyAiWallet } = await import('./companyAiWalletService.js');
      const { getAiMinTokens } = await import('./aiMinTokens.js');
      const { getProviderEntitlements, isModelAllowed } = await import('./aiEntitlementService.js');
      const MIN_TOKENS = getAiMinTokens();
      const providerKey = getProviderKey(selectedProvider);
      const providerWallet = await getCompanyAiWallet(companyId, providerKey);
      const walletBalance = providerWallet?.balanceTokens || 0;

      const entitlements = await getProviderEntitlements(companyId, providerKey);
      let isEntitled = true;
      if (entitlements && !entitlements.isProviderWide) {
        const catalog = await loadAiModelCatalog(db);
        const catalogModel = catalog.find(
          (m) => m.provider === selectedProvider && m.model === selectedModel
        );
        const modelTier = (catalogModel as any)?.tier || undefined;
        isEntitled = isModelAllowed(entitlements, selectedProvider, selectedModel, modelTier);
      }

      if (isEntitled && walletBalance >= MIN_TOKENS) {
        logger.info('[AI] Resolver: EXACT match (paid)', {
          provider: selectedProvider,
          model: selectedModel,
          providerKey,
          walletBalance,
        });
        logger.end();
        return {
          provider: selectedProvider,
          model: selectedModel,
          isFreeEligible: false,
          resolvedBy: AI_RESOLVE_BY.EXACT,
          reason: AI_RESOLVE_REASON.NORMAL,
          modelAutoResolved: false,
          suggestedPaid: null,
        };
      }

      paidExactUnusable = {
        provider: selectedProvider,
        model: selectedModel,
        providerKey,
        reason: !isEntitled ? AI_RESOLVE_REASON.NOT_ENTITLED : AI_RESOLVE_REASON.NO_FUNDS_FOR_PAID,
      };
      logger.warn('[AI] Resolver: EXACT paid unusable → will use free Groq', {
        companyId,
        selected: { provider: selectedProvider, model: selectedModel },
        providerKey,
        walletBalance,
        min: MIN_TOKENS,
        reason: paidExactUnusable.reason,
      });
    } else {
      // Selected model NOT in availableModels - need to resolve fallback
      logger.warn('[AI] Resolver: Selected model not available', {
        companyId,
        selected: { provider: selectedProvider, model: selectedModel },
      });
    }

    // Compute suggested paid model (reuse restore paid helper logic)
    const restorePaidStatus = await computeRestorePaidStatus({
      db,
      companyId,
      userId: null, // Not needed for read-only computation
      settings,
      planId: planFlags.planId,
    });

    const paidCandidates = availableModels.filter(m => m.freeEligible !== true);
    const hasPaidCandidate = paidCandidates.length > 0;
    const freeCandidates = availableModels.filter(m => m.freeEligible === true);

    // Priority 2: If PremiumPlus and paid candidate exists, use it (if wallet has balance)
    // Skip when user already has a paid selection that's just short on funds (prefer free over swap)
    if (!paidExactUnusable && planFlags.isPremiumPlus && hasPaidCandidate && restorePaidStatus.suggestedPaid) {
      const suggested = restorePaidStatus.suggestedPaid;
      // Verify suggested is still in availableModels
      const verified = availableModels.find(
        m => m.provider === suggested.provider && m.model === suggested.model
      );
      
      if (verified) {
        // Teklifbul Rule v3.12 - Check provider wallet availability before paid fallback
        const { getCompanyAiWallet } = await import('./companyAiWalletService.js');
        const { getAiMinTokens } = await import('./aiMinTokens.js');
        const MIN_TOKENS = getAiMinTokens();
        
        // Teklifbul Rule v3.15 - Use getProviderKey helper and include in meta
        const providerKey = getProviderKey(suggested.provider);
        const providerWallet = await getCompanyAiWallet(args.companyId, providerKey);
        const walletBalance = providerWallet?.balanceTokens || 0;
        
        // Teklifbul Rule v3.15 - Check entitlements before wallet (entitlements are already checked in restorePaidStatus, but double-check)
        const { getProviderEntitlements, isModelAllowed } = await import('./aiEntitlementService.js');
        const entitlements = await getProviderEntitlements(args.companyId, providerKey);
        let isEntitled = true;
        if (entitlements && !entitlements.isProviderWide) {
          const catalog = await loadAiModelCatalog(db);
          const catalogModel = catalog.find(m => m.provider === suggested.provider && m.model === suggested.model);
          const modelTier = (catalogModel as any)?.tier || undefined;
          isEntitled = isModelAllowed(entitlements, suggested.provider, suggested.model, modelTier);
        }
        
        if (isEntitled && walletBalance >= MIN_TOKENS) {
          logger.info('[AI] Resolver: FALLBACK_PAID', {
            from: { provider: selectedProvider, model: selectedModel },
            to: { provider: suggested.provider, model: suggested.model },
            providerKey,
            walletBalance,
          });
          logger.end();
          return {
            provider: suggested.provider,
            model: suggested.model,
            isFreeEligible: false,
            resolvedBy: AI_RESOLVE_BY.FALLBACK_PAID,
            reason: AI_RESOLVE_REASON.SELECTED_MODEL_NOT_AVAILABLE,
            modelAutoResolved: true,
            suggestedPaid: { ...suggested, providerKey }, // Teklifbul Rule v3.15 - Include providerKey
          };
        } else {
          const reason = !isEntitled ? AI_RESOLVE_REASON.NOT_ENTITLED : AI_RESOLVE_REASON.NO_FUNDS_FOR_PAID;
          logger.warn('[AI] Resolver: FALLBACK_PAID skipped', {
            provider: suggested.provider,
            providerKey,
            walletBalance,
            min: MIN_TOKENS,
            isEntitled,
            reason,
          });
          // Teklifbul Rule v3.17 - Store requiredProviderKey for free fallback
          // This will be included in the free fallback return below
        }
      } else {
        // Suggested paid model not in availableModels - likely entitlement issue
        logger.warn('[AI] Resolver: FALLBACK_PAID skipped (model not entitled or not available)', {
          provider: suggested.provider,
          model: suggested.model,
        });
        // Fall through to free fallback
      }
    }

    // Priority 3: Fallback to best free eligible model (Groq tercih, free_local stub değil)
    if (freeCandidates.length > 0) {
      const catalog = await loadAiModelCatalog(db);
      const catalogMap = new Map<string, { sort?: number }>();
      catalog.forEach(m => {
        const key = `${m.provider}::${m.model}`;
        catalogMap.set(key, { sort: m.sort });
      });

      const enriched = freeCandidates.map((m) => ({
        ...m,
        sort: catalogMap.get(`${m.provider}::${m.model}`)?.sort ?? 9999,
      }));
      const bestFree = pickPreferredFreeModel(enriched) || enriched[0];
      
      // Teklifbul Rule v3.17 - Include requiredProviderKey if falling back due to NO_FUNDS_FOR_PAID or NOT_ENTITLED
      let requiredProviderKey: string | undefined = undefined;
      if (restorePaidStatus.suggestedPaid?.providerKey) {
        // Check if the reason for fallback is provider-specific
        const suggested = restorePaidStatus.suggestedPaid;
        const suggestedProviderKey = suggested.providerKey!;
        
        // Verify if this is a provider-specific issue
        const { getCompanyAiWallet } = await import('./companyAiWalletService.js');
        const { getAiMinTokens } = await import('./aiMinTokens.js');
        const MIN_TOKENS = getAiMinTokens();
        const providerWallet = await getCompanyAiWallet(args.companyId, suggestedProviderKey);
        const walletBalance = providerWallet?.balanceTokens || 0;
        
        // Check entitlements
        const { getProviderEntitlements, isModelAllowed } = await import('./aiEntitlementService.js');
        const entitlements = await getProviderEntitlements(args.companyId, suggestedProviderKey);
        let isEntitled = true;
        if (entitlements && !entitlements.isProviderWide) {
          const catalog = await loadAiModelCatalog(db);
          const catalogModel = catalog.find(m => m.provider === suggested.provider && m.model === suggested.model);
          const modelTier = (catalogModel as any)?.tier || undefined;
          isEntitled = isModelAllowed(entitlements, suggested.provider, suggested.model, modelTier);
        }
        
        // Set requiredProviderKey if it's a provider-specific issue
        if (walletBalance < MIN_TOKENS || !isEntitled) {
          requiredProviderKey = suggestedProviderKey;
        }
      }
      
      const freeReason = paidExactUnusable
        ? paidExactUnusable.reason
        : hasPaidCandidate
          ? AI_RESOLVE_REASON.SELECTED_MODEL_NOT_AVAILABLE
          : AI_RESOLVE_REASON.NO_PAID_MODEL_AVAILABLE;

      const suggestedPaid =
        paidExactUnusable
          ? {
              provider: paidExactUnusable.provider,
              model: paidExactUnusable.model,
              providerKey: paidExactUnusable.providerKey,
            }
          : restorePaidStatus.suggestedPaid;

      if (paidExactUnusable && !requiredProviderKey) {
        requiredProviderKey = paidExactUnusable.providerKey;
      }

      logger.info('[AI] Resolver: FALLBACK_FREE', {
        from: { provider: selectedProvider, model: selectedModel },
        to: { provider: bestFree.provider, model: bestFree.model },
        requiredProviderKey,
        reason: freeReason,
      });
      logger.end();
      return {
        provider: bestFree.provider,
        model: bestFree.model,
        isFreeEligible: true,
        resolvedBy: AI_RESOLVE_BY.FALLBACK_FREE,
        reason: freeReason,
        modelAutoResolved: true,
        suggestedPaid,
        requiredProviderKey, // Teklifbul Rule v3.17
      };
    }

    // Last resort: default free Groq
    logger.warn('[AI] Resolver: Last resort fallback to default free Groq');
    logger.end();
    return {
      provider: DEFAULT_FREE_AI.provider,
      model: DEFAULT_FREE_AI.model,
      isFreeEligible: true,
      resolvedBy: AI_RESOLVE_BY.FALLBACK_FREE,
      reason: paidExactUnusable?.reason || AI_RESOLVE_REASON.NO_AVAILABLE_MODELS,
      modelAutoResolved: true,
      suggestedPaid: paidExactUnusable
        ? {
            provider: paidExactUnusable.provider,
            model: paidExactUnusable.model,
            providerKey: paidExactUnusable.providerKey,
          }
        : restorePaidStatus.suggestedPaid,
      requiredProviderKey: paidExactUnusable?.providerKey,
    };
  } catch (error: any) {
    logger.error('[AI] Resolver: Error', error);
    logger.end();
    // Safe fallback
    return {
      provider: DEFAULT_FREE_AI.provider,
      model: DEFAULT_FREE_AI.model,
      isFreeEligible: true,
      resolvedBy: AI_RESOLVE_BY.FALLBACK_FREE,
      reason: AI_RESOLVE_REASON.RESOLVER_ERROR,
      modelAutoResolved: true,
      suggestedPaid: null,
    };
  }
}

