// Teklifbul Rule v1.0
import type { Response, NextFunction } from 'express';
import { logger } from '../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from './auth.js';

/**
 * AI erişimi için middleware
 * Teklifbul Rule v1.0 — Ücretsiz Groq AI tüm planlarda açık.
 * Ücretli OpenAI/Gemini modelleri settings + wallet + Premium Plus ile ayrı gated.
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
    logger.info('AI access granted (free tier open for all authenticated users)', { userId });
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
