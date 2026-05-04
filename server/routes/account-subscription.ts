// Teklifbul Rule v1.0
import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  cancelSubscriptionAtPeriodEnd,
  createDefaultSubscriptionSummary,
  getSummaryForUser
} from '../services/subscriptionService.js';
import { getAllTokenPacks, getTokenPacksByProvider } from '../services/aiTokenPackCatalog.js';
import { logger } from '../../src/shared/log/logger.js';

const router = Router();

router.get('/', verifyToken, async (req: AuthenticatedRequest, res) => {
  logger.group('account-subscription:get');
  try {
    const authUser: any = (req as any).user || {};
    const userId = authUser.uid || authUser.userId || authUser.id || null;

    if (!userId) {
      logger.warn('account-subscription: userId missing', { authUser });
      logger.end();
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Kullanıcı doğrulanamadı'
      });
    }

    try {
      logger.info('account-subscription: fetching summary', { userId });
      const summary = (await getSummaryForUser(userId)) ?? createDefaultSubscriptionSummary();
      logger.end();
      return res.json(summary);
    } catch (err: any) {
      logger.error('subscription summary fetch failed', { msg: err?.message, stack: err?.stack });
      logger.end();
      // Teklifbul Rule v1.0 - Hata durumunda default summary döndür
      return res.status(200).json(createDefaultSubscriptionSummary());
    }
  } catch (err: any) {
    logger.error('account-subscription route fatal', { msg: err?.message, stack: err?.stack });
    logger.end();
    // Teklifbul Rule v1.0 - Fatal hata durumunda da default summary döndür
    return res.status(200).json(createDefaultSubscriptionSummary());
  }
});

router.post('/cancel', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    await cancelSubscriptionAtPeriodEnd(req.user!.uid);
    res.json({ ok: true });
  } catch (error: any) {
    logger.error('Subscription cancel error', error);
    res.status(400).json({
      error: 'subscription_cancel_failed',
      message: error.message || 'Abonelik iptali planlanamadı'
    });
  }
});

/**
 * GET /api/account/subscription/token-packs
 * Token paket listesini döndürür
 * Query params: provider (opsiyonel) - 'openai' veya 'gemini'
 */
router.get('/token-packs', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Token Packs List');
    const provider = req.query.provider as 'openai' | 'gemini' | undefined;
    
    let packs;
    if (provider && (provider === 'openai' || provider === 'gemini')) {
      packs = getTokenPacksByProvider(provider);
      logger.info('Token packs filtered by provider', { provider, count: packs.length });
    } else {
      packs = getAllTokenPacks();
      logger.info('All token packs returned', { count: packs.length });
    }
    
    logger.end();
    return res.json({ packs });
  } catch (error: any) {
    logger.error('Token packs list error', error);
    logger.end();
    return res.status(500).json({
      error: 'token_packs_fetch_failed',
      message: 'Token paket listesi alınamadı'
    });
  }
});

export default router;

