/**
 * AI Cost Accounting Service
 * Teklifbul Rule v3.18 - Single source of truth for cost calculation
 *
 * Purpose: Centralize all AI cost calculations to ensure consistency across:
 * - Ledger writes
 * - Usage summaries (7/30 days)
 * - Admin profit reports (month + detail)
 * - Alerts (profit + burn)
 * - Regression runner scripts
 */
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { loadAiModelCatalog } from './purchaseAssistantAvailabilityService.js';
/**
 * Get USD/TRY exchange rate
 * Teklifbul Rule v3.18 - Centralized FX rate
 *
 * @param db - Firestore database instance
 * @returns USD/TRY rate (default: 30)
 */
export async function getUsdTryRate(db) {
    try {
        const financeRef = db.collection('system_settings').doc('finance');
        const financeSnap = await financeRef.get();
        if (financeSnap.exists) {
            const data = financeSnap.data() || {};
            const rate = Number(data.usdTryRate);
            if (rate > 0) {
                return rate;
            }
        }
    }
    catch (e) {
        logger.warn('[CostAccounting] Failed to read USD/TRY rate, using default', { error: e.message });
    }
    // Default: 30 TRY per USD
    return 30;
}
/**
 * Get monthly USD/TRY snapshot rate if available
 * Teklifbul Rule v3.18 - FX drift guard
 *
 * @param db - Firestore database instance
 * @param month - Month in format "YYYY-MM"
 * @returns Snapshot rate or null if not found
 */
export async function getUsdTryRateSnapshot(db, month) {
    try {
        const snapshotRef = db.collection('system_settings').doc('financeMonthly').collection('snapshots').doc(month);
        const snapshotSnap = await snapshotRef.get();
        if (snapshotSnap.exists) {
            const data = snapshotSnap.data() || {};
            const rate = Number(data.usdTryRateSnapshot);
            if (rate > 0) {
                return rate;
            }
        }
    }
    catch (e) {
        logger.warn('[CostAccounting] Failed to read USD/TRY snapshot', { month, error: e.message });
    }
    return null;
}
/**
 * Get model cost per 1k tokens in USD from catalog
 * Teklifbul Rule v3.18 - Catalog lookup
 *
 * @param provider - Provider name (e.g., 'openai', 'gemini')
 * @param model - Model name (e.g., 'gpt-4o-mini')
 * @param catalog - Catalog models array
 * @returns Cost per 1k tokens in USD, or null if not found
 */
export function getModelCostPer1kUsd(provider, model, catalog) {
    const catalogModel = catalog.find(m => m.provider === provider && m.model === model);
    if (!catalogModel) {
        return null;
    }
    const cost = catalogModel.costPer1kTokensUSD;
    if (typeof cost === 'number' && cost >= 0) {
        return cost;
    }
    return null;
}
export function estimateCostUsdFromInputOutputTokens(params) {
    const found = params.catalog.find((m) => m.provider === params.provider && m.model === params.model);
    if (!found)
        return null;
    const inputPer1M = Number(found.inputCostPer1MTokensUSD || 0);
    const outputPer1M = Number(found.outputCostPer1MTokensUSD || 0);
    if (inputPer1M > 0 || outputPer1M > 0) {
        const inUsd = (Math.max(0, params.promptTokens) / 1000000) * inputPer1M;
        const outUsd = (Math.max(0, params.completionTokens) / 1000000) * outputPer1M;
        return inUsd + outUsd;
    }
    const per1k = getModelCostPer1kUsd(params.provider, params.model, params.catalog);
    return estimateCostUsdFromTokens(params.promptTokens + params.completionTokens, per1k);
}
/**
 * Estimate cost in USD from token count
 * Teklifbul Rule v3.18 - Cost calculation
 *
 * @param tokens - Number of tokens
 * @param costPer1kUsd - Cost per 1k tokens in USD
 * @returns Estimated cost in USD
 */
export function estimateCostUsdFromTokens(tokens, costPer1kUsd) {
    if (costPer1kUsd === null || costPer1kUsd < 0) {
        return null;
    }
    if (tokens <= 0) {
        return 0;
    }
    return (tokens / 1000) * costPer1kUsd;
}
/**
 * Convert USD to TRY
 * Teklifbul Rule v3.18 - FX conversion
 *
 * @param usd - Amount in USD
 * @param usdTryRate - USD/TRY exchange rate
 * @returns Amount in TRY
 */
export function toTry(usd, usdTryRate) {
    if (usd === null || usd < 0) {
        return null;
    }
    return usd * usdTryRate;
}
/**
 * Compute cost metadata for ledger entry
 * Teklifbul Rule v3.18 - Ledger cost meta
 *
 * @param params - Cost computation parameters
 * @returns Cost metadata object
 */
