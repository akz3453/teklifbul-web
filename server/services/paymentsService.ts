// Teklifbul Rule v1.0
import crypto from 'crypto';
import { logger } from '../../src/shared/log/logger.js';
import { getPlanDefinition, isPaidPremiumPlanId, type PlanId } from './planCatalog.js';
import {
  createInvoiceRecord,
  createPaymentIntentRecord,
  recordAuditEvent,
  upsertSubscription
} from './subscriptionService.js';

const DEFAULT_CHECKOUT_BASE_URL = 'https://pay.teklifbul-sandbox.local/checkout';

function isSandboxCheckoutUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('sandbox') || u.includes('localhost') || u.includes('127.0.0.1');
}

/** Production'da gerçek PSP URL yoksa ödeme başlatılmaz (sahte checkout yok). */
export function isLiveCheckoutConfigured(): boolean {
  const url = String(process.env.PAYMENT_CHECKOUT_BASE_URL || '').trim();
  if (!url) return false;
  if (isSandboxCheckoutUrl(url)) return false;
  return true;
}

export function resolveCheckoutBaseUrl(): string {
  const url = String(process.env.PAYMENT_CHECKOUT_BASE_URL || '').trim();
  const cloudProd = Boolean(process.env.K_SERVICE) && process.env.NODE_ENV !== 'test';
  if (process.env.NODE_ENV === 'production' || cloudProd) {
    if (!url || isSandboxCheckoutUrl(url)) {
      throw new Error('Kart ile ödeme henüz aktif değil');
    }
    return url;
  }
  if (url) return url;
  return DEFAULT_CHECKOUT_BASE_URL;
}

export function isMockPurchaseEnabled(): boolean {
  if (process.env.K_SERVICE && process.env.NODE_ENV !== 'test') return false;
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_AI_PURCHASES === 'true';
}

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
  if (!plan || !isPaidPremiumPlanId(plan.id)) {
    logger.end();
    throw new Error('Plan bulunamadı');
  }
  if ((process.env.NODE_ENV === 'production' || (process.env.K_SERVICE && process.env.NODE_ENV !== 'test')) && !isLiveCheckoutConfigured()) {
    logger.end();
    throw new Error('Kart ile ödeme henüz aktif değil');
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

  const providerSessionId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const paymentIntent = await createPaymentIntentRecord({
    userId: input.userId,
    planId: plan.id,
    amount: finalAmount,
    currency: plan.currency,
    status: 'initiated',
    providerSessionId
  });

  const checkoutBase = resolveCheckoutBaseUrl();
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
    // Teklifbul Rule v1.0 — Fail-closed: secret yoksa webhook kabul edilmez
    logger.error('PAYMENT_WEBHOOK_SECRET tanımlı değil — webhook reddedildi');
    return false;
  }
  if (!signatureHeader) {
    return false;
  }
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(hash, 'utf8');
    const b = Buffer.from(String(signatureHeader), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function amountsMatch(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) < 0.001;
}

/**
 * Intent'i atomik olarak succeeded işaretle; replay ve sahte intent yaratmayı engelle.
 * @returns intent data if first success; null if already processed
 */
async function claimSucceededIntent(paymentIntentId: string, payload: PaymentWebhookPayload['data']) {
  const { getAdminDb } = await import('../utils/firestore.js');
  const db = await getAdminDb();
  if (!db) throw new Error('db_unavailable');

  const intentRef = db.collection('payment_intents').doc(paymentIntentId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(intentRef);
    if (!snap.exists) {
      throw new Error('payment_intent_not_found');
    }
    const intent = snap.data() || {};
    const status = String(intent.status || '');

    if (status === 'succeeded') {
      return { alreadyProcessed: true as const, intent };
    }
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`payment_intent_terminal_status:${status}`);
    }

    if (intent.userId && payload.userId && String(intent.userId) !== String(payload.userId)) {
      throw new Error('payment_intent_user_mismatch');
    }
    if (intent.currency && payload.currency && String(intent.currency).toLowerCase() !== String(payload.currency).toLowerCase()) {
      throw new Error('payment_intent_currency_mismatch');
    }
    if (intent.amount != null && payload.amount != null && !amountsMatch(intent.amount, payload.amount)) {
      throw new Error('payment_intent_amount_mismatch');
    }
    if (intent.planId && payload.planId && String(intent.planId) !== String(payload.planId)) {
      const metaType = intent.metadata?.type;
      // Token pack intent'lerinde planId token_pack_* formatında olabilir
      if (metaType !== 'token_pack' && metaType !== 'company_ai_token_pack') {
        throw new Error('payment_intent_plan_mismatch');
      }
    }

    tx.update(intentRef, {
      status: 'succeeded',
      updatedAt: new Date(),
      webhookClaimedAt: new Date(),
    });

    return { alreadyProcessed: false as const, intent };
  });
}

