/**
 * AI Entitlement Service (v3.13)
 * Teklifbul Rule v3.13 - Package entitlements (model access policy)
 *
 * Purpose: Resolve company entitlements from token purchases and check model access
 * Caching: 30s in-memory cache per company+provider
 */
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const entitlementCache = new Map();
/**
 * Get provider key from provider string
 * Teklifbul Rule v3.12 - Normalize provider to wallet key
 */
export function getProviderKey(provider) {
    const normalized = String(provider || '').toLowerCase().trim();
    if (normalized === 'openai' || normalized.startsWith('openai'))
        return 'openai';
    if (normalized === 'gemini' || normalized.startsWith('gemini'))
        return 'gemini';
    if (normalized === 'free_local' || normalized === 'free')
        return 'free';
    return normalized || 'unknown';
}
/**
 * Check if model is allowed by entitlements
 * Teklifbul Rule v3.13 - Model entitlement check
 */
export function isModelAllowed(entitlements, provider, model, modelTier) {
    if (!entitlements)
        return false;
    // Provider-wide allow (legacy behavior)
    if (entitlements.isProviderWide)
        return true;
    // Check exact model match
    if (entitlements.allowedModels.includes(model))
        return true;
    // Check prefix match
    for (const prefix of entitlements.allowedModelPrefixes) {
        if (model.startsWith(prefix))
            return true;
    }
    // Check tier match
    if (modelTier && entitlements.allowedTiers.includes(modelTier))
        return true;
    return false;
}
/**
 * Get legacy provider-wide entitlement behavior flag
 * Teklifbul Rule v3.14 - ENV-controlled legacy behavior
 */
function getLegacyProviderWideEnabled() {
    const envValue = process.env.TB_LEGACY_ENTITLEMENT_PROVIDER_WIDE;
    // Default: true (backward compatible)
    if (envValue === undefined || envValue === '')
        return true;
    return envValue.toLowerCase() === 'true';
}
/**
 * Merge entitlements from multiple packages
 * Teklifbul Rule v3.13 + v3.14 - Union entitlements with legacy control
 */
function mergeEntitlements(entitlementsList, hasLegacyPackages = false) {
    const merged = {
        providerKey: '',
        allowedModels: [],
        allowedModelPrefixes: [],
        allowedTiers: [],
        isProviderWide: false, // Default: false, set to true only if conditions met
    };
    const modelSet = new Set();
    const prefixSet = new Set();
    const tierSet = new Set();
    let hasSpecificEntitlements = false;
    for (const ent of entitlementsList) {
        if (ent.allowedModels && ent.allowedModels.length > 0) {
            ent.allowedModels.forEach(m => modelSet.add(m));
            hasSpecificEntitlements = true;
        }
        if (ent.allowedModelPrefixes && ent.allowedModelPrefixes.length > 0) {
            ent.allowedModelPrefixes.forEach(p => prefixSet.add(p));
            hasSpecificEntitlements = true;
        }
        if (ent.allowedTiers && ent.allowedTiers.length > 0) {
            ent.allowedTiers.forEach(t => tierSet.add(t));
            hasSpecificEntitlements = true;
        }
    }
    merged.allowedModels = Array.from(modelSet);
    merged.allowedModelPrefixes = Array.from(prefixSet);
    merged.allowedTiers = Array.from(tierSet);
    // Teklifbul Rule v3.14 - Legacy provider-wide behavior controlled by ENV
    if (!hasSpecificEntitlements && hasLegacyPackages) {
        const legacyEnabled = getLegacyProviderWideEnabled();
        merged.isProviderWide = legacyEnabled;
    }
    else if (hasSpecificEntitlements) {
        merged.isProviderWide = false; // Explicit entitlements override provider-wide
    }
    else {
        merged.isProviderWide = false; // No entitlements and no legacy = no unlock
    }
    return merged;
}
/**
 * Get company entitlements for all providers
 * Teklifbul Rule v3.13 - Entitlement resolution with caching
 */
