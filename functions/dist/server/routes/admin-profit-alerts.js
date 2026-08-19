/**
 * Admin Profit Alerts Route
 * Teklifbul Rule v2.6 - Profit/Burn Alerts Panel (Actionable)
 *
 * GET /api/admin/alerts/profit?month=YYYY-MM
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { Timestamp } from 'firebase-admin/firestore';
import { loadAiModelCatalog } from '../services/purchaseAssistantAvailabilityService.js';
import { getAiMinTokens } from '../services/aiMinTokens.js';
const router = Router();
router.use(verifyToken, requireAdmin);
// Teklifbul Rule v3.18 - Use cost accounting service
// (getUsdTryRate and cost calculation functions are now imported from aiCostAccountingService)
/**
 * Teklifbul Rule v3.2 - Calculate 7-day usage summary for a company
 * Reused from admin-profit-detail.ts
 */
async function calculateUsageSummary7(db, companyId, costMap) {
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
        ledgerSnap.docs.forEach((doc) => {
            const data = doc.data();
            const meta = data.meta || {};
            const isFreeEligible = meta.freeEligible === true;
            if (!isFreeEligible) {
                const paidTokensEntry = Math.abs(Number(data.amountTokens || 0));
                paidTokens += paidTokensEntry;
            }
        });
    }
    catch (err) {
        logger.warn('Failed to calculate usage summary 7d for alert', { companyId, error: err });
    }
    return { paidTokens };
}
/**
 * Teklifbul Rule v3.2 - Calculate suggested daily cap
 */
function calculateSuggestedDailyCap(avgDailyPaidTokens7) {
    if (avgDailyPaidTokens7 <= 0) {
        return null;
    }
    const minTokens = getAiMinTokens();
    const suggested = Math.ceil(avgDailyPaidTokens7 * 1.2);
    const suggestedDailyCap = Math.max(suggested, minTokens);
    return suggestedDailyCap;
}
/**
 * Generate message and suggested actions for an alert
 */
function generateAlertMessage(company) {
    const isBurnHigh = company.burnFlag === 'HIGH';
    const isRiskHigh = company.riskFlag === 'HIGH';
    let message = '';
    const suggestedActions = [];
    if (isBurnHigh && isRiskHigh) {
        // Both HIGH: combine message
        message = 'Aşırı tüketim ve zarar: maliyet geliri aşıyor, net kâr negatif.';
        suggestedActions.push('Ücretli modeli düşürün (free modele geçiş önerin).');
        suggestedActions.push('Günlük kota belirleyin.');
        suggestedActions.push('Paket fiyatını artırın / üst paket önerin.');
        suggestedActions.push('Kullanım limitlerini gözden geçirin.');
    }
    else if (isBurnHigh) {
        message = 'Aşırı tüketim: maliyet geliri aşıyor.';
        suggestedActions.push('Ücretli modeli düşürün (free modele geçiş önerin).');
        suggestedActions.push('Günlük kota belirleyin.');
        suggestedActions.push('Paket fiyatını artırın / üst paket önerin.');
    }
    else if (isRiskHigh) {
        message = 'Zararda: net kâr negatif.';
        suggestedActions.push('Paket fiyatını artırın.');
        suggestedActions.push('Kullanım limitlerini gözden geçirin.');
    }
    return { message, suggestedActions };
}
/**
 * GET /api/admin/alerts/profit?month=YYYY-MM
 * Returns profit/burn alerts for companies with HIGH flags
 */
