/**
 * Admin Company Profit Detail Route
 * Teklifbul Rule v2.5 - Admin Profit Drill-down (Company Detail)
 * 
 * GET /api/admin/company-profit-detail?companyId=...&month=YYYY-MM
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { Timestamp } from 'firebase-admin/firestore';
import { loadAiModelCatalog } from '../services/purchaseAssistantAvailabilityService.js';

const router = Router();

router.use(verifyToken, requireAdmin);

/**
 * Get USD/TRY exchange rate from system settings
 */
async function getUsdTryRate(db: any): Promise<number> {
  try {
    const settingsDoc = await db.collection('system_settings').doc('finance').get();
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      const rate = Number(data?.usdTryRate);
      if (rate > 0) {
        return rate;
      }
    }
  } catch (err) {
    logger.warn('Failed to load USD/TRY rate from system_settings', err);
  }
  return 30; // Default fallback
}

/**
 * Calculate cost for a ledger entry
 */
function calculateCostUSD(tokens: number, costPer1k: number): number {
  return (tokens / 1000) * costPer1k;
}

/**
 * Calculate usage summary for a company (reuse usage-report logic)
 */
async function calculateUsageSummary(
  db: any,
  companyId: string,
  days: number,
  costMap: Map<string, number>,
  catalog?: any[],
  usdTryRate?: number
): Promise<{
  paidTokens: number;
  freeTokens: number;
  costUSD: number;
  costTRY: number;
  costSource: 'ledger' | 'estimated' | 'mixed';
  unknownCostTokens: number;
  byModel: Array<{ provider: string; model: string; paidConsumed: number; freeUsedTotalTokens: number; requests: number; costUSD: number; costSource?: 'ledger' | 'estimated'; unknownCostTokens?: number }>;
  byRoute: Array<{ route: string; paidConsumed: number; freeUsedTotalTokens: number; requests: number; costUSD: number; costSource?: 'ledger' | 'estimated'; unknownCostTokens?: number }>;
}> {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(toDate);

  const ledgerSnap = await db
    .collection('companies')
    .doc(companyId)
    .collection('aiTokenLedger')
    .where('createdAt', '>=', fromTimestamp)
    .where('createdAt', '<=', toTimestamp)
    .orderBy('createdAt', 'asc')
    .get();

  const ledgerEntries = ledgerSnap.docs.map((doc: any) => {
    const data: any = doc.data();
    return {
      id: doc.id,
      type: data.type || 'unknown',
      amountTokens: Number(data.amountTokens || 0),
      meta: data.meta || {},
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAtMs ? new Date(data.createdAtMs) : new Date()),
    };
  });

  // Teklifbul Rule v3.18 - Use cost accounting service
  const { summarizeCostsFromLedgerEntries, estimateCostUsdFromTokens, getModelCostPer1kUsd } = await import('../services/aiCostAccountingService.js');
  
  let paidTokens = 0;
  let freeTokens = 0;
  let totalCostUSD = 0;
  let costFromLedger = 0;
  let costEstimated = 0;
  let unknownCostTokens = 0;
  let ledgerCostCount = 0;
  let estimatedCostCount = 0;
  
  const byModelMap = new Map<string, { provider: string; model: string; paidConsumed: number; freeUsedTotalTokens: number; requests: number; costUSD: number; costFromLedger: number; costEstimated: number; unknownCostTokens: number }>();
  const byRouteMap = new Map<string, { route: string; paidConsumed: number; freeUsedTotalTokens: number; requests: number; costUSD: number; costFromLedger: number; costEstimated: number; unknownCostTokens: number }>();

  for (const entry of ledgerEntries) {
    const meta = entry.meta || {};
    const provider = meta.provider || 'unknown';
    const model = meta.model || 'unknown';
    const route = meta.route || 'unknown';
    const modelKey = `${provider}::${model}`;

    if (entry.type === 'consume') {
      const isFreeEligible = meta.freeEligible === true;

      if (isFreeEligible) {
        const freeTokensCount = Number(meta.totalTokens || 0);
        freeTokens += freeTokensCount;

        if (!byModelMap.has(modelKey)) {
          byModelMap.set(modelKey, { provider, model, paidConsumed: 0, freeUsedTotalTokens: 0, requests: 0, costUSD: 0, costFromLedger: 0, costEstimated: 0, unknownCostTokens: 0 });
        }
        const byModel = byModelMap.get(modelKey)!;
        byModel.freeUsedTotalTokens += freeTokensCount;
        byModel.requests += 1;

        if (!byRouteMap.has(route)) {
          byRouteMap.set(route, { route, paidConsumed: 0, freeUsedTotalTokens: 0, requests: 0, costUSD: 0, costFromLedger: 0, costEstimated: 0, unknownCostTokens: 0 });
        }
        const byRoute = byRouteMap.get(route)!;
        byRoute.freeUsedTotalTokens += freeTokensCount;
        byRoute.requests += 1;
      } else {
        const paidTokensCount = Math.abs(entry.amountTokens);
        paidTokens += paidTokensCount;
        
        // Teklifbul Rule v3.18 - Prefer ledger cost meta, fallback to catalog computation
        let entryCost = 0;
        let costSource: 'ledger' | 'estimated' = 'estimated';
        
        if (typeof meta.costUsd === 'number' && meta.costUsd >= 0) {
          // Use ledger cost
          entryCost = meta.costUsd;
          costFromLedger += entryCost;
          ledgerCostCount++;
          costSource = 'ledger';
        } else {
          // Estimate from catalog
          const costPer1k = catalog && catalog.length > 0
            ? (getModelCostPer1kUsd(provider, model, catalog) || costMap.get(modelKey) || 0)
            : (costMap.get(modelKey) || 0);
          
          const estimated = estimateCostUsdFromTokens(paidTokensCount, costPer1k);
          if (estimated !== null) {
            entryCost = estimated;
            costEstimated += entryCost;
            estimatedCostCount++;
          } else {
            // Cost unknown
            unknownCostTokens += paidTokensCount;
          }
        }
        
        totalCostUSD += entryCost;

        if (!byModelMap.has(modelKey)) {
          byModelMap.set(modelKey, { provider, model, paidConsumed: 0, freeUsedTotalTokens: 0, requests: 0, costUSD: 0, costFromLedger: 0, costEstimated: 0, unknownCostTokens: 0 });
        }
        const byModel = byModelMap.get(modelKey)!;
        byModel.paidConsumed += paidTokensCount;
        byModel.requests += 1;
        byModel.costUSD += entryCost;
        if (costSource === 'ledger') {
          byModel.costFromLedger += entryCost;
        } else {
          byModel.costEstimated += entryCost;
        }
        if (entryCost === 0 && paidTokensCount > 0) {
          byModel.unknownCostTokens += paidTokensCount;
        }

        if (!byRouteMap.has(route)) {
          byRouteMap.set(route, { route, paidConsumed: 0, freeUsedTotalTokens: 0, requests: 0, costUSD: 0, costFromLedger: 0, costEstimated: 0, unknownCostTokens: 0 });
        }
        const byRoute = byRouteMap.get(route)!;
        byRoute.paidConsumed += paidTokensCount;
        byRoute.requests += 1;
        byRoute.costUSD += entryCost;
        if (costSource === 'ledger') {
          byRoute.costFromLedger += entryCost;
        } else {
          byRoute.costEstimated += entryCost;
        }
        if (entryCost === 0 && paidTokensCount > 0) {
          byRoute.unknownCostTokens += paidTokensCount;
        }
      }
    }
  }
  
  // Determine cost source
  let costSource: 'ledger' | 'estimated' | 'mixed' = 'estimated';
  if (ledgerCostCount > 0 && estimatedCostCount === 0) {
    costSource = 'ledger';
  } else if (ledgerCostCount > 0 && estimatedCostCount > 0) {
    costSource = 'mixed';
  }

  const byModel = Array.from(byModelMap.values()).map(m => ({
    provider: m.provider,
    model: m.model,
    paidConsumed: m.paidConsumed,
    freeUsedTotalTokens: m.freeUsedTotalTokens,
    requests: m.requests,
    costUSD: Number(m.costUSD.toFixed(2)),
    costSource: (m.costFromLedger > 0 && m.costEstimated === 0) ? 'ledger' as const :
                (m.costFromLedger > 0 && m.costEstimated > 0) ? 'ledger' as const : // Mixed, but prefer ledger
                'estimated' as const,
    unknownCostTokens: m.unknownCostTokens > 0 ? m.unknownCostTokens : undefined,
  })).sort((a, b) => b.paidConsumed + b.freeUsedTotalTokens - (a.paidConsumed + a.freeUsedTotalTokens));
  
  const byRoute = Array.from(byRouteMap.values()).map(r => ({
    route: r.route,
    paidConsumed: r.paidConsumed,
    freeUsedTotalTokens: r.freeUsedTotalTokens,
    requests: r.requests,
    costUSD: Number(r.costUSD.toFixed(2)),
    costSource: (r.costFromLedger > 0 && r.costEstimated === 0) ? 'ledger' as const :
                (r.costFromLedger > 0 && r.costEstimated > 0) ? 'ledger' as const : // Mixed, but prefer ledger
                'estimated' as const,
    unknownCostTokens: r.unknownCostTokens > 0 ? r.unknownCostTokens : undefined,
  })).sort((a, b) => b.paidConsumed + b.freeUsedTotalTokens - (a.paidConsumed + a.freeUsedTotalTokens));

  return {
    paidTokens,
    freeTokens,
    costUSD: Number(totalCostUSD.toFixed(2)),
    costTRY: 0, // Will be calculated with rate
    costSource,
    unknownCostTokens,
    byModel,
    byRoute,
  };
}

