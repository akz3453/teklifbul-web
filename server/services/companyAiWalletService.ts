/**
 * Company AI Wallet Service
 * Teklifbul Rule v1.0 + v1.3 (Ledger Meta Enrichment) + v1.4.2 (FreeEligible Zero-Consume)
 * Teklifbul Rule v3.12 - Provider-aware wallets (multi-provider safe)
 *
 * Company-based token wallet + ledger (purchase/consume)
 * Provider-specific wallets: companies/{companyId}/aiWallets/{providerKey}
 * Legacy support: companies/{companyId}/wallets/aiTokens (fallback)
 *
 * TODO: add ledger retention/archival strategy
 */

import { createHash } from 'crypto';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import { AI_ERROR_CODES } from '../constants/aiMeta.js';

/**
 * Get provider key from provider string
 * Teklifbul Rule v3.12 - Normalize provider to wallet key
 */
function getProviderKey(provider: string): string {
  const normalized = String(provider || '').toLowerCase().trim();
  // Map common provider names to keys
  if (normalized === 'openai' || normalized.startsWith('openai')) return 'openai';
  if (normalized === 'gemini' || normalized.startsWith('gemini')) return 'gemini';
  if (normalized === 'free_local' || normalized === 'free') return 'free';
  // Default: use normalized provider as key
  return normalized || 'unknown';
}

/**
 * Check if legacy wallet universal mode is enabled
 * Teklifbul Rule v3.12 - Legacy wallet fallback behavior
 */
function isLegacyWalletUniversal(): boolean {
  const flag = process.env.TB_LEGACY_WALLET_UNIVERSAL;
  return flag === 'true' || flag === '1' || flag === undefined; // Default: true
}

/**
 * Get company AI wallet (provider-aware)
 * Teklifbul Rule v3.12 - Provider-specific wallets with legacy fallback
 * H-007: reservedTokens missing on old docs is treated as 0.
 *
 * @param companyId - Company ID
 * @param providerKey - Provider key (e.g., 'openai', 'gemini'). If not provided, uses legacy wallet.
 * @returns Wallet snapshot or null if DB unavailable
 */
export const AI_TOKEN_HOLD_STATUS = {
  RESERVED: 'reserved',
  CAPTURED: 'captured',
  RELEASED: 'released',
} as const;

export type AiTokenHoldStatus = typeof AI_TOKEN_HOLD_STATUS[keyof typeof AI_TOKEN_HOLD_STATUS];

export const AI_HOLD_PROVIDER_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  TIMEOUT: 'timeout',
} as const;

export type AiHoldProviderStatus = typeof AI_HOLD_PROVIDER_STATUS[keyof typeof AI_HOLD_PROVIDER_STATUS];

export const AI_HOLD_BILLING_STATUS = {
  RESERVED: 'reserved',
  CAPTURE_PENDING: 'capture_pending',
  CAPTURED: 'captured',
  RELEASED: 'released',
  NEEDS_RECONCILIATION: 'needs_reconciliation',
} as const;

export type AiHoldBillingStatus = typeof AI_HOLD_BILLING_STATUS[keyof typeof AI_HOLD_BILLING_STATUS];

export const DEFAULT_AI_HOLD_TTL_MS = 5 * 60 * 1000;
const MIN_AI_HOLD_TTL_MS = 60 * 1000;

export function getAiHoldTtlMs(): number {
  const parsed = Number.parseInt(String(process.env.AI_HOLD_TTL_MS || ''), 10);
  if (Number.isFinite(parsed) && parsed >= MIN_AI_HOLD_TTL_MS) return parsed;
  return DEFAULT_AI_HOLD_TTL_MS;
}

export function isHoldProviderSuccessPendingCapture(hold: Record<string, unknown> | undefined | null): boolean {
  if (!hold) return false;
  const status = String(hold.status || '');
  if (status !== AI_TOKEN_HOLD_STATUS.RESERVED) return false;
  const billingStatus = String(hold.billingStatus || '');
  const providerStatus = String(hold.providerStatus || '');
  return (
    billingStatus === AI_HOLD_BILLING_STATUS.CAPTURE_PENDING ||
    providerStatus === AI_HOLD_PROVIDER_STATUS.SUCCESS
  );
}

export type CompanyWalletSnapshot = {
  balanceTokens: number;
  reservedTokens: number;
  availableTokens: number;
  providerKey?: string;
};

export type ReserveCompanyTokensResult = {
  holdId: string;
  requestId: string;
  providerKey: string;
  estimatedTokens: number;
  replay: boolean;
  status: AiTokenHoldStatus;
  wallet: CompanyWalletSnapshot;
  providerStatus?: string;
  billingStatus?: string;
  actualTokens?: number;
};

export type CaptureCompanyTokensResult = {
  holdId: string;
  requestId: string;
  providerKey: string;
  status: AiTokenHoldStatus;
  estimatedTokens: number;
  actualTokens: number;
  wallet: CompanyWalletSnapshot;
  applied: boolean;
};

export type ReleaseCompanyTokensResult = {
  holdId: string;
  requestId: string;
  providerKey: string;
  status: AiTokenHoldStatus;
  estimatedTokens: number;
  wallet: CompanyWalletSnapshot;
  applied: boolean;
};

export function buildAiTokenHoldId(requestId: string): string {
  return createHash('sha256').update(String(requestId), 'utf8').digest('hex');
}

export function readWalletTokenFields(data: Record<string, unknown> | undefined | null): {
  balanceTokens: number;
  reservedTokens: number;
} {
  const balanceTokens = Math.max(0, Number(data?.balanceTokens || 0));
  const reservedTokens = Math.max(0, Number(data?.reservedTokens || 0));
  return { balanceTokens, reservedTokens };
}

