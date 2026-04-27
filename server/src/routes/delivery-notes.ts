/**
 * Delivery Notes Routes - Satış Modülü Faz 4
 * İrsaliye oluşturma API endpoint'leri
 * Teklifbul Rule v1.0 - Transaction güvenli, validation, audit log
 */

import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { edocSendLimiter, edocStatusLimiter, edocPdfLimiter, edocCancelLimiter } from '../middleware/rateLimit.js';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { createDeliveryNoteDraftFromSale, createDirectDeliveryNoteDraft, prepareDeliveryNote, sendDeliveryNote, syncDeliveryNoteStatus, getDeliveryNotePdf, cancelDeliveryNote } from '../services/deliveryNoteService.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { deliveryNoteIdParamsSchema, companyIdBodySchema } from '../schemas/deliveryNoteSchemas.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(verifyToken);

/**
 * POST /api/delivery-notes
 * Irsaliye olustur. Teklifbul Rule v1.0 - edespatch.create izni gerekli.
 */
router.post('/', requirePermission('edespatch.create'), async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const body = req.body as any;
    if (!body.saleId || !body.companyId || !body.items || body.items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'saleId, companyId ve items zorunludur'
      });
    }

    // CompanyId kontrolü
    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== body.companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const companyId = userData.companyId;

    // İrsaliye oluştur
    const result = await createDeliveryNoteDraftFromSale({
      companyId,
      saleId: body.saleId,
      userId,
      requestId: body.requestId,
      shipDate: body.shipDate ? new Date(body.shipDate) : undefined,
      shipToAddress: body.deliveryAddress
    });
    const deliveryNoteId = result.deliveryNoteId;

    return res.status(201).json({
      ok: true,
      deliveryNoteId,
      message: 'İrsaliye oluşturuldu'
    });
  } catch (error: any) {
    logger.error('İrsaliye oluşturma hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye oluşturulamadı'
    });
  }
});

/**
 * POST /api/delivery-notes/direct
 * Sifirdan (satissiz) irsaliye olustur. Teklifbul Rule v1.0 - edespatch.create izni gerekli.
 */
router.post('/direct', requirePermission('edespatch.create'), async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const body = req.body as any;
    if (!body.companyId || !body.customerId || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'companyId, customerId ve en az bir items zorunludur'
      });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData || (userData.companyId !== body.companyId && userData.activeCompanyId !== body.companyId)) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const result = await createDirectDeliveryNoteDraft({
      companyId: body.companyId,
      userId,
      customerId: body.customerId,
      items: body.items,
      shipDate: body.shipDate ? new Date(body.shipDate) : undefined,
      shipToAddress: body.shipToAddress,
      fromLocationId: body.fromLocationId,
      fromLocationName: body.fromLocationName,
      requestId: body.requestId
    });

    return res.status(201).json({
      ok: true,
      deliveryNoteId: result.deliveryNoteId,
      number: result.number,
      message: 'İrsaliye oluşturuldu'
    });
  } catch (error: any) {
    logger.error('Direct irsaliye oluşturma hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye oluşturulamadı'
    });
  }
});

/**
 * GET /api/delivery-notes/:id
 * İrsaliye detayını getir
 * Permission: edespatch.view
 */
router.get('/:id', 
  validate({ params: deliveryNoteIdParamsSchema }),
  requirePermission('edespatch.view'), 
  async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const deliveryNoteId = req.params.id;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
    if (!deliveryNoteDoc.exists) {
      return res.status(404).json({ ok: false, error: 'İrsaliye bulunamadı' });
    }

    const deliveryNote = deliveryNoteDoc.data();

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== deliveryNote?.companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    return res.json({
      ok: true,
      deliveryNote: {
        id: deliveryNoteDoc.id,
        ...deliveryNote
      }
    });
  } catch (error: any) {
    logger.error('İrsaliye getirme hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye getirilemedi'
    });
  }
});

/**
 * POST /api/delivery-notes/:id/prepare
 * Delivery note hazırla (validasyon + status=ready)
 * Permission: edespatch.create
 */
router.post('/:id/prepare', 
  validate({ 
    params: deliveryNoteIdParamsSchema,
    body: companyIdBodySchema
  }),
  requirePermission('edespatch.create'), 
  async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const deliveryNoteId = req.params.id;
    const body = req.body as { companyId?: string };

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // CompanyId resolve
    let companyId = body.companyId;
    if (!companyId) {
      const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
      if (!deliveryNoteDoc.exists) {
        return res.status(404).json({ ok: false, error: 'İrsaliye bulunamadı' });
      }
      companyId = deliveryNoteDoc.data()?.companyId;
    }

    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== companyId && userData?.activeCompanyId !== companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    await prepareDeliveryNote(deliveryNoteId, userId, companyId);

    return res.json({
      ok: true,
      message: 'İrsaliye hazırlandı'
    });
  } catch (error: any) {
    logger.error('Delivery note prepare hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye hazırlanamadı',
      errorType: error.message?.includes('Validasyon') ? 'VALIDATION_ERROR' : 'PROVIDER_ERROR'
    });
  }
});

