// Teklifbul Rule v1.0
import dayjs from 'dayjs';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getPlanDefinition, type PlanDefinition, type PlanId } from './planCatalog.js';

const SUBSCRIPTIONS_COLLECTION = 'subscriptions';
const INVOICES_COLLECTION = 'invoices';
const PAYMENT_PREFERENCES_COLLECTION = 'payment_preferences';
const PAYMENT_INTENTS_COLLECTION = 'payment_intents';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';

export interface SubscriptionRecord {
  id: string;
  userId: string;
  companyId?: string | null;
  planId: PlanId;
  planName: string;
  status: SubscriptionStatus;
  startedAt: Date;
  currentPeriodEnd: Date;
  billingInterval: 'monthly' | 'yearly';
  cancelAtPeriodEnd?: boolean;
  paymentProviderSubscriptionId?: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface InvoiceRecord {
  id: string;
  userId: string;
  companyId?: string;
  subscriptionId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  taxRate: number;
  status: 'paid' | 'unpaid' | 'refunded';
  pdfUrl?: string | null;
  createdAt: Date;
}

export interface InvoiceCreateInput {
  userId: string;
  companyId?: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'unpaid' | 'refunded';
  taxRate?: number;
  pdfUrl?: string;
}

export interface PaymentPreferenceRecord {
  id: string;
  userId: string;
  companyId?: string;
  paymentMethodType: string;
  payload: Record<string, any>;
  amount?: number;
  currency?: string;
  status: 'draft' | 'pending' | 'confirmed' | 'canceled';
  createdAt: Date;
  updatedAt: Date;
}

async function getDbOrThrow() {
  const db = await getAdminDb();
  if (!db) {
    // Teklifbul Rule v1.0 - Firebase Admin SDK credentials hatası için daha açıklayıcı mesaj
    const error = new Error('Firestore bağlantısı yapılamadı. Firebase Admin SDK credentials yapılandırılmamış. Lütfen .env dosyasına FIREBASE_SERVICE_ACCOUNT veya GOOGLE_APPLICATION_CREDENTIALS ekleyin.');
    logger.error('Firestore connection failed', error);
    throw error;
  }
  return db;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  return null;
}

export async function getActiveSubscription(userId: string): Promise<SubscriptionRecord | null> {
  const db = await getDbOrThrow();
  
  // Teklifbul Rule v1.0 - Index gerektirmeyen sorgu (orderBy olmadan)
  // Önce tüm aktif subscription'ları al, sonra memory'de sırala
  let snap;
  try {
    // Index gerektiren sorgu dene
    snap = await db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', 'in', ['active', 'trialing'])
      .orderBy('currentPeriodEnd', 'desc')
      .limit(1)
      .get();
  } catch (indexError: any) {
    // Index yoksa, index gerektirmeyen sorgu kullan
    logger.warn('Subscription index hatası, alternatif sorgu kullanılıyor', { error: indexError.message });
    const allSnap = await db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', 'in', ['active', 'trialing'])
      .get();
    
    // Memory'de sırala (en yeni expiresAt'a göre)
    const sortedDocs = allSnap.docs.sort((a, b) => {
      const aDate = toDate(a.data().currentPeriodEnd) || new Date(0);
      const bDate = toDate(b.data().currentPeriodEnd) || new Date(0);
      return bDate.getTime() - aDate.getTime(); // Descending
    });
    
    snap = {
      docs: sortedDocs.slice(0, 1),
      empty: sortedDocs.length === 0
    } as any;
  }

  if (snap.empty) {
    return null;
  }

  const doc = snap.docs[0];
  const data = doc.data();
  const record: SubscriptionRecord = {
    id: doc.id,
    userId: data.userId,
    companyId: data.companyId,
    planId: data.planId,
    planName: data.planName,
    status: data.status,
    startedAt: toDate(data.startedAt) || new Date(),
    currentPeriodEnd: toDate(data.currentPeriodEnd) || new Date(),
    billingInterval: data.billingInterval,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    paymentProviderSubscriptionId: data.paymentProviderSubscriptionId,
    updatedAt: toDate(data.updatedAt) || new Date(),
    createdAt: toDate(data.createdAt) || new Date()
  };
  return record;
}

export interface AccountSubscriptionSummary {
  plan: {
    planId: PlanId;
    planName: string;
    billingInterval: 'monthly' | 'yearly';
    isPremium: boolean;
    startedAt?: string | Date | null;
    expiresAt?: string | Date | null;
    cancelAtPeriodEnd?: boolean;
    amount: number;
    currency: string;
  };
  subscription: SubscriptionRecord | null;
  lastInvoice: InvoiceRecord | null;
}

export type BillingIntervalSummary = 'monthly' | 'yearly' | null;

export interface SubscriptionPlanSummaryPayload {
  isPremium: boolean;
  planId: string;
  planName: string;
  billingInterval: BillingIntervalSummary;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SanitizedInvoiceRecord extends Omit<InvoiceRecord, 'createdAt'> {
  createdAt: string | null;
}

export interface SubscriptionSummaryPayload {
  plan: SubscriptionPlanSummaryPayload;
  lastInvoice: SanitizedInvoiceRecord | null;
  ai?: {
    provider: 'gemini' | 'openai' | null;
    gemini_free_tokens?: number;
    gemini_extra_tokens?: number;
    openai_tokens?: number;
  };
  user?: {
    ai_provider?: 'gemini' | 'openai' | null;
  };
}

const PREMIUM_DEFAULT_PLAN_ID = 'premium_monthly';
const FREE_PLAN_NAME = 'Ücretsiz';

const defaultFreePlanSummary: SubscriptionSummaryPayload = {
  plan: {
    isPremium: false,
    planId: PREMIUM_DEFAULT_PLAN_ID,
    planName: FREE_PLAN_NAME,
    billingInterval: 'monthly',
    expiresAt: null,
    cancelAtPeriodEnd: false
  },
  lastInvoice: null
};

function cloneFreeSummary(): SubscriptionSummaryPayload {
  return {
    plan: { ...defaultFreePlanSummary.plan },
    lastInvoice: null
  };
}

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof (value as any)?.toDate === 'function') {
    const dateValue = (value as any).toDate();
    return dateValue instanceof Date ? dateValue.toISOString() : null;
  }
  return null;
};

