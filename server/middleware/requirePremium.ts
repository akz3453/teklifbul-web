// Teklifbul Rule v1.0
import type { Response, NextFunction } from 'express';
import { logger } from '../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from './auth.js';
import { isAdmin } from './auth.js';
import { getActiveSubscription, markUserAsFree, getAccountSubscriptionSummary } from '../services/subscriptionService.js';
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
 * Premium erişimi için middleware
 * Şirket bazlı premium kontrolü yapar (companies/{companyId} dokümanından)
 * Eğer şirket bazlı premium yoksa, kullanıcı bazlı planı kontrol eder (fallback)
 * Admin kullanıcılar plan kontrolünden muaf
 * verifyToken'dan sonra kullanılmalı
 */
export async function requirePremium(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.group('Require Premium Check');
    
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
    logger.info('Checking premium access', { userId });

    // Teklifbul Rule v1.0 - Admin kullanıcılar plan kontrolünden muaf
    const userIsAdmin = await isAdmin(req.user);
    if (userIsAdmin) {
      logger.info('Admin user bypassed premium check', { userId });
      logger.end();
      next();
      return;
    }

    // Teklifbul Rule v1.0 - Şirket bazlı premium kontrolü
    // Önce x-company-id header'ından al (frontend'den gönderilmişse)
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    let companyHasPremium = false;
    let effectivePlanId: string | null = null;
    let companyExpiresAt: Date | null = null;
    
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
            logger.info('x-company-id header kullanıldı', { headerCompanyId, userId });
          }
          
          if (companyId && !companyId.startsWith('solo-') && !companyId.startsWith('tax-')) {
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists) {
              const companyData = companyDoc.data() || {};
              const companyPlanId = companyData.planId || companyData.plan || companyData.subscriptionPlanId || companyData.subscription?.planId || 'free';
              const companyIsPremium = companyData.isPremium === true || (companyPlanId && companyPlanId !== 'free');
              
              // ExpiresAt kontrolü
              const expiresAt = companyData.premiumExpiresAt || companyData.expiresAt || companyData.subscription?.expiresAt;
              if (expiresAt) {
                const parsed: Date = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
                companyExpiresAt = parsed;
                const now = new Date();
                if (parsed >= now && companyIsPremium) {
                  companyHasPremium = true;
                  effectivePlanId = companyPlanId;
                }
              } else if (companyIsPremium) {
                // ExpiresAt yoksa ama isPremium true ise, premium kabul et
                companyHasPremium = true;
                effectivePlanId = companyPlanId;
              }
              
              logger.info('Company premium status checked', { companyId, companyPlanId, companyHasPremium, expiresAt: companyExpiresAt });
            }
          }
        }
      }
    } catch (companyCheckError: any) {
      logger.warn('Company premium check failed (falling back to user subscription)', { error: companyCheckError.message });
    }

    // Eğer şirket bazlı premium yoksa, kullanıcı bazlı subscription'ı kontrol et
    if (!companyHasPremium) {
      logger.info('Company premium not found, checking user subscription', { userId });
      const subscription = await getActiveSubscription(userId);
      
      if (!subscription) {
        await markUserAsFree(userId);
        logger.warn('No active subscription found', { userId });
        logger.end();
        res.status(402).json({
          error: 'premium_required',
          message: 'Premium plan gereklidir. Lütfen abonelik satın alın.'
        });
        return;
      }

      const now = new Date();
      if (subscription.currentPeriodEnd <= now || subscription.status !== 'active') {
        await markUserAsFree(userId);
        logger.warn('Subscription expired or inactive', { userId, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd });
        logger.end();
        res.status(402).json({
          error: 'subscription_expired',
          message: 'Premium aboneliğinizin süresi dolmuş. Lütfen planınızı yenileyin.'
        });
        return;
      }

      req.subscription = subscription;
      logger.info('User subscription is active', { userId, planId: subscription.planId });
      logger.end();
      next();
      return;
    }

    // Şirket bazlı premium var ve geçerli
    logger.info('Company premium access granted', { userId, planId: effectivePlanId });
    
    // req.subscription için mock bir subscription objesi oluştur (geriye dönük uyumluluk)
    req.subscription = {
      id: `company-${effectivePlanId}`,
      userId: userId,
      planId: effectivePlanId || 'premium',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: companyExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 yıl sonra
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
    
    logger.end();
    next();
  } catch (error) {
    logger.error('requirePremium middleware error', error);
    logger.end();
    res.status(500).json({
      error: 'premium_check_failed',
      message: 'Premium kontrolü sırasında hata oluştu'
    });
  }
}

