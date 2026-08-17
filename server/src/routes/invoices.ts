/**
 * Invoice Routes - Satış Modülü Faz 4
 * Fatura ve ödeme kaydı API endpoint'leri
 * Teklifbul Rule v1.0 - Transaction güvenli, validation, audit log
 */

import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { edocSendLimiter, edocStatusLimiter, edocPdfLimiter, edocCancelLimiter } from '../middleware/rateLimit.js';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { createInvoiceDraftFromSale, createDirectInvoiceDraft, recordPayment, prepareInvoice, sendInvoice, syncInvoiceStatus, getInvoicePdf, cancelInvoice } from '../services/invoiceService.js';
import { sendEInvoice } from '../services/efaturaService.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { invoiceIdParamsSchema, companyIdBodySchema } from '../schemas/invoiceSchemas.js';
import { userBelongsToCompanyAsync } from '../../utils/companyAccess.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(verifyToken);

/**
 * POST /api/invoices
 * Fatura olustur. Teklifbul Rule v1.0 - einvoice.create izni gerekli.
 */
router.post('/', requirePermission('einvoice.create'), async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const body = req.body as any;
    if (!body.saleId || !body.companyId) {
      return res.status(400).json({ ok: false, error: 'saleId ve companyId zorunludur' });
    }

    // CompanyId kontrolü
    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData || !(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const companyId = body.companyId;

    // Fatura oluştur
    const result = await createInvoiceDraftFromSale({
      companyId,
      saleId: body.saleId,
      userId,
      requestId: body.requestId || null
    });
    const invoiceId = result.invoiceId;

    return res.status(201).json({
      ok: true,
      invoiceId,
      message: 'Fatura oluşturuldu'
    });
  } catch (error: any) {
    logger.error('Fatura oluşturma hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Fatura oluşturulamadı'
    });
  }
});

/**
 * POST /api/invoices/direct
 * Sifirdan (satissiz) fatura olustur. Teklifbul Rule v1.0 - einvoice.create izni gerektirir.
 */
router.post('/direct', requirePermission('einvoice.create'), async (req: any, res) => {
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
    if (!userData || !(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const result = await createDirectInvoiceDraft({
      companyId: body.companyId,
      userId,
      customerId: body.customerId,
      items: body.items,
      currency: body.currency,
      exchangeRate: body.exchangeRate,
      paymentTermsDays: body.paymentTermsDays,
      requestId: body.requestId
    });

    return res.status(201).json({
      ok: true,
      invoiceId: result.invoiceId,
      number: result.number,
      message: 'Fatura oluşturuldu'
    });
  } catch (error: any) {
    logger.error('Direct fatura oluşturma hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Fatura oluşturulamadı'
    });
  }
});

/**
 * POST /api/invoices/:id/payments
 * Ödeme kaydı ekle
 */
router.post('/:id/payments', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const invoiceId = req.params.id;
    const body = req.body as any;

    if (!body.amount || !body.date || !body.method || !body.companyId) {
      return res.status(400).json({
        ok: false,
        error: 'amount, date, method ve companyId zorunludur'
      });
    }

    // CompanyId kontrolü
    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData || !(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const companyId = body.companyId;

    // Tarih parse et
    const paymentDate = body.date instanceof Date ? body.date : new Date(body.date);

    // Ödeme kaydı ekle
    await recordPayment(invoiceId, userId, companyId, {
      amount: parseFloat(body.amount),
      date: paymentDate,
      method: body.method,
      reference: body.reference || null
    });

    return res.json({
      ok: true,
      message: 'Ödeme kaydedildi'
    });
  } catch (error: any) {
    logger.error('Ödeme kaydı hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Ödeme kaydedilemedi'
    });
  }
});

/**
 * GET /api/invoices/:id
 * Fatura detayını getir
 * Permission: einvoice.view
 */