const sanitizeInvoice = (invoice: InvoiceRecord | null | undefined): SanitizedInvoiceRecord | null => {
  if (!invoice) {
    return null;
  }

  const { createdAt, ...rest } = invoice;
  return {
    ...rest,
    createdAt: toIsoString(createdAt)
  };
};

const normalizeAccountSummary = (raw?: AccountSubscriptionSummary | null): SubscriptionSummaryPayload => {
  // Teklifbul Rule v1.0 - Single source of truth: preserve plan from getAccountSubscriptionSummary()
  // Rule B: normalizeAccountSummary must preserve plan that comes in
  if (!raw) {
    return cloneFreeSummary();
  }

  // Use raw.plan as the base, preserve whatever getAccountSubscriptionSummary() decided
  const plan = raw.plan || {
    planId: 'free' as PlanId,
    planName: 'Ücretsiz Plan',
    billingInterval: 'monthly' as const,
    isPremium: false,
    expiresAt: null,
    cancelAtPeriodEnd: false,
    amount: 0,
    currency: 'TRY'
  };
  
  // Normalize billingInterval type (monthly/yearly -> monthly/yearly/null)
  const billingInterval: BillingIntervalSummary =
    plan.billingInterval === 'yearly'
      ? 'yearly'
      : plan.billingInterval === 'monthly'
        ? 'monthly'
        : null;

  // Rule B: Preserve all plan fields from getAccountSubscriptionSummary() without overwriting
  // If raw.plan has planId "premium_monthly" and isPremium true, keep that as-is
  return {
    plan: {
      // Preserve isPremium exactly as computed by getAccountSubscriptionSummary()
      isPremium: plan.isPremium === true,
      // Preserve planId exactly as computed by getAccountSubscriptionSummary()
      planId: plan.planId,
      // Preserve planName exactly as computed by getAccountSubscriptionSummary()
      planName: plan.planName,
      // Normalize billingInterval type only
      billingInterval,
      // Convert expiresAt to ISO string, preserve null if not set
      expiresAt: toIsoString(plan.expiresAt) ?? null,
      // Preserve cancelAtPeriodEnd boolean
      cancelAtPeriodEnd: plan.cancelAtPeriodEnd === true
    },
    lastInvoice: sanitizeInvoice(raw.lastInvoice)
  };
};

export function createDefaultSubscriptionSummary(): SubscriptionSummaryPayload {
  return cloneFreeSummary();
}

