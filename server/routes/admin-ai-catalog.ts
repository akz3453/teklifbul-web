/**
 * Admin AI Catalog Route
 * Teklifbul Rule v1.4 - AI Model Catalog + Token Packages CRUD
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { invalidateAvailableModelsCacheAll } from '../services/purchaseAssistantAvailabilityService.js';

const router = Router();

router.use(verifyToken, requireAdmin);

// ==================== AI MODEL CATALOG ====================

const aiModelSchema = z.object({
  provider: z.string().min(1, 'Provider gerekli'),
  model: z.string().min(1, 'Model gerekli'),
  label: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  freeEligible: z.boolean().optional().default(false),
  sort: z.number().int().optional().default(100),
  costPer1kTokensUSD: z.number().min(0, 'Maliyet negatif olamaz').optional().default(0),
  currency: z.string().optional().default('USD'),
});

/**
 * GET /api/admin/ai-models
 * List all AI models
 */
router.get('/ai-models', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin AI models list');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const snap = await db.collection('ai_model_catalog').orderBy('sort', 'asc').get();
    const models = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as any));

    // Secondary sort in memory to avoid complex index requirement
    models.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return (a.provider || '').localeCompare(b.provider || '');
    });

    logger.info('AI models listed', { count: models.length });
    logger.end();
    return res.json({ models });
  } catch (error: any) {
    logger.error('AI models list error', error);
    logger.end();
    return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/ai-models
 * Create new AI model
 */
router.post('/ai-models',
  validateRequest({ body: aiModelSchema }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin AI model create');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const { provider, model, label, isActive, freeEligible, sort, costPer1kTokensUSD, currency } = req.body;

      // Check uniqueness: provider+model
      const existingSnap = await db
        .collection('ai_model_catalog')
        .where('provider', '==', provider)
        .where('model', '==', model)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        logger.warn('AI model already exists', { provider, model });
        logger.end();
        return res.status(400).json({ error: 'DUPLICATE', message: 'Bu provider+model kombinasyonu zaten mevcut' });
      }

      const docRef = db.collection('ai_model_catalog').doc();
      await docRef.set({
        provider,
        model,
        label: label || `${provider}/${model}`,
        isActive: isActive !== false,
        freeEligible: freeEligible === true,
        sort: sort || 100,
        costPer1kTokensUSD: typeof costPer1kTokensUSD === 'number' ? Math.max(0, costPer1kTokensUSD) : 0,
        currency: currency || 'USD',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      });

      // Teklifbul Rule v1.4 - Invalidate cache (catalog changed)
      invalidateAvailableModelsCacheAll();

      logger.info('AI model created', { id: docRef.id, provider, model });
      logger.end();
      return res.json({ ok: true, id: docRef.id });
    } catch (error: any) {
      logger.error('AI model create error', error);
      logger.end();
      return res.status(500).json({ error: 'CREATE_ERROR', message: error.message });
    }
  }
);

/**
 * PATCH /api/admin/ai-models/:id
 * Update AI model
 */
router.patch('/ai-models/:id',
  validateRequest({
    body: aiModelSchema.partial(),
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin AI model update');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const { id } = req.params;
      const updateData: any = {
        ...req.body,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      };

      // Teklifbul Rule v1.9 - Handle costPer1kTokensUSD
      if (req.body.costPer1kTokensUSD !== undefined) {
        updateData.costPer1kTokensUSD = typeof req.body.costPer1kTokensUSD === 'number' 
          ? Math.max(0, req.body.costPer1kTokensUSD) 
          : 0;
      }
      if (req.body.currency !== undefined) {
        updateData.currency = req.body.currency || 'USD';
      }

      // If provider or model is being changed, check uniqueness
      if (updateData.provider || updateData.model) {
        const docSnap = await db.collection('ai_model_catalog').doc(id).get();
        if (!docSnap.exists) {
          logger.end();
          return res.status(404).json({ error: 'NOT_FOUND', message: 'Model bulunamadı' });
        }

        const existing = docSnap.data() || {};
        const newProvider = updateData.provider || existing.provider;
        const newModel = updateData.model || existing.model;

        const existingSnap = await db
          .collection('ai_model_catalog')
          .where('provider', '==', newProvider)
          .where('model', '==', newModel)
          .limit(1)
          .get();

        // Check if another document (not this one) has the same provider+model
        const conflict = existingSnap.docs.find(d => d.id !== id);
        if (conflict) {
          logger.warn('AI model conflict', { provider: newProvider, model: newModel });
          logger.end();
          return res.status(400).json({ error: 'DUPLICATE', message: 'Bu provider+model kombinasyonu zaten mevcut' });
        }
      }

      await db.collection('ai_model_catalog').doc(id).update(updateData);

      // Teklifbul Rule v1.4 - Invalidate cache (catalog changed)
      invalidateAvailableModelsCacheAll();

      logger.info('AI model updated', { id });
      logger.end();
      return res.json({ ok: true });
    } catch (error: any) {
      logger.error('AI model update error', error);
      logger.end();
      return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
  }
);

/**
 * DELETE /api/admin/ai-models/:id
 * Delete AI model (soft delete: set isActive=false)
 */
router.delete('/ai-models/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin AI model delete');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const { id } = req.params;

    // Soft delete: set isActive=false
    await db.collection('ai_model_catalog').doc(id).update({
      isActive: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user!.uid,
    });

    // Teklifbul Rule v1.4 - Invalidate cache (catalog changed)
    invalidateAvailableModelsCacheAll();

    logger.info('AI model deleted (soft)', { id });
    logger.end();
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error('AI model delete error', error);
    logger.end();
    return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
  }
});