export async function handlePaymentWebhook(rawBody: Buffer, payload: PaymentWebhookPayload, signature?: string): Promise<void> {
  if (!verifySignature(rawBody, signature)) {
    throw new Error('Webhook imza doğrulaması başarısız');
  }

  logger.group('Payment Webhook');
  logger.info('Webhook event received', { type: payload.type, paymentIntentId: payload.data.paymentIntentId });

  if (payload.type === 'payment.succeeded') {
    const claim = await claimSucceededIntent(payload.data.paymentIntentId, payload.data);
    if (claim.alreadyProcessed) {
      logger.info('Webhook replay ignored (already succeeded)', { paymentIntentId: payload.data.paymentIntentId });
      logger.end();
      return;
    }

    const intent = claim.intent;
    const metadata = intent.metadata || {};
    const trustedUserId = String(intent.userId || payload.data.userId || '');
    const trustedAmount = Number(intent.amount ?? payload.data.amount);
    const trustedCurrency = String(intent.currency || payload.data.currency || 'TRY');
    const trustedCompanyId = String(metadata.companyId || intent.companyId || payload.data.companyId || '');

    const { getAdminDb } = await import('../utils/firestore.js');
    const db = await getAdminDb();

    if (metadata?.type === 'company_ai_token_pack' && db) {
      const companyId = String(metadata.companyId || '');
      const providerKey = String(metadata.providerKey || metadata.provider || '');
      const tokenAmount = Number(metadata.tokenAmount || metadata.tokens || 0);
      const packageId = String(metadata.packId || metadata.packageId || '');

      if (!companyId || !providerKey || !tokenAmount) {
        logger.error('company_ai_token_pack metadata incomplete', { metadata });
        logger.end();
        throw new Error('company_ai_token_pack_metadata_invalid');
      }

      const { FieldValue } = await import('firebase-admin/firestore');
      const providerWalletRef = db.collection('companies').doc(companyId).collection('aiWallets').doc(providerKey);
      const purchaseRef = db.collection('companies').doc(companyId).collection('aiTokenPurchases').doc(`pi_${payload.data.paymentIntentId}`);
      const ledgerRef = db.collection('companies').doc(companyId).collection('aiTokenLedger').doc(`purchase_pi_${payload.data.paymentIntentId}`);

      await db.runTransaction(async (tx) => {
        const existingPurchase = await tx.get(purchaseRef);
        if (existingPurchase.exists) return;

        const walletSnap = await tx.get(providerWalletRef);
        const walletData = walletSnap.exists ? (walletSnap.data() || {}) : {};
        const currentBalance = Number(walletData.balanceTokens || 0);
        const newBalance = currentBalance + tokenAmount;

        tx.set(providerWalletRef, {
          provider: providerKey,
          balanceTokens: newBalance,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        tx.set(purchaseRef, {
          packageId,
          providerKey,
          status: 'paid',
          paymentIntentId: payload.data.paymentIntentId,
          createdAt: FieldValue.serverTimestamp(),
          paidAt: FieldValue.serverTimestamp(),
          createdBy: trustedUserId,
          walletBefore: { balanceTokens: currentBalance, providerKey },
          walletAfter: { balanceTokens: newBalance, providerKey },
          packageSnapshot: {
            id: packageId,
            tokens: tokenAmount,
            priceTRY: trustedAmount,
          },
        });

        tx.set(ledgerRef, {
          type: 'purchase',
          amountTokens: tokenAmount,
          reason: `purchase:${packageId}`,
          providerKey,
          meta: {
            packageId,
            priceTRY: trustedAmount,
            paymentProvider: 'webhook',
            paymentIntentId: payload.data.paymentIntentId,
            providerKey,
          },
          createdAt: FieldValue.serverTimestamp(),
          createdBy: trustedUserId,
        });
      });

      try {
        const { clearEntitlementCache } = await import('./aiEntitlementService.js');
        const { invalidateAvailableModelsCache } = await import('./purchaseAssistantAvailabilityService.js');
        clearEntitlementCache(companyId);
        invalidateAvailableModelsCache(companyId);
      } catch (cacheErr) {
        logger.warn('Post-purchase cache invalidate failed', cacheErr);
      }

      await recordAuditEvent({
        userId: trustedUserId,
        type: 'token_pack_purchased',
        meta: {
          paymentIntentId: payload.data.paymentIntentId,
          packId: packageId,
          provider: providerKey,
          tokenAmount,
          companyId,
        }
      });

      logger.info('Company AI token pack purchase processed', { packageId, companyId, userId: trustedUserId });
      logger.end();
      return;
    }

    if (metadata?.type === 'token_pack' && db) {
      const { FieldValue } = await import('firebase-admin/firestore');
      const purchaseDocId = `pi_${payload.data.paymentIntentId}`;
      const purchaseRef = db.collection('token_pack_purchases').doc(purchaseDocId);
      const packRef = db.collection('ai_token_packs').doc(`${trustedUserId}_${metadata.provider}`);
      const tokenAmount = Number(metadata.tokenAmount) || 0;

      const credited = await db.runTransaction(async (tx) => {
        const existing = await tx.get(purchaseRef);
        if (existing.exists) {
          return false;
        }
        const packSnap = await tx.get(packRef);
        const now = new Date();
        if (!packSnap.exists) {
          tx.set(packRef, {
            userId: trustedUserId,
            provider: metadata.provider,
            totalTokens: tokenAmount,
            usedTokens: 0,
            remainingTokens: tokenAmount,
            currency: trustedCurrency,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          const data = packSnap.data() || {};
          tx.update(packRef, {
            totalTokens: (data.totalTokens || 0) + tokenAmount,
            remainingTokens: (data.remainingTokens || 0) + tokenAmount,
            updatedAt: now,
          });
        }
        tx.set(purchaseRef, {
          userId: trustedUserId,
          packId: metadata.packId,
          provider: metadata.provider,
          tokenAmount,
          price: trustedAmount,
          currency: trustedCurrency,
          paymentIntentId: payload.data.paymentIntentId,
          status: 'completed',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (!credited) {
        logger.info('Token pack purchase already recorded', { paymentIntentId: payload.data.paymentIntentId });
        logger.end();
        return;
      }

      await recordAuditEvent({
        userId: trustedUserId,
        type: 'token_pack_purchased',
        meta: {
          paymentIntentId: payload.data.paymentIntentId,
          packId: metadata.packId,
          provider: metadata.provider,
          tokenAmount: metadata.tokenAmount
        }
      });

      logger.info('Token pack purchase processed', { packId: metadata.packId, userId: trustedUserId });
      logger.end();
      return;
    }

    // Normal plan ödemesi — intent alanlarına güven
    const planId = (intent.planId || payload.data.planId) as PlanId;
    const subscription = await upsertSubscription({
      userId: trustedUserId,
      companyId: trustedCompanyId || undefined,
      planId,
      paymentProviderSubscriptionId: payload.data.providerSubscriptionId || payload.data.paymentIntentId,
      billingInterval: getPlanDefinition(planId)?.billingInterval
    });
    await createInvoiceRecord({
      userId: trustedUserId,
      companyId: trustedCompanyId || undefined,
      subscriptionId: subscription.id,
      amount: trustedAmount,
      currency: trustedCurrency,
      status: 'paid',
      pdfUrl: payload.data.invoicePdfUrl
    });
    await recordAuditEvent({
      userId: trustedUserId,
      type: 'payment_succeeded',
      meta: {
        paymentIntentId: payload.data.paymentIntentId,
        planId
      }
    });
    logger.info('Payment success processed');
  } else if (payload.type === 'payment.failed') {
    const { getAdminDb } = await import('../utils/firestore.js');
    const db = await getAdminDb();
    if (!db) throw new Error('db_unavailable');
    const intentRef = db.collection('payment_intents').doc(payload.data.paymentIntentId);
    const snap = await intentRef.get();
    if (!snap.exists) {
      throw new Error('payment_intent_not_found');
    }
    const status = String(snap.data()?.status || '');
    if (status !== 'succeeded') {
      await intentRef.update({ status: 'failed', updatedAt: new Date() });
    }
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