export async function getSummaryForUser(userId: string): Promise<SubscriptionSummaryPayload | null> {
  try {
    const rawSummary = await getAccountSubscriptionSummary(userId);
    const summary = normalizeAccountSummary(rawSummary);
    
    // AI Provider bilgilerini ekle
    try {
      const db = await getAdminDb();
      if (db) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data() || {};
          const aiProvider = userData.ai_provider || null;
          const geminiFreeTokens = userData.gemini_free_tokens || 0;
          const geminiExtraTokens = userData.gemini_extra_tokens || 0;
          const openaiTokens = userData.openai_tokens || 0;

          summary.ai = {
            provider: aiProvider,
            gemini_free_tokens: geminiFreeTokens,
            gemini_extra_tokens: geminiExtraTokens,
            openai_tokens: openaiTokens
          };

          summary.user = {
            ai_provider: aiProvider
          };
        }
      }
    } catch (aiError: any) {
      logger.warn('AI provider bilgileri alınamadı', { error: aiError?.message });
      // AI bilgileri alınamazsa devam et, summary'i boş bırakma
    }
    
    // Log final plan that will go to the client
    logger?.info?.('getSummaryForUser.finalPlan', {
      userId,
      plan: summary.plan,
      aiProvider: summary.ai?.provider
    });
    
    return summary;
  } catch (error: any) {
    logger.error('getSummaryForUser failed', {
      userId,
      error: error?.message,
      stack: error?.stack
    });
    return null;
  }
}

/**
 * Teklifbul Rule v1.0 - Always returns a valid summary, never throws
 * Returns default free plan if any error occurs
 */
