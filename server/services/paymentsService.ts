// Teklifbul Rule v1.0
import crypto from 'crypto';
import { logger } from '../../src/shared/log/logger.js';
import { getPlanDefinition, type PlanId } from './planCatalog.js';
import {
  createInvoiceRecord,
  createPaymentIntentRecord,
  recordAuditEvent,
  updatePaymentIntentStatus,
  upsertSubscription
} from './subscriptionService.js';

const DEFAULT_CHECKOUT_BASE_URL = 'https://pay.teklifbul-sandbox.local/checkout';

export interface InitiatePaymentInput {
  userId: string;
  companyId?: string;
  planId: PlanId;
  billingInterval?: 'monthly' | 'yearly';
  couponCode?: string;
}

export interface InitiatePaymentResponse {
  paymentIntentId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
}

export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResponse> {
  logger.group('Initiate Payment');
  logger.info('Initiating payment', input);
  const plan = getPlanDefinition(input.planId);
  if (!plan) {
    logger.end();
    throw new Error('Plan bulunamadı');
  }

  if (input.billingInterval && plan.billingInterval !== input.billingInterval) {
    logger.warn('Billing interval mismatch, overriding with plan interval', {
      requested: input.billingInterval,
      planInterval: plan.billingInterval
    });
  }

  // Basit kupon uygulaması (örnek)
  let finalAmount = plan.amount;
  if (input.couponCode && input.couponCode.toUpperCase() === 'WELCOME10') {
    finalAmount = Math.max(0, finalAmount * 0.9);
  }

  const providerSessionId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const paymentIntent = await createPaymentIntentRecord({
    userId: input.userId,
    planId: plan.id,
    amount: finalAmount,
    currency: plan.currency,
    status: 'initiated',
    providerSessionId
  });

  const checkoutBase = process.env.PAYMENT_CHECKOUT_BASE_URL || DEFAULT_CHECKOUT_BASE_URL;
  const checkoutUrl = `${checkoutBase}?session=${providerSessionId}&intent=${paymentIntent.id}`;

  logger.info('Payment intent created', { paymentIntentId: paymentIntent.id, checkoutUrl });
  logger.end();

  return {
    paymentIntentId: paymentIntent.id,
    checkoutUrl,
    amount: finalAmount,
    currency: plan.currency
  };
}

export interface PaymentWebhookPayload {
  type: 'payment.succeeded' | 'payment.failed';
  data: {
    paymentIntentId: string;
    userId: string;
    companyId?: string;
    planId: PlanId;
    amount: number;
    currency: string;
    providerSessionId?: string;
    providerSubscriptionId?: string;
    invoicePdfUrl?: string;
  };
}

function verifySignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('PAYMENT_WEBHOOK_SECRET tanımlı değil, webhook doğrulaması atlanıyor');
    return true;
  }
  if (!signatureHeader) {
    return false;
  }
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return hash === signatureHeader;
}

export async function handlePaymentWebhook(rawBody: Buffer, payload: PaymentWebhookPayload, signature?: string): Promise<void> {
  if (!verifySignature(rawBody, signature)) {
    throw new Error('Webhook imza doğrulaması başarısız');
  }

  logger.group('Payment Webhook');
  logger.info('Webhook event received', { type: payload.type, paymentIntentId: payload.data.paymentIntentId });

  if (payload.type === 'payment.succeeded') {
    await updatePaymentIntentStatus(payload.data.paymentIntentId, 'succeeded');
    
    // Token paketi ödemesi kontrolü
    const { getAdminDb } = await import('../utils/firestore.js');
    const db = await getAdminDb();
    if (db) {
      const paymentIntentDoc = await db.collection('payment_intents').doc(payload.data.paymentIntentId).get();
      const metadata = paymentIntentDoc.data()?.metadata;
      
      if (metadata?.type === 'token_pack') {
        // Token paketi ödemesi - token ekle
        const { addTokensToUser } = await import('./aiTokenPackService.js');
        const { FieldValue } = await import('firebase-admin/firestore');
        
        await addTokensToUser(
          payload.data.userId,
          metadata.provider,
          metadata.tokenAmount,
          payload.data.currency
        );
        
        // Ödeme kaydı oluştur
        await db.collection('token_pack_purchases').add({
          userId: payload.data.userId,
          packId: metadata.packId,
          provider: metadata.provider,
          tokenAmount: metadata.tokenAmount,
          price: payload.data.amount,
          currency: payload.data.currency,
          paymentIntentId: payload.data.paymentIntentId,
          status: 'completed',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        
        await recordAuditEvent({
          userId: payload.data.userId,
          type: 'token_pack_purchased',
          meta: {
            paymentIntentId: payload.data.paymentIntentId,
            packId: metadata.packId,
            provider: metadata.provider,
            tokenAmount: metadata.tokenAmount
          }
        });
        
        logger.info('Token pack purchase processed', { packId: metadata.packId, userId: payload.data.userId });
        logger.end();
        return;
      }
    }
    
    // Normal plan ödemesi
    const subscription = await upsertSubscription({
      userId: payload.data.userId,
      companyId: payload.data.companyId,
      planId: payload.data.planId,
      paymentProviderSubscriptionId: payload.data.providerSubscriptionId || payload.data.paymentIntentId,
      billingInterval: getPlanDefinition(payload.data.planId)?.billingInterval
    });
    await createInvoiceRecord({
      userId: payload.data.userId,
      companyId: payload.data.companyId,
      subscriptionId: subscription.id,
      amount: payload.data.amount,
      currency: payload.data.currency,
      status: 'paid',
      pdfUrl: payload.data.invoicePdfUrl
    });
    await recordAuditEvent({
      userId: payload.data.userId,
      type: 'payment_succeeded',
      meta: {
        paymentIntentId: payload.data.paymentIntentId,
        planId: payload.data.planId
      }
    });
    logger.info('Payment success processed');
  } else if (payload.type === 'payment.failed') {
    await updatePaymentIntentStatus(payload.data.paymentIntentId, 'failed');
    await recordAuditEvent({
      userId: payload.data.userId,
      type: 'payment_failed',
      meta: {
        paymentIntentId: payload.data.paymentIntentId,
        reason: 'provider_failed'
      }
    });
    logger.warn('Payment marked as failed', { paymentIntentId: payload.data.paymentIntentId });
  } else {
    logger.warn('Unhandled webhook event', payload.type);
  }

  logger.end();
}