export function availableWalletTokens(balanceTokens: number, reservedTokens: number): number {
  return Math.max(0, balanceTokens - reservedTokens);
}

export function toWalletSnapshot(
  balanceTokens: number,
  reservedTokens: number,
  providerKey?: string
): CompanyWalletSnapshot {
  return {
    balanceTokens,
    reservedTokens,
    availableTokens: availableWalletTokens(balanceTokens, reservedTokens),
    providerKey,
  };
}

export function assertWalletInvariants(balanceTokens: number, reservedTokens: number): void {
  if (!(balanceTokens >= 0) || !(reservedTokens >= 0) || !(balanceTokens >= reservedTokens)) {
    const error: any = new Error('WALLET_INVARIANT_VIOLATION');
    error.code = 'WALLET_INVARIANT_VIOLATION';
    error.balanceTokens = balanceTokens;
    error.reservedTokens = reservedTokens;
    throw error;
  }
}

function utcTodayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function makeInsufficientError(providerKey: string, resolvedProvider: string) {
  const error: any = new Error(`Yeterli token bulunmamaktadır (${providerKey} wallet)`);
  error.code = AI_ERROR_CODES.INSUFFICIENT_TOKENS;
  error.providerKey = providerKey;
  error.resolvedProvider = resolvedProvider;
  return error;
}

export async function getCompanyAiWallet(
  companyId: string,
  providerKey?: string
): Promise<CompanyWalletSnapshot | null> {
  const db = await getAdminDb();
  if (!db) return null;

  // If providerKey provided, use provider-specific wallet
  if (providerKey) {
    const ref = db.collection('companies').doc(companyId).collection('aiWallets').doc(providerKey);
    const snap = await ref.get();
    if (snap.exists) {
      const fields = readWalletTokenFields(snap.data() || {});
      return toWalletSnapshot(fields.balanceTokens, fields.reservedTokens, providerKey);
    }
    // Provider wallet missing => return 0 balance
    return toWalletSnapshot(0, 0, providerKey);
  }

  // Legacy: check old wallet location
  const legacyRef = db.collection('companies').doc(companyId).collection('wallets').doc('aiTokens');
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) {
    const fields = readWalletTokenFields(legacySnap.data() || {});
    logger.warn('[Wallet] Using legacy wallet (no providerKey)', { companyId });
    return toWalletSnapshot(fields.balanceTokens, fields.reservedTokens);
  }

  // No wallet found => return 0
  return toWalletSnapshot(0, 0);
}

/**
 * Consume tokens from company wallet atomically, writes ledger entry.
 * Teklifbul Rule v1.4.2 - If freeEligible=true, wallet balance unchanged, ledger amountTokens=0.
 * Teklifbul Rule v3.12 - Provider-aware consumption (consumes from provider-specific wallet)
 */
