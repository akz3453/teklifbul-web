import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { logger } from '../../src/shared/log/logger.js';

/**
 * Ödeme gibi kritik uçlarda Firebase emailVerified zorunlu.
 * Onboarding (doğrulama maili, join) bu middleware'siz kalır.
 */
export function requireEmailVerified(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.emailVerified === true) {
    next();
    return;
  }
  if (req.user?.emailVerified === false) {
    logger.warn('emailVerified required', { uid: req.user?.uid, path: req.path });
    res.status(403).json({
      error: 'email_unverified',
      message: 'Bu işlem için e-posta adresinizi doğrulayın.',
    });
    return;
  }
  next();
}