export async function getAccountSubscriptionSummary(userId: string): Promise<AccountSubscriptionSummary> {
  // Default free plan summary - used as fallback
  const defaultFreeSummary: AccountSubscriptionSummary = {
    plan: {
      planId: 'free',
      planName: 'Ücretsiz Plan',
      billingInterval: 'monthly',
      isPremium: false,
      startedAt: null,
      expiresAt: null,
      cancelAtPeriodEnd: false,
      amount: 0,
      currency: 'TRY'
    },
    subscription: null,
    lastInvoice: null
  };

  try {
    logger.group('Get Account Subscription Summary');
    logger.info('Fetching subscription summary', { userId });
    
    // Defensive check: userId must be provided
    if (!userId || typeof userId !== 'string') {
      logger.warn('Invalid userId provided', { userId });
      logger.end();
      return defaultFreeSummary;
    }

    // Teklifbul Rule v1.0 - Try to get database connection - if it fails, return default free plan
    let db;
    try {
      db = await getAdminDb();
      if (!db) {
        logger.warn('Database connection failed (null), returning default free plan', { userId });
        logger.end();
        return defaultFreeSummary;
      }
    } catch (dbError: any) {
      logger.warn('Database connection failed (exception), returning default free plan', { 
        error: dbError?.message || String(dbError),
        userId 
      });
      logger.end();
      // In dev environment, return default instead of crashing
      return defaultFreeSummary;
    }

    // Teklifbul Rule v1.0 - Paralel request'ler (performans optimizasyonu)
    // User, subscription ve invoice verilerini paralel çek
    const [userResult, subscriptionResult, invoiceResult] = await Promise.allSettled([
      db.collection('users').doc(userId).get().then(doc => ({ doc, data: doc.data() || {} })),
      getActiveSubscription(userId).catch(() => null),
      getLastInvoice(userId).catch(() => null)
    ]);

    // User data
    interface UserData {
      planId?: string;
      isPremium?: boolean | string | number;
      expiresAt?: string | Date;
      planName?: string;
      cancelAtPeriodEnd?: boolean;
      billingInterval?: 'monthly' | 'yearly';
      startedAt?: string | Date;
    }
    let userData: UserData = {};
    if (userResult.status === 'fulfilled') {
      userData = (userResult.value.data || {}) as UserData;
      logger.info('User data retrieved', { 
        hasPlanId: !!userData.planId, 
        isPremium: userData.isPremium,
        hasExpiresAt: !!userData.expiresAt 
      });
    } else {
      logger.warn('Failed to fetch user document, using empty userData', { 
        error: userResult.reason?.message,
        userId 
      });
    }
    
    // Subscription
    const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
    if (subscription) {
      logger.info('Active subscription check', { found: true, subscriptionId: subscription.id });
    } else if (subscriptionResult.status === 'rejected') {
      logger.warn('getActiveSubscription error (continuing)', { error: subscriptionResult.reason?.message });
    }
    
    // Last invoice
    const lastInvoice = invoiceResult.status === 'fulfilled' ? invoiceResult.value : null;
    if (lastInvoice) {
      logger.info('Last invoice check', { found: true });
    } else if (invoiceResult.status === 'rejected') {
      logger.warn('getLastInvoice error (continuing)', { error: invoiceResult.reason?.message });
    }

    // Teklifbul Rule v1.0 - DEBUG: Log raw data at the top of decision logic
    logger.group('Subscription Debug');
    logger.info('SUBSCRIPTION DEBUG START', {
      userData: {
        planId: userData?.planId,
        isPremium: userData?.isPremium,
        expiresAt: userData?.expiresAt
      },
      subscriptionDocExists: !!subscription,
      subscriptionRaw: subscription ? {
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        currentPeriodEndType: typeof subscription.currentPeriodEnd,
        currentPeriodEndIsDate: subscription.currentPeriodEnd instanceof Date
      } : null
    });

    // Teklifbul Rule v1.0 - Normalize userData.isPremium to boolean
    const normalizedUserIsPremium =
      userData.isPremium === true ||
      userData.isPremium === 'true' ||
      userData.isPremium === 1;

    // Prefer subscription.currentPeriodEnd for expiry, fallback to userData.expiresAt
    const expiresFromSubscription = subscription?.currentPeriodEnd
      ? toDate(subscription.currentPeriodEnd)
      : null;

    let expiresFromUser: Date | null = null;
    if (userData.expiresAt) {
      try {
        const d = new Date(userData.expiresAt as any);
        if (!isNaN(d.getTime())) {
          expiresFromUser = d;
        } else {
          logger?.warn?.('getAccountSubscriptionSummary: invalid user expiresAt', {
            userId,
            expiresAt: userData.expiresAt,
          });
        }
      } catch (e: any) {
        logger?.warn?.('getAccountSubscriptionSummary: failed to parse user expiresAt', {
          userId,
          error: e?.message,
          expiresAt: userData.expiresAt,
        });
      }
    }

    const expiresAtDate = expiresFromSubscription || expiresFromUser;
    const isExpired = !!expiresAtDate && expiresAtDate < new Date();

    // 1. Determine final planId
    const planIdFromUser = (userData.planId as PlanId) || 'free';
    const planIdFromSubscription = (subscription?.planId as PlanId) || null;

    const finalPlanId: PlanId =
      planIdFromSubscription ||
      planIdFromUser ||
      'free';

    // 2. Determine if we have a truly active subscription
    const hasActiveSubscription =
      !!subscription &&
      subscription.status === 'active' &&
      (!expiresFromSubscription || expiresFromSubscription >= new Date());

    // 3. Premium decision
    let hasValidPremium: boolean;

    if (hasActiveSubscription) {
      // If Firestore says there is an active subscription with a non-expired end date,
      // we trust that as the source of truth.
      hasValidPremium = finalPlanId !== 'free' && !isExpired;
    } else {
      // No active subscription found → fall back to userData flags.
      hasValidPremium =
        finalPlanId !== 'free' &&
        normalizedUserIsPremium &&
        !isExpired;
    }

    // Get plan definition - always fallback to 'free' if not found
    let planDefinition = getPlanDefinition(finalPlanId);
    if (!planDefinition) {
      logger.warn('Plan definition not found, using free plan', { planId: finalPlanId });
      planDefinition = getPlanDefinition('free');
    }
    
    // Final safety check - if still no plan definition, use hardcoded free plan
    if (!planDefinition) {
      logger.error('Free plan definition not found in catalog - this should never happen!');
      logger.end();
      return defaultFreeSummary;
    }

    // Detailed logging for debugging
    logger?.info?.('getAccountSubscriptionSummary.debug', {
      userId,
      userPlanId: userData.planId,
      userIsPremiumRaw: userData.isPremium,
      normalizedUserIsPremium,
      userExpiresAtRaw: userData.expiresAt,
      subscriptionExists: !!subscription,
      subscriptionStatus: subscription?.status,
      subscriptionPlanId: subscription?.planId,
      subscriptionCurrentPeriodEnd: subscription?.currentPeriodEnd
        ? (subscription.currentPeriodEnd instanceof Date
            ? subscription.currentPeriodEnd.toISOString()
            : typeof (subscription.currentPeriodEnd as any).toDate === 'function'
              ? (subscription.currentPeriodEnd as any).toDate().toISOString()
              : String(subscription.currentPeriodEnd))
        : null,
      expiresFromSubscription: expiresFromSubscription ? expiresFromSubscription.toISOString() : null,
      expiresFromUser: expiresFromUser ? expiresFromUser.toISOString() : null,
      expiresAtDate: expiresAtDate ? expiresAtDate.toISOString() : null,
      isExpired,
      hasActiveSubscription,
      finalPlanId,
      hasValidPremium,
    });

    // Construct the plan object accordingly
    const planIsPremium = hasValidPremium;
    const effectivePlanId: PlanId = planIsPremium ? finalPlanId : 'free';

    const planName =
      planIsPremium
        ? (subscription?.planName || (userData.planName as string) || planDefinition.name)
        : 'Ücretsiz Plan';

    const expiresAtIso = expiresAtDate ? expiresAtDate.toISOString() : null;

    const cancelAtPeriodEnd =
      !!(subscription?.cancelAtPeriodEnd || userData.cancelAtPeriodEnd);

    const billingInterval =
      (subscription?.billingInterval as 'monthly' | 'yearly') ||
      (userData.billingInterval as 'monthly' | 'yearly') ||
      planDefinition.billingInterval;

    // Build response with defensive null checks
    const response: AccountSubscriptionSummary = {
      plan: {
        planId: effectivePlanId,
        isPremium: planIsPremium,
        planName,
        expiresAt: expiresAtIso,
        cancelAtPeriodEnd,
        billingInterval,
        startedAt: subscription?.startedAt?.toISOString() || userData.startedAt || null,
        amount: planDefinition.amount,
        currency: planDefinition.currency
      },
      subscription: subscription || null,
      lastInvoice
    };

    // Teklifbul Rule v1.0 - DEBUG: Log final premium result before return
    logger.info('FINAL PREMIUM RESULT', {
      hasActiveSubscription,
      finalPlanId,
      expiresAtIso,
      hasValidPremium,
      planIsPremium,
      effectivePlanId,
      reason: hasActiveSubscription ? "subscription-based" :
              normalizedUserIsPremium ? "user-flag" : "default-free"
    });

    logger.info('Subscription summary created', { 
      isPremium: hasValidPremium, 
      planId: finalPlanId,
      planName: response.plan.planName 
    });
    logger.end();
    
    return response;
  } catch (error: any) {
    // Catch-all: any unexpected error returns default free plan
    logger.error('getAccountSubscriptionSummary unexpected error', { 
      error: error.message,
      stack: error.stack,
      userId 
    });
    logger.end();
    // Never throw - always return a valid summary
    return defaultFreeSummary;
  }
}