export async function getCompanyEntitlements(companyId) {
    // Check cache
    const now = Date.now();
    const cacheEntry = entitlementCache.get(companyId);
    if (cacheEntry && cacheEntry.expiresAt > now) {
        return cacheEntry.data;
    }
    const db = await getAdminDb();
    if (!db) {
        logger.warn('[Entitlements] Database unavailable, returning empty entitlements', { companyId });
        return new Map();
    }
    // Load active purchases
    let purchaseDocs = [];
    try {
        const snap = await db
            .collection('companies')
            .doc(companyId)
            .collection('aiTokenPurchases')
            .where('status', '==', 'paid')
            .get();
        purchaseDocs = snap.docs.map((d) => d.data() || {});
    }
    catch (e) {
        logger.warn('[Entitlements] Failed to load purchases', { companyId, error: e?.message || e });
        return new Map();
    }
    // Group entitlements by provider
    const entitlementsByProvider = new Map();
    const legacyPackagesByProvider = new Map(); // Track if provider has legacy packages
    for (const purchase of purchaseDocs) {
        const providerKey = purchase.providerKey || null;
        if (!providerKey) {
            // Legacy purchase without providerKey - skip (no provider key to assign)
            continue;
        }
        // Get entitlements from purchase snapshot or package definition
        const packageSnapshot = purchase.packageSnapshot || {};
        const purchaseEntitlement = purchase.entitlement || {};
        // Prefer purchase.entitlement snapshot, fallback to packageSnapshot
        const entitlement = {
            allowedModels: purchaseEntitlement.allowedModels ||
                (Array.isArray(packageSnapshot.allowedModels) ? packageSnapshot.allowedModels : undefined),
            allowedModelPrefixes: purchaseEntitlement.allowedModelPrefixes ||
                (Array.isArray(packageSnapshot.allowedModelPrefixes) ? packageSnapshot.allowedModelPrefixes : undefined),
            allowedTiers: purchaseEntitlement.allowedTiers ||
                (Array.isArray(packageSnapshot.allowedTiers) ? packageSnapshot.allowedTiers : undefined),
        };
        // Teklifbul Rule v3.14 - Check if this is a legacy package (no entitlements)
        const hasEntitlements = (entitlement.allowedModels && entitlement.allowedModels.length > 0) ||
            (entitlement.allowedModelPrefixes && entitlement.allowedModelPrefixes.length > 0) ||
            (entitlement.allowedTiers && entitlement.allowedTiers.length > 0);
        if (!hasEntitlements) {
            // Legacy package: mark provider as having legacy packages
            legacyPackagesByProvider.set(providerKey, true);
            // Don't add empty entitlement - mergeEntitlements will handle legacy behavior
        }
        else {
            // Explicit entitlements: add to list
            const existing = entitlementsByProvider.get(providerKey) || [];
            existing.push(entitlement);
            entitlementsByProvider.set(providerKey, existing);
        }
    }
    // Merge entitlements per provider
    const result = new Map();
    for (const [providerKey, entitlementsList] of entitlementsByProvider.entries()) {
        const hasLegacy = legacyPackagesByProvider.get(providerKey) === true;
        const merged = mergeEntitlements(entitlementsList, hasLegacy);
        merged.providerKey = providerKey;
        result.set(providerKey, merged);
    }
    // Handle providers with only legacy packages (no explicit entitlements)
    for (const [providerKey, hasLegacy] of legacyPackagesByProvider.entries()) {
        if (!result.has(providerKey) && hasLegacy) {
            const merged = mergeEntitlements([], true); // Empty list, but has legacy
            merged.providerKey = providerKey;
            result.set(providerKey, merged);
        }
    }
    // Cache result
    entitlementCache.set(companyId, {
        data: result,
        expiresAt: now + CACHE_TTL_MS,
    });
    logger.info('[Entitlements] Resolved company entitlements', {
        companyId,
        providerCount: result.size,
        providers: Array.from(result.keys()),
    });
    return result;
}
/**
 * Get entitlements for a specific provider
 * Teklifbul Rule v3.13 - Provider-specific entitlement lookup
 */
export async function getProviderEntitlements(companyId, providerKey) {
    const allEntitlements = await getCompanyEntitlements(companyId);
    return allEntitlements.get(providerKey) || null;
}
/**
 * Clear entitlement cache (call after purchase)
 * Teklifbul Rule v3.13 - Cache invalidation
 */
export function clearEntitlementCache(companyId) {
    entitlementCache.delete(companyId);
    logger.info('[Entitlements] Cache cleared', { companyId });
}
