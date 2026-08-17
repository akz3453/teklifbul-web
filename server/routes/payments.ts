// Teklifbul Rule v1.0
import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import { initiatePayment, handlePaymentWebhook, type PaymentWebhookPayload } from '../services/paymentsService.js';
import { logger } from '../../src/shared/log/logger.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const initiatePaymentSchema = z.object({
  planId: z.string().min(1, 'Plan seçimi zorunludur'),
  billingInterval: z.enum(['monthly', 'yearly']).optional(),
  couponCode: z.string().optional()
});

router.post('/initiate', verifyToken, requireEmailVerified, validateRequest({ body: initiatePaymentSchema }), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Giriş yapmalısınız'
      });
    }
    const { planId, billingInterval, couponCode } = req.body;
    const result = await initiatePayment({
      userId: req.user.uid,
      companyId: (req.user.customClaims as { companyId?: string })?.companyId,
      planId,
      billingInterval,
      couponCode
    });
    res.json(result);
  } catch (error: any) {
    logger.error('Payment initiate error', error);
    res.status(400).json({
      error: 'payment_initiate_failed',
      message: error.message || 'Ödeme başlatma sırasında hata oluştu'
    });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const signatureHeader = req.headers['x-webhook-signature'];
    if (!signatureHeader) {
      return res.status(401).json({
        error: 'signature_missing',
        message: 'Webhook imzası eksik'
      });
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    let payload: PaymentWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString() || '{}');
    } catch (parseError) {
      logger.error('Webhook payload parse error', parseError);
      return res.status(400).json({
        error: 'invalid_payload',
        message: 'Webhook gövdesi JSON formatında olmalıdır'
      });
    }
    await handlePaymentWebhook(rawBody, payload, Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader);
    res.json({ received: true });
  } catch (error: any) {
    logger.error('Payment webhook error', error);
    res.status(400).json({
      error: 'webhook_failed',
      message: error.message || 'Webhook işlenemedi'
    });
  }
});

export default router;