router.get('/alerts/profit', async (req, res) => {
    try {
        logger.group('Admin Profit Alerts API');
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
        const monthParam = req.query.month;
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
        logger.info('Profit alerts requested', { month: monthParam });
        // Teklifbul Rule v3.18 - Use cost accounting service
        const { getUsdTryRate } = await import('../services/aiCostAccountingService.js');
        const usdTryRate = await getUsdTryRate(db);
        // Load cost map from catalog (for backward compatibility with old entries)
        const catalog = await loadAiModelCatalog(db);
        const costMap = new Map();
        catalog.forEach(m => {
            const key = `${m.provider}::${m.model}`;
            const cost = typeof m.costPer1kTokensUSD === 'number' ? Math.max(0, m.costPer1kTokensUSD) : 0;
            costMap.set(key, cost);
        });
        // Get all companies
        const companiesSnap = await db.collection('companies').get();
        const companies = companiesSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        const monthStartTimestamp = Timestamp.fromDate(monthStart);
        const monthEndTimestamp = Timestamp.fromDate(monthEnd);
        const companyReports = [];
        // Teklifbul Rule v2.6 - Reuse admin-profit calculation logic
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
            }
            catch (err) {
                logger.warn('Failed to fetch purchases for company', { companyId, error: err });
            }
            // B) AI Cost: aiTokenLedger (consume entries)
            // Teklifbul Rule v3.18 - Use ledger cost meta with fallback
            let costUSD = 0;
            let unknownCostTokens = 0;
            let costSource = 'estimated';
            let costFromLedger = 0;
            let costEstimated = 0;
            try {
                const { estimateCostUsdFromTokens, getModelCostPer1kUsd } = await import('../services/aiCostAccountingService.js');
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
                            costFromLedger += meta.costUsd;
                        }
                        else {
                            // Fallback to catalog computation
                            const modelKey = `${provider}::${model}`;
                            const costPer1k = catalog && catalog.length > 0
                                ? (getModelCostPer1kUsd(provider, model, catalog) || costMap.get(modelKey) || 0)
                                : (costMap.get(modelKey) || 0);
                            const estimated = estimateCostUsdFromTokens(paidTokens, costPer1k);
                            if (estimated !== null) {
                                costUSD += estimated;
                                costEstimated += estimated;
                            }
                            else {
                                unknownCostTokens += paidTokens;
                            }
                        }
                    }
                });
                // Determine cost source
                if (costFromLedger > 0 && costEstimated === 0) {
                    costSource = 'ledger';
                }
                else if (costFromLedger > 0 && costEstimated > 0) {
                    costSource = 'mixed';
                }
            }
            catch (err) {
                logger.warn('Failed to fetch ledger for company', { companyId, error: err });
            }
            const costTRY = costUSD * usdTryRate;
            const profitTRY = revenueTRY - costTRY;
            // Calculate margin and risk
            const marginPct = revenueTRY > 0 ? (profitTRY / revenueTRY) * 100 : null;
            let riskFlag = 'OK';
            if (revenueTRY === 0 && costTRY > 0) {
                riskFlag = 'HIGH';
            }
            else if (profitTRY < 0) {
                riskFlag = 'HIGH';
            }
            else if (marginPct !== null && marginPct < 15) {
                riskFlag = 'MED';
            }
            else {
                riskFlag = 'OK';
            }
            // Calculate burn ratio
            const burnRatio = revenueTRY > 0 ? costTRY / revenueTRY : null;
            let burnFlag = 'OK';
            if (revenueTRY === 0 && costTRY > 0) {
                burnFlag = 'HIGH';
            }
            else if (burnRatio !== null && burnRatio >= 1.0) {
                burnFlag = 'HIGH';
            }
            else if (burnRatio !== null && burnRatio >= 0.7 && burnRatio < 1.0) {
                burnFlag = 'MED';
            }
            else if (burnRatio !== null && burnRatio < 0.7) {
                burnFlag = 'OK';
            }
            // Only include HIGH alerts
            if (burnFlag === 'HIGH' || riskFlag === 'HIGH') {
                const { message, suggestedActions } = generateAlertMessage({
                    burnFlag,
                    riskFlag,
                });
                // Teklifbul Rule v2.9 - Load guardrails from settings
                let forcedFreeMode = false;
                let dailyPaidTokenCap = null;
                try {
                    const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
                    const settingsSnap = await settingsRef.get();
                    if (settingsSnap.exists) {
                        const settings = settingsSnap.data() || {};
                        forcedFreeMode = settings.forcedFreeMode === true;
                        dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
                    }
                }
                catch (err) {
                    logger.warn('Failed to load guardrails for alert', { companyId, error: err });
                }
                // Teklifbul Rule v3.2 - Calculate suggested daily cap (only if not forced free mode)
                let avgDailyPaidTokens7 = 0;
                let suggestedDailyCap = null;
                if (!forcedFreeMode) {
                    try {
                        const usageSummary7 = await calculateUsageSummary7(db, companyId, costMap);
                        avgDailyPaidTokens7 = usageSummary7.paidTokens / 7;
                        suggestedDailyCap = calculateSuggestedDailyCap(avgDailyPaidTokens7);
                    }
                    catch (err) {
                        logger.warn('Failed to calculate suggested daily cap for alert', { companyId, error: err });
                    }
                }
                companyReports.push({
                    companyId,
                    name: companyName,
                    revenueTRY: Number(revenueTRY.toFixed(2)),
                    costTRY: Number(costTRY.toFixed(2)),
                    profitTRY: Number(profitTRY.toFixed(2)),
                    burnRatio: burnRatio !== null ? Number(burnRatio.toFixed(4)) : null,
                    burnFlag,
                    marginPct: marginPct !== null ? Number(marginPct.toFixed(2)) : null,
                    riskFlag,
                    message,
                    suggestedActions,
                    // Teklifbul Rule v2.9 - Guardrails visibility
                    forcedFreeMode,
                    dailyPaidTokenCap,
                    // Teklifbul Rule v3.2 - Smart daily cap suggestion
                    avgDailyPaidTokens7: Number(avgDailyPaidTokens7.toFixed(2)),
                    suggestedDailyCap,
                    // Teklifbul Rule v3.18 - Cost source and unknown tracking
                    costSource,
                    unknownCostTokens,
                });
            }
        }
        // Teklifbul Rule v2.6 - Sort: burnRatio desc (null last), profitTRY asc, costTRY desc
        companyReports.sort((a, b) => {
            // 1) burnRatio desc (null last)
            if (a.burnRatio === null && b.burnRatio === null)
                return 0;
            if (a.burnRatio === null)
                return 1;
            if (b.burnRatio === null)
                return -1;
            if (b.burnRatio !== a.burnRatio)
                return b.burnRatio - a.burnRatio;
            // 2) profitTRY asc (more negative first)
            if (a.profitTRY !== b.profitTRY)
                return a.profitTRY - b.profitTRY;
            // 3) costTRY desc
            return b.costTRY - a.costTRY;
        });
        // Top 20
        const alerts = companyReports.slice(0, 20);
        const response = {
            month: monthParam,
            alerts,
        };
        logger.info('Profit alerts generated', {
            month: monthParam,
            alertCount: alerts.length,
            totalCompanies: companies.length,
        });
        logger.end();
        return res.json(response);
    }
    catch (error) {
        logger.error('Error in profit alerts endpoint', error);
        logger.end();
        return res.status(500).json({
            error: 'server_error',
            message: error.message || 'Sunucu hatası oluştu.',
        });
    }
});
export default router;
