/**
 * Billing Plan Routes
 * Teklifbul Rule v1.6 - Plan & Usage Page (No-Payment Yet)
 * 
 * GET /api/billing/plan
 * GET /api/billing/usage-summary?days=7
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { getCompanyPlanFlags } from '../services/purchaseAssistantAvailabilityService.js';
import { getAiMinTokens } from '../services/aiMinTokens.js';
import { getCompanyAiWallet } from '../services/companyAiWalletService.js';

const router = Router();

// Rate limit config (from rateLimitAi.ts)
const WINDOW_SEC = Number(process.env.AI_RL_WINDOW_SEC) || 60;
const FREE_MAX = Number(process.env.AI_RL_FREE_MAX) || 20;
const PREMIUM_MAX = Number(process.env.AI_RL_PREMIUM_MAX) || 60;
const PREMIUM_PLUS_MAX = Number(process.env.AI_RL_PREMIUM_PLUS_MAX) || 120;

function resolveSharedCompanyId(userData: any): string | null {
  const cid = userData?.companyId;
  const aid = userData?.activeCompanyId;
  const arr0 = Array.isArray(userData?.companies) && userData.companies.length ? userData.companies[0] : null;
  if (cid && typeof cid === 'string' && !cid.startsWith('solo-') && !cid.startsWith('tax-')) return cid;
  if (aid && typeof aid === 'string' && aid.startsWith('solo-') && cid) return cid;
  return aid || cid || arr0;
}

async function getCompanyContext(req: AuthenticatedRequest): Promise<{ companyId: string; planId: string } | null> {
  const userId = req.user?.uid;
  if (!userId) return null;

  const headerCompanyId = req.headers['x-company-id'] as string | undefined;
  const db = await getAdminDb();
  if (!db) return null;

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;

  const userData = userDoc.data() || {};
  const companyId = headerCompanyId || resolveSharedCompanyId(userData);
  if (!companyId) return null;

  const planFlags = await getCompanyPlanFlags(companyId);
  return { companyId, planId: planFlags.planId };
}

function getPlanName(planId: string): string {
  if (planId.includes('premium_plus')) return 'Premium Plus';
  if (planId.includes('premium')) return 'Premium';
  return 'Ücretsiz';
}

function getRateLimitForPlan(planId: string): number {
  if (planId.includes('premium_plus')) return PREMIUM_PLUS_MAX;
  if (planId.includes('premium')) return PREMIUM_MAX;
  return FREE_MAX;
}

/**
 * GET /api/billing/plan
 * Returns current plan, features, and AI policy
 */