export async function computeLedgerCostMeta(params) {
    const { providerKey, provider, model, tokensPaid } = params;
    // Load catalog if not provided
    let catalog = params.catalog;
    if (!catalog) {
        try {
            const db = params.db || await getAdminDb();
            if (db) {
                catalog = await loadAiModelCatalog(db);
            }
            else {
                catalog = [];
            }
        }
        catch (e) {
            logger.warn('[CostAccounting] Failed to load catalog for cost computation', { error: e.message });
            catalog = [];
        }
    }
    // Get USD/TRY rate if not provided
    let usdTryRate = params.usdTryRate;
    if (usdTryRate === undefined) {
        try {
            const db = params.db || await getAdminDb();
            if (db) {
                usdTryRate = await getUsdTryRate(db);
            }
            else {
                usdTryRate = 30; // Default
            }
        }
        catch (e) {
            logger.warn('[CostAccounting] Failed to load USD/TRY rate, using default', { error: e.message });
            usdTryRate = 30;
        }
    }
    // Get cost per 1k tokens
    const costPer1kUsd = catalog && catalog.length > 0
        ? getModelCostPer1kUsd(provider, model, catalog)
        : null;
    const promptTokens = Number(params.promptTokens || 0);
    const completionTokens = Number(params.completionTokens || 0);
    const hasSplitTokens = promptTokens > 0 || completionTokens > 0;
    const costUsd = hasSplitTokens
        ? estimateCostUsdFromInputOutputTokens({
            promptTokens,
            completionTokens,
            provider,
            model,
            catalog: catalog || [],
        })
        : estimateCostUsdFromTokens(tokensPaid, costPer1kUsd);
    // Convert to TRY
    const costTry = toTry(costUsd, usdTryRate);
    return {
        costPer1kTokensUsd: costPer1kUsd,
        costUsd,
        costTry,
        usdTryRateUsed: usdTryRate,
        costComputedAt: new Date().toISOString(),
        costVersion: 'v3.19',
    };
}
/**
 * Summarize costs from ledger entries
 * Teklifbul Rule v3.18 - Cost summary with unknown tracking
 *
 * @param entries - Array of ledger entry documents
 * @returns Cost summary
 */
export function summarizeCostsFromLedgerEntries(entries) {
    let paidTokens = 0;
    let freeTokens = 0;
    let costUsdKnown = 0;
    let costTryKnown = 0;
    let costUsdUnknownTokens = 0;
    let unknownCostEntriesCount = 0;
    for (const entry of entries) {
        const data = entry.data ? entry.data() : entry;
        const meta = data.meta || {};
        const amountTokens = Math.abs(Number(data.amountTokens || 0));
        const isFreeEligible = meta.freeEligible === true;
        if (isFreeEligible) {
            freeTokens += amountTokens;
        }
        else {
            paidTokens += amountTokens;
            // Check if cost is known from ledger meta
            const costUsd = meta.costUsd;
            const costTry = meta.costTry;
            if (typeof costUsd === 'number' && costUsd >= 0) {
                costUsdKnown += costUsd;
                if (typeof costTry === 'number' && costTry >= 0) {
                    costTryKnown += costTry;
                }
            }
            else {
                // Cost unknown - track tokens
                costUsdUnknownTokens += amountTokens;
                unknownCostEntriesCount++;
            }
        }
    }
    return {
        paidTokens,
        freeTokens,
        costUsdKnown,
        costTryKnown,
        costUsdUnknownTokens,
        unknownCostEntriesCount,
    };
}
/**
 * Check for FX drift warning
 * Teklifbul Rule v3.18 - FX drift guard
 *
 * @param db - Firestore database instance
 * @param month - Month in format "YYYY-MM"
 * @returns FX drift warning or null
 */
export async function checkFxDriftWarning(db, month) {
    try {
        const currentRate = await getUsdTryRate(db);
        const snapshotRate = await getUsdTryRateSnapshot(db, month);
        if (snapshotRate === null) {
            // No snapshot - no warning (first time)
            return null;
        }
        // Calculate percentage difference
        const pctDiff = Math.abs(((currentRate - snapshotRate) / snapshotRate) * 100);
        // Warn if > 10% difference
        if (pctDiff > 10) {
            return {
                month,
                current: currentRate,
                snapshotOrNull: snapshotRate,
                pctDiff: Math.round(pctDiff * 100) / 100, // Round to 2 decimals
            };
        }
        return null;
    }
    catch (e) {
        logger.warn('[CostAccounting] Failed to check FX drift', { month, error: e.message });
        return null;
    }
}