export async function getLastInvoice(userId: string): Promise<InvoiceRecord | null> {
  const db = await getDbOrThrow();
  
  // Teklifbul Rule v1.0 - Index gerektirmeyen sorgu
  let snap;
  try {
    // Index gerektiren sorgu dene
    snap = await db
      .collection(INVOICES_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
  } catch (indexError: any) {
    // Index yoksa, index gerektirmeyen sorgu kullan
    logger.warn('Invoice index hatası, alternatif sorgu kullanılıyor', { error: indexError.message });
    const allSnap = await db
      .collection(INVOICES_COLLECTION)
      .where('userId', '==', userId)
      .get();
    
    // Memory'de sırala (en yeni createdAt'e göre)
    const sortedDocs = allSnap.docs.sort((a, b) => {
      const aDate = toDate(a.data().createdAt) || new Date(0);
      const bDate = toDate(b.data().createdAt) || new Date(0);
      return bDate.getTime() - aDate.getTime(); // Descending
    });
    
    snap = {
      docs: sortedDocs.slice(0, 1),
      empty: sortedDocs.length === 0
    } as any;
  }

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    userId: data.userId,
    companyId: data.companyId,
    subscriptionId: data.subscriptionId,
    invoiceNumber: data.invoiceNumber,
    amount: data.amount,
    currency: data.currency,
    taxRate: data.taxRate,
    status: data.status,
    pdfUrl: data.pdfUrl,
    createdAt: toDate(data.createdAt) || new Date()
  };
}

export async function createInvoiceRecord(input: InvoiceCreateInput): Promise<InvoiceRecord> {
  const db = await getDbOrThrow();
  const now = new Date();
  const invoiceNumber = `INV-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Math.floor(
    Math.random() * 90000 + 10000
  )}`;
  const docRef = await db.collection(INVOICES_COLLECTION).add({
    userId: input.userId,
    companyId: input.companyId || null,
    subscriptionId: input.subscriptionId,
    invoiceNumber,
    amount: input.amount,
    currency: input.currency,
    taxRate: typeof input.taxRate === 'number' ? input.taxRate : 20,
    status: input.status,
    pdfUrl: input.pdfUrl || null,
    createdAt: now
  });
  const record: InvoiceRecord = {
    id: docRef.id,
    userId: input.userId,
    companyId: input.companyId,
    subscriptionId: input.subscriptionId,
    invoiceNumber,
    amount: input.amount,
    currency: input.currency,
    taxRate: typeof input.taxRate === 'number' ? input.taxRate : 20,
    status: input.status,
    pdfUrl: input.pdfUrl || null,
    createdAt: now
  };
  return record;
}

export interface SubscriptionUpsertPayload {
  userId: string;
  companyId?: string;
  planId: PlanId;
  paymentProviderSubscriptionId?: string;
  billingInterval?: 'monthly' | 'yearly';
  status?: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  startedAt?: Date;
  currentPeriodEnd?: Date;
}

