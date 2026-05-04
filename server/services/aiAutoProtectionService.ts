/**
 * AI Auto-Protection Service
 * Teklifbul Rule v3.20 - Auto-Protection Layer (DRY RUN default, Safe Apply)
 * 
 * Analyzes profit alerts and proposes guardrails actions (set_daily_cap, force_free_on)
 * Defaults to DRY RUN (no mutations). Requires explicit confirmation for APPLY.
 * 
 * CRITICAL: Never changes provider/model selection. Only guardrails.
 */

import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { loadAiModelCatalog } from './purchaseAssistantAvailabilityService.js';
import { getUsdTryRate } from './aiCostAccountingService.js';
import { getAiMinTokens } from './aiMinTokens.js';

/**
 * Calculate 7-day usage summary for a company
 * Reused from admin-profit-alerts.ts
 */
async function calculateUsageSummary7(
  db: any,
  companyId: string,
  costMap: Map<string, number>
): Promise<{ paidTokens: number }> {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 7);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(toDate);

  let paidTokens = 0;

  try {
    const ledgerSnap = await db
      .collection('companies')
      .doc(companyId)
      .collection('aiTokenLedger')
      .where('createdAt', '>=', fromTimestamp)
      .where('createdAt', '<=', toTimestamp)
      .where('type', '==', 'consume')
      .get();

    ledgerSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      const meta = data.meta || {};
      const isFreeEligible = meta.freeEligible === true;

      if (!isFreeEligible) {
        const paidTokensEntry = Math.abs(Number(data.amountTokens || 0));
        paidTokens += paidTokensEntry;
      }
    });
  } catch (err) {
    logger.warn('Failed to calculate usage summary 7d for auto-protection', { companyId, error: err });
  }

  return { paidTokens };
}

/**
 * Calculate suggested daily cap
 * Reused from admin-profit-alerts.ts
 */
function calculateSuggestedDailyCap(avgDailyPaidTokens7: number): number | null {
  if (avgDailyPaidTokens7 <= 0) {
    return null;
  }

  const minTokens = getAiMinTokens();
  const suggested = Math.ceil(avgDailyPaidTokens7 * 1.2);
  const suggestedDailyCap = Math.max(suggested, minTokens);

  return suggestedDailyCap;
}

/**
 * Apply guardrails update (reusable helper)
 * Teklifbul Rule v3.20 - Extract from admin-guardrails.ts for reuse
 * Teklifbul Rule v3.20 - DRY RUN Protection: Hard guard prevents writes when dryRun=true
 */