// ==================== TOKEN PACKAGES ====================

const tokenPackageSchema = z.object({
  name: z.string().min(1, 'Paket adı gerekli'),
  tokens: z.number().int().positive('Token sayısı pozitif olmalı'),
  priceTRY: z.number().min(0, 'Fiyat negatif olamaz'),
  planRequired: z.string().optional().default('premium_plus'),
  isActive: z.boolean().optional().default(true),
  sort: z.number().int().optional().default(100),
  allowedProviders: z.array(z.string()).min(1, 'En az bir provider gerekli'),
  allowedModels: z.array(z.string()).nullable().optional(),
  description: z.string().optional(),
});

/**
 * GET /api/admin/ai-token-packages
 * List all token packages
 */
router.get('/ai-token-packages', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin token packages list');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const snap = await db.collection('ai_token_packages').orderBy('sort', 'asc').get();
    const packages = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as any));

    // Secondary sort in memory to avoid complex index requirement
    packages.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return (a.name || '').localeCompare(b.name || '');
    });

    logger.info('Token packages listed', { count: packages.length });
    logger.end();
    return res.json({ packages });
  } catch (error: any) {
    logger.error('Token packages list error', error);
    logger.end();
    return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/ai-token-packages
 * Create new token package
 */
router.post('/ai-token-packages',
  validateRequest({ body: tokenPackageSchema }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin token package create');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const body = req.body;
      // Normalize allowedModels: empty array => null
      const allowedModels = Array.isArray(body.allowedModels) && body.allowedModels.length > 0
        ? body.allowedModels
        : null;

      const docRef = db.collection('ai_token_packages').doc();
      await docRef.set({
        name: body.name,
        tokens: body.tokens,
        priceTRY: body.priceTRY,
        planRequired: body.planRequired || 'premium_plus',
        isActive: body.isActive !== false,
        sort: body.sort || 100,
        allowedProviders: body.allowedProviders,
        allowedModels,
        description: body.description || null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      });

      // Teklifbul Rule v1.4 - Invalidate cache (packages affect availableModels)
      invalidateAvailableModelsCacheAll();

      logger.info('Token package created', { id: docRef.id, name: body.name });
      logger.end();
      return res.json({ ok: true, id: docRef.id });
    } catch (error: any) {
      logger.error('Token package create error', error);
      logger.end();
      return res.status(500).json({ error: 'CREATE_ERROR', message: error.message });
    }
  }
);

/**
 * PATCH /api/admin/ai-token-packages/:id
 * Update token package
 */
router.patch('/ai-token-packages/:id',
  validateRequest({
    body: tokenPackageSchema.partial(),
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin token package update');
    try {
      const db = await getAdminDb();
      if (!db) {
        logger.end();
        return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
      }

      const { id } = req.params;
      const body = req.body;

      const updateData: any = {
        ...body,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user!.uid,
      };

      // Normalize allowedModels if present
      if ('allowedModels' in body) {
        updateData.allowedModels = Array.isArray(body.allowedModels) && body.allowedModels.length > 0
          ? body.allowedModels
          : null;
      }

      await db.collection('ai_token_packages').doc(id).update(updateData);

      // Teklifbul Rule v1.4 - Invalidate cache (packages affect availableModels)
      invalidateAvailableModelsCacheAll();

      logger.info('Token package updated', { id });
      logger.end();
      return res.json({ ok: true });
    } catch (error: any) {
      logger.error('Token package update error', error);
      logger.end();
      return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
  }
);

/**
 * DELETE /api/admin/ai-token-packages/:id
 * Delete token package (soft delete: set isActive=false)
 */
router.delete('/ai-token-packages/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin token package delete');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const { id } = req.params;

    // Soft delete: set isActive=false
    await db.collection('ai_token_packages').doc(id).update({
      isActive: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user!.uid,
    });

    // Teklifbul Rule v1.4 - Invalidate cache (packages affect availableModels)
    invalidateAvailableModelsCacheAll();

    logger.info('Token package deleted (soft)', { id });
    logger.end();
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error('Token package delete error', error);
    logger.end();
    return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
  }
});

/**
 * GET /api/admin/upgrade-leads
 * Returns last 50 upgrade leads across all companies (admin only)
 */
router.get('/upgrade-leads', verifyToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Admin Upgrade Leads API');
    
    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    // Fetch leads from all companies (last 50)
    // TODO: Optimize with composite query if needed
    const companiesSnap = await db.collection('companies').limit(100).get(); // Limit companies for performance
    const allLeads: any[] = [];

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;
      const leadsSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('upgradeLeads')
        .orderBy('createdAtMs', 'desc')
        .limit(10)
        .get();
      
      leadsSnap.docs.forEach(doc => {
        const data = doc.data();
        allLeads.push({
          id: doc.id,
          companyId,
          ...data,
        });
      });
    }

    // Sort by createdAtMs descending and take last 50
    allLeads.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    const last50 = allLeads.slice(0, 50);

    logger.info('Upgrade leads fetched', { count: last50.length });
    logger.end();

    return res.json({
      leads: last50,
    });
  } catch (error: any) {
    logger.error('Error in upgrade leads endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

