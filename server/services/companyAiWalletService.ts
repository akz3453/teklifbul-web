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

import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
 * 
 * @param companyId - Company ID
 * @param providerKey - Provider key (e.g., 'openai', 'gemini'). If not provided, uses legacy wallet.
 * @returns Wallet balance or null if DB unavailable
 */
export async function getCompanyAiWallet(
  companyId: string,
  providerKey?: string
): Promise<{ balanceTokens: number; providerKey?: string } | null> {
  const db = await getAdminDb();
  if (!db) return null;

  // If providerKey provided, use provider-specific wallet
  if (providerKey) {
    const ref = db.collection('companies').doc(companyId).collection('aiWallets').doc(providerKey);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return { balanceTokens: Number(data.balanceTokens || 0), providerKey };
    }
    // Provider wallet missing => return 0 balance
    return { balanceTokens: 0, providerKey };
  }

  // Legacy: check old wallet location
  const legacyRef = db.collection('companies').doc(companyId).collection('wallets').doc('aiTokens');
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) {
    const data = legacySnap.data() || {};
    logger.warn('[Wallet] Using legacy wallet (no providerKey)', { companyId });
    return { balanceTokens: Number(data.balanceTokens || 0) };
  }

  // No wallet found => return 0
  return { balanceTokens: 0 };
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
      let currentBalance = Number(walletData.balanceTokens || 0);
      let usingLegacy = false;

      // If provider wallet missing or zero, check legacy wallet (if universal mode enabled)
      if (currentBalance === 0 && isLegacyWalletUniversal()) {
        const legacySnap = await tx.get(legacyWalletRef);
        if (legacySnap.exists) {
          const legacyData = legacySnap.data() || {};
          const legacyBalance = Number(legacyData.balanceTokens || 0);
          if (legacyBalance > 0) {
            logger.warn('[Wallet] Using legacy wallet for provider consumption', { companyId, providerKey, legacyBalance });
            currentBalance = legacyBalance;
            usingLegacy = true;
          }
        }
      }

      if (currentBalance < usedTokens) {
        const error: any = new Error(`Yeterli token bulunmamaktadır (${providerKey} wallet)`);
        error.providerKey = providerKey;
        error.resolvedProvider = resolvedProvider;
        throw error;
      }
      const newBalance = currentBalance - usedTokens;

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


