import { logger } from '../../src/shared/log/logger.js';
/**
 * Ödeme gibi kritik uçlarda Firebase emailVerified zorunlu.
 * Onboarding (doğrulama maili, join) bu middleware'siz kalır.
 */
export function requireEmailVerified(req, res, next) {
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