router.get('/:id',
  validate({ params: invoiceIdParamsSchema }),
  requirePermission('einvoice.view'),
  async (req: any, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const invoiceId = req.params.id;

      const db = await getAdminDb();
      if (!db) {
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
      if (!invoiceDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Fatura bulunamadı' });
      }

      const invoice = invoiceDoc.data();

      // Company kontrolü
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      if (!(await userBelongsToCompanyAsync(userData, invoice?.companyId, userId))) {
        return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
      }

      // Ödeme kayıtlarını yükle (subcollection)
      const paymentsSnapshot = await db
        .collection('invoices')
        .doc(invoiceId)
        .collection('invoice_payments')
        .orderBy('date', 'desc')
        .get();

      const payments = paymentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.json({
        ok: true,
        invoice: {
          id: invoiceDoc.id,
          ...invoice,
          payments: payments // Subcollection'dan gelen ödemeler
        }
      });
    } catch (error: any) {
      logger.error('Fatura getirme hatası (API)', error);
      return res.status(400).json({
        ok: false,
        error: error.message || 'Fatura getirilemedi'
      });
    }
  });

/**
 * POST /api/invoices/:id/send-efatura
 * E-fatura gönder
 */
router.post('/:id/send-efatura', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const invoiceId = req.params.id;
    const body = req.body as any;

    if (!body.companyId) {
      return res.status(400).json({ ok: false, error: 'companyId zorunludur' });
    }

    // CompanyId kontrolü
    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData || !(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const companyId = body.companyId;

    // E-fatura gönder
    const eInvoiceUUID = await sendEInvoice(invoiceId, userId, companyId);

    return res.json({
      ok: true,
      eInvoiceUUID,
      message: 'E-fatura gönderildi'
    });
    } catch (error: any) {
    logger.error('E-fatura gönderim hatası (API)', error);
    const unavailable = error?.name === 'EdocNotAvailableError' || String(error?.message || '').includes('henüz aktif değil');
    return res.status(unavailable ? 503 : 400).json({
      ok: false,
      error: error.message || 'E-fatura gönderilemedi'
    });
  }
});

/**
 * POST /api/invoices/:id/prepare
 * Invoice hazırla (validasyon + status=ready)
 * Permission: einvoice.create
 */
router.post('/:id/prepare',
  validate({
    params: invoiceIdParamsSchema,
    body: companyIdBodySchema
  }),
  requirePermission('einvoice.create'),
  async (req: any, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const invoiceId = req.params.id;
      const body = req.body as { companyId?: string };

      const db = await getAdminDb();
      if (!db) {
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      // CompanyId resolve
      let companyId = body.companyId;
      if (!companyId) {
        const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
        if (!invoiceDoc.exists) {
          return res.status(404).json({ ok: false, error: 'Fatura bulunamadı' });
        }
        companyId = invoiceDoc.data()?.companyId;
      }

      if (!companyId) {
        return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
      }

      // Company kontrolü
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
        return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
      }

      await prepareInvoice(invoiceId, userId, companyId);

      return res.json({
        ok: true,
        message: 'Fatura hazırlandı'
      });
    } catch (error: any) {
      logger.error('Invoice prepare hatası (API)', error);
      return res.status(400).json({
        ok: false,
        error: error.message || 'Fatura hazırlanamadı',
        errorType: error.message?.includes('Validasyon') ? 'VALIDATION_ERROR' : 'PROVIDER_ERROR'
      });
    }
  });

/**
 * POST /api/invoices/:id/send
 * Invoice gönder
 * Permission: einvoice.send
 */
router.post('/:id/send',
  validate({
    params: invoiceIdParamsSchema,
    body: companyIdBodySchema
  }),
  edocSendLimiter,
  requirePermission('einvoice.send'),
  async (req: any, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const invoiceId = req.params.id;
      const body = req.body as { companyId?: string };

      const db = await getAdminDb();
      if (!db) {
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      // CompanyId resolve
      let companyId = body.companyId;
      if (!companyId) {
        const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
        if (!invoiceDoc.exists) {
          return res.status(404).json({ ok: false, error: 'Fatura bulunamadı' });
        }
        companyId = invoiceDoc.data()?.companyId;
      }

      if (!companyId) {
        return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
      }

      // Company kontrolü
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
        return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
      }

      const result = await sendInvoice(invoiceId, userId, companyId);

      return res.json({
        ok: true,
        externalId: result.externalId,
        uuid: result.uuid,
        message: 'Fatura gönderildi'
      });
    } catch (error: any) {
      logger.error('Invoice send hatası (API)', error);
      const unavailable = error?.name === 'EdocNotAvailableError' || String(error?.message || '').includes('henüz aktif değil');
      return res.status(unavailable ? 503 : 400).json({
        ok: false,
        error: error.message || 'Fatura gönderilemedi',
        errorType: 'PROVIDER_ERROR'
      });
    }
  });

