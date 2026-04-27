/**
 * Admin Entitlements Debug Endpoint
 * Teklifbul Rule v3.14 - Entitlements debug and diagnostics
 * 
 * GET /api/admin/entitlements?companyId=...
 * Returns merged entitlements per provider with purchase sources
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getCompanyEntitlements, getProviderKey } from '../services/aiEntitlementService.js';

const router = Router();

/**
 * GET /api/admin/entitlements?companyId=...
 * Get entitlements debug info for a company
 */
router.get('/entitlements', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin entitlements debug');
  try {
    const companyId = String(req.query.companyId || '').trim();
    if (!companyId) {
      logger.end();
      return res.status(400).json({ error: 'COMPANY_ID_REQUIRED', message: 'companyId query parameter required' });
    }

    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
    }

    // Get merged entitlements
    const entitlements = await getCompanyEntitlements(companyId);

    // Load recent purchases (last 20) for source tracking
    let purchaseDocs: any[] = [];
    try {
      const snap = await db
        .collection('companies')
        .doc(companyId)
        .collection('aiTokenPurchases')
        .where('status', '==', 'paid')
        .orderBy('createdAtMs', 'desc')
        .limit(20)
        .get();
      purchaseDocs = snap.docs.map((d: any) => ({
        id: d.id,
        ...(d.data() || {}),
      }));
    } catch (e) {
      logger.warn('[Entitlements Debug] Failed to load purchases', { companyId, error: (e as any)?.message || e });
    }

    // Group purchases by provider and build sources
    const providersData: Array<{
      providerKey: string;
      providerWide: boolean;
      allowedModels: string[];
      allowedModelPrefixes: string[];
      allowedTiers: string[];
      purchasesCount: number;
      sources: Array<{
        purchaseId: string;
        packageId?: string;
        providerKey?: string;
        entitlementSnapshot?: any;
        createdAt?: any;
      }>;
    }> = [];

    // Process each provider's entitlements
    for (const [providerKey, providerEntitlements] of entitlements.entries()) {
      const providerPurchases = purchaseDocs.filter(p => {
        const pProviderKey = p.providerKey || (p.packageSnapshot?.allowedProviders?.[0] ? getProviderKey(p.packageSnapshot.allowedProviders[0]) : null);
        return pProviderKey === providerKey;
      });

      const sources = providerPurchases.map(p => ({
        purchaseId: p.id,
        packageId: p.packageId || p.packageSnapshot?.id,
        providerKey: p.providerKey || null,
        entitlementSnapshot: p.entitlement || null,
        createdAt: p.createdAt || p.createdAtMs || null,
      }));

      providersData.push({
        providerKey,
        providerWide: providerEntitlements.isProviderWide,
        allowedModels: providerEntitlements.allowedModels,
        allowedModelPrefixes: providerEntitlements.allowedModelPrefixes,
        allowedTiers: providerEntitlements.allowedTiers,
        purchasesCount: providerPurchases.length,
        sources: sources.slice(0, 20), // Limit to 20 most recent
      });
    }

    // Get ENV flag value
    const legacyProviderWide = process.env.TB_LEGACY_ENTITLEMENT_PROVIDER_WIDE !== 'false';

    logger.info('[Entitlements Debug] Retrieved entitlements', { 
      companyId, 
      providerCount: providersData.length,
      legacyProviderWide,
    });
    logger.end();

    return res.json({
      companyId,
      providers: providersData,
      env: {
        legacyProviderWide,
      },
    });
  } catch (error: any) {
    logger.error('[Entitlements Debug] Error', error);
    logger.end();
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message || 'Internal server error' });
  }
});

export default router;

