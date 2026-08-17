/**
 * Company AI Token Packages + Purchases
 * Teklifbul Rule v1.0
 *
 * GET  /api/ai/token-packages
 * POST /api/ai/token-purchases/create
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAllTokenPacks } from '../services/aiTokenPackCatalog.js';
import crypto from 'crypto';
import { AI_ERROR_CODES } from '../constants/aiMeta.js';
import { clearEntitlementCache, getProviderKey } from '../services/aiEntitlementService.js'; // Teklifbul Rule v3.13 + v3.15
import { isAdminUser } from '../auth/admin-check.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
import { isMockPurchaseEnabled, resolveCheckoutBaseUrl } from '../services/paymentsService.js';

type AiTokenPackage = {
  id: string;
  name: string;
  tokens: number;
  priceTRY: number;
  planRequired: 'premium_plus';
  isActive: boolean;
  sort: number;
  allowedProviders: string[];
  allowedModels: string[] | null;
  freeEligible: boolean;
  description?: string;
};

async function getCompanyContext(req: AuthenticatedRequest) {
  const userId = req.user?.uid;
  if (!userId) return { userId: null, companyId: null, userData: null as any };

  const db = await getAdminDb();
  if (!db) return { userId, companyId: null, userData: null as any };

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? (userDoc.data() || {}) : {};
  const headerCompanyId = req.headers['x-company-id'] as string | undefined;
  const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
    userId,
    path: req.path,
  });
  return { userId, companyId: companyId || null, userData };
}

async function loadPackagesFromFirestore(db: any): Promise<AiTokenPackage[] | null> {
  try {
    const snap = await db.collection('ai_token_packages').where('isActive', '==', true).get();
    if (snap.empty) return [];
    const items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
    // normalize minimal shape
    return items
      .map((p: any) => ({
        id: String(p.id),
        name: String(p.name || p.id),
        tokens: Number(p.tokens || 0),
        priceTRY: Number(p.priceTRY || 0),
        planRequired: 'premium_plus' as const,
        isActive: p.isActive !== false,
        sort: Number(p.sort || 0),
        allowedProviders: Array.isArray(p.allowedProviders) ? p.allowedProviders.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
        allowedModels: Array.isArray(p.allowedModels) ? p.allowedModels.map((x: any) => String(x || '').trim()).filter(Boolean) : (p.allowedModels === null ? null : null),
        freeEligible: p.freeEligible === true,
        description: p.description ? String(p.description) : undefined,
      }))
      .sort((a: any, b: any) => a.sort - b.sort);
  } catch (e) {
    logger.warn('ai_token_packages load failed (firestore)', { error: (e as any)?.message || e });
    return null;
  }
}

function adaptPackagesFromCodeCatalog(): AiTokenPackage[] {
  // Teklifbul Rule v1.0 - Adapter: if Firestore catalog missing/empty, use code catalog
  // TODO: Admin panel + Firestore yönetimi
  const packs = getAllTokenPacks();
  return packs
    .map((p: any, idx: number) => ({
      id: String(p.id),
      name: String(p.name),
      tokens: Number(p.tokenAmount || 0),
      priceTRY: Number(p.price || 0),
      planRequired: 'premium_plus' as const,
      isActive: true,
      sort: Number(idx + 1),
      allowedProviders: [String(p.provider)],
      // Hardening rule: allowModels null/empty => provider-wide unlock of paid models for that provider
      allowedModels: null,
      freeEligible: false,
      description: p.description ? String(p.description) : undefined,
    }))
    .sort((a, b) => a.sort - b.sort);
}

/**
 * Get provider key from package
 * Teklifbul Rule v3.12 - Determine providerKey for wallet credit
 */
function getProviderKeyFromPackage(pkg: AiTokenPackage): string {
  // Use first allowedProvider as providerKey
  if (Array.isArray(pkg.allowedProviders) && pkg.allowedProviders.length > 0) {
    const provider = String(pkg.allowedProviders[0]).toLowerCase().trim();
    if (provider === 'openai' || provider.startsWith('openai')) return 'openai';
    if (provider === 'gemini' || provider.startsWith('gemini')) return 'gemini';
    return provider;
  }
  // Fallback: if no allowedProviders, require explicit providerKey (will fail validation)
  throw new Error('Package must have at least one allowedProvider');
}

const router = Router();