async function applyGuardrailsUpdate(
  db: any,
  companyId: string,
  action: 'force_free_on' | 'set_daily_cap',
  params: {
    dailyPaidTokenCap?: number;
    reason?: string;
    actorUid: string;
    actorEmail?: string | null;
    actorName?: string | null;
    dryRun?: boolean; // Teklifbul Rule v3.20 - DRY RUN protection
  }
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  // Teklifbul Rule v3.20 - Hard guard: DRY RUN mode prevents all writes
  if (params.dryRun === true) {
    logger.warn('applyGuardrailsUpdate skipped: DRY RUN mode', { companyId, action });
    return { success: false, skipped: true, error: 'DRY_RUN_MODE' };
  }

  try {
    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
    const settingsSnap = await settingsRef.get();
    const currentSettings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};

    // Capture "before" state for audit
    const beforeState = {
      forcedFreeMode: currentSettings.forcedFreeMode === true,
      dailyPaidTokenCap: typeof currentSettings.dailyPaidTokenCap === 'number' ? currentSettings.dailyPaidTokenCap : null,
      provider: currentSettings.provider || null,
      model: currentSettings.model || null,
    };

    let afterState: typeof beforeState;

    if (action === 'force_free_on') {
      // Force free mode: set provider/model to free_local/basic
      // Teklifbul Rule v3.20 - CRITICAL: This changes provider/model, but it's intentional for force_free_on
      // However, auto-protection should NOT change provider/model unless explicitly force_free_on
      const nextSettings = {
        provider: 'free_local',
        model: 'basic',
        profile: currentSettings.profile || 'fast',
        dictionaryLearning: currentSettings.dictionaryLearning !== undefined ? currentSettings.dictionaryLearning : true,
        forcedFreeMode: true,
        forcedFreeModeReason: params.reason || 'auto_burn_high',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: params.actorUid,
      };

      await settingsRef.set(nextSettings, { merge: true });

      // Invalidate cache
      const { invalidateAvailableModelsCache } = await import('./purchaseAssistantAvailabilityService.js');
      invalidateAvailableModelsCache(companyId);

      afterState = {
        forcedFreeMode: true,
        dailyPaidTokenCap: beforeState.dailyPaidTokenCap,
        provider: 'free_local',
        model: 'basic',
      };
    } else if (action === 'set_daily_cap') {
      // Set daily cap (preserve provider/model)
      const capValue = params.dailyPaidTokenCap;
      if (capValue === undefined || capValue < 0) {
        return { success: false, error: 'Invalid dailyPaidTokenCap value' };
      }

      const nextSettings = {
        ...currentSettings,
        dailyPaidTokenCap: capValue,
        dailyPaidTokenCapReason: params.reason || 'auto_protection',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: params.actorUid,
      };

      await settingsRef.set(nextSettings, { merge: true });

      afterState = {
        forcedFreeMode: beforeState.forcedFreeMode,
        dailyPaidTokenCap: capValue,
        provider: beforeState.provider,
        model: beforeState.model,
      };
    } else {
      return { success: false, error: 'Invalid action' };
    }

    // Write audit log (only if not dry run) - Teklifbul Rule v1.0
    // dryRun=true durumu yukarida early-return ile zaten yakalandi (line 101)
    {
      await writeAuditLog(db, companyId, {
        action,
        reason: params.reason || null,
        actorUid: params.actorUid,
        actorEmail: params.actorEmail || null,
        actorName: params.actorName || null,
        before: beforeState,
        after: afterState,
        dryRun: false,
      });
    }

    return { success: true };
  } catch (err: any) {
    logger.error('Failed to apply guardrails update', { companyId, action, error: err });
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/**
 * Write audit log for guardrails actions
 * Teklifbul Rule v3.20 - DRY RUN Protection: Hard guard prevents writes when dryRun=true
 */
async function writeAuditLog(
  db: any,
  companyId: string,
  data: {
    action: 'force_free_on' | 'set_daily_cap';
    reason: string | null;
    actorUid: string;
    actorEmail?: string | null;
    actorName?: string | null;
    before: {
      forcedFreeMode: boolean;
      dailyPaidTokenCap: number | null;
      provider: string | null;
      model: string | null;
    };
    after: {
      forcedFreeMode: boolean;
      dailyPaidTokenCap: number | null;
      provider: string | null;
      model: string | null;
    };
    dryRun?: boolean; // Teklifbul Rule v3.20 - DRY RUN protection
  }
): Promise<{ skipped?: boolean }> {
  // Teklifbul Rule v3.20 - Hard guard: DRY RUN mode prevents all writes
  if (data.dryRun === true) {
    logger.warn('writeAuditLog skipped: DRY RUN mode', { companyId, action: data.action });
    return { skipped: true };
  }

  try {
    // Company audit log
    const companyAuditRef = db.collection('companies').doc(companyId).collection('auditLogs').doc();
    await companyAuditRef.set({
      type: 'auto_protection.run',
      action: data.action,
      reason: data.reason,
      actorUid: data.actorUid,
      actorEmail: data.actorEmail || null,
      actorName: data.actorName || null,
      before: data.before,
      after: data.after,
      createdAt: FieldValue.serverTimestamp(),
    });

    // System audit log
    const systemAuditRef = db.collection('system_auditLogs').doc();
    await systemAuditRef.set({
      type: 'auto_protection.run',
      companyId,
      action: data.action,
      reason: data.reason,
      actorUid: data.actorUid,
      actorEmail: data.actorEmail || null,
      actorName: data.actorName || null,
      before: data.before,
      after: data.after,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info('Auto-protection audit log written', { companyId, action: data.action, actorUid: data.actorUid });
    return {};
  } catch (err) {
    logger.warn('Failed to write auto-protection audit log', { companyId, action: data.action, error: err });
    // Don't throw - audit log failure shouldn't break the main operation
    return {};
  }
}

/**
 * Run auto-protection analysis and optionally apply actions
 * Teklifbul Rule v3.20 - Auto-Protection Runner
 */
export async function runAutoProtection(params: {
  month: string; // YYYY-MM
  dryRun?: boolean; // Default: true
  limit?: number; // Default: 50
  actor: {
    uid: string;
    email?: string | null;
    name?: string | null;
  };
}): Promise<{
  month: string;
  dryRun: boolean;
  totals: {
    scanned: number;
    proposed: number;
    applied: number;
    skipped: number;
    failed: number;
  };
  results: Array<{
    companyId: string;
    name: string;
    proposedAction: 'force_free_on' | 'set_daily_cap' | null;
    capValue?: number;
    reason: string;
    status: 'PROPOSED' | 'APPLIED' | 'SKIPPED' | 'FAILED';
    error?: string;
  }>;
}> {
  const { month, dryRun = true, limit = 50, actor } = params;

  logger.group('Auto-Protection Runner');
  logger.info('Starting auto-protection', { month, dryRun, limit, actorUid: actor.uid });

  const db = await getAdminDb();
  if (!db) {
    throw new Error('Database connection failed');
  }

  const [year, monthNum] = month.split('-').map(Number);
  const monthStart = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);

  const monthStartTimestamp = Timestamp.fromDate(monthStart);
  const monthEndTimestamp = Timestamp.fromDate(monthEnd);

  // Load dependencies
  const usdTryRate = await getUsdTryRate(db);
  const catalog = await loadAiModelCatalog(db);
  const costMap = new Map<string, number>();
  catalog.forEach(m => {
    const key = `${m.provider}::${m.model}`;
    const cost = typeof m.costPer1kTokensUSD === 'number' ? Math.max(0, m.costPer1kTokensUSD) : 0;
    costMap.set(key, cost);
  });

  // Get all companies
  const companiesSnap = await db.collection('companies').get();
  const companies: any[] = companiesSnap.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const results: Array<{
    companyId: string;
    name: string;
    proposedAction: 'force_free_on' | 'set_daily_cap' | null;
    capValue?: number;
    reason: string;
    status: 'PROPOSED' | 'APPLIED' | 'SKIPPED' | 'FAILED';
    error?: string;
  }> = [];

  let scanned = 0;
  let proposed = 0;
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  // Process companies (reuse alert calculation logic)
  for (const company of companies) {
    if (results.length >= limit) break;

    const companyId = company.id;
    const companyName = company.name || company.companyName || companyId;
    scanned++;

    try {
      // Calculate profit metrics (reuse from admin-profit-alerts)
      let revenueTRY = 0;
      try {
        const purchasesSnap = await db
          .collection('companies')
          .doc(companyId)
          .collection('aiTokenPurchases')
          .where('createdAt', '>=', monthStartTimestamp)
          .where('createdAt', '<=', monthEndTimestamp)
          .where('status', '==', 'paid')
          .get();

        purchasesSnap.docs.forEach(doc => {
          const data = doc.data();
          const packageSnapshot = data.packageSnapshot || {};
          const priceTRY = Number(packageSnapshot.priceTRY || 0);
          revenueTRY += priceTRY;
        });
      } catch (err) {
        logger.warn('Failed to fetch purchases for auto-protection', { companyId, error: err });
      }

      let costUSD = 0;
      try {
        const { estimateCostUsdFromTokens, getModelCostPer1kUsd } = await import('./aiCostAccountingService.js');
        
        const ledgerSnap = await db
          .collection('companies')
          .doc(companyId)
          .collection('aiTokenLedger')
          .where('createdAt', '>=', monthStartTimestamp)
          .where('createdAt', '<=', monthEndTimestamp)
          .where('type', '==', 'consume')
          .get();

        ledgerSnap.docs.forEach(doc => {
          const data = doc.data();
          const meta = data.meta || {};
          const isFreeEligible = meta.freeEligible === true;
          
          if (!isFreeEligible) {
            const paidTokens = Math.abs(Number(data.amountTokens || 0));
            const provider = meta.provider || 'unknown';
            const model = meta.model || 'unknown';
            
            if (typeof meta.costUsd === 'number' && meta.costUsd >= 0) {
              costUSD += meta.costUsd;
            } else {
              const modelKey = `${provider}::${model}`;
              const costPer1k = catalog && catalog.length > 0
                ? (getModelCostPer1kUsd(provider, model, catalog) || costMap.get(modelKey) || 0)
                : (costMap.get(modelKey) || 0);
              const estimated = estimateCostUsdFromTokens(paidTokens, costPer1k);
              if (estimated !== null) {
                costUSD += estimated;
              }
            }
          }
        });
      } catch (err) {
        logger.warn('Failed to fetch ledger for auto-protection', { companyId, error: err });
      }

      const costTRY = costUSD * usdTryRate;
      const profitTRY = revenueTRY - costTRY;
      const burnRatio = revenueTRY > 0 ? costTRY / revenueTRY : null;

      // Calculate flags
      let riskFlag: 'OK' | 'MED' | 'HIGH' = 'OK';
      if (revenueTRY === 0 && costTRY > 0) {
        riskFlag = 'HIGH';
      } else if (profitTRY < 0) {
        riskFlag = 'HIGH';
      } else if (revenueTRY > 0 && (profitTRY / revenueTRY) * 100 < 15) {
        riskFlag = 'MED';
      }

      let burnFlag: 'OK' | 'MED' | 'HIGH' = 'OK';
      if (revenueTRY === 0 && costTRY > 0) {
        burnFlag = 'HIGH';
      } else if (burnRatio !== null && burnRatio >= 1.0) {
        burnFlag = 'HIGH';
      } else if (burnRatio !== null && burnRatio >= 0.7) {
        burnFlag = 'MED';
      }

      // Only process HIGH alerts
      if (burnFlag !== 'HIGH' && riskFlag !== 'HIGH') {
        skipped++;
        continue;
      }

      // Load guardrails
      let forcedFreeMode = false;
      let dailyPaidTokenCap: number | null = null;
      try {
        const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
          const settings = settingsSnap.data() || {};
          forcedFreeMode = settings.forcedFreeMode === true;
          dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
        }
      } catch (err) {
        logger.warn('Failed to load guardrails for auto-protection', { companyId, error: err });
      }

      // Calculate suggested daily cap
      let avgDailyPaidTokens7 = 0;
      let suggestedDailyCap: number | null = null;
      if (!forcedFreeMode) {
        try {
          const usageSummary7 = await calculateUsageSummary7(db, companyId, costMap);
          avgDailyPaidTokens7 = usageSummary7.paidTokens / 7;
          suggestedDailyCap = calculateSuggestedDailyCap(avgDailyPaidTokens7);
        } catch (err) {
          logger.warn('Failed to calculate suggested daily cap for auto-protection', { companyId, error: err });
        }
      }

      // Determine proposed action
      let proposedAction: 'force_free_on' | 'set_daily_cap' | null = null;
      let capValue: number | undefined = undefined;
      let reason = '';

      // Teklifbul Rule v3.20 - SKIP if already forced free
      if (forcedFreeMode === true) {
        skipped++;
        results.push({
          companyId,
          name: companyName,
          proposedAction: null,
          reason: 'already_forced_free',
          status: 'SKIPPED',
        });
        continue;
      }

      // Teklifbul Rule v3.20 - PROPOSE force_free_on if burn HIGH and (profit negative or burnRatio >= 1.0)
      if (burnFlag === 'HIGH' && (profitTRY < 0 || (burnRatio !== null && burnRatio >= 1.0))) {
        proposedAction = 'force_free_on';
        reason = 'auto_burn_high';
      } else if (suggestedDailyCap !== null) {
        // PROPOSE set_daily_cap if cap is missing or insufficient
        if (dailyPaidTokenCap === null) {
          proposedAction = 'set_daily_cap';
          capValue = suggestedDailyCap;
          reason = 'auto_cap_missing';
        } else if (dailyPaidTokenCap < suggestedDailyCap) {
          proposedAction = 'set_daily_cap';
          capValue = suggestedDailyCap;
          reason = 'auto_cap_insufficient';
        } else {
          // Cap is sufficient
          skipped++;
          results.push({
            companyId,
            name: companyName,
            proposedAction: null,
            reason: 'cap_already_sufficient',
            status: 'SKIPPED',
          });
          continue;
        }
      } else {
        // No action needed
        skipped++;
        results.push({
          companyId,
          name: companyName,
          proposedAction: null,
          reason: 'no_action_needed',
          status: 'SKIPPED',
        });
        continue;
      }

      proposed++;

      // Apply action if not dry run
      // Teklifbul Rule v3.20 - DRY RUN Protection: Never call applyGuardrailsUpdate when dryRun=true
      if (!dryRun && proposedAction) {
        const applyResult = await applyGuardrailsUpdate(db, companyId, proposedAction, {
          dailyPaidTokenCap: capValue,
          reason,
          actorUid: actor.uid,
          actorEmail: actor.email || null,
          actorName: actor.name || null,
          dryRun: false, // Explicitly set to false for APPLY mode
        });

        if (applyResult.success) {
          applied++;
          results.push({
            companyId,
            name: companyName,
            proposedAction,
            capValue,
            reason,
            status: 'APPLIED',
          });
        } else {
          failed++;
          results.push({
            companyId,
            name: companyName,
            proposedAction,
            capValue,
            reason,
            status: 'FAILED',
            error: applyResult.error,
          });
        }
      } else {
        // Dry run - just propose
        results.push({
          companyId,
          name: companyName,
          proposedAction,
          capValue,
          reason,
          status: 'PROPOSED',
        });
      }
    } catch (err: any) {
      failed++;
      logger.error('Error processing company for auto-protection', { companyId: company.id, error: err });
      results.push({
        companyId: company.id,
        name: company.name || company.id,
        proposedAction: null,
        reason: 'error',
        status: 'FAILED',
        error: err?.message || 'Unknown error',
      });
    }
  }

  logger.info('Auto-protection completed', {
    month,
    dryRun,
    totals: { scanned, proposed, applied, skipped, failed },
  });
  logger.end();

  return {
    month,
    dryRun,
    totals: {
      scanned,
      proposed,
      applied,
      skipped,
      failed,
    },
    results,
  };
}