export async function upsertSubscription(payload: SubscriptionUpsertPayload): Promise<SubscriptionRecord> {
  const db = await getDbOrThrow();
  const planDefinition = getPlanDefinition(payload.planId);
  if (!planDefinition) {
    throw new Error('Plan bulunamadı');
  }

  const startedAt = payload.startedAt || new Date();
  const currentPeriodEnd =
    payload.currentPeriodEnd ||
    dayjs(startedAt).add(planDefinition.intervalDays, 'day').toDate();

  const subscriptionsRef = db.collection(SUBSCRIPTIONS_COLLECTION);
  const existingSnap = await subscriptionsRef
    .where('userId', '==', payload.userId)
    .where('status', 'in', ['active', 'trialing'])
    .limit(1)
    .get();

  const data = {
    userId: payload.userId,
    companyId: payload.companyId || null,
    planId: planDefinition.id,
    planName: planDefinition.name,
    status: payload.status || 'active',
    startedAt,
    currentPeriodEnd,
    billingInterval: payload.billingInterval || planDefinition.billingInterval,
    cancelAtPeriodEnd: payload.cancelAtPeriodEnd || false,
    paymentProviderSubscriptionId: payload.paymentProviderSubscriptionId || null,
    updatedAt: new Date()
  };

  let docRef;
  if (!existingSnap.empty) {
    docRef = existingSnap.docs[0].ref;
    await docRef.set(data, { merge: true });
  } else {
    docRef = await subscriptionsRef.add({ ...data, createdAt: new Date() });
  }

  await updateUserPlanFields(payload.userId, {
    planId: planDefinition.id,
    planName: planDefinition.name,
    billingInterval: data.billingInterval,
    isPremium: data.status === 'active',
    startedAt: startedAt.toISOString(),
    expiresAt: currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    currentSubscriptionId: docRef.id
  });

  await recordAuditEvent({
    userId: payload.userId,
    type: 'subscription_updated',
    meta: {
      planId: planDefinition.id,
      status: data.status,
      startedAt: startedAt.toISOString(),
      currentPeriodEnd: currentPeriodEnd.toISOString()
    }
  });

  return {
    id: docRef.id,
    ...data,
    createdAt: existingSnap.empty ? startedAt : toDate(existingSnap.docs[0].data()?.createdAt) || startedAt
  };
}

export async function markUserAsFree(userId: string): Promise<void> {
  const freePlan = getPlanDefinition('free')!;
  await updateUserPlanFields(userId, {
    planId: 'free',
    planName: freePlan.name,
    billingInterval: freePlan.billingInterval,
    isPremium: false,
    startedAt: null,
    expiresAt: null,
    cancelAtPeriodEnd: false,
    currentSubscriptionId: null
  });
}

export async function cancelSubscriptionAtPeriodEnd(userId: string): Promise<void> {
  const db = await getDbOrThrow();
  const subscription = await getActiveSubscription(userId);
  if (!subscription) {
    throw new Error('Aktif abonelik bulunamadı');
  }

  await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscription.id).set(
    {
      cancelAtPeriodEnd: true,
      status: subscription.status,
      updatedAt: new Date()
    },
    { merge: true }
  );

  await updateUserPlanFields(userId, {
    cancelAtPeriodEnd: true
  });

  await recordAuditEvent({
    userId,
    type: 'subscription_cancel_scheduled',
    meta: {
      subscriptionId: subscription.id,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString()
    }
  });
}

export interface PaymentPreferenceInput {
  userId: string;
  companyId?: string;
  paymentMethodType: string;
  payload: Record<string, any>;
  amount?: number;
  currency?: string;
  status?: 'draft' | 'pending' | 'confirmed' | 'canceled';
}

export async function createPaymentPreference(input: PaymentPreferenceInput): Promise<PaymentPreferenceRecord> {
  try {
    const db = await getDbOrThrow();
    const now = new Date();
    const docRef = await db.collection(PAYMENT_PREFERENCES_COLLECTION).add({
      userId: input.userId,
      companyId: input.companyId || null,
      paymentMethodType: input.paymentMethodType,
      payload: input.payload,
      amount: input.amount || null,
      currency: input.currency || 'TRY',
      status: input.status || 'draft',
      createdAt: now,
      updatedAt: now
    });
    const record: PaymentPreferenceRecord = {
      id: docRef.id,
      ...input,
      amount: input.amount,
      currency: input.currency || 'TRY',
      status: input.status || 'draft',
      createdAt: now,
      updatedAt: now
    };
    return record;
  } catch (error: any) {
    // Teklifbul Rule v1.0 - Firebase Admin SDK credentials hatası için daha açıklayıcı mesaj
    if (error.message?.includes('default credentials') || error.message?.includes('credentials')) {
      logger.error('Firebase Admin SDK credentials not configured', error);
      throw new Error('Firebase Admin SDK yapılandırması eksik. Lütfen .env dosyasına FIREBASE_SERVICE_ACCOUNT veya GOOGLE_APPLICATION_CREDENTIALS ekleyin.');
    }
    throw error;
  }
}

