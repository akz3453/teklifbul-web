/**
 * Admin Tokens API Routes
 * Teklifbul Rule v1.0 - Admin token yönetimi API'leri
 * 
 * Admin kullanıcıların token paketlerini yönetmesi için API endpoints
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { addTokensToUser, getUserAllTokenPacks, getUserTokenPack } from '../services/aiTokenPackService.js';
import { getCheaperProvider } from '../services/aiCostComparison.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();

router.use(verifyToken, requireAdmin);

/**
 * GET /api/admin/tokens/cost-comparison
 * Maliyet karşılaştırması yap — :userId'den ÖNCE kayıt edilmeli
 */
router.get('/cost-comparison', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-tokens:cost-comparison');
  try {
    const { promptTokens = 100, completionTokens = 200 } = req.query;

    const prompt = parseInt(promptTokens as string, 10) || 100;
    const completion = parseInt(completionTokens as string, 10) || 200;

    const { calculateCost, PROVIDER_COSTS } = await import('../services/aiCostComparison.js');
    
    const openaiCost = calculateCost('openai', prompt, completion);
    const geminiCost = calculateCost('gemini', prompt, completion);
    const cheaper = getCheaperProvider(prompt, completion);

    logger.info('Cost comparison completed', { prompt, completion, cheaper });
    logger.end();
    res.json({
      ok: true,
      comparison: {
        promptTokens: prompt,
        completionTokens: completion,
        openai: {
          cost: openaiCost,
          costPerMillion: PROVIDER_COSTS.openai.averagePricePerMillion
        },
        gemini: {
          cost: geminiCost,
          costPerMillion: PROVIDER_COSTS.gemini.averagePricePerMillion
        },
        cheaper,
        savings: cheaper === 'gemini' 
          ? openaiCost - geminiCost 
          : geminiCost - openaiCost
      }
    });
  } catch (error: any) {
    logger.error('Failed to compare costs', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_compare_costs',
      message: error.message || 'Maliyet karşılaştırması yapılamadı'
    });
  }
});

/**
 * GET /api/admin/tokens/:userId
 * Kullanıcının tüm token paketlerini getir
 */
router.get('/:userId', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-tokens:get');
  try {
    const { userId } = req.params;

    const packs = await getUserAllTokenPacks(userId);

    logger.info('Token packs fetched', { userId, count: packs.length });
    logger.end();
    res.json({
      ok: true,
      userId,
      packs: packs.map(pack => ({
        ...pack,
        createdAt: pack.createdAt.toISOString(),
        updatedAt: pack.updatedAt.toISOString()
      }))
    });
  } catch (error: any) {
    logger.error('Failed to fetch token packs', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_fetch_tokens',
      message: error.message || 'Token paketleri alınamadı'
    });
  }
});

/**
 * POST /api/admin/tokens/:userId/add
 * Kullanıcıya token ekle
 */
router.post('/:userId/add',
  validateRequest({
    body: z.object({
      provider: z.enum(['openai', 'gemini']),
      tokenAmount: z.number().int().positive(),
      currency: z.string().optional().default('TRY')
    })
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('admin-tokens:add');
    try {
      const { userId } = req.params;
      const { provider, tokenAmount, currency } = req.body;

      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        logger.end();
        return res.status(404).json({ ok: false, error: 'user_not_found' });
      }

      const updatedPack = await addTokensToUser(userId, provider, tokenAmount, currency);

      const { serverLogger } = await import('../utils/logger.js');
      serverLogger.security.adminAction(req, 'add_tokens', userId);

      logger.info('Tokens added', { userId, provider, tokenAmount });
      logger.end();
      res.json({
        ok: true,
        message: 'Token başarıyla eklendi',
        pack: {
          ...updatedPack,
          createdAt: updatedPack.createdAt.toISOString(),
          updatedAt: updatedPack.updatedAt.toISOString()
        }
      });
    } catch (error: any) {
      logger.error('Failed to add tokens', error);
      logger.end();
      res.status(500).json({
        ok: false,
        error: 'failed_to_add_tokens',
        message: error.message || 'Token eklenemedi'
      });
    }
  }
);

export default router;