/**
 * POST /api/delivery-notes/:id/send
 * Delivery note gönder
 * Permission: edespatch.send
 */
router.post('/:id/send', 
  validate({ 
    params: deliveryNoteIdParamsSchema,
    body: companyIdBodySchema
  }),
  edocSendLimiter,
  requirePermission('edespatch.send'), 
  async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const deliveryNoteId = req.params.id;
    const body = req.body as { companyId?: string };

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // CompanyId resolve
    let companyId = body.companyId;
    if (!companyId) {
      const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
      if (!deliveryNoteDoc.exists) {
        return res.status(404).json({ ok: false, error: 'İrsaliye bulunamadı' });
      }
      companyId = deliveryNoteDoc.data()?.companyId;
    }

    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== companyId && userData?.activeCompanyId !== companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const result = await sendDeliveryNote(deliveryNoteId, userId, companyId);

    return res.json({
      ok: true,
      externalId: result.externalId,
      uuid: result.uuid,
      message: 'İrsaliye gönderildi'
    });
  } catch (error: any) {
    logger.error('Delivery note send hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye gönderilemedi',
      errorType: 'PROVIDER_ERROR'
    });
  }
});

/**
 * GET /api/delivery-notes/:id/status
 * Delivery note durum sorgula
 * Permission: edespatch.status
 */
router.get('/:id/status', 
  validate({ params: deliveryNoteIdParamsSchema }),
  edocStatusLimiter,
  requirePermission('edespatch.status'), 
  async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const deliveryNoteId = req.params.id;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // Delivery note'u al
    const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
    if (!deliveryNoteDoc.exists) {
      return res.status(404).json({ ok: false, error: 'İrsaliye bulunamadı' });
    }

    const deliveryNote = deliveryNoteDoc.data();
    const companyId = deliveryNote?.companyId;

    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== companyId && userData?.activeCompanyId !== companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const result = await syncDeliveryNoteStatus(deliveryNoteId, userId, companyId);

    return res.json({
      ok: true,
      status: result.status,
      pdfUrl: result.pdfUrl
    });
  } catch (error: any) {
    logger.error('Delivery note status hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye durumu sorgulanamadı',
      errorType: 'PROVIDER_ERROR'
    });
  }
});

/**
 * GET /api/delivery-notes/:id/pdf
 * Delivery note PDF al
 * Permission: edespatch.view
 */
router.get('/:id/pdf', 
  validate({ params: deliveryNoteIdParamsSchema }),
  edocPdfLimiter,
  requirePermission('edespatch.view'), 
  async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const deliveryNoteId = req.params.id;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // Delivery note'u al
    const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
    if (!deliveryNoteDoc.exists) {
      return res.status(404).json({ ok: false, error: 'İrsaliye bulunamadı' });
    }

    const deliveryNote = deliveryNoteDoc.data();
    const companyId = deliveryNote?.companyId;

    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== companyId && userData?.activeCompanyId !== companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const result = await getDeliveryNotePdf(deliveryNoteId, userId, companyId);

    return res.json({
      ok: true,
      pdfUrl: result.pdfUrl
    });
  } catch (error: any) {
    logger.error('Delivery note PDF hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye PDF alınamadı',
      errorType: 'PROVIDER_ERROR'
    });
  }
});

/**
 * POST /api/delivery-notes/:id/cancel
 * Delivery note iptal et
 * Permission: edespatch.cancel
 */
router.post('/:id/cancel', 
  validate({ 
    params: deliveryNoteIdParamsSchema,
    body: companyIdBodySchema
  }),
  edocCancelLimiter,
  requirePermission('edespatch.cancel'), 
  async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const deliveryNoteId = req.params.id;
    const body = req.body as { companyId?: string };

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // CompanyId resolve
    let companyId = body.companyId;
    if (!companyId) {
      const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
      if (!deliveryNoteDoc.exists) {
        return res.status(404).json({ ok: false, error: 'İrsaliye bulunamadı' });
      }
      companyId = deliveryNoteDoc.data()?.companyId;
    }

    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.companyId !== companyId && userData?.activeCompanyId !== companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    await cancelDeliveryNote(deliveryNoteId, userId, companyId);

    return res.json({
      ok: true,
      message: 'İrsaliye iptal edildi'
    });
  } catch (error: any) {
    logger.error('Delivery note cancel hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'İrsaliye iptal edilemedi',
      errorType: 'PROVIDER_ERROR'
    });
  }
});

export default router;