export async function consumeCompanyTokensTransactional(params: {
  companyId: string;
  usedTokens: number;
  provider: string;
  model?: string | null;
  userId: string;
  reason: string;
  freeEligible?: boolean; // Teklifbul Rule v1.4.2 - Zero-consume policy
  meta?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    route?: string;
    requestId?: string;
    demandId?: string;
    resolvedProvider?: string; // Teklifbul Rule v3.12 - Resolved provider for wallet lookup
    resolvedModel?: string; // Teklifbul Rule v3.12 - Resolved model
    [key: string]: any;
  };
}): Promise<{ balanceTokens: number; providerKey?: string }> {
  const { companyId, usedTokens, provider, model, userId, reason, freeEligible, meta } = params;
  if (!companyId) throw new Error('companyId missing');
  
  // Teklifbul Rule v3.12 - Determine provider key for wallet lookup
  const resolvedProvider = meta?.resolvedProvider || provider;
  const providerKey = getProviderKey(resolvedProvider);
  
  // Teklifbul Rule v1.4.2 - FreeEligible models: zero consume
  if (freeEligible === true) {
    // Wallet balance unchanged, but write ledger entry with amountTokens=0
    const db = await getAdminDb();
    if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');
    
    // Teklifbul Rule v3.12 - For free models, still track provider but no wallet consumption
    const ledgerRef = db.collection('companies').doc(companyId).collection('aiTokenLedger').doc();
    const nowMs = Date.now();
    
    // Get current balance from provider wallet (for return value, but don't modify)
    const walletInfo = await getCompanyAiWallet(companyId, providerKey);
    const currentBalance = walletInfo?.balanceTokens || 0;
    
    // Write ledger entry with amountTokens=0
    const enrichedMeta: any = {
      provider: resolvedProvider,
      model: meta?.resolvedModel || model || null,
      providerKey, // Teklifbul Rule v3.12
      totalTokens: usedTokens, // Actual tokens used (for tracking)
      promptTokens: meta?.promptTokens || null,
      completionTokens: meta?.completionTokens || null,
      route: meta?.route || null,
      requestId: meta?.requestId || null,
      userId: userId,
      demandId: meta?.demandId || null,
      freeEligible: true, // Teklifbul Rule v1.4.2
    };
    if (meta) {
      Object.keys(meta).forEach(key => {
        if (!['promptTokens', 'completionTokens', 'totalTokens', 'route', 'requestId', 'demandId'].includes(key)) {
          enrichedMeta[key] = meta[key];
        }
      });
    }
    
    await ledgerRef.set({
      type: 'consume',
      amountTokens: 0, // Teklifbul Rule v1.4.2 - Zero consume for freeEligible
      reason,
      meta: enrichedMeta,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: nowMs,
      createdBy: userId,
    });
    
    logger.info('company freeEligible model used (zero consume)', { companyId, provider: resolvedProvider, providerKey, model, usedTokens, balanceTokens: currentBalance });
    return { balanceTokens: currentBalance, providerKey };
  }
  
  // Normal token consume for paid models
  if (!usedTokens || usedTokens <= 0) throw new Error('Geçersiz token miktarı');

  const db = await getAdminDb();
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');

  // Teklifbul Rule v2.7.2 + v3.0 - Daily paid token cap check (using counter doc)
  const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;

  // Teklifbul Rule v3.0 - Generate today key (YYYY-MM-DD UTC)
  const now = new Date();
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const counterRef = db.collection('companies').doc(companyId).collection('aiDailyCounters').doc(todayKey);

  // Teklifbul Rule v3.12 - Use provider-specific wallet
  const providerWalletRef = db.collection('companies').doc(companyId).collection('aiWallets').doc(providerKey);
  const legacyWalletRef = db.collection('companies').doc(companyId).collection('wallets').doc('aiTokens');
  const ledgerRef = db.collection('companies').doc(companyId).collection('aiTokenLedger').doc();
  const nowMs = Date.now();

  logger.group('companyAiWallet:consume');
  try {
    const result = await db.runTransaction(async (tx: any) => {
      // Teklifbul Rule v3.0 - Read counter doc (O(1) check)
      let usedTodayPaid = 0;
      if (dailyPaidTokenCap !== null && dailyPaidTokenCap >= 0) {
        try {
          const counterSnap = await tx.get(counterRef);
          if (counterSnap.exists) {
            const counterData = counterSnap.data() || {};
            usedTodayPaid = Number(counterData.paidUsedTokens || 0);
          }
          // Counter doc yoksa 0 kabul et (backfill yok)

          // Check if adding this consumption would exceed cap
          if (usedTodayPaid + usedTokens > dailyPaidTokenCap) {
            const error: any = new Error('Günlük ücretli token kotası doldu');
            error.code = 'DAILY_CAP_REACHED';
            error.cap = dailyPaidTokenCap;
            error.used = usedTodayPaid;
            throw error;
          }

          // Update counter (increment paidUsedTokens)
          const newPaidUsed = usedTodayPaid + usedTokens;
          tx.set(
            counterRef,
            {
              date: todayKey,
              paidUsedTokens: newPaidUsed,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (counterError: any) {
          // Teklifbul Rule v3.0 - FAIL CLOSED: if counter check fails, reject request
          if (counterError.code === 'DAILY_CAP_REACHED') {
            throw counterError; // Re-throw cap reached error
          }
          logger.warn('Daily cap counter check failed, rejecting request (FAIL CLOSED)', {
            companyId,
            todayKey,
            error: counterError,
          });
          const error: any = new Error('Günlük kota kontrolü yapılamadı, daha sonra tekrar deneyin.');
          error.code = 'DAILY_CAP_CHECK_FAILED';
          throw error;
        }
      }

      // Teklifbul Rule v3.12 - Wallet balance check and update (provider-specific)
      // Try provider wallet first, then legacy if enabled
      const walletSnap = await tx.get(providerWalletRef);
      const walletData = walletSnap.exists ? (walletSnap.data() || {}) : {};
      let { balanceTokens: currentBalance, reservedTokens: currentReserved } = readWalletTokenFields(walletData);
      let usingLegacy = false;

      // If provider wallet missing or zero, check legacy wallet (if universal mode enabled)
      if (currentBalance === 0 && isLegacyWalletUniversal()) {
        const legacySnap = await tx.get(legacyWalletRef);
        if (legacySnap.exists) {
          const legacyData = legacySnap.data() || {};
          const legacyFields = readWalletTokenFields(legacyData);
          if (legacyFields.balanceTokens > 0) {
            logger.warn('[Wallet] Using legacy wallet for provider consumption', { companyId, providerKey, legacyBalance: legacyFields.balanceTokens });
            currentBalance = legacyFields.balanceTokens;
            currentReserved = legacyFields.reservedTokens;
            usingLegacy = true;
          }
        }
      }

      const availableTokens = availableWalletTokens(currentBalance, currentReserved);
      if (availableTokens < usedTokens) {
        throw makeInsufficientError(providerKey, resolvedProvider);
      }
      const newBalance = currentBalance - usedTokens;
      assertWalletInvariants(newBalance, currentReserved);

      // Update the appropriate wallet
      if (usingLegacy) {
        tx.set(
          legacyWalletRef,
          {
            balanceTokens: newBalance,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        tx.set(
          providerWalletRef,
          {
            provider: providerKey,
            balanceTokens: newBalance,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Teklifbul Rule v1.3 + v3.12 - Enriched ledger meta
      const enrichedMeta: any = {
        provider: resolvedProvider,
        model: meta?.resolvedModel || model || null,
        providerKey, // Teklifbul Rule v3.12
        totalTokens: meta?.totalTokens || usedTokens,
        promptTokens: meta?.promptTokens || null,
        completionTokens: meta?.completionTokens || null,
        route: meta?.route || null,
        requestId: meta?.requestId || null,
        userId: userId,
        demandId: meta?.demandId || null,
      };
      // Merge any additional meta fields
      if (meta) {
        Object.keys(meta).forEach(key => {
          if (!['promptTokens', 'completionTokens', 'totalTokens', 'route', 'requestId', 'demandId'].includes(key)) {
            enrichedMeta[key] = meta[key];
          }
        });
      }

      // Teklifbul Rule v3.18 - Compute cost metadata (best-effort, non-blocking)
      // Compute cost outside transaction to avoid blocking, but include in ledger entry
      let costMeta: any = null;
      try {
        const { computeLedgerCostMeta } = await import('./aiCostAccountingService.js');
        const actualModel = meta?.resolvedModel || model || null;
        if (actualModel && resolvedProvider && resolvedProvider !== 'free_local') {
          // Only compute cost for paid models
          costMeta = await computeLedgerCostMeta({
            providerKey,
            provider: resolvedProvider,
            model: actualModel,
            tokensPaid: usedTokens,
            promptTokens: Number(meta?.promptTokens || 0),
            completionTokens: Number(meta?.completionTokens || 0),
            db,
          });
          // Add cost metadata to enrichedMeta
          if (costMeta) {
            enrichedMeta.costPer1kTokensUsd = costMeta.costPer1kTokensUsd;
            enrichedMeta.costUsd = costMeta.costUsd;
            enrichedMeta.costTry = costMeta.costTry;
            enrichedMeta.usdTryRateUsed = costMeta.usdTryRateUsed;
            enrichedMeta.costComputedAt = costMeta.costComputedAt;
            enrichedMeta.costVersion = costMeta.costVersion;
          }
        }
      } catch (costErr: any) {
        // Teklifbul Rule v3.18 - Fail-soft: cost computation failure doesn't break ledger write
        logger.warn('[Wallet] Cost computation failed (non-blocking)', {
          companyId,
          provider: resolvedProvider,
          model: meta?.resolvedModel || model,
          error: costErr?.message || costErr,
        });
        // Still include costVersion to indicate we tried
        enrichedMeta.costVersion = 'v3.18';
      }

      tx.set(ledgerRef, {
        type: 'consume',
        amountTokens: -Math.abs(usedTokens),
        reason,
        meta: enrichedMeta,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: nowMs,
        createdBy: userId,
      });

      return { balanceTokens: newBalance, providerKey };
    });

    logger.info('company tokens consumed', { companyId, usedTokens, provider: resolvedProvider, providerKey, model, balanceTokens: result.balanceTokens });
    logger.end();
    return result;
  } catch (e) {
    logger.error('company token consume failed', e);
    logger.end();
    throw e;
  }
}

async function resolveWalletInTx(
  tx: FirebaseFirestore.Transaction,
  providerWalletRef: FirebaseFirestore.DocumentReference,
  legacyWalletRef: FirebaseFirestore.DocumentReference
): Promise<{
  balanceTokens: number;
  reservedTokens: number;
  ref: FirebaseFirestore.DocumentReference;
  source: 'provider' | 'legacy';
}> {
  const walletSnap = await tx.get(providerWalletRef);
  const providerFields = readWalletTokenFields(walletSnap.exists ? walletSnap.data() || {} : {});
  if (providerFields.balanceTokens > 0 || !isLegacyWalletUniversal()) {
    return {
      ...providerFields,
      ref: providerWalletRef,
      source: 'provider',
    };
  }

  const legacySnap = await tx.get(legacyWalletRef);
  if (legacySnap.exists) {
    const legacyFields = readWalletTokenFields(legacySnap.data() || {});
    if (legacyFields.balanceTokens > 0) {
      return {
        ...legacyFields,
        ref: legacyWalletRef,
        source: 'legacy',
      };
    }
  }

  return {
    ...providerFields,
    ref: providerWalletRef,
    source: 'provider',
  };
}

function dailyCapNextOrThrow(params: {
  usedTodayPaid: number;
  dailyPaidTokenCap: number | null;
  delta: number;
  failIfExceed: boolean;
}): number | null {
  if (params.dailyPaidTokenCap === null || params.dailyPaidTokenCap < 0) {
    return null;
  }
  if (params.failIfExceed && params.delta > 0 && params.usedTodayPaid + params.delta > params.dailyPaidTokenCap) {
    const error: any = new Error('Günlük ücretli token kotası doldu');
    error.code = AI_ERROR_CODES.DAILY_CAP_REACHED;
    error.cap = params.dailyPaidTokenCap;
    error.used = params.usedTodayPaid;
    throw error;
  }
  return Math.max(0, params.usedTodayPaid + params.delta);
}

function writeDailyCounterInTx(
  tx: FirebaseFirestore.Transaction,
  counterRef: FirebaseFirestore.DocumentReference,
  todayKey: string,
  paidUsedTokens: number
) {
  tx.set(
    counterRef,
    {
      date: todayKey,
      paidUsedTokens,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function readPaidUsedToday(
  tx: FirebaseFirestore.Transaction,
  counterRef: FirebaseFirestore.DocumentReference
): Promise<number> {
  const counterSnap = await tx.get(counterRef);
  if (!counterSnap.exists) return 0;
  return Number((counterSnap.data() || {}).paidUsedTokens || 0);
}

function writeWalletInTx(
  tx: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
  source: 'provider' | 'legacy',
  providerKey: string,
  balanceTokens: number,
  reservedTokens: number
) {
  assertWalletInvariants(balanceTokens, reservedTokens);
  const payload: Record<string, unknown> = {
    balanceTokens,
    reservedTokens,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (source === 'provider') {
    payload.provider = providerKey;
  }
  tx.set(ref, payload, { merge: true });
}

/**
 * Atomically reserve estimated paid tokens before a provider call.
 * Teklifbul Rule v1.0 — H-007
 *
 * Idempotent on companies/{companyId}/aiTokenHolds/{sha256(requestId)}.
 */
export async function reserveCompanyTokensTransactional(params: {
  companyId: string;
  userId: string;
  provider: string;
  model?: string | null;
  requestId: string;
  estimatedTokens: number;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<ReserveCompanyTokensResult> {
  const { companyId, userId, provider, requestId } = params;
  const estimatedTokens = Math.floor(Number(params.estimatedTokens || 0));
  if (!companyId) throw new Error('companyId missing');
  if (!requestId) throw new Error('requestId missing');
  if (!estimatedTokens || estimatedTokens <= 0) throw new Error('Geçersiz token miktarı');

  const resolvedProvider = String(params.meta?.resolvedProvider || provider);
  const providerKey = getProviderKey(resolvedProvider);
  const holdId = buildAiTokenHoldId(requestId);

  const db = await getAdminDb();
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');

  const companyRef = db.collection('companies').doc(companyId);
  const providerWalletRef = companyRef.collection('aiWallets').doc(providerKey);
  const legacyWalletRef = companyRef.collection('wallets').doc('aiTokens');
  const holdRef = companyRef.collection('aiTokenHolds').doc(holdId);
  const settingsRef = companyRef.collection('settings').doc('purchaseAssistant');
  const todayKey = utcTodayKey();
  const counterRef = companyRef.collection('aiDailyCounters').doc(todayKey);

  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;

  logger.group('companyAiWallet:reserve');
  logger.info('reserve start', {
    companyId,
    requestId,
    provider: resolvedProvider,
    estimatedTokens,
  });

  try {
    const result = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const holdSnap = await tx.get(holdRef);
      const wallet = await resolveWalletInTx(tx, providerWalletRef, legacyWalletRef);
      const usedTodayPaid = await readPaidUsedToday(tx, counterRef);

      if (holdSnap.exists) {
        const hold = holdSnap.data() || {};
        const status = String(hold.status || '') as AiTokenHoldStatus;
        logger.info('reserve replay', {
          companyId,
          requestId,
          provider: resolvedProvider,
          estimatedTokens: Number(hold.estimatedTokens || estimatedTokens),
          holdStatus: status,
        });
        return {
          holdId,
          requestId,
          providerKey,
          estimatedTokens: Number(hold.estimatedTokens || estimatedTokens),
          replay: true,
          status,
          wallet: toWalletSnapshot(wallet.balanceTokens, wallet.reservedTokens, providerKey),
          providerStatus: hold.providerStatus ? String(hold.providerStatus) : undefined,
          billingStatus: hold.billingStatus ? String(hold.billingStatus) : undefined,
          actualTokens: Number(hold.actualTokens || 0) || undefined,
        } as ReserveCompanyTokensResult;
      }

      const nextPaidUsed = dailyCapNextOrThrow({
        usedTodayPaid,
        dailyPaidTokenCap,
        delta: estimatedTokens,
        failIfExceed: true,
      });

      const available = availableWalletTokens(wallet.balanceTokens, wallet.reservedTokens);
      if (available < estimatedTokens) {
        throw makeInsufficientError(providerKey, resolvedProvider);
      }

      const newReserved = wallet.reservedTokens + estimatedTokens;
      writeWalletInTx(
        tx,
        wallet.ref,
        wallet.source,
        providerKey,
        wallet.balanceTokens,
        newReserved
      );
      if (nextPaidUsed !== null) {
        writeDailyCounterInTx(tx, counterRef, todayKey, nextPaidUsed);
      }

      tx.set(holdRef, {
        requestId,
        providerKey,
        estimatedTokens,
        status: AI_TOKEN_HOLD_STATUS.RESERVED,
        providerStatus: AI_HOLD_PROVIDER_STATUS.PENDING,
        billingStatus: AI_HOLD_BILLING_STATUS.RESERVED,
        walletSource: wallet.source,
        createdBy: userId,
        reason: params.reason || 'chat',
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        holdId,
        requestId,
        providerKey,
        estimatedTokens,
        replay: false,
        status: AI_TOKEN_HOLD_STATUS.RESERVED,
        wallet: toWalletSnapshot(wallet.balanceTokens, newReserved, providerKey),
        providerStatus: AI_HOLD_PROVIDER_STATUS.PENDING,
        billingStatus: AI_HOLD_BILLING_STATUS.RESERVED,
      } as ReserveCompanyTokensResult;
    });

    logger.info('reserve done', {
      companyId,
      requestId,
      provider: resolvedProvider,
      estimatedTokens: result.estimatedTokens,
      holdStatus: result.status,
      replay: result.replay,
      balanceTokens: result.wallet.balanceTokens,
      reservedTokens: result.wallet.reservedTokens,
    });
    logger.end();
    return result;
  } catch (e) {
    logger.error('company token reserve failed', e);
    logger.end();
    throw e;
  }
}

/**
 * Capture actual usage after a successful paid provider call.
 * Teklifbul Rule v1.0 — H-007
 */
export async function captureCompanyTokensTransactional(params: {
  companyId: string;
  userId: string;
  provider: string;
  model?: string | null;
  requestId: string;
  actualTokens: number;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<CaptureCompanyTokensResult> {
  const { companyId, userId, provider, requestId } = params;
  const actualTokens = Math.max(0, Math.floor(Number(params.actualTokens || 0)));
  if (!companyId) throw new Error('companyId missing');
  if (!requestId) throw new Error('requestId missing');

  const resolvedProvider = String(params.meta?.resolvedProvider || provider);
  const providerKey = getProviderKey(resolvedProvider);
  const holdId = buildAiTokenHoldId(requestId);

  const db = await getAdminDb();
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');

  const companyRef = db.collection('companies').doc(companyId);
  const providerWalletRef = companyRef.collection('aiWallets').doc(providerKey);
  const legacyWalletRef = companyRef.collection('wallets').doc('aiTokens');
  const holdRef = companyRef.collection('aiTokenHolds').doc(holdId);
  const settingsRef = companyRef.collection('settings').doc('purchaseAssistant');
  const todayKey = utcTodayKey();
  const counterRef = companyRef.collection('aiDailyCounters').doc(todayKey);
  const ledgerRef = companyRef.collection('aiTokenLedger').doc();

  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;

  let costMeta: Record<string, unknown> | null = null;
  try {
    const { computeLedgerCostMeta } = await import('./aiCostAccountingService.js');
    const actualModelRaw = params.meta?.resolvedModel ?? params.model ?? null;
    const actualModel = typeof actualModelRaw === 'string' ? actualModelRaw : null;
    if (actualModel && resolvedProvider && resolvedProvider !== 'free_local') {
      costMeta = await computeLedgerCostMeta({
        providerKey,
        provider: resolvedProvider,
        model: actualModel,
        tokensPaid: actualTokens,
        promptTokens: Number(params.meta?.promptTokens || 0),
        completionTokens: Number(params.meta?.completionTokens || 0),
        db,
      });
    }
  } catch (costErr: any) {
    logger.warn('[Wallet] Cost computation failed (non-blocking)', {
      companyId,
      requestId,
      provider: resolvedProvider,
      error: costErr?.message || costErr,
    });
  }

  logger.group('companyAiWallet:capture');
  logger.info('capture start', {
    companyId,
    requestId,
    provider: resolvedProvider,
    actualTokens,
  });

  try {
    const result = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists) {
        throw new Error('Token hold bulunamadı');
      }
      const hold = holdSnap.data() || {};
      const status = String(hold.status || '') as AiTokenHoldStatus;
      const estimatedTokens = Math.max(0, Number(hold.estimatedTokens || 0));
      const walletSource: 'provider' | 'legacy' = hold.walletSource === 'legacy' ? 'legacy' : 'provider';
      const walletRef = walletSource === 'legacy' ? legacyWalletRef : providerWalletRef;
      const walletSnap = await tx.get(walletRef);
      const walletFields = readWalletTokenFields(walletSnap.exists ? walletSnap.data() || {} : {});
      const usedTodayPaid = await readPaidUsedToday(tx, counterRef);

      if (status === AI_TOKEN_HOLD_STATUS.CAPTURED) {
        logger.info('capture idempotent no-op', {
          companyId,
          requestId,
          provider: resolvedProvider,
          estimatedTokens,
          actualTokens: Number(hold.actualTokens || actualTokens),
          holdStatus: status,
        });
        return {
          holdId,
          requestId,
          providerKey,
          status,
          estimatedTokens,
          actualTokens: Number(hold.actualTokens || actualTokens),
          wallet: toWalletSnapshot(walletFields.balanceTokens, walletFields.reservedTokens, providerKey),
          applied: false,
        } as CaptureCompanyTokensResult;
      }

      if (status !== AI_TOKEN_HOLD_STATUS.RESERVED) {
        const error: any = new Error('Hold capture için reserved değil');
        error.code = 'HOLD_INVALID_STATUS';
        error.status = status;
        throw error;
      }

      const newReserved = Math.max(0, walletFields.reservedTokens - estimatedTokens);
      const maxDebit = Math.max(0, walletFields.balanceTokens - newReserved);
      const debit = Math.min(actualTokens, maxDebit);
      if (debit < actualTokens) {
        logger.warn('capture actual exceeds available — clamping debit', {
          companyId,
          requestId,
          provider: resolvedProvider,
          estimatedTokens,
          actualTokens,
          debit,
        });
      }
      const newBalance = walletFields.balanceTokens - debit;
      writeWalletInTx(tx, walletRef, walletSource, providerKey, newBalance, newReserved);

      const capDelta = debit - estimatedTokens;
      const nextPaidUsed = dailyCapNextOrThrow({
        usedTodayPaid,
        dailyPaidTokenCap,
        delta: capDelta,
        failIfExceed: false,
      });
      if (nextPaidUsed !== null) {
        writeDailyCounterInTx(tx, counterRef, todayKey, nextPaidUsed);
      }

      tx.set(
        holdRef,
        {
          status: AI_TOKEN_HOLD_STATUS.CAPTURED,
          billingStatus: AI_HOLD_BILLING_STATUS.CAPTURED,
          providerStatus: AI_HOLD_PROVIDER_STATUS.SUCCESS,
          actualTokens: debit,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtMs: Date.now(),
        },
        { merge: true }
      );

      const enrichedMeta: Record<string, unknown> = {
        provider: resolvedProvider,
        model: params.meta?.resolvedModel || params.model || null,
        providerKey,
        totalTokens: debit,
        promptTokens: params.meta?.promptTokens || null,
        completionTokens: params.meta?.completionTokens || null,
        route: params.meta?.route || '/api/chat',
        requestId,
        userId,
        estimatedTokens,
        holdId,
        ...(costMeta || {}),
      };

      tx.set(ledgerRef, {
        type: 'consume',
        amountTokens: -Math.abs(debit),
        reason: params.reason || 'chat',
        meta: enrichedMeta,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        createdBy: userId,
      });

      return {
        holdId,
        requestId,
        providerKey,
        status: AI_TOKEN_HOLD_STATUS.CAPTURED,
        estimatedTokens,
        actualTokens: debit,
        wallet: toWalletSnapshot(newBalance, newReserved, providerKey),
        applied: true,
      } as CaptureCompanyTokensResult;
    });

    logger.info('capture done', {
      companyId,
      requestId,
      provider: resolvedProvider,
      estimatedTokens: result.estimatedTokens,
      actualTokens: result.actualTokens,
      holdStatus: result.status,
      balanceTokens: result.wallet.balanceTokens,
      reservedTokens: result.wallet.reservedTokens,
    });
    logger.end();
    return result;
  } catch (e) {
    logger.error('company token capture failed', e);
    logger.end();
    throw e;
  }
}

/**
 * Release a reserved hold after provider failure. Idempotent.
 * Teklifbul Rule v1.0 — H-007
 */
export async function releaseCompanyTokensTransactional(params: {
  companyId: string;
  userId: string;
  provider: string;
  requestId: string;
  billingStatus?: string;
}): Promise<ReleaseCompanyTokensResult> {
  const { companyId, userId, provider, requestId } = params;
  if (!companyId) throw new Error('companyId missing');
  if (!requestId) throw new Error('requestId missing');

  const providerKey = getProviderKey(provider);
  const holdId = buildAiTokenHoldId(requestId);

  const db = await getAdminDb();
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');

  const companyRef = db.collection('companies').doc(companyId);
  const providerWalletRef = companyRef.collection('aiWallets').doc(providerKey);
  const legacyWalletRef = companyRef.collection('wallets').doc('aiTokens');
  const holdRef = companyRef.collection('aiTokenHolds').doc(holdId);
  const settingsRef = companyRef.collection('settings').doc('purchaseAssistant');
  const todayKey = utcTodayKey();
  const counterRef = companyRef.collection('aiDailyCounters').doc(todayKey);

  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const dailyPaidTokenCap = typeof settings.dailyPaidTokenCap === 'number' ? settings.dailyPaidTokenCap : null;

  logger.group('companyAiWallet:release');
  logger.info('release start', {
    companyId,
    requestId,
    provider,
  });

  try {
    const result = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const holdSnap = await tx.get(holdRef);
      const usedTodayPaid = await readPaidUsedToday(tx, counterRef);
      if (!holdSnap.exists) {
        const wallet = await resolveWalletInTx(tx, providerWalletRef, legacyWalletRef);
        logger.warn('release hold missing — no-op', { companyId, requestId, provider });
        return {
          holdId,
          requestId,
          providerKey,
          status: AI_TOKEN_HOLD_STATUS.RELEASED,
          estimatedTokens: 0,
          wallet: toWalletSnapshot(wallet.balanceTokens, wallet.reservedTokens, providerKey),
          applied: false,
        } as ReleaseCompanyTokensResult;
      }

      const hold = holdSnap.data() || {};
      const status = String(hold.status || '') as AiTokenHoldStatus;
      const estimatedTokens = Math.max(0, Number(hold.estimatedTokens || 0));
      const walletSource: 'provider' | 'legacy' = hold.walletSource === 'legacy' ? 'legacy' : 'provider';
      const walletRef = walletSource === 'legacy' ? legacyWalletRef : providerWalletRef;
      const walletSnap = await tx.get(walletRef);
      const walletFields = readWalletTokenFields(walletSnap.exists ? walletSnap.data() || {} : {});

      if (status === AI_TOKEN_HOLD_STATUS.RELEASED) {
        logger.info('release idempotent no-op', {
          companyId,
          requestId,
          provider,
          estimatedTokens,
          holdStatus: status,
        });
        return {
          holdId,
          requestId,
          providerKey,
          status,
          estimatedTokens,
          wallet: toWalletSnapshot(walletFields.balanceTokens, walletFields.reservedTokens, providerKey),
          applied: false,
        } as ReleaseCompanyTokensResult;
      }

      if (status === AI_TOKEN_HOLD_STATUS.CAPTURED) {
        logger.warn('release skipped — hold already captured', {
          companyId,
          requestId,
          provider,
          estimatedTokens,
          holdStatus: status,
        });
        return {
          holdId,
          requestId,
          providerKey,
          status,
          estimatedTokens,
          wallet: toWalletSnapshot(walletFields.balanceTokens, walletFields.reservedTokens, providerKey),
          applied: false,
        } as ReleaseCompanyTokensResult;
      }

      if (isHoldProviderSuccessPendingCapture(hold)) {
        logger.warn('release skipped — provider success pending capture', {
          companyId,
          requestId,
          provider,
          estimatedTokens,
          holdStatus: status,
          providerStatus: hold.providerStatus,
          billingStatus: hold.billingStatus,
        });
        return {
          holdId,
          requestId,
          providerKey,
          status,
          estimatedTokens,
          wallet: toWalletSnapshot(walletFields.balanceTokens, walletFields.reservedTokens, providerKey),
          applied: false,
        } as ReleaseCompanyTokensResult;
      }

      const newReserved = Math.max(0, walletFields.reservedTokens - estimatedTokens);
      writeWalletInTx(
        tx,
        walletRef,
        walletSource,
        providerKey,
        walletFields.balanceTokens,
        newReserved
      );

      const nextPaidUsed = dailyCapNextOrThrow({
        usedTodayPaid,
        dailyPaidTokenCap,
        delta: -estimatedTokens,
        failIfExceed: false,
      });
      if (nextPaidUsed !== null) {
        writeDailyCounterInTx(tx, counterRef, todayKey, nextPaidUsed);
      }

      tx.set(
        holdRef,
        {
          status: AI_TOKEN_HOLD_STATUS.RELEASED,
          billingStatus: params.billingStatus || AI_HOLD_BILLING_STATUS.RELEASED,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtMs: Date.now(),
          releasedBy: userId,
        },
        { merge: true }
      );

      return {
        holdId,
        requestId,
        providerKey,
        status: AI_TOKEN_HOLD_STATUS.RELEASED,
        estimatedTokens,
        wallet: toWalletSnapshot(walletFields.balanceTokens, newReserved, providerKey),
        applied: true,
      } as ReleaseCompanyTokensResult;
    });

    logger.info('release done', {
      companyId,
      requestId,
      provider,
      estimatedTokens: result.estimatedTokens,
      holdStatus: result.status,
      balanceTokens: result.wallet.balanceTokens,
      reservedTokens: result.wallet.reservedTokens,
    });
    logger.end();
    return result;
  } catch (e) {
    logger.error('company token release failed', e);
    logger.end();
    throw e;
  }
}

/**
 * Persist provider outcome without changing reservedTokens.
 * Teklifbul Rule v1.0 — H-007A
 *
 * success → billingStatus capture_pending (capture may still fail)
 * failure/timeout → metadata only; caller releases
 */
export async function markCompanyAiHoldProviderOutcome(params: {
  companyId: string;
  requestId: string;
  provider: string;
  userId: string;
  providerStatus: AiHoldProviderStatus;
  actualTokens?: number;
  providerRequestId?: string;
}): Promise<{ status: AiTokenHoldStatus; billingStatus: string; providerStatus: string }> {
  const { companyId, requestId, provider, userId, providerStatus } = params;
  if (!companyId) throw new Error('companyId missing');
  if (!requestId) throw new Error('requestId missing');

  const holdId = buildAiTokenHoldId(requestId);
  const db = await getAdminDb();
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');

  const holdRef = db.collection('companies').doc(companyId).collection('aiTokenHolds').doc(holdId);
  const actualTokens =
    typeof params.actualTokens === 'number' && Number.isFinite(params.actualTokens)
      ? Math.max(0, Math.floor(params.actualTokens))
      : undefined;

  logger.group('companyAiWallet:providerOutcome');
  logger.info('provider outcome write', {
    companyId,
    requestId,
    provider,
    providerStatus,
    actualTokens: actualTokens ?? null,
  });

  try {
    const result = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists) {
        throw new Error('Token hold bulunamadı');
      }
      const hold = holdSnap.data() || {};
      const status = String(hold.status || '') as AiTokenHoldStatus;
      if (status === AI_TOKEN_HOLD_STATUS.CAPTURED || status === AI_TOKEN_HOLD_STATUS.RELEASED) {
        return {
          status,
          billingStatus: String(hold.billingStatus || status),
          providerStatus: String(hold.providerStatus || providerStatus),
        };
      }

      const billingStatus =
        providerStatus === AI_HOLD_PROVIDER_STATUS.SUCCESS
          ? AI_HOLD_BILLING_STATUS.CAPTURE_PENDING
          : String(hold.billingStatus || AI_HOLD_BILLING_STATUS.RESERVED);

      const patch: Record<string, unknown> = {
        providerStatus,
        billingStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtMs: Date.now(),
        providerOutcomeBy: userId,
      };
      if (actualTokens !== undefined) patch.actualTokens = actualTokens;
      if (params.providerRequestId) patch.providerRequestId = params.providerRequestId;

      tx.set(holdRef, patch, { merge: true });
      return { status, billingStatus, providerStatus };
    });

    logger.info('provider outcome written', {
      companyId,
      requestId,
      provider,
      providerStatus: result.providerStatus,
      billingStatus: result.billingStatus,
      holdStatus: result.status,
    });
    logger.end();
    return result;
  } catch (e) {
    logger.error('provider outcome write failed', e);
    logger.end();
    throw e;
  }
}

/**
 * Mark an unknown-crash reserved hold for manual reconciliation.
 * Teklifbul Rule v1.0 — H-007A
 *
 * Does not mutate wallet (reservedTokens / balanceTokens unchanged).
 * Does not capture or release. Idempotent.
 */
export async function markCompanyAiHoldNeedsReconciliation(params: {
  companyId: string;
  requestId: string;
  provider: string;
}): Promise<{
  status: AiTokenHoldStatus;
  billingStatus: string;
  providerStatus: string;
  alreadyReconciled: boolean;
}> {
  const { companyId, requestId, provider } = params;
  if (!companyId) throw new Error('companyId missing');
  if (!requestId) throw new Error('requestId missing');

  const holdId = buildAiTokenHoldId(requestId);
  const db = await getAdminDb();
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');

  const holdRef = db.collection('companies').doc(companyId).collection('aiTokenHolds').doc(holdId);

  logger.group('companyAiWallet:needsReconciliation');
  logger.info('needs_reconciliation mark start', {
    companyId,
    requestId,
    provider,
    holdId,
  });

  try {
    const result = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists) {
        throw new Error('Token hold bulunamadı');
      }
      const hold = holdSnap.data() || {};
      const status = String(hold.status || '') as AiTokenHoldStatus;
      const billingStatus = String(hold.billingStatus || '');
      const providerStatus = String(hold.providerStatus || AI_HOLD_PROVIDER_STATUS.PENDING);

      if (status !== AI_TOKEN_HOLD_STATUS.RESERVED) {
        return {
          status,
          billingStatus: billingStatus || status,
          providerStatus,
          alreadyReconciled: true,
        };
      }

      if (isHoldProviderSuccessPendingCapture(hold)) {
        return {
          status,
          billingStatus,
          providerStatus,
          alreadyReconciled: true,
        };
      }

      if (billingStatus === AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION) {
        return {
          status,
          billingStatus,
          providerStatus,
          alreadyReconciled: true,
        };
      }

      tx.set(
        holdRef,
        {
          status: AI_TOKEN_HOLD_STATUS.RESERVED,
          billingStatus: AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtMs: Date.now(),
        },
        { merge: true }
      );

      return {
        status: AI_TOKEN_HOLD_STATUS.RESERVED,
        billingStatus: AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION,
        providerStatus,
        alreadyReconciled: false,
      };
    });

    logger.info('needs_reconciliation mark done', {
      companyId,
      requestId,
      provider,
      holdId,
      holdStatus: result.status,
      billingStatus: result.billingStatus,
      alreadyReconciled: result.alreadyReconciled,
    });
    logger.end();
    return result;
  } catch (e) {
    logger.error('needs_reconciliation mark failed', e);
    logger.end();
    throw e;
  }
}