export interface PaymentPreferenceListOptions {
  userId: string;
  page?: number;
  pageSize?: number;
}

export async function listPaymentPreferences(options: PaymentPreferenceListOptions): Promise<PaymentPreferenceRecord[]> {
  try {
    const db = await getDbOrThrow();
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const offset = (page - 1) * pageSize;
    const query = db
      .collection(PAYMENT_PREFERENCES_COLLECTION)
      .where('userId', '==', options.userId)
      .orderBy('createdAt', 'desc')
      .offset(offset)
      .limit(pageSize);

    const snap = await query.get();
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        companyId: data.companyId,
        paymentMethodType: data.paymentMethodType,
        payload: data.payload || {},
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date()
      };
    });
  } catch (error: any) {
    // Teklifbul Rule v1.0 - Firebase Admin SDK credentials hatası için daha açıklayıcı mesaj
    if (error.message?.includes('default credentials') || error.message?.includes('credentials')) {
      logger.error('Firebase Admin SDK credentials not configured', error);
      throw new Error('Firebase Admin SDK yapılandırması eksik. Lütfen .env dosyasına FIREBASE_SERVICE_ACCOUNT veya GOOGLE_APPLICATION_CREDENTIALS ekleyin.');
    }
    throw error;
  }
}

export interface PaymentIntentRecord {
  id: string;
  userId: string;
  planId: PlanId;
  amount: number;
  currency: string;
  status: 'initiated' | 'succeeded' | 'failed' | 'canceled';
  providerSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionListOptions {
  status?: SubscriptionStatus | 'all';
  planId?: PlanId | 'all';
  limit?: number;
}

export interface UpcomingRenewalOptions {
  days?: number;
}

export async function createPaymentIntentRecord(data: Omit<PaymentIntentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentIntentRecord> {
  const db = await getDbOrThrow();
  const now = new Date();
  const docRef = await db.collection(PAYMENT_INTENTS_COLLECTION).add({
    ...data,
    createdAt: now,
    updatedAt: now
  });
  return {
    ...data,
    id: docRef.id,
    createdAt: now,
    updatedAt: now
  };
}

export async function updatePaymentIntentStatus(id: string, status: PaymentIntentRecord['status']): Promise<void> {
  const db = await getDbOrThrow();
  await db.collection(PAYMENT_INTENTS_COLLECTION).doc(id).set(
    {
      status,
      updatedAt: new Date()
    },
    { merge: true }
  );
}

export async function listSubscriptions(options: SubscriptionListOptions = {}): Promise<SubscriptionRecord[]> {
  try {
    // Teklifbul Rule v1.0 - Firebase bağlantısı kontrolü
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore bağlantısı yok, boş liste döndürülüyor');
      return [];
    }
    
    const limit = Math.min(200, Math.max(10, options.limit || 50));
    let queryRef: FirebaseFirestore.Query = db.collection(SUBSCRIPTIONS_COLLECTION);
    if (options.status && options.status !== 'all') {
      queryRef = queryRef.where('status', '==', options.status);
    }
    if (options.planId && options.planId !== 'all') {
      queryRef = queryRef.where('planId', '==', options.planId);
    }
    queryRef = queryRef.orderBy('updatedAt', 'desc').limit(limit);
    const snap = await queryRef.get();
  const subscriptions = snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      companyId: data.companyId,
      planId: data.planId,
      planName: data.planName,
      status: data.status,
      startedAt: toDate(data.startedAt) || new Date(),
      currentPeriodEnd: toDate(data.currentPeriodEnd) || new Date(),
      billingInterval: data.billingInterval,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
      paymentProviderSubscriptionId: data.paymentProviderSubscriptionId,
      updatedAt: toDate(data.updatedAt) || new Date(),
      createdAt: toDate(data.createdAt) || new Date()
    };
  });

  // Kullanıcı email bilgilerini toplu olarak al (performans için)
  const userIds = [...new Set(subscriptions.map(s => s.userId))];
  const userEmailsMap = new Map<string, string>();
  
  if (userIds.length > 0) {
    try {
      // Batch olarak kullanıcı bilgilerini al
      const userPromises = userIds.slice(0, 10).map(async (userId) => {
        try {
          const userDoc = await db.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            const email = userData?.email || userData?.contactEmails?.[0] || '';
            if (email) {
              userEmailsMap.set(userId, email);
            }
          }
        } catch (error) {
          // Sessizce devam et
        }
      });
      
      await Promise.all(userPromises);
    } catch (error) {
      logger.warn('Kullanıcı email bilgileri alınamadı', { error });
    }
  }

    // Email bilgilerini ekle
    return subscriptions.map(sub => ({
      ...sub,
      email: userEmailsMap.get(sub.userId) || ''
    }));
  } catch (error: any) {
    logger.error('listSubscriptions error', { error: error?.message || String(error) });
    // Teklifbul Rule v1.0 - Hata durumunda boş liste döndür
    return [];
  }
}

