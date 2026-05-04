import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../../middleware/auth.js';
import { createPaymentPreference, listPaymentPreferences } from '../../services/subscriptionService.js';
import { logger } from '../../../src/shared/log/logger.js';

const router = Router();

router.post('/', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { paymentMethodType, payload, amount, currency, status } = req.body || {};
    if (!paymentMethodType) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Ödeme yöntemi tipi zorunludur'
      });
    }

    const allowedStatus = new Set(['draft', 'pending', 'confirmed', 'canceled']);
    const preference = await createPaymentPreference({
      userId: req.user!.uid,
      companyId: (req.user!.customClaims as { companyId?: string } | undefined)?.companyId,
      paymentMethodType,
      payload: payload || {},
      amount: typeof amount === 'number' ? amount : undefined,
      currency: typeof currency === 'string' ? currency : 'TRY',
      status: allowedStatus.has(status) ? status : 'draft'
    });
    res.json(preference);
  } catch (error: any) {
    logger.error('Payment preference create error', error);
    // Teklifbul Rule v1.0 - Firebase Admin SDK credentials hatası için özel mesaj
    const isCredentialsError = error.message?.includes('Firebase Admin SDK') || 
                               error.message?.includes('credentials') ||
                               error.message?.includes('default credentials');
    const statusCode = isCredentialsError ? 503 : 400;
    res.status(statusCode).json({
      error: isCredentialsError ? 'firebase_config_error' : 'payment_preference_failed',
      message: error.message || 'Ödeme tercihi kaydedilemedi'
    });
  }
});

router.get('/', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const preferences = await listPaymentPreferences({
      userId: req.user!.uid,
      page,
      pageSize
    });
    res.json({
      page,
      pageSize,
      items: preferences
    });
  } catch (error: any) {
    logger.error('Payment preference list error', error);
    // Teklifbul Rule v1.0 - Firebase Admin SDK credentials hatası için özel mesaj
    const isCredentialsError = error.message?.includes('Firebase Admin SDK') || 
                               error.message?.includes('credentials') ||
                               error.message?.includes('default credentials');
    const statusCode = isCredentialsError ? 503 : 500;
    res.status(statusCode).json({
      error: isCredentialsError ? 'firebase_config_error' : 'payment_preference_list_failed',
      message: error.message || 'Ödeme tercihleri alınamadı'
    });
  }
});

export default router;


