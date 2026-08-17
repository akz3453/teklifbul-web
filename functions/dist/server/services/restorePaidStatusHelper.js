/**
 * Shared helper for restore paid status logic
 * Teklifbul Rule v3.7 - DRY: reuse in GET status and POST purchase hint
 */
import { logger } from '../../src/shared/log/logger.js';
import { computeAvailableModels, loadAiModelCatalog } from './purchaseAssistantAvailabilityService.js';
import { getAccountSubscriptionSummary } from './subscriptionService.js';
import { getProviderEntitlements, isModelAllowed, getProviderKey } from './aiEntitlementService.js'; // Teklifbul Rule v3.13
function computePlanFlags(planId) {
    const id = planId || 'free';
    return {
        planId: id,
        isPremiumPlus: id === 'premium_plus',
        isPremium: id === 'premium' || id === 'premium_plus',
    };
}
/**
 * Compute restore paid status (read-only, no mutations)
 * Teklifbul Rule v3.7 - Shared helper
 */
export async function computeRestorePaidStatus(params) {
    const { db, companyId, userId, settings, planId } = params;
    const forcedFreeMode = settings.forcedFreeMode === true;
    const currentProvider = settings.provider || null;
    const currentModel = settings.model || null;
    // Determine plan
    let resolvedPlanId = planId;
    if (!resolvedPlanId && userId) {
        try {
            const summary = await getAccountSubscriptionSummary(userId);
            resolvedPlanId = summary.plan.planId;
        }
        catch (e) {
            logger.warn('Failed to get account subscription summary', { error: e?.message || e });
        }
    }
    const plan = computePlanFlags(resolvedPlanId);
    // Compute available models
    const availableModels = await computeAvailableModels({
        db,
        companyId,
        isPremiumPlus: plan.isPremiumPlus,
    });
    // Filter paid candidates
    const paidCandidates = availableModels.filter(m => m.freeEligible !== true);
    const hasPaidCandidate = paidCandidates.length > 0;
    // Check if current model is freeEligible
    const currentModelObj = availableModels.find(m => m.provider === currentProvider && m.model === currentModel);
    const isCurrentlyFree = currentModelObj?.freeEligible === true;
    // Determine suggested paid model (same logic as restore endpoint, but read-only)
    // Teklifbul Rule v3.15 - Include providerKey in suggestedPaid
    let suggestedPaid = null;
    if (hasPaidCandidate) {
        const lastPaidProvider = settings.lastPaidProvider;
        const lastPaidModel = settings.lastPaidModel;
        // Try lastPaid first
        if (lastPaidProvider && lastPaidModel) {
            const found = paidCandidates.find(m => m.provider === lastPaidProvider && m.model === lastPaidModel);
            if (found) {
                const lastPaidProviderKey = getProviderKey(lastPaidProvider);
                // Teklifbul Rule v3.15 - Check wallet and entitlements for lastPaid
                const { getCompanyAiWallet } = await import('./companyAiWalletService.js');
                const { getAiMinTokens } = await import('./aiMinTokens.js');
                const MIN_TOKENS = getAiMinTokens();
                const providerWallet = await getCompanyAiWallet(companyId, lastPaidProviderKey);
                const walletBalance = providerWallet?.balanceTokens || 0;
                // Check entitlements
                const entitlements = await getProviderEntitlements(companyId, lastPaidProviderKey);
                let isEntitled = true;
                if (entitlements && !entitlements.isProviderWide) {
                    const catalog = await loadAiModelCatalog(db);
                    const catalogModel = catalog.find(m => m.provider === lastPaidProvider && m.model === lastPaidModel);
                    const modelTier = catalogModel?.tier || undefined;
                    isEntitled = isModelAllowed(entitlements, lastPaidProvider, lastPaidModel, modelTier);
                }
                // Only use lastPaid if both wallet and entitlements are sufficient
                if (isEntitled && walletBalance >= MIN_TOKENS) {
                    suggestedPaid = { provider: lastPaidProvider, model: lastPaidModel, providerKey: lastPaidProviderKey };
                }
            }
        }
        // Fallback: best candidate with wallet balance preference
        if (!suggestedPaid) {
            const catalog = await loadAiModelCatalog(db);
            const catalogMap = new Map();
            catalog.forEach(m => {
                const key = `${m.provider}::${m.model}`;
                catalogMap.set(key, { sort: m.sort });
            });
            paidCandidates.sort((a, b) => {
                const keyA = `${a.provider}::${a.model}`;
                const keyB = `${b.provider}::${b.model}`;
                const sortA = catalogMap.get(keyA)?.sort ?? 9999;
                const sortB = catalogMap.get(keyB)?.sort ?? 9999;
                if (sortA !== sortB)
                    return sortA - sortB;
                if (a.provider !== b.provider)
                    return a.provider.localeCompare(b.provider, 'en');
                return a.model.localeCompare(b.model, 'en');
            });
            // Teklifbul Rule v3.12 + v3.13 - Prefer candidates with wallet balance AND entitlements
            const { getCompanyAiWallet } = await import('./companyAiWalletService.js');
            const { getAiMinTokens } = await import('./aiMinTokens.js');
            const MIN_TOKENS = getAiMinTokens();
            // Find first candidate with sufficient wallet and entitlements
            for (const candidate of paidCandidates) {
                const providerKey = getProviderKey(candidate.provider);
                // Teklifbul Rule v3.13 - Check entitlements
                const entitlements = await getProviderEntitlements(companyId, providerKey);
                if (entitlements && !entitlements.isProviderWide) {
                    const catalog = await loadAiModelCatalog(db);
                    const catalogModel = catalog.find(m => m.provider === candidate.provider && m.model === candidate.model);
                    const modelTier = catalogModel?.tier || undefined;
                    const isEntitled = isModelAllowed(entitlements, candidate.provider, candidate.model, modelTier);
                    if (!isEntitled) {
                        continue; // Skip non-entitled models
                    }
                }
                // Teklifbul Rule v3.12 - Check wallet balance
                const providerWallet = await getCompanyAiWallet(companyId, providerKey);
                const walletBalance = providerWallet?.balanceTokens || 0;
                if (walletBalance >= MIN_TOKENS) {
                    suggestedPaid = { provider: candidate.provider, model: candidate.model, providerKey };
                    break;
                }
            }
            // Teklifbul Rule v3.15 - If no candidate has sufficient wallet, use best entitled candidate (for UI messaging)
            if (!suggestedPaid && paidCandidates.length > 0) {
                // Find best candidate that is entitled (even if wallet insufficient)
                for (const candidate of paidCandidates) {
                    const candidateProviderKey = getProviderKey(candidate.provider);
                    const entitlements = await getProviderEntitlements(companyId, candidateProviderKey);
                    if (entitlements && !entitlements.isProviderWide) {
                        const catalog = await loadAiModelCatalog(db);
                        const catalogModel = catalog.find(m => m.provider === candidate.provider && m.model === candidate.model);
                        const modelTier = catalogModel?.tier || undefined;
                        const isEntitled = isModelAllowed(entitlements, candidate.provider, candidate.model, modelTier);
                        if (isEntitled) {
                            suggestedPaid = { provider: candidate.provider, model: candidate.model, providerKey: candidateProviderKey };
                            break;
                        }
                    }
                    else if (entitlements?.isProviderWide) {
                        // Provider-wide entitlements, use first one
                        suggestedPaid = { provider: candidate.provider, model: candidate.model, providerKey: candidateProviderKey };
                        break;
                    }
                }
                // If still no suggestion, use first candidate (fallback)
                if (!suggestedPaid) {
                    const best = paidCandidates[0];
                    suggestedPaid = { provider: best.provider, model: best.model, providerKey: getProviderKey(best.provider) };
                }
            }
        }
    }
    // Determine canRestore and reason
    // Teklifbul Rule v3.12 + v3.13 - Check wallet balance AND entitlements
    let canRestore = false;
    let reason = 'OK';
    if (forcedFreeMode) {
        reason = 'FORCED_FREE_MODE';
        canRestore = false;
    }
    else if (!hasPaidCandidate) {
        // Teklifbul Rule v3.15 - Distinguish between no paid models vs not entitled
        // Check if company has purchases but entitlements exclude all models
        const { getCompanyEntitlements } = await import('./aiEntitlementService.js');
        const allEntitlements = await getCompanyEntitlements(companyId);
        const hasAnyPurchases = allEntitlements.size > 0;
        if (hasAnyPurchases) {
            // Has purchases but no paid candidates = entitlements exclude all models
            reason = 'NOT_ENTITLED';
        }
        else {
            reason = 'NO_PAID_MODEL';
        }
        canRestore = false;
    }
    else if (!isCurrentlyFree) {
        reason = 'ALREADY_PAID';
        canRestore = false;
    }
    else if (suggestedPaid) {
        const providerKey = getProviderKey(suggestedPaid.provider);
        // Teklifbul Rule v3.13 - Check entitlements
        const entitlements = await getProviderEntitlements(companyId, providerKey);
        if (entitlements && !entitlements.isProviderWide) {
            const catalog = await loadAiModelCatalog(db);
            const catalogModel = catalog.find(m => m.provider === suggestedPaid.provider && m.model === suggestedPaid.model);
            const modelTier = catalogModel?.tier || undefined;
            const isEntitled = isModelAllowed(entitlements, suggestedPaid.provider, suggestedPaid.model, modelTier);
            if (!isEntitled) {
                reason = 'NOT_ENTITLED';
                canRestore = false;
                return { forcedFreeMode, hasPaidCandidate, canRestore, suggestedPaid, reason };
            }
        }
        // Teklifbul Rule v3.12 - Check wallet balance
        const { getCompanyAiWallet } = await import('./companyAiWalletService.js');
        const { getAiMinTokens } = await import('./aiMinTokens.js');
        const MIN_TOKENS = getAiMinTokens();
        const providerWallet = await getCompanyAiWallet(companyId, providerKey);
        const walletBalance = providerWallet?.balanceTokens || 0;
        if (walletBalance >= MIN_TOKENS) {
            reason = 'OK';
            canRestore = true;
        }
        else {
            reason = 'NO_FUNDS_FOR_PAID';
            canRestore = false; // Can't restore without wallet balance
        }
    }
    else {
        reason = 'OK';
        canRestore = true;
    }
    return {
        forcedFreeMode,
        hasPaidCandidate,
        canRestore,
        suggestedPaid,
        reason,
    };
}
