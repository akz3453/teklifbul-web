/**
 * Token Pack Purchase Routes
 * Teklifbul Rule v1.0 - Token paketi satın alma API'leri
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAiAccess } from '../middleware/requireAiAccess.js';
import { logger } from '../../src/shared/log/logger.js';
import { getTokenPackById, getAllTokenPacks } from '../services/aiTokenPackCatalog.js';
import { addTokensToUser, getUserAllTokenPacks } from '../services/aiTokenPackService.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();

/**
 * POST /api/token-packs/initiate-payment
 * Token paketi için ödeme başlatma
 */
router.post('/initiate-payment',
  verifyToken,
  requireAiAccess,
  validateRequest({
    body: z.object({
      packId: z.string()
    })
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('token-pack:initiate-payment');
    try {
      const userId = req.user?.uid;
      if (!userId) {
        logger.end();
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }

      const { packId } = req.body;

      // Paket bilgisini al
      const pack = getTokenPackById(packId);
      if (!pack) {
        logger.end();
        return res.status(404).json({ ok: false, error: 'pack_not_found' });
      }

      // Teklifbul Rule v1.0 - requireAiAccess middleware zaten Premium Plus kontrolü yapıyor
      // Burada ekstra kontrol gerekmez, middleware geçtiyse Premium Plus var demektir

      // Payment intent oluştur
      const { createPaymentIntentRecord } = await import('../services/subscriptionService.js');
      const providerSessionId = `token_pack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      const paymentIntent = await createPaymentIntentRecord({
        userId,
        planId: `token_pack_${packId}` as any, // Özel planId formatı
        amount: pack.price,
        currency: pack.currency,
        status: 'initiated',
        providerSessionId
      });

      // Payment intent'e token paketi bilgilerini metadata olarak ekle
      // Teklifbul Rule v1.0 - Firestore admin db'yi runtime'da resolve et
      const db = await getAdminDb();
      if (db) {
        await db.collection('payment_intents').doc(paymentIntent.id).update({
          metadata: {
            type: 'token_pack',
            packId: pack.id,
            provider: pack.provider,
            tokenAmount: pack.tokenAmount
          }
        });
      } else {
        logger.warn('Firestore unavailable, payment_intents metadata atlandi');
      }

      const checkoutBase = process.env.PAYMENT_CHECKOUT_BASE_URL || 'https://pay.teklifbul-sandbox.local/checkout';
      const checkoutUrl = `${checkoutBase}?session=${providerSessionId}&intent=${paymentIntent.id}&type=token_pack`;

      logger.info('Token pack payment initiated', { userId, packId, paymentIntentId: paymentIntent.id });
      logger.end();
      res.json({
        ok: true,
        paymentIntentId: paymentIntent.id,
        checkoutUrl,
        amount: pack.price,
        currency: pack.currency,
        pack: {
          id: pack.id,
          name: pack.name,
          provider: pack.provider,
          tokenAmount: pack.tokenAmount
        }
      });
    } catch (error: any) {
      logger.error('Token pack payment initiation error', error);
      logger.end();
      res.status(500).json({
        ok: false,
        error: 'payment_initiation_failed',
        message: error.message || 'Ödeme başlatılamadı'
      });
    }
  }
);

/**
 * GET /api/token-packs
 * Tüm token paketlerini listele
 */
router.get('/', verifyToken, async (req: AuthenticatedRequest, res) => {
  logger.group('token-packs:list');
  try {
    const { provider } = req.query;
    
    let packs;
    if (provider === 'openai' || provider === 'gemini') {
      const { getTokenPacksByProvider } = await import('../services/aiTokenPackCatalog.js');
      packs = getTokenPacksByProvider(provider);
    } else {
      packs = getAllTokenPacks();
    }

    // Kullanıcının mevcut token paketlerini al
    const userId = req.user?.uid;
    let userPacks: any[] = [];
    if (userId) {
      userPacks = await getUserAllTokenPacks(userId);
    }

    // Paketlere kullanıcının mevcut token bilgisini ekle
    const packsWithUserInfo = packs.map((pack: any) => {
      const userPack = userPacks.find((up: any) => up.provider === pack.provider);
      return {
        ...pack,
        userHasPack: !!userPack,
        remainingTokens: userPack?.remainingTokens || 0,
        totalTokens: userPack?.totalTokens || 0,
        usedTokens: userPack?.usedTokens || 0
      };
    });

    logger.info('Token packs listed', { count: packsWithUserInfo.length });
    logger.end();
    res.json({ ok: true, packs: packsWithUserInfo });
  } catch (error: any) {
    logger.error('Token packs list error', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'list_failed',
      message: error.message || 'Token paketleri listelenemedi'
    });
  }
});

export default router;