router.get('/plan', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Billing Plan API');
    
    const context = await getCompanyContext(req);
    if (!context) {
      logger.warn('Company context not found');
      logger.end();
      return res.status(400).json({
        error: 'company_not_found',
        message: 'Şirket bilgisi bulunamadı.'
      });
    }

    const { companyId, planId } = context;
    const planName = getPlanName(planId);
    const minTokens = getAiMinTokens();
    const rateLimitMax = getRateLimitForPlan(planId);

    // Teklifbul Rule v2.8 - Load guardrails from settings
    const db = await getAdminDb();
    let forcedFreeMode = false;
    let dailyPaidTokenCap: number | null = null;
    if (db) {
      try {
        const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
          const settings = settingsSnap.data() || {};
          forcedFreeMode = settings.forcedFreeMode === true;
          dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;
        }
      } catch (err) {
        logger.warn('Failed to load guardrails from settings', { companyId, error: err });
      }
    }

    // Teklifbul Rule v3.1 - Get today's paid token usage
    let todayPaidUsage = { dateKey: '', paidUsedTokens: 0 };
    if (db) {
      try {
        const { getTodayPaidUsedTokens } = await import('../services/aiDailyCounterService.js');
        todayPaidUsage = await getTodayPaidUsedTokens(companyId);
      } catch (err) {
        logger.warn('Failed to load today paid usage', { companyId, error: err });
      }
    }

    // Features based on plan
    const features = {
      aiFreeModels: true, // All plans can use freeEligible models
      aiPaidModels: planId.includes('premium_plus'),
      tokenPackages: planId.includes('premium_plus'),
      salesModule: !planId.includes('free'), // Premium and Premium Plus
      interimPaymentsModule: planId.includes('premium_plus'),
    };

    const response = {
      plan: {
        planId,
        planName,
      },
      aiPolicy: {
        minTokens,
        rateLimits: {
          windowSec: WINDOW_SEC,
          freeMax: FREE_MAX,
          premiumMax: PREMIUM_MAX,
          premiumPlusMax: PREMIUM_PLUS_MAX,
        },
        freeEligibleNoCharge: true,
        currentPlanLimit: rateLimitMax,
        // Teklifbul Rule v2.8 - Guardrails visibility
        forcedFreeMode,
        dailyPaidTokenCap,
        // Teklifbul Rule v3.1 - Today paid usage
        todayPaidUsage,
      },
      features,
    };

    logger.info('Billing plan retrieved', { companyId, planId, planName });
    logger.end();

    return res.json(response);
  } catch (error: any) {
    logger.error('Error in billing plan endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

/**
 * GET /api/billing/usage-summary?days=7
 * Returns usage summary (reuses v1.5 usage-report summary)
 */
router.get('/usage-summary', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Billing Usage Summary API');
    
    const context = await getCompanyContext(req);
    if (!context) {
      logger.warn('Company context not found');
      logger.end();
      return res.status(400).json({
        error: 'company_not_found',
        message: 'Şirket bilgisi bulunamadı.'
      });
    }

    const { companyId } = context;
    const daysParam = req.query.days as string | undefined;
    const days = daysParam ? parseInt(daysParam, 10) : 7;
    if (![7, 14, 30].includes(days)) {
      logger.warn('Invalid days parameter', { daysParam, days });
      logger.end();
      return res.status(400).json({
        error: 'invalid_days',
        message: 'days parametresi 7, 14 veya 30 olmalıdır.'
      });
    }

    // Reuse usage-report logic (simplified - just summary)
    const wallet = await getCompanyAiWallet(companyId);
    const balanceTokens = wallet?.balanceTokens || 0;

    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(now);
    toDate.setHours(23, 59, 59, 999);

    const { Timestamp } = await import('firebase-admin/firestore');
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

    const ledgerEntries = ledgerSnap.docs.map(doc => {
      const data = doc.data();
      return {
        type: data.type || 'unknown',
        amountTokens: Number(data.amountTokens || 0),
        meta: data.meta || {},
      };
    });

    let totalConsumedTokensPaid = 0;
    let totalConsumedTokensFree = 0;
    let totalPurchasedTokens = 0;

    for (const entry of ledgerEntries) {
      if (entry.type === 'consume') {
        const isFreeEligible = entry.meta.freeEligible === true;
        if (isFreeEligible) {
          totalConsumedTokensFree += Number(entry.meta.totalTokens || 0);
        } else {
          totalConsumedTokensPaid += Math.abs(entry.amountTokens);
        }
      } else if (entry.type === 'purchase') {
        totalPurchasedTokens += Math.abs(entry.amountTokens);
      }
    }

    const avgDailyPaidConsumption = days > 0 ? totalConsumedTokensPaid / days : 0;
    const estimatedDaysRemaining = avgDailyPaidConsumption > 0 && balanceTokens > 0
      ? Number((balanceTokens / avgDailyPaidConsumption).toFixed(1))
      : null;

    const response = {
      days,
      wallet: {
        balanceTokens,
      },
      summary: {
        totalConsumedTokensPaid,
        totalConsumedTokensFree,
        totalPurchasedTokens,
        avgDailyPaidConsumption: Math.round(avgDailyPaidConsumption),
        estimatedDaysRemaining,
      },
    };

    logger.info('Usage summary retrieved', { companyId, days });
    logger.end();

    return res.json(response);
  } catch (error: any) {
    logger.error('Error in usage summary endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

