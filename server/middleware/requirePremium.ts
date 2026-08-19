// Teklifbul Rule v1.0
import type { Response, NextFunction } from 'express';
import { logger } from '../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from './auth.js';
import { isAdmin } from './auth.js';
import { getActiveSubscription, markUserAsFree } from '../services/subscriptionService.js';
import { getAdminDb } from '../utils/firestore.js';
// Teklifbul Rule v1.0 - users/{uid} cache (request-scope)
import { getCachedUserDoc } from '../src/utils/userDocCache.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
import { companyGrantsPremiumAccess, subscriptionGrantsPremiumAccess } from '../services/planCatalog.js';

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
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    let companyHasPremium = false;
    let effectivePlanId: string | null = null;
    let companyExpiresAt: Date | null = null;
    
    try {
      const db = await getAdminDb();
      const userDoc = await getCachedUserDoc(userId, req);
      if (db && userDoc.exists) {
        {
          const userData = userDoc.data || {};
          const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
            userId,
            path: req.path,
          });
          
          if (headerCompanyId && !companyId) {
            logger.warn('requirePremium: spoofed x-company-id ignored', { headerCompanyId, userId });
          }
          
          if (companyId && !companyId.startsWith('solo-')) {
            // Teklifbul Rule v1.0 — tax-{vkn} gerçek şirket id'sidir; solo- hariç companies/{id} kontrol edilir
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists) {
              const companyData = companyDoc.data() || {};
              const companyPlanId = companyData.planId || companyData.plan || companyData.subscriptionPlanId || companyData.subscription?.planId || 'free';
              const expiresAt = companyData.premiumExpiresAt || companyData.expiresAt || companyData.subscription?.expiresAt;
              if (expiresAt) {
                const parsed: Date = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
                companyExpiresAt = parsed;
              }
              if (companyGrantsPremiumAccess(companyData)) {
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

      if (!subscription || !subscriptionGrantsPremiumAccess(subscription)) {
        await markUserAsFree(userId);
        logger.warn('No paid active subscription found', { userId, planId: subscription?.planId, status: subscription?.status });
        logger.end();
        res.status(402).json({
          error: 'premium_required',
          message: 'Premium plan gereklidir. Lütfen abonelik satın alın.'
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

