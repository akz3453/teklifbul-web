/**
 * AI Kill-Switch Service (v3.11)
 * Teklifbul Rule v3.11 - Emergency controls for AI system
 * 
 * Purpose: Read-only service to check AI availability (global/company/panic mode)
 * Runtime enforcement: NO MUTATIONS, only reads from Firestore
 * Fail-safe: Fail open (if read fails, allow AI) BUT log warning
 */

import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { AI_DISABLED_REASONS } from '../constants/aiMeta.js';

export type AiAvailabilityResult = {
  enabled: boolean;
  disabledReason: 'PANIC' | 'GLOBAL' | 'COMPANY' | null;
  message: string;
};

// In-memory cache: 30s TTL
interface CacheEntry {
  data: AiAvailabilityResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

let globalCache: CacheEntry | null = null;
const companyCache = new Map<string, CacheEntry>();

/**
 * Get global AI controls from Firestore
 * Teklifbul Rule v3.11 - Fail open: if read fails, return enabled=true
 */
async function getGlobalAiControls(): Promise<{
  globalAiDisabled: boolean;
  globalAiDisabledReason: string | null;
  panicMode: boolean;
  panicModeReason: string | null;
}> {
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.warn('[KillSwitch] Database unavailable, fail open');
      return {
        globalAiDisabled: false,
        globalAiDisabledReason: null,
        panicMode: false,
        panicModeReason: null,
      };
    }

    const docRef = db.collection('system_settings').doc('aiControls');
    const snap = await docRef.get();

    if (!snap.exists) {
      // Document missing => defaults false
      return {
        globalAiDisabled: false,
        globalAiDisabledReason: null,
        panicMode: false,
        panicModeReason: null,
      };
    }

    const data = snap.data() || {};
    return {
      globalAiDisabled: data.globalAiDisabled === true,
      globalAiDisabledReason: data.globalAiDisabledReason || null,
      panicMode: data.panicMode === true,
      panicModeReason: data.panicModeReason || null,
    };
  } catch (err) {
    logger.warn('[KillSwitch] Failed to read global controls, fail open', err);
    // Fail open: return enabled
    return {
      globalAiDisabled: false,
      globalAiDisabledReason: null,
      panicMode: false,
      panicModeReason: null,
    };
  }
}

/**
 * Get company AI controls from Firestore
 * Teklifbul Rule v3.11 - Fail open: if read fails, return enabled=true
 */
async function getCompanyAiControls(companyId: string): Promise<{
  companyAiDisabled: boolean;
  companyAiDisabledReason: string | null;
}> {
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.warn('[KillSwitch] Database unavailable, fail open', { companyId });
      return {
        companyAiDisabled: false,
        companyAiDisabledReason: null,
      };
    }

    const docRef = db
      .collection('companies')
      .doc(companyId)
      .collection('settings')
      .doc('aiControls');
    const snap = await docRef.get();

    if (!snap.exists) {
      // Document missing => defaults false
      return {
        companyAiDisabled: false,
        companyAiDisabledReason: null,
      };
    }

    const data = snap.data() || {};
    return {
      companyAiDisabled: data.companyAiDisabled === true,
      companyAiDisabledReason: data.companyAiDisabledReason || null,
    };
  } catch (err) {
    logger.warn('[KillSwitch] Failed to read company controls, fail open', { companyId, error: err });
    // Fail open: return enabled
    return {
      companyAiDisabled: false,
      companyAiDisabledReason: null,
    };
  }
}

/**
 * Evaluate AI availability for a company
 * Priority: PANIC > GLOBAL > COMPANY > enabled
 * Teklifbul Rule v3.11 - Kill-switch evaluation
 */
export async function evaluateAiAvailability(companyId: string | null): Promise<AiAvailabilityResult> {
  // Check cache first (global)
  const now = Date.now();
  if (globalCache && globalCache.expiresAt > now) {
    // Use cached global result, but still check company if companyId provided
    if (!companyId) {
      return globalCache.data;
    }
  }

  // Read global controls
  const global = await getGlobalAiControls();

  // Check panic mode first (highest priority)
  if (global.panicMode) {
    const result: AiAvailabilityResult = {
      enabled: false,
      disabledReason: AI_DISABLED_REASONS.PANIC,
      message: global.panicModeReason || 'Panic mode aktif',
    };
    // Cache global result
    globalCache = {
      data: result,
      expiresAt: now + CACHE_TTL_MS,
    };
    return result;
  }

  // Check global disable
  if (global.globalAiDisabled) {
    const result: AiAvailabilityResult = {
      enabled: false,
      disabledReason: AI_DISABLED_REASONS.GLOBAL,
      message: global.globalAiDisabledReason || 'Global AI kapalı',
    };
    // Cache global result
    globalCache = {
      data: result,
      expiresAt: now + CACHE_TTL_MS,
    };
    return result;
  }

  // If no companyId, return enabled
  if (!companyId) {
    const result: AiAvailabilityResult = {
      enabled: true,
      disabledReason: null,
      message: 'AI aktif',
    };
    globalCache = {
      data: result,
      expiresAt: now + CACHE_TTL_MS,
    };
    return result;
  }

  // Check company cache
  const companyCacheEntry = companyCache.get(companyId);
  if (companyCacheEntry && companyCacheEntry.expiresAt > now) {
    return companyCacheEntry.data;
  }

  // Read company controls
  const company = await getCompanyAiControls(companyId);

  // Check company disable
  if (company.companyAiDisabled) {
    const result: AiAvailabilityResult = {
      enabled: false,
      disabledReason: AI_DISABLED_REASONS.COMPANY,
      message: company.companyAiDisabledReason || 'Bu firma için AI kapalı',
    };
    // Cache company result
    companyCache.set(companyId, {
      data: result,
      expiresAt: now + CACHE_TTL_MS,
    });
    return result;
  }

  // All checks passed: AI enabled
  const result: AiAvailabilityResult = {
    enabled: true,
    disabledReason: null,
    message: 'AI aktif',
  };
  // Cache company result
  companyCache.set(companyId, {
    data: result,
    expiresAt: now + CACHE_TTL_MS,
  });
  return result;
}

/**
 * Clear cache (call after admin toggles)
 * Teklifbul Rule v3.11 - Cache invalidation
 */
export function clearKillSwitchCache(companyId?: string): void {
  globalCache = null;
  if (companyId) {
    companyCache.delete(companyId);
  } else {
    companyCache.clear();
  }
  logger.info('[KillSwitch] Cache cleared', { companyId: companyId || 'all' });
}

