// Teklifbul Rule v1.0
import type { Response, NextFunction } from 'express';
import { logger } from '../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from './auth.js';
import { isAdmin } from './auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { getCachedUserDoc } from '../src/utils/userDocCache.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
import { getActiveSubscription, markUserAsFree } from '../services/subscriptionService.js';

function isPremiumPlusPlanId(planId: string | null | undefined): boolean {
  const id = String(planId || '').toLowerCase();
  return id.includes('premium_plus');
}

/**
 * Premium Plus erişimi için middleware.
 * Şirket planı öncelikli; yoksa kullanıcı aboneliği kontrol edilir.
 * Admin kullanıcılar muaf. verifyToken'dan sonra kullanılmalı.
 */
export async function requirePremiumPlus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.group('Require Premium Plus Check');

    if (!req.user?.uid) {
      logger.warn('User not authenticated');
      logger.end();
      res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.',
      });
      return;
    }

    const userId = req.user.uid;

    const userIsAdmin = await isAdmin(req.user);
    if (userIsAdmin) {
      logger.info('Admin user bypassed premium plus check', { userId });
      logger.end();
      next();
      return;
    }

    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    let companyHasPremiumPlus = false;
    let effectivePlanId: string | null = null;
    let companyExpiresAt: Date | null = null;

    try {
      const db = await getAdminDb();
      const userDoc = await getCachedUserDoc(userId, req);
      if (db && userDoc.exists) {
        const userData = userDoc.data || {};
        const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
          userId,
          path: req.path,
        });

        if (headerCompanyId && !companyId) {
          logger.warn('requirePremiumPlus: spoofed x-company-id ignored', {
            headerCompanyId,
            userId,
          });
        }

        if (companyId && !companyId.startsWith('solo-')) {
          // Teklifbul Rule v1.0 — tax-{vkn} gerçek şirket id'sidir; solo- hariç companies/{id} kontrol edilir
          const companyDoc = await db.collection('companies').doc(companyId).get();
          if (companyDoc.exists) {
            const companyData = companyDoc.data() || {};
            const companyPlanId = String(
              companyData.planId ||
                companyData.plan ||
                companyData.subscriptionPlanId ||
                companyData.subscription?.planId ||
                'free'
            );
            const expiresAt =
              companyData.premiumExpiresAt ||
              companyData.expiresAt ||
              companyData.subscription?.expiresAt;

            if (isPremiumPlusPlanId(companyPlanId)) {
              if (expiresAt) {
                const parsed: Date = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
                companyExpiresAt = parsed;
                if (parsed >= new Date()) {
                  companyHasPremiumPlus = true;
                  effectivePlanId = companyPlanId;
                }
              } else {
                companyHasPremiumPlus = true;
                effectivePlanId = companyPlanId;
              }
            }

            logger.info('Company premium plus status checked', {
              companyId,
              companyPlanId,
              companyHasPremiumPlus,
              expiresAt: companyExpiresAt,
            });
          }
        }
      }
    } catch (companyCheckError: any) {
      logger.warn('Company premium plus check failed (falling back to user subscription)', {
        error: companyCheckError?.message,
      });
    }

    if (!companyHasPremiumPlus) {
      logger.info('Company premium plus not found, checking user subscription', { userId });
      const subscription = await getActiveSubscription(userId);

      if (!subscription) {
        await markUserAsFree(userId);
        logger.warn('No active subscription found for premium plus', { userId });
        logger.end();
        res.status(402).json({
          error: 'premium_plus_required',
          message: 'Premium Plus plan gereklidir. Lütfen aboneliğinizi yükseltin.',
        });
        return;
      }

      const now = new Date();
      if (subscription.currentPeriodEnd <= now || subscription.status !== 'active') {
        await markUserAsFree(userId);
        logger.warn('Subscription expired or inactive', {
          userId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        });
        logger.end();
        res.status(402).json({
          error: 'subscription_expired',
          message: 'Aboneliğinizin süresi dolmuş. Lütfen planınızı yenileyin.',
        });
        return;
      }

      if (!isPremiumPlusPlanId(subscription.planId)) {
        logger.warn('Active subscription is not premium plus', {
          userId,
          planId: subscription.planId,
        });
        logger.end();
        res.status(402).json({
          error: 'premium_plus_required',
          message: 'Hakediş modülü için Premium Plus plan gereklidir.',
        });
        return;
      }

      req.subscription = subscription;
      logger.info('User premium plus subscription is active', {
        userId,
        planId: subscription.planId,
      });
      logger.end();
      next();
      return;
    }

    req.subscription = {
      id: `company-${effectivePlanId}`,
      userId,
      planId: effectivePlanId || 'premium_plus',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd:
        companyExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    logger.info('Company premium plus access granted', { userId, planId: effectivePlanId });
    logger.end();
    next();
  } catch (error) {
    logger.error('requirePremiumPlus middleware error', error);
    logger.end();
    res.status(500).json({
      error: 'premium_plus_check_failed',
      message: 'Premium Plus kontrolü sırasında hata oluştu',
    });
  }
}