router.get('/token-packages', verifyToken, async (req: AuthenticatedRequest, res) => {
  logger.group('ai:token-packages:get');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'db_unavailable', message: 'Veritabanı bağlantısı kurulamadı.' });
    }

    const fsPkgs = await loadPackagesFromFirestore(db);
    const packages = fsPkgs && fsPkgs.length ? fsPkgs : adaptPackagesFromCodeCatalog();

    logger.info('Token packages returned', { count: packages.length, source: fsPkgs && fsPkgs.length ? 'firestore' : 'code_catalog' });
    logger.end();
    return res.json({ ok: true, packages });
  } catch (e: any) {
    logger.error('ai:token-packages:get error', e);
    logger.end();
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message || 'Bilinmeyen hata' });
  }
});

const createSchema = z.object({
  packageId: z.string().min(1),
});

router.post(
  '/token-purchases/create',
  verifyToken,
  validateRequest({ body: createSchema }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('ai:token-purchases:create');
    try {
      if (!req.user?.uid) {
        logger.end();
        return res.status(401).json({ ok: false, error: 'auth_required', message: 'Bu işlem için giriş yapmalısınız.' });
      }

      const { companyId } = await getCompanyContext(req);
      if (!companyId) {
        logger.end();
        return res.status(403).json({
          ok: false,
          error: 'company_forbidden',
          message: 'Şirket erişimi doğrulanamadı. x-company-id geçersiz olabilir.',
        });
      }

      // Teklifbul Rule v1.0 — Mock satın alma yalnız admin + env; diğerleri gerçek ödeme intent
      const allowMock =
        isMockPurchaseEnabled() && isAdminUser(req.user);

      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ ok: false, error: 'db_unavailable', message: 'Veritabanı bağlantısı kurulamadı.' });
      }

      const nowMs = Date.now();
      const { packageId } = req.body as any;
      const idempotencyKeyRaw = (req.headers['idempotency-key'] as string | undefined) || '';
      const idempotencyKey = String(idempotencyKeyRaw || '').trim();

      // Load package (Firestore preferred; fallback to code catalog)
      const fsPkgs = await loadPackagesFromFirestore(db);
      const packages = fsPkgs && fsPkgs.length ? fsPkgs : adaptPackagesFromCodeCatalog();
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg || pkg.isActive === false) {
        logger.end();
        return res.status(400).json({ ok: false, error: 'package_not_found', message: 'Paket bulunamadı veya aktif değil.' });
      }

      // Teklifbul Rule v3.12 - Determine providerKey from package
      let providerKey: string;
      try {
        providerKey = getProviderKeyFromPackage(pkg);
      } catch (err: any) {
        logger.warn('Invalid package: missing providerKey', { packageId, error: err.message });
        logger.end();
        return res.status(400).json({
          ok: false,
          error: AI_ERROR_CODES.INVALID_PROVIDER,
          message: 'Paket geçersiz: providerKey belirlenemedi.'
        });
      }

      if (!allowMock) {
        const { createPaymentIntentRecord } = await import('../services/subscriptionService.js');
        const providerSessionId = `ai_tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const paymentIntent = await createPaymentIntentRecord({
          userId: req.user!.uid,
          planId: `token_pack_${pkg.id}` as any,
          amount: Number(pkg.priceTRY || 0),
          currency: 'TRY',
          status: 'initiated',
          providerSessionId,
        });

        await db.collection('payment_intents').doc(paymentIntent.id).update({
          companyId,
          metadata: {
            type: 'company_ai_token_pack',
            companyId,
            packageId: pkg.id,
            packId: pkg.id,
            providerKey,
            provider: providerKey,
            tokenAmount: pkg.tokens,
            tokens: pkg.tokens,
            idempotencyKey: idempotencyKey || null,
          },
        });

        const checkoutBase = resolveCheckoutBaseUrl();
        const checkoutUrl = `${checkoutBase}?session=${providerSessionId}&intent=${paymentIntent.id}&type=company_ai_token_pack`;

        logger.info('Company AI token payment initiated', {
          userId: req.user!.uid,
          companyId,
          packageId: pkg.id,
          paymentIntentId: paymentIntent.id,
        });
        logger.end();
        return res.json({
          ok: true,
          requiresPayment: true,
          paymentIntentId: paymentIntent.id,
          checkoutUrl,
          amount: pkg.priceTRY,
          currency: 'TRY',
          package: {
            id: pkg.id,
            name: pkg.name,
            tokens: pkg.tokens,
            providerKey,
          },
        });
      }

      const purchasesCol = db.collection('companies').doc(companyId).collection('aiTokenPurchases');

      // Teklifbul Rule v1.2 - Strong idempotency: Idempotency-Key header
      // If provided, use deterministic purchaseId derived from companyId+key to guarantee idempotency even under concurrency.
      if (idempotencyKey) {
        const hash = crypto.createHash('sha256').update(`${companyId}|${idempotencyKey}`).digest('hex');
        const deterministicPurchaseId = `idem_${hash}`;
        const purchaseRef = purchasesCol.doc(deterministicPurchaseId);
        const purchaseSnap = await purchaseRef.get();
        if (purchaseSnap.exists) {
          const existing = purchaseSnap.data() || {};
          logger.info('Idempotency-Key hit: returning existing purchase', { companyId, packageId, purchaseId: purchaseRef.id });
          logger.end();
          return res.json({
            ok: true,
            alreadyProcessed: true,
            purchaseId: purchaseRef.id,
            newBalanceTokens: existing?.walletAfter?.balanceTokens ?? null,
          });
        }

        // Teklifbul Rule v3.12 - Use provider-specific wallet
        const providerWalletRef = db.collection('companies').doc(companyId).collection('aiWallets').doc(providerKey);
        const ledgerCol = db.collection('companies').doc(companyId).collection('aiTokenLedger');
        const companyRef = db.collection('companies').doc(companyId);
        const ledgerRef = ledgerCol.doc(`purchase_${purchaseRef.id}`);

        // Teklifbul Rule v1.0 - hasEntitlements transaction disinda da kullaniliyor, lift et
        const hasEntitlements =
          (Array.isArray(pkg.allowedModels) && pkg.allowedModels.length > 0) ||
          (Array.isArray((pkg as any).allowedModelPrefixes) && (pkg as any).allowedModelPrefixes.length > 0) ||
          (Array.isArray((pkg as any).allowedTiers) && (pkg as any).allowedTiers.length > 0);

        const result = await db.runTransaction(async (tx: any) => {
          const existingInTx = await tx.get(purchaseRef);
          if (existingInTx.exists) {
            const existing = existingInTx.data() || {};
            return { 
              newBalanceTokens: existing?.walletAfter?.balanceTokens ?? null, 
              purchaseId: purchaseRef.id, 
              alreadyProcessed: true,
              providerKey: existing?.providerKey || providerKey,
            };
          }

          // Teklifbul Rule v3.12 - Read provider wallet
          const walletSnap = await tx.get(providerWalletRef);
          const walletData = walletSnap.exists ? (walletSnap.data() || {}) : {};
          const currentBalance = Number(walletData.balanceTokens || 0);
          const newBalance = currentBalance + pkg.tokens;

          // Mock upgrade: token alan firma Premium Plus sayılır
          const companySnap = await tx.get(companyRef);
          const companyData = companySnap.exists ? (companySnap.data() || {}) : {};
          const currentPlanId = String(companyData.planId || companyData.plan || 'free');
          const isPremiumPlus = currentPlanId.includes('premium_plus');
          if (!isPremiumPlus) {
            tx.set(
              companyRef,
              {
                planId: 'premium_plus_monthly',
                isPremium: true,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }

          // Teklifbul Rule v3.12 - Credit provider-specific wallet
          tx.set(
            providerWalletRef,
            {
              provider: providerKey,
              balanceTokens: newBalance,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // Teklifbul Rule v3.13 + v3.15 - Store entitlement snapshot with providerKey
          // Not: hasEntitlements transaction disinda lift edildi
          const entitlementSnapshot = hasEntitlements ? {
            providerKey, // Teklifbul Rule v3.15 - Include providerKey in entitlement snapshot
            allowedModels: Array.isArray(pkg.allowedModels) ? pkg.allowedModels : undefined,
            allowedModelPrefixes: Array.isArray((pkg as any).allowedModelPrefixes) ? (pkg as any).allowedModelPrefixes : undefined,
            allowedTiers: Array.isArray((pkg as any).allowedTiers) ? (pkg as any).allowedTiers : undefined,
          } : null; // Teklifbul Rule v3.15 - Explicitly null for legacy packages
          
          tx.set(purchaseRef, {
            packageId,
            idempotencyKey,
            providerKey, // Teklifbul Rule v3.12
            packageSnapshot: {
              id: pkg.id,
              name: pkg.name,
              tokens: pkg.tokens,
              priceTRY: pkg.priceTRY,
              allowedProviders: pkg.allowedProviders,
              allowedModels: pkg.allowedModels,
              allowedModelPrefixes: (pkg as any).allowedModelPrefixes,
              allowedTiers: (pkg as any).allowedTiers,
              providerCount: Array.isArray(pkg.allowedProviders) ? pkg.allowedProviders.length : 0,
              modelCount: Array.isArray(pkg.allowedModels) ? pkg.allowedModels.length : 0,
              planRequired: pkg.planRequired,
            },
            entitlement: entitlementSnapshot, // Teklifbul Rule v3.13 - Entitlement snapshot
            status: 'paid',
            createdAt: FieldValue.serverTimestamp(),
            createdAtMs: nowMs,
            paidAt: FieldValue.serverTimestamp(),
            createdBy: req.user!.uid,
            walletBefore: { balanceTokens: currentBalance, providerKey },
            walletAfter: { balanceTokens: newBalance, providerKey },
          });

          // Teklifbul Rule v1.3 + v3.12 - Enriched purchase ledger meta
          tx.set(ledgerRef, {
            type: 'purchase',
            amountTokens: pkg.tokens,
            reason: `purchase:${pkg.id}`,
            providerKey, // Teklifbul Rule v3.12
            meta: {
              packageId: pkg.id,
              priceTRY: pkg.priceTRY,
              allowedProviders: pkg.allowedProviders,
              allowedModels: pkg.allowedModels,
              idempotencyKey: idempotencyKey || null,
              paymentProvider: 'mock', // Teklifbul Rule v1.3 - Currently mocked purchases
              providerKey, // Teklifbul Rule v3.12
            },
            createdAt: FieldValue.serverTimestamp(),
            createdAtMs: nowMs,
            createdBy: req.user!.uid,
          });

          return { newBalanceTokens: newBalance, purchaseId: purchaseRef.id, alreadyProcessed: false, providerKey };
        });

        // Teklifbul Rule v1.3 + v3.13 - Invalidate availableModels and entitlement caches
        const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
        invalidateAvailableModelsCache(companyId);
        clearEntitlementCache(companyId); // Teklifbul Rule v3.13
        
        // Teklifbul Rule v3.7 - Compute post-purchase restore hint
        let postPurchaseHint: any = null;
        try {
          const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
          const settingsSnap = await settingsRef.get();
          const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
          
          // Determine plan
          let planId: string | null = null;
          try {
            const cdoc = await db.collection('companies').doc(companyId).get();
            const cdata = cdoc.exists ? (cdoc.data() || {}) : {};
            planId = cdata.planId || cdata.plan || cdata.subscriptionPlanId || cdata.subscription?.planId || null;
          } catch {}
          
          const { computeRestorePaidStatus } = await import('../services/restorePaidStatusHelper.js');
          const status = await computeRestorePaidStatus({
            db,
            companyId,
            userId: req.user?.uid || null,
            settings,
            planId,
          });
          
          // Teklifbul Rule v3.15 + v3.17 - Include providerKey in suggestedPaid and requiredProviderKey
          const suggestedPaidWithProvider = status.suggestedPaid ? {
            ...status.suggestedPaid,
            providerKey: status.suggestedPaid.providerKey || (status.suggestedPaid.provider ? getProviderKey(status.suggestedPaid.provider) : providerKey),
          } : null;
          
          // Teklifbul Rule v3.17 - requiredProviderKey same as suggestedPaid.providerKey when shouldOfferRestorePaid
          const requiredProviderKey = status.canRestore && suggestedPaidWithProvider?.providerKey ? 
            suggestedPaidWithProvider.providerKey : 
            (suggestedPaidWithProvider?.providerKey || undefined);
          
          postPurchaseHint = {
            shouldOfferRestorePaid: status.canRestore,
            suggestedPaid: suggestedPaidWithProvider,
            requiredProviderKey, // Teklifbul Rule v3.17
            reason: status.reason,
          };
        } catch (hintErr: any) {
          logger.warn('Failed to compute post-purchase hint', { error: hintErr?.message || hintErr });
          // Non-critical, continue
        }
        
        logger.info('Token purchase created (idempotency-key)', { companyId, packageId, providerKey, purchaseId: result.purchaseId, newBalanceTokens: result.newBalanceTokens });
        logger.end();
        return res.json({ 
          ok: true, 
          purchaseId: result.purchaseId, 
          newBalanceTokens: result.newBalanceTokens, 
          alreadyProcessed: result.alreadyProcessed,
          creditedProviderKey: providerKey, // Teklifbul Rule v3.12
          entitlementApplied: hasEntitlements, // Teklifbul Rule v3.15 - Whether entitlements were applied
          postPurchaseHint, // Teklifbul Rule v3.7 + v3.15
        });
      }

      // Idempotency guard (3 seconds): same company+packageId (legacy clients)
      const recentSnap = await purchasesCol
        .where('packageId', '==', packageId)
        .where('status', '==', 'paid')
        .where('createdAtMs', '>=', nowMs - 3000)
        .limit(1)
        .get();
      if (!recentSnap.empty) {
        const d = recentSnap.docs[0];
        const purchase = d.data() || {};
        logger.info('Idempotency hit: already processed', { companyId, packageId, purchaseId: d.id });
        logger.end();
        return res.json({
          ok: true,
          alreadyProcessed: true,
          purchaseId: d.id,
          newBalanceTokens: purchase?.walletAfter?.balanceTokens ?? null,
        });
      }

      // Teklifbul Rule v3.12 - Use provider-specific wallet
      const providerWalletRef = db.collection('companies').doc(companyId).collection('aiWallets').doc(providerKey);
      const ledgerCol = db.collection('companies').doc(companyId).collection('aiTokenLedger');
      const companyRef = db.collection('companies').doc(companyId);

      const purchaseRef = purchasesCol.doc();
      const ledgerRef = ledgerCol.doc();

      const result = await db.runTransaction(async (tx: any) => {
        // Teklifbul Rule v3.12 - Read provider wallet
        const walletSnap = await tx.get(providerWalletRef);
        const walletData = walletSnap.exists ? (walletSnap.data() || {}) : {};
        const currentBalance = Number(walletData.balanceTokens || 0);
        const newBalance = currentBalance + pkg.tokens;

        // Mock upgrade: token alan firma Premium Plus sayılır
        const companySnap = await tx.get(companyRef);
        const companyData = companySnap.exists ? (companySnap.data() || {}) : {};
        const currentPlanId = String(companyData.planId || companyData.plan || 'free');
        const isPremiumPlus = currentPlanId.includes('premium_plus');
        if (!isPremiumPlus) {
          tx.set(
            companyRef,
            {
              planId: 'premium_plus_monthly',
              isPremium: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        // Teklifbul Rule v3.12 - Credit provider-specific wallet
        tx.set(
          providerWalletRef,
          {
            provider: providerKey,
            balanceTokens: newBalance,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.set(purchaseRef, {
          packageId,
          providerKey, // Teklifbul Rule v3.12
          packageSnapshot: {
            id: pkg.id,
            name: pkg.name,
            tokens: pkg.tokens,
            priceTRY: pkg.priceTRY,
            allowedProviders: pkg.allowedProviders,
            allowedModels: pkg.allowedModels,
            providerCount: Array.isArray(pkg.allowedProviders) ? pkg.allowedProviders.length : 0,
            modelCount: Array.isArray(pkg.allowedModels) ? pkg.allowedModels.length : 0,
            planRequired: pkg.planRequired,
          },
          status: 'paid',
          createdAt: FieldValue.serverTimestamp(),
          createdAtMs: nowMs,
          paidAt: FieldValue.serverTimestamp(),
          createdBy: req.user!.uid,
          walletBefore: { balanceTokens: currentBalance, providerKey },
          walletAfter: { balanceTokens: newBalance, providerKey },
        });

        // Teklifbul Rule v1.3 + v3.12 - Enriched purchase ledger meta
        tx.set(ledgerRef, {
          type: 'purchase',
          amountTokens: pkg.tokens,
          reason: `purchase:${pkg.id}`,
          providerKey, // Teklifbul Rule v3.12
          meta: {
            packageId: pkg.id,
            priceTRY: pkg.priceTRY,
            allowedProviders: pkg.allowedProviders,
            allowedModels: pkg.allowedModels,
            paymentProvider: 'mock', // Teklifbul Rule v1.3 - Currently mocked purchases
            providerKey, // Teklifbul Rule v3.12
          },
          createdAt: FieldValue.serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: req.user!.uid,
        });

        return { newBalanceTokens: newBalance, purchaseId: purchaseRef.id, providerKey };
      });

      // Teklifbul Rule v1.3 - Invalidate availableModels cache
      const { invalidateAvailableModelsCache } = await import('../services/purchaseAssistantAvailabilityService.js');
      invalidateAvailableModelsCache(companyId);
      clearEntitlementCache(companyId); // Teklifbul Rule v3.13
      
      logger.info('Token purchase created', { companyId, packageId, providerKey, purchaseId: result.purchaseId, newBalanceTokens: result.newBalanceTokens });
      logger.end();
      return res.json({ 
        ok: true, 
        purchaseId: result.purchaseId, 
        newBalanceTokens: result.newBalanceTokens,
        creditedProviderKey: providerKey, // Teklifbul Rule v3.12
      });
    } catch (e: any) {
      logger.error('ai:token-purchases:create error', e);
      logger.end();
      return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message || 'Bilinmeyen hata' });
    }
  }
);

export default router;


