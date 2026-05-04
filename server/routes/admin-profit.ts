/**
 * Admin Profit Report Route
 * Teklifbul Rule v2.0 - Profit Engine (Company Profitability System)
 * 
 * GET /api/admin/profit-report?month=YYYY-MM
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

// Teklifbul Rule v3.18 - Use cost accounting service for USD/TRY rate
// (getUsdTryRate is now imported from aiCostAccountingService)

/**
 * Calculate cost for a ledger entry
 */
function calculateCostUSD(tokens: number, costPer1k: number): number {
  return (tokens / 1000) * costPer1k;
}

/**
 * GET /api/admin/profit-report?month=YYYY-MM
 * Returns profit report for all companies for a given month
 */
router.get('/profit-report', async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Admin Profit Report API');
    
    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    // Parse month parameter (YYYY-MM)
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

    logger.info('Profit report requested', { month: monthParam, monthStart: monthStart.toISOString(), monthEnd: monthEnd.toISOString() });

    // Get USD/TRY rate
    // Teklifbul Rule v3.18 - Use cost accounting service
    const { getUsdTryRate, checkFxDriftWarning } = await import('../services/aiCostAccountingService.js');
    const usdTryRate = await getUsdTryRate(db);
    logger.info('USD/TRY rate', { usdTryRate });
    
    // Check FX drift warning
    const fxDriftWarning = await checkFxDriftWarning(db, monthParam);

    // Load cost map from catalog
    const catalog = await loadAiModelCatalog(db);
    const costMap = new Map<string, number>(); // key: "provider::model", value: costPer1kTokensUSD
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

    logger.info('Companies found', { count: companies.length });

    const monthStartTimestamp = Timestamp.fromDate(monthStart);
    const monthEndTimestamp = Timestamp.fromDate(monthEnd);

    // Calculate projection period (last 7 days of the month)
    const projectionStart = new Date(monthEnd);
    projectionStart.setDate(projectionStart.getDate() - 7);
    const projectionStartTimestamp = Timestamp.fromDate(projectionStart);

    const companyReports: any[] = [];
    let totalRevenueTRY = 0;
    let totalCostTRY = 0;

    for (const company of companies) {
      const companyId = company.id;
      const companyName = company.name || company.companyName || companyId;

      // A) Revenue: aiTokenPurchases
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
        logger.warn('Failed to fetch purchases for company', { companyId, error: err });
      }

      // B) AI Cost: aiTokenLedger (consume entries)
      // Teklifbul Rule v3.18 - Use ledger cost meta with fallback
      let costUSD = 0;
      let projectionCostUSD = 0;
      let unknownCostTokensMonth = 0;
      let unknownCostTokensProjection = 0;
      let costSourceMonth: 'ledger' | 'estimated' | 'mixed' = 'estimated';
      let costFromLedgerMonth = 0;
      let costEstimatedMonth = 0;
      
      try {
        const { estimateCostUsdFromTokens, getModelCostPer1kUsd } = await import('../services/aiCostAccountingService.js');
        
        // Month cost
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
            
            // Prefer ledger cost meta
            if (typeof meta.costUsd === 'number' && meta.costUsd >= 0) {
              costUSD += meta.costUsd;
              costFromLedgerMonth += meta.costUsd;
            } else {
              // Fallback to catalog computation
              const modelKey = `${provider}::${model}`;
              const costPer1k = catalog && catalog.length > 0
                ? (getModelCostPer1kUsd(provider, model, catalog) || costMap.get(modelKey) || 0)
                : (costMap.get(modelKey) || 0);
              const estimated = estimateCostUsdFromTokens(paidTokens, costPer1k);
              if (estimated !== null) {
                costUSD += estimated;
                costEstimatedMonth += estimated;
              } else {
                unknownCostTokensMonth += paidTokens;
              }
            }
          }
        });

        // Projection cost (last 7 days)
        const projectionSnap = await db
          .collection('companies')
          .doc(companyId)
          .collection('aiTokenLedger')
          .where('createdAt', '>=', projectionStartTimestamp)
          .where('createdAt', '<=', monthEndTimestamp)
          .where('type', '==', 'consume')
          .get();

        projectionSnap.docs.forEach(doc => {
          const data = doc.data();
          const meta = data.meta || {};
          const isFreeEligible = meta.freeEligible === true;
          
          if (!isFreeEligible) {
            const paidTokens = Math.abs(Number(data.amountTokens || 0));
            const provider = meta.provider || 'unknown';
            const model = meta.model || 'unknown';
            
            // Prefer ledger cost meta
            if (typeof meta.costUsd === 'number' && meta.costUsd >= 0) {
              projectionCostUSD += meta.costUsd;
            } else {
              // Fallback to catalog computation
              const modelKey = `${provider}::${model}`;
              const costPer1k = catalog && catalog.length > 0
                ? (getModelCostPer1kUsd(provider, model, catalog) || costMap.get(modelKey) || 0)
                : (costMap.get(modelKey) || 0);
              const estimated = estimateCostUsdFromTokens(paidTokens, costPer1k);
              if (estimated !== null) {
                projectionCostUSD += estimated;
              } else {
                unknownCostTokensProjection += paidTokens;
              }
            }
          }
        });
        
        // Determine cost source
        if (costFromLedgerMonth > 0 && costEstimatedMonth === 0) {
          costSourceMonth = 'ledger';
        } else if (costFromLedgerMonth > 0 && costEstimatedMonth > 0) {
          costSourceMonth = 'mixed';
        }
      } catch (err) {
        logger.warn('Failed to fetch ledger for company', { companyId, error: err });
      }

      const costTRY = costUSD * usdTryRate;
      const profitTRY = revenueTRY - costTRY;

      // Teklifbul Rule v2.1 - Calculate margin and risk
      const marginPct = revenueTRY > 0 ? (profitTRY / revenueTRY) * 100 : null;
      
      let riskFlag: 'OK' | 'MED' | 'HIGH' = 'OK';
      let recommendation = '';
      
      if (revenueTRY === 0 && costTRY > 0) {
        riskFlag = 'HIGH';
        recommendation = 'Zararda: paket fiyatını artırın veya kullanım kotası koyun.';
      } else if (profitTRY < 0) {
        riskFlag = 'HIGH';
        recommendation = 'Zararda: paket fiyatını artırın veya kullanım kotası koyun.';
      } else if (marginPct !== null && marginPct < 15) {
        riskFlag = 'MED';
        recommendation = 'Marj düşük: fiyat/limitleri gözden geçirin, üst paket önerin.';
      } else {
        riskFlag = 'OK';
        recommendation = 'Karlı: mevcut yapı uygun.';
      }

      // Teklifbul Rule v2.4 - Calculate burn ratio (cost/revenue)
      const burnRatio = revenueTRY > 0 ? costTRY / revenueTRY : null;
      
      let burnFlag: 'OK' | 'MED' | 'HIGH' = 'OK';
      if (revenueTRY === 0 && costTRY > 0) {
        burnFlag = 'HIGH'; // Free usage costing money
      } else if (burnRatio !== null && burnRatio >= 1.0) {
        burnFlag = 'HIGH'; // Cost exceeds revenue
      } else if (burnRatio !== null && burnRatio >= 0.7 && burnRatio < 1.0) {
        burnFlag = 'MED'; // Cost approaching revenue
      } else if (burnRatio !== null && burnRatio < 0.7) {
        burnFlag = 'OK'; // Healthy ratio
      }

      // Teklifbul Rule v2.4 - Update recommendation based on burn flag
      if (burnFlag === 'HIGH') {
        recommendation = 'Maliyet geliri aşıyor: fiyat artırın / kota koyun / ücretli modeli kısıtlayın.';
      } else if (burnFlag === 'MED') {
        recommendation = 'Maliyet gelire yaklaştı: paket/limitleri gözden geçirin, üst paket önerin.';
      }
      // Otherwise keep v2.1 recommendation (profit/margin based)

      // Projection: avg daily cost from last 7 days * 30
      const avgDailyCostUSD = 7 > 0 ? projectionCostUSD / 7 : 0;
      const projectedMonthlyCostUSD = avgDailyCostUSD * 30;
      const projectedMonthlyCostTRY = projectedMonthlyCostUSD * usdTryRate;
      
      // Projection revenue: avg daily revenue from last 7 days * 30
      let projectionRevenueTRY = 0;
      try {
        const projectionPurchasesSnap = await db
          .collection('companies')
          .doc(companyId)
          .collection('aiTokenPurchases')
          .where('createdAt', '>=', projectionStartTimestamp)
          .where('createdAt', '<=', monthEndTimestamp)
          .where('status', '==', 'paid')
          .get();

        projectionPurchasesSnap.docs.forEach(doc => {
          const data = doc.data();
          const packageSnapshot = data.packageSnapshot || {};
          const priceTRY = Number(packageSnapshot.priceTRY || 0);
          projectionRevenueTRY += priceTRY;
        });
      } catch (err) {
        logger.warn('Failed to fetch projection purchases', { companyId, error: err });
      }

      const avgDailyRevenueTRY = 7 > 0 ? projectionRevenueTRY / 7 : 0;
      const projectedMonthlyRevenueTRY = avgDailyRevenueTRY * 30;
      const projectedMonthlyProfitTRY = projectedMonthlyRevenueTRY - projectedMonthlyCostTRY;

      totalRevenueTRY += revenueTRY;
      totalCostTRY += costTRY;

      companyReports.push({
        companyId,
        name: companyName,
        revenueTRY: Number(revenueTRY.toFixed(2)),
        costTRY: Number(costTRY.toFixed(2)),
        profitTRY: Number(profitTRY.toFixed(2)),
        projectedMonthlyProfitTRY: Number(projectedMonthlyProfitTRY.toFixed(2)),
        status: profitTRY >= 0 ? 'profit' : 'loss',
        marginPct: marginPct !== null ? Number(marginPct.toFixed(2)) : null,
        riskFlag,
        recommendation,
        // Teklifbul Rule v2.4 - Burn ratio
        burnRatio: burnRatio !== null ? Number(burnRatio.toFixed(4)) : null,
        burnFlag,
        costSource: costSourceMonth, // Teklifbul Rule v3.18
        unknownCostTokens: unknownCostTokensMonth, // Teklifbul Rule v3.18
      });
    }

    const totalProfitTRY = totalRevenueTRY - totalCostTRY;
    
    // Teklifbul Rule v3.18 - Aggregate unknown costs
    let totalUnknownCostTokens = 0;
    let unknownCostCompaniesCount = 0;
    companyReports.forEach(c => {
      if (c.unknownCostTokens > 0) {
        totalUnknownCostTokens += c.unknownCostTokens;
        unknownCostCompaniesCount++;
      }
    });

    // Teklifbul Rule v2.1 - Count risk categories
    const lossCompaniesCount = companyReports.filter(c => c.riskFlag === 'HIGH').length;
    const medRiskCompaniesCount = companyReports.filter(c => c.riskFlag === 'MED').length;
    const okCompaniesCount = companyReports.filter(c => c.riskFlag === 'OK').length;

    // Teklifbul Rule v2.4 - Count burn categories
    const highBurnCount = companyReports.filter(c => c.burnFlag === 'HIGH').length;
    const medBurnCount = companyReports.filter(c => c.burnFlag === 'MED').length;
    const okBurnCount = companyReports.filter(c => c.burnFlag === 'OK').length;

    const response = {
      month: monthParam,
      companies: companyReports.sort((a, b) => b.profitTRY - a.profitTRY), // Sort by profit descending
      totals: {
        revenueTRY: Number(totalRevenueTRY.toFixed(2)),
        costTRY: Number(totalCostTRY.toFixed(2)),
        profitTRY: Number(totalProfitTRY.toFixed(2)),
        lossCompaniesCount,
        medRiskCompaniesCount,
        okCompaniesCount,
        // Teklifbul Rule v2.4 - Burn counts
        highBurnCount,
        medBurnCount,
        okBurnCount,
        // Teklifbul Rule v3.18 - Unknown cost tracking
        unknownCostCompaniesCount,
        unknownCostTokensTotal: totalUnknownCostTokens,
      },
      meta: {
        usdTryRate,
        generatedAtISO: new Date().toISOString(),
        fxDriftWarning: fxDriftWarning || undefined, // Teklifbul Rule v3.18
      },
    };

    logger.info('Profit report generated', {
      month: monthParam,
      companyCount: companyReports.length,
      totalRevenueTRY,
      totalCostTRY,
      totalProfitTRY,
    });
    logger.end();

    return res.json(response);
  } catch (error: any) {
    logger.error('Error in profit report endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

