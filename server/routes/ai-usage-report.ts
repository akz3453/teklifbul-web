/**
 * AI Usage Report Routes
 * Teklifbul Rule v1.5 - Token & AI Usage Dashboard (Company)
 * 
 * GET /api/ai/usage-report?days=7|14|30
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { hasPermission } from '../src/services/permissionService.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getCompanyAiWallet } from '../services/companyAiWalletService.js';
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { Timestamp } from 'firebase-admin/firestore';
import { getAiMinTokens } from '../services/aiMinTokens.js';
import { loadAiModelCatalog } from '../services/purchaseAssistantAvailabilityService.js';

const router = Router();

/**
 * GET /api/ai/usage-report
 * Returns AI usage and token consumption report for company
 */
// Teklifbul Rule v1.0 - Usage report endpoint: reports.view yetkisi yoksa boş data döndür
router.get('/usage-report', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('AI Usage Report API');
    
    const userId = req.user?.uid;
    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
    }

    // Get company ID (async version with validation)
    let companyId = await getCompanyIdFromRequest(req);
    if (!companyId) {
      const db = await getAdminDb();
      if (db) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          companyId = userData?.companyId || userData?.activeCompanyId || null;
        }
      }
    }

    if (!companyId) {
      logger.warn('Company ID not found', { userId });
      logger.end();
      return res.status(400).json({
        error: 'company_not_found',
        message: 'Şirket bilgisi bulunamadı.'
      });
    }

    // Validate days parameter
    const daysParam = req.query.days as string | undefined;
    const allowedDays = [7, 14, 30];
    const days = daysParam ? parseInt(daysParam, 10) : 7;
    if (!allowedDays.includes(days)) {
      logger.warn('Invalid days parameter', { daysParam, days });
      logger.end();
      return res.status(400).json({
        error: 'invalid_days',
        message: 'days parametresi 7, 14 veya 30 olmalıdır.'
      });
    }

    // Calculate date range
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(now);
    toDate.setHours(23, 59, 59, 999);

    // Teklifbul Rule v1.0 - Check permission, if not available return empty data
    let hasReportsView = false;
    try {
      hasReportsView = await hasPermission(userId, companyId, 'reports.view', req);
    } catch (permError: any) {
      logger.warn('Usage report: Permission check failed, returning empty data', { 
        userId, 
        companyId, 
        error: permError?.message 
      });
      hasReportsView = false;
    }
    
    if (!hasReportsView) {
      logger.info('Usage report: Permission denied, returning empty data', { userId, companyId });
      logger.end();
      return res.json({
        ok: true,
        permissionDenied: true,
        range: {
          days,
          fromISO: fromDate.toISOString(),
          toISO: toDate.toISOString(),
        },
        wallet: {
          balanceTokens: 0,
        },
        summary: {
          totalConsumedTokensPaid: 0,
          totalConsumedTokensFree: 0,
          totalPurchasedTokens: 0,
          avgDailyPaidConsumption: 0,
          estimatedDaysRemaining: null,
        },
        cost: {
          currency: 'USD',
          totalCostUSD: 0,
          daily: [],
          byModel: [],
          byRoute: [],
          projectedMonthlyCostUSD: 0,
        },
        daily: [],
        byModel: [],
        byRoute: [],
        meta: {
          generatedAtISO: new Date().toISOString(),
          minTokens: 0,
        },
      });
    }

    logger.info('Fetching usage report', { companyId, days, fromDate: fromDate.toISOString(), toDate: toDate.toISOString() });

    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    // Get wallet balance
    const wallet = await getCompanyAiWallet(companyId);
    const balanceTokens = wallet?.balanceTokens || 0;

    // Fetch ledger entries
    const ledgerRef = db
      .collection('companies')
      .doc(companyId)
      .collection('aiTokenLedger');
    
    // TODO: Firestore index: companies/{companyId}/aiTokenLedger: createdAt (ascending)
    // Convert JS Date to Firestore Timestamp
    const fromTimestamp = Timestamp.fromDate(fromDate);
    const toTimestamp = Timestamp.fromDate(toDate);
    
    const ledgerSnap = await ledgerRef
      .where('createdAt', '>=', fromTimestamp)
      .where('createdAt', '<=', toTimestamp)
      .orderBy('createdAt', 'asc')
      .get();

    const ledgerEntries = ledgerSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type || 'unknown',
        amountTokens: Number(data.amountTokens || 0),
        reason: data.reason || '',
        meta: data.meta || {},
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAtMs ? new Date(data.createdAtMs) : new Date()),
        createdBy: data.createdBy || null,
      };
    });

    logger.info('Ledger entries fetched', { count: ledgerEntries.length });

    // Teklifbul Rule v1.9 - Load cost map from catalog
    const catalog = await loadAiModelCatalog(db);
    const costMap = new Map<string, number>(); // key: "provider::model", value: costPer1kTokensUSD
    catalog.forEach(m => {
      const key = `${m.provider}::${m.model}`;
      const cost = typeof m.costPer1kTokensUSD === 'number' ? Math.max(0, m.costPer1kTokensUSD) : 0;
      costMap.set(key, cost);
    });
    logger.info('Cost map loaded', { modelCount: costMap.size });

    // Process data
    let totalConsumedTokensPaid = 0;
    let totalConsumedTokensFree = 0;
    let totalPurchasedTokens = 0;
    let freeEligibleMissingTotalTokensCount = 0; // Teklifbul Rule v1.5.1 - Edge case tracking
    let totalCostUSD = 0; // Teklifbul Rule v1.9 - Total cost
    const dailyMap = new Map<string, { date: string; paidConsumed: number; freeUsedTotalTokens: number; purchases: number; costUSD: number; requests: number }>();
    const byModelMap = new Map<string, { provider: string; model: string; paidConsumed: number; freeUsedTotalTokens: number; requests: number; costUSD: number }>();
    const byRouteMap = new Map<string, { route: string; paidConsumed: number; freeUsedTotalTokens: number; requests: number; costUSD: number }>();

    for (const entry of ledgerEntries) {
      const dateKey = entry.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      const meta = entry.meta || {};
      const provider = meta.provider || 'unknown';
      const model = meta.model || 'unknown';
      const route = meta.route || 'unknown';
      const modelKey = `${provider}::${model}`;

      // Daily aggregation
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { date: dateKey, paidConsumed: 0, freeUsedTotalTokens: 0, purchases: 0, costUSD: 0, requests: 0 });
      }
      const daily = dailyMap.get(dateKey)!;

      // By model aggregation
      if (!byModelMap.has(modelKey)) {
        byModelMap.set(modelKey, { provider, model, paidConsumed: 0, freeUsedTotalTokens: 0, requests: 0, costUSD: 0 });
      }
      const byModel = byModelMap.get(modelKey)!;

      // By route aggregation
      if (!byRouteMap.has(route)) {
        byRouteMap.set(route, { route, paidConsumed: 0, freeUsedTotalTokens: 0, requests: 0, costUSD: 0 });
      }
      const byRoute = byRouteMap.get(route)!;

      // Teklifbul Rule v1.9 - Calculate cost
      const costPer1k = costMap.get(modelKey) || 0;

      if (entry.type === 'consume') {
        const isFreeEligible = meta.freeEligible === true;
        
        if (isFreeEligible) {
          // Teklifbul Rule v1.5.1 - Free eligible: amountTokens=0, but meta.totalTokens has actual usage
          // Edge case: totalTokens yoksa safe fallback
          const freeTokens = Number(meta.totalTokens || 0);
          if (!meta.totalTokens && meta.totalTokens !== 0) {
            freeEligibleMissingTotalTokensCount++;
          }
          totalConsumedTokensFree += freeTokens;
          daily.freeUsedTotalTokens += freeTokens;
          byModel.freeUsedTotalTokens += freeTokens;
          byRoute.freeUsedTotalTokens += freeTokens;
        } else {
          // Teklifbul Rule v1.5.1 - Paid consume: amountTokens is negative, abs ile pozitif göster
          const paidTokens = Math.abs(entry.amountTokens);
          totalConsumedTokensPaid += paidTokens;
          daily.paidConsumed += paidTokens;
          byModel.paidConsumed += paidTokens;
          byRoute.paidConsumed += paidTokens;
          
          // Teklifbul Rule v1.9 - Calculate cost for paid tokens
          const entryCost = (paidTokens / 1000) * costPer1k;
          totalCostUSD += entryCost;
          daily.costUSD += entryCost;
          byModel.costUSD += entryCost;
          byRoute.costUSD += entryCost;
        }
        
        daily.requests = (daily.requests || 0) + 1;
        byModel.requests += 1;
        byRoute.requests += 1;
      } else if (entry.type === 'purchase') {
        // Purchase: amountTokens is positive
        const purchasedTokens = Math.abs(entry.amountTokens);
        totalPurchasedTokens += purchasedTokens;
        daily.purchases += purchasedTokens;
      } else if (entry.type === 'adjust') {
        // Adjust: can be positive or negative, but not counted in consumption
        // Could be added to summary if needed
      }
    }

    // Teklifbul Rule v1.5.1 - Edge case warning log (per request, once)
    if (freeEligibleMissingTotalTokensCount > 0) {
      logger.warn('[AI] usage-report: freeEligible ledger missing totalTokens', {
        companyId,
        count: freeEligibleMissingTotalTokensCount,
      });
    }

    // Calculate averages and estimates
    const avgDailyPaidConsumption = days > 0 ? totalConsumedTokensPaid / days : 0;
    // Teklifbul Rule v1.5.1 - estimatedDaysRemaining: 1 decimal, null if avgDailyPaidConsumption <= 0
    const estimatedDaysRemaining = avgDailyPaidConsumption > 0 && balanceTokens > 0
      ? Number((balanceTokens / avgDailyPaidConsumption).toFixed(1))
      : null;

    // Convert maps to arrays and sort
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const byModel = Array.from(byModelMap.values()).sort((a, b) => b.paidConsumed + b.freeUsedTotalTokens - (a.paidConsumed + a.freeUsedTotalTokens));
    const byRoute = Array.from(byRouteMap.values()).sort((a, b) => b.paidConsumed + b.freeUsedTotalTokens - (a.paidConsumed + a.freeUsedTotalTokens));

    // Teklifbul Rule v1.9 - Calculate projected monthly cost
    const avgDailyCost = days > 0 ? totalCostUSD / days : 0;
    const projectedMonthlyCostUSD = Number((avgDailyCost * 30).toFixed(2));

    // Teklifbul Rule v1.5.1 - Response meta
    const minTokens = getAiMinTokens();
    const response = {
      range: {
        days,
        fromISO: fromDate.toISOString(),
        toISO: toDate.toISOString(),
      },
      wallet: {
        balanceTokens,
      },
      summary: {
        totalConsumedTokensPaid, // Teklifbul Rule v1.5.1 - Already positive (abs applied)
        totalConsumedTokensFree,
        totalPurchasedTokens,
        avgDailyPaidConsumption: Math.round(avgDailyPaidConsumption),
        estimatedDaysRemaining, // Teklifbul Rule v1.5.1 - 1 decimal or null
      },
      cost: {
        currency: 'USD',
        totalCostUSD: Number(totalCostUSD.toFixed(2)),
        daily: daily.map(d => ({ date: d.date, costUSD: Number(d.costUSD.toFixed(2)) })),
        byModel: byModel.map(m => ({ provider: m.provider, model: m.model, costUSD: Number(m.costUSD.toFixed(2)) })),
        byRoute: byRoute.map(r => ({ route: r.route, costUSD: Number(r.costUSD.toFixed(2)) })),
        projectedMonthlyCostUSD,
      },
      daily, // Teklifbul Rule v1.5.1 - paidConsumed already positive
      byModel, // Teklifbul Rule v1.5.1 - paidConsumed already positive
      byRoute, // Teklifbul Rule v1.5.1 - paidConsumed already positive
      meta: {
        generatedAtISO: new Date().toISOString(),
        minTokens,
      },
    };

    logger.info('Usage report generated', {
      companyId,
      days,
      totalConsumedTokensPaid,
      totalConsumedTokensFree,
      totalPurchasedTokens,
      estimatedDaysRemaining,
    });
    logger.end();

    return res.json(response);
  } catch (error: any) {
    logger.error('Error in usage report endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