export async function listUpcomingRenewals(options: UpcomingRenewalOptions = {}): Promise<SubscriptionRecord[]> {
  try {
    // Teklifbul Rule v1.0 - Firebase bağlantısı kontrolü
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore bağlantısı yok, boş liste döndürülüyor');
      return [];
    }
    
    const days = Math.max(1, options.days || 7);
    const now = new Date();
    const endDate = dayjs(now).add(days, 'day').toDate();
    const queryRef = db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .where('status', 'in', ['active', 'trialing'])
      .where('currentPeriodEnd', '>=', now)
      .where('currentPeriodEnd', '<=', endDate)
      .orderBy('currentPeriodEnd', 'asc');
    const snap = await queryRef.get();
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        companyId: data.companyId,
        planId: data.planId,
        planName: data.planName,
        status: data.status,
        startedAt: toDate(data.startedAt) || new Date(),
        currentPeriodEnd: toDate(data.currentPeriodEnd) || new Date(),
        billingInterval: data.billingInterval,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
        paymentProviderSubscriptionId: data.paymentProviderSubscriptionId,
        updatedAt: toDate(data.updatedAt) || new Date(),
        createdAt: toDate(data.createdAt) || new Date()
      };
    });
  } catch (error: any) {
    logger.error('listUpcomingRenewals error', { error: error?.message || String(error) });
    // Teklifbul Rule v1.0 - Hata durumunda boş liste döndür
    return [];
  }
}

export async function listFailedPaymentIntents(limit = 50): Promise<PaymentIntentRecord[]> {
  try {
    // Teklifbul Rule v1.0 - Firebase bağlantısı kontrolü
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore bağlantısı yok, boş liste döndürülüyor');
      return [];
    }
    
    const snap = await db
      .collection(PAYMENT_INTENTS_COLLECTION)
      .where('status', '==', 'failed')
      .orderBy('updatedAt', 'desc')
      .limit(Math.min(200, Math.max(5, limit)))
      .get();
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        planId: data.planId,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        providerSessionId: data.providerSessionId,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date()
      };
    });
  } catch (error: any) {
    logger.error('listFailedPaymentIntents error', { error: error?.message || String(error) });
    // Teklifbul Rule v1.0 - Hata durumunda boş liste döndür
    return [];
  }
}

export interface AuditEvent {
  userId: string;
  adminId?: string;
  type:
    | 'subscription_created'
    | 'subscription_updated'
    | 'subscription_cancel_scheduled'
    | 'subscription_canceled'
    | 'payment_succeeded'
    | 'payment_failed'
    | 'plan_changed'
    | 'token_pack_purchased';
  meta?: Record<string, any>;
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  const db = await getDbOrThrow();
  await db.collection(AUDIT_LOGS_COLLECTION).add({
    ...event,
    meta: event.meta || {},
    createdAt: new Date()
  });
  logger.info('Audit event recorded', event);
}

interface UserPlanUpdate {
  planId?: PlanId;
  planName?: string;
  billingInterval?: 'monthly' | 'yearly';
  isPremium?: boolean;
  startedAt?: string | null;
  expiresAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentSubscriptionId?: string | null;
}

async function updateUserPlanFields(userId: string, update: UserPlanUpdate): Promise<void> {
  const db = await getDbOrThrow();
  const payload: Record<string, any> = {
    updatedAt: new Date()
  };
  if (typeof update.planId !== 'undefined') payload.planId = update.planId;
  if (typeof update.planName !== 'undefined') payload.planName = update.planName;
  if (typeof update.billingInterval !== 'undefined') payload.billingInterval = update.billingInterval;
  if (typeof update.isPremium !== 'undefined') payload.isPremium = update.isPremium;
  if (typeof update.startedAt !== 'undefined') payload.startedAt = update.startedAt;
  if (typeof update.expiresAt !== 'undefined') payload.expiresAt = update.expiresAt;
  if (typeof update.cancelAtPeriodEnd !== 'undefined') payload.cancelAtPeriodEnd = update.cancelAtPeriodEnd;
  if (typeof update.currentSubscriptionId !== 'undefined') payload.currentSubscriptionId = update.currentSubscriptionId;

  await db.collection('users').doc(userId).set(payload, { merge: true });
}