/**
 * GET /api/invoices/:id/status
 * Invoice durum sorgula
 * Permission: einvoice.status
 */
router.get('/:id/status',
  validate({ params: invoiceIdParamsSchema }),
  edocStatusLimiter,
  requirePermission('einvoice.status'),
  async (req: any, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const invoiceId = req.params.id;

      const db = await getAdminDb();
      if (!db) {
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      // Invoice'ı al
      const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
      if (!invoiceDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Fatura bulunamadı' });
      }

      const invoice = invoiceDoc.data();
      const companyId = invoice?.companyId;

      if (!companyId) {
        return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
      }

      // Company kontrolü
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
        return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
      }

      const result = await syncInvoiceStatus(invoiceId, userId, companyId);

      return res.json({
        ok: true,
        status: result.status,
        ettn: result.ettn,
        pdfUrl: result.pdfUrl
      });
    } catch (error: any) {
      logger.error('Invoice status hatası (API)', error);
      return res.status(400).json({
        ok: false,
        error: error.message || 'Fatura durumu sorgulanamadı',
        errorType: 'PROVIDER_ERROR'
      });
    }
  });

/**
 * GET /api/invoices/:id/pdf
 * Invoice PDF al
 * Permission: einvoice.view
 */
router.get('/:id/pdf',
  validate({ params: invoiceIdParamsSchema }),
  edocPdfLimiter,
  requirePermission('einvoice.view'),
  async (req: any, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const invoiceId = req.params.id;

      const db = await getAdminDb();
      if (!db) {
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      // Invoice'ı al
      const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
      if (!invoiceDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Fatura bulunamadı' });
      }

      const invoice = invoiceDoc.data();
      const companyId = invoice?.companyId;

      if (!companyId) {
        return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
      }

      // Company kontrolü
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
        return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
      }

      const result = await getInvoicePdf(invoiceId, userId, companyId);

      return res.json({
        ok: true,
        pdfUrl: result.pdfUrl
      });
    } catch (error: any) {
      logger.error('Invoice PDF hatası (API)', error);
      return res.status(400).json({
        ok: false,
        error: error.message || 'Fatura PDF alınamadı',
        errorType: 'PROVIDER_ERROR'
      });
    }
  });

/**
 * POST /api/invoices/:id/cancel
 * Invoice iptal et
 * Permission: einvoice.cancel
 */
router.post('/:id/cancel',
  validate({
    params: invoiceIdParamsSchema,
    body: companyIdBodySchema
  }),
  edocCancelLimiter,
  requirePermission('einvoice.cancel'),
  async (req: any, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const invoiceId = req.params.id;
      const body = req.body as { companyId?: string };

      const db = await getAdminDb();
      if (!db) {
        return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
      }

      // CompanyId resolve
      let companyId = body.companyId;
      if (!companyId) {
        const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
        if (!invoiceDoc.exists) {
          return res.status(404).json({ ok: false, error: 'Fatura bulunamadı' });
        }
        companyId = invoiceDoc.data()?.companyId;
      }

      if (!companyId) {
        return res.status(400).json({ ok: false, error: 'Company ID bulunamadı' });
      }

      // Company kontrolü
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
        return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
      }

      await cancelInvoice(invoiceId, userId, companyId);

      return res.json({
        ok: true,
        message: 'Fatura iptal edildi'
      });
    } catch (error: any) {
      logger.error('Invoice cancel hatası (API)', error);
      return res.status(400).json({
        ok: false,
        error: error.message || 'Fatura iptal edilemedi',
        errorType: 'PROVIDER_ERROR'
      });
    }
  });

export default router;
