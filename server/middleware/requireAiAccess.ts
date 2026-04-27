// Teklifbul Rule v1.0
import type { Response, NextFunction } from 'express';
import { logger } from '../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from './auth.js';
import { isAdmin } from './auth.js';
import { getAccountSubscriptionSummary } from '../services/subscriptionService.js';
import { userHasAiPlan } from '../services/userService.js';
import { getAdminDb } from '../utils/firestore.js';
// Teklifbul Rule v1.0 - users/{uid} cache (request-scope)
import { getCachedUserDoc } from '../src/utils/userDocCache.js';

/**
 * Şirket bazlı companyId çözümleme helper'ı
 * Teklifbul Rule v1.0 - Shared company ID resolution
 */
function resolveSharedCompanyId(userData: any): string | null {
  const cid = userData?.companyId;
  const aid = userData?.activeCompanyId;
  const arr0 = Array.isArray(userData?.companies) && userData.companies.length ? userData.companies[0] : null;

  // Prefer explicit companyId if present and not a solo/tax doc
  if (cid && typeof cid === "string" && !cid.startsWith("solo-") && !cid.startsWith("tax-")) return cid;

  // If activeCompanyId is solo-* but companyId exists, still use companyId
  if (aid && typeof aid === "string" && aid.startsWith("solo-") && cid) return cid;

  // Otherwise fallback
  return aid || cid || arr0;
}

/**
 * AI erişimi için middleware
 * Sadece Premium Plus planına sahip kullanıcılar AI özelliklerine erişebilir
 * Admin kullanıcılar plan kontrolünden muaf
 * Şirket bazlı premium kontrolü yapar (companies/{companyId} dokümanından)
 * verifyToken'dan sonra kullanılmalı
 */
export async function requireAiAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.group('Require AI Access Check');
    
    if (!req.user?.uid) {
      logger.warn('User not authenticated');
      logger.end();
      res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
      return;
    }

    const userId = req.user.uid;
    logger.info('Checking AI access', { userId });

    // Teklifbul Rule v1.0 - Admin kullanıcılar plan kontrolünden muaf
    const userIsAdmin = await isAdmin(req.user);
    if (userIsAdmin) {
      logger.info('Admin user bypassed AI plan check', { userId });
      logger.end();
      next();
      return;
    }

    // Teklifbul Rule v1.0 - Şirket bazlı premium kontrolü
    // Önce x-company-id header'ından al (frontend'den gönderilmişse)
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    let companyIsPremiumPlus = false;
    let effectivePlanId: string | null = null;
    
    try {
      const db = await getAdminDb();
      // Teklifbul Rule v1.0 - cached user doc (req-scope + 30s TTL)
      const userDoc = await getCachedUserDoc(userId, req);
      if (db && userDoc.exists) {
        {
          const userData = userDoc.data || {};
          // Teklifbul Rule v1.0 - x-company-id header'ı varsa onu kullan, yoksa resolveSharedCompanyId kullan
          const companyId = headerCompanyId || resolveSharedCompanyId(userData);
          
          if (headerCompanyId) {
            logger.info('x-company-id header kullanıldı (requireAiAccess)', { headerCompanyId, userId });
          }
          
          if (companyId) {
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists) {
              const companyData = companyDoc.data() || {};
              const companyPlanId = companyData.planId || companyData.plan || companyData.subscriptionPlanId || companyData.subscription?.planId || 'free';
              companyIsPremiumPlus = companyData.isPremium === true || companyPlanId.includes('premium_plus');
              effectivePlanId = companyIsPremiumPlus ? companyPlanId : null;
              logger.info('Company premium status checked', { companyId, companyPlanId, companyIsPremiumPlus });
            }
          }
        }
      }
    } catch (companyCheckError: any) {
      logger.warn('Company premium check failed (falling back to user plan)', { error: companyCheckError.message });
    }

    // Eğer şirket bazlı premium yoksa, kullanıcı bazlı planı kontrol et
    if (!companyIsPremiumPlus) {
      const accountSummary = await getAccountSubscriptionSummary(userId);
      effectivePlanId = accountSummary.plan.planId;
      logger.info('User plan retrieved', { userId, planId: effectivePlanId });
    } else {
      logger.info('Using company premium plan', { userId, planId: effectivePlanId });
    }

    // AI plan kontrolü
    if (!effectivePlanId || !userHasAiPlan(effectivePlanId)) {
      logger.warn('User/company does not have AI plan', { userId, planId: effectivePlanId, companyIsPremiumPlus });
      logger.end();
      res.status(402).json({
        error: 'ai_plan_required',
        message: 'Yapay zekâ kullanımı için Premium Plus aboneliği gereklidir.',
        planId: effectivePlanId
      });
      return;
    }

    logger.info('AI access granted', { userId, planId: effectivePlanId, source: companyIsPremiumPlus ? 'company' : 'user' });
    logger.end();
    next();
  } catch (error: any) {
    logger.error('requireAiAccess middleware error', error);
    logger.end();
    res.status(500).json({
      error: 'ai_check_failed',
      message: 'AI erişim kontrolü sırasında hata oluştu'
    });
  }
}