/**
 * GET /api/admin/company-profit-detail?companyId=...&month=YYYY-MM
 */
router.get('/company-profit-detail', async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Admin Company Profit Detail API');

    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    const companyId = req.query.companyId as string | undefined;
    if (!companyId) {
      logger.warn('Company ID missing');
      logger.end();
      return res.status(400).json({
        error: 'company_id_required',
        message: 'companyId parametresi gereklidir.'
      });
    }

    const monthParam = req.query.month as string | undefined;
    if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
      logger.warn('Invalid month parameter', { monthParam });
      logger.end();
      return res.status(400).json({
        error: 'invalid_month',
        message: 'month parametresi YYYY-MM formatında olmalıdır (örn: 2024-01).'
      });
    }

    const [year, month] = monthParam.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    logger.info('Company profit detail requested', { companyId, month: monthParam });

    // Get company info
    const companyDoc = await db.collection('companies').doc(companyId).get();
    if (!companyDoc.exists) {
      logger.warn('Company not found', { companyId });
      logger.end();
      return res.status(404).json({
        error: 'company_not_found',
        message: 'Şirket bulunamadı.'
      });
    }

    const companyData = companyDoc.data() || {};
    const companyName = companyData.name || companyData.companyName || companyId;

    // Teklifbul Rule v3.18 - Use cost accounting service
    const { getUsdTryRate, checkFxDriftWarning } = await import('../services/aiCostAccountingService.js');
    const usdTryRate = await getUsdTryRate(db);

    // Load cost map from catalog (for backward compatibility with old entries)
    const catalog = await loadAiModelCatalog(db);
    const costMap = new Map<string, number>();
    catalog.forEach(m => {
      const key = `${m.provider}::${m.model}`;
      const cost = typeof m.costPer1kTokensUSD === 'number' ? Math.max(0, m.costPer1kTokensUSD) : 0;
      costMap.set(key, cost);
    });
    
    // Check FX drift warning
    const fxDriftWarning = await checkFxDriftWarning(db, monthParam);

    const monthStartTimestamp = Timestamp.fromDate(monthStart);
    const monthEndTimestamp = Timestamp.fromDate(monthEnd);

    // A) Revenue: aiTokenPurchases
    let revenueTRY = 0;
    const purchases: any[] = [];
    try {
      const purchasesSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('aiTokenPurchases')
        .where('createdAt', '>=', monthStartTimestamp)
        .where('createdAt', '<=', monthEndTimestamp)
        .where('status', '==', 'paid')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      purchasesSnap.docs.forEach(doc => {
        const data = doc.data();
        const packageSnapshot = data.packageSnapshot || {};
        const priceTRY = Number(packageSnapshot.priceTRY || 0);
        revenueTRY += priceTRY;

        purchases.push({
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAtMs ? new Date(data.createdAtMs).toISOString() : new Date().toISOString()),
          packageId: data.packageId || '',
          packageName: packageSnapshot.name || packageSnapshot.id || '',
          tokens: Number(packageSnapshot.tokens || 0),
          priceTRY: priceTRY,
        });
      });
    } catch (err) {
      logger.warn('Failed to fetch purchases', { companyId, error: err });
    }

    // B) AI Cost: aiTokenLedger (consume entries)
    // Teklifbul Rule v3.18 - Use ledger cost meta with fallback
    let costUSD = 0;
    let costUSDFromLedger = 0;
    let costUSDEstimated = 0;
    let unknownCostTokensMonth = 0;
    try {
      const ledgerSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('aiTokenLedger')
        .where('createdAt', '>=', monthStartTimestamp)
        .where('createdAt', '<=', monthEndTimestamp)
        .where('type', '==', 'consume')
        .get();

      const { estimateCostUsdFromTokens, getModelCostPer1kUsd } = await import('../services/aiCostAccountingService.js');
      
      ledgerSnap.docs.forEach(doc => {
        const data = doc.data();
        const meta = data.meta || {};
        const isFreeEligible = meta.freeEligible === true;

        if (!isFreeEligible) {
          const paidTokens = Math.abs(Number(data.amountTokens || 0));
          const provider = meta.provider || 'unknown';
          const model = meta.model || 'unknown';
          
          // Prefer ledger cost meta
          if (typeof meta.costUsd === 'number' && meta.costUsd >= 0) {
            costUSD += meta.costUsd;
            costUSDFromLedger += meta.costUsd;
          } else {
            // Fallback to catalog computation
            const modelKey = `${provider}::${model}`;
            const costPer1k = catalog && catalog.length > 0
              ? (getModelCostPer1kUsd(provider, model, catalog) || costMap.get(modelKey) || 0)
              : (costMap.get(modelKey) || 0);
            const estimated = estimateCostUsdFromTokens(paidTokens, costPer1k);
            if (estimated !== null) {
              costUSD += estimated;
              costUSDEstimated += estimated;
            } else {
              unknownCostTokensMonth += paidTokens;
            }
          }
        }
      });
    } catch (err) {
      logger.warn('Failed to fetch ledger', { companyId, error: err });
    }

    const costTRY = costUSD * usdTryRate;
    const costSourceMonth = costUSDFromLedger > 0 && costUSDEstimated === 0 ? 'ledger' :
                           costUSDFromLedger > 0 && costUSDEstimated > 0 ? 'mixed' : 'estimated';
    const profitTRY = revenueTRY - costTRY;
    const burnRatio = revenueTRY > 0 ? costTRY / revenueTRY : null;
    const marginPct = revenueTRY > 0 ? (profitTRY / revenueTRY) * 100 : null;

    // C) Usage summaries (7 and 30 days)
    // Teklifbul Rule v3.18 - Pass catalog and rate for cost computation
    const usageSummary7 = await calculateUsageSummary(db, companyId, 7, costMap, catalog, usdTryRate);
    usageSummary7.costTRY = usageSummary7.costUSD * usdTryRate;

    const usageSummary30 = await calculateUsageSummary(db, companyId, 30, costMap, catalog, usdTryRate);
    usageSummary30.costTRY = usageSummary30.costUSD * usdTryRate;

    // Teklifbul Rule v2.9 - Load guardrails from settings
    let forcedFreeMode = false;
    let forcedFreeModeReason: string | null = null;
    let dailyPaidTokenCap: number | null = null;
    let dailyPaidTokenCapReason: string | null = null;
    try {
      const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
      const settingsSnap = await settingsRef.get();
      if (settingsSnap.exists) {
        const settings = settingsSnap.data() || {};
        forcedFreeMode = settings.forcedFreeMode === true;
        forcedFreeModeReason = settings.forcedFreeModeReason || null;
        dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
        dailyPaidTokenCapReason = settings.dailyPaidTokenCapReason || null;
      }
    } catch (err) {
      logger.warn('Failed to load guardrails for detail', { companyId, error: err });
    }

    // Teklifbul Rule v3.1 - Get today's paid token usage
    const { getTodayPaidUsedTokens } = await import('../services/aiDailyCounterService.js');
    const todayPaidUsage = await getTodayPaidUsedTokens(companyId);

    const response = {
      company: {
        companyId,
        name: companyName,
      },
      month: monthParam,
      revenueTRY: Number(revenueTRY.toFixed(2)),
      costUSD: Number(costUSD.toFixed(2)),
      costTRY: Number(costTRY.toFixed(2)),
      profitTRY: Number(profitTRY.toFixed(2)),
      burnRatio: burnRatio !== null ? Number(burnRatio.toFixed(4)) : null,
      marginPct: marginPct !== null ? Number(marginPct.toFixed(2)) : null,
      purchases,
      usageSummary7: {
        paidTokens: usageSummary7.paidTokens,
        freeTokens: usageSummary7.freeTokens,
        costUSD: usageSummary7.costUSD,
        costTRY: Number(usageSummary7.costTRY.toFixed(2)),
        costSource: usageSummary7.costSource, // Teklifbul Rule v3.18
        unknownCostTokens: usageSummary7.unknownCostTokens, // Teklifbul Rule v3.18
      },
      usageSummary30: {
        paidTokens: usageSummary30.paidTokens,
        freeTokens: usageSummary30.freeTokens,
        costUSD: usageSummary30.costUSD,
        costTRY: Number(usageSummary30.costTRY.toFixed(2)),
        costSource: usageSummary30.costSource, // Teklifbul Rule v3.18
        unknownCostTokens: usageSummary30.unknownCostTokens, // Teklifbul Rule v3.18
      },
      byModel7: usageSummary7.byModel.map(m => ({
        provider: m.provider,
        model: m.model,
        paidConsumed: m.paidConsumed,
        freeUsedTotalTokens: m.freeUsedTotalTokens,
        requests: m.requests,
        costUSD: Number(m.costUSD.toFixed(2)),
      })),
      byRoute7: usageSummary7.byRoute.map(r => ({
        route: r.route,
        paidConsumed: r.paidConsumed,
        freeUsedTotalTokens: r.freeUsedTotalTokens,
        requests: r.requests,
        costUSD: Number(r.costUSD.toFixed(2)),
      })),
      // Teklifbul Rule v2.9 - Guardrails visibility
      forcedFreeMode,
      forcedFreeModeReason,
      dailyPaidTokenCap,
      dailyPaidTokenCapReason,
      // Teklifbul Rule v3.1 - Today paid usage
      todayPaidUsage,
      meta: {
        usdTryRate,
        generatedAtISO: new Date().toISOString(),
        costSource: costSourceMonth, // Teklifbul Rule v3.18
        unknownCostTokens: unknownCostTokensMonth, // Teklifbul Rule v3.18
        fxDriftWarning: fxDriftWarning || undefined, // Teklifbul Rule v3.18
      },
    };

    logger.info('Company profit detail generated', {
      companyId,
      month: monthParam,
      revenueTRY,
      costTRY,
      profitTRY,
    });
    logger.end();

    return res.json(response);
  } catch (error: any) {
    logger.error('Error in company profit detail endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

