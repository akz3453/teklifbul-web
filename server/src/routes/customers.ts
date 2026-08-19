/**
 * Customers Routes - Satış Modülü Faz 1
 * Müşteri CRUD API endpoint'leri
 * Teklifbul Rule v1.0 - Transaction güvenliği, validation, audit log
 */

import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import {
  createCustomer,
  updateCustomer,
  archiveCustomer,
  CreateCustomerInput,
  UpdateCustomerInput
} from '../services/customerService.js';
import { logAuditEvent } from '../services/auditService.js';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import ExcelJS from 'exceljs';
import { userBelongsToCompanyAsync } from '../../utils/companyAccess.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(verifyToken);
/**
 * POST /api/customers
 * Yeni müşteri oluştur
 */
router.post('/', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const body = req.body as CreateCustomerInput;
    if (!body.companyId || !body.name) {
      return res.status(400).json({ ok: false, error: 'companyId ve name zorunludur' });
    }

    // CompanyId kontrolü (kullanıcının şirketi ile eşleşmeli)
    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const customerId = await createCustomer({
      ...body,
      userId
    });

    // Audit log
    await logAuditEvent({
      companyId: body.companyId,
      entityType: 'customer',
      entityId: customerId,
      action: 'create',
      actorUserId: userId,
      result: 'success',
      metadata: { code: 'auto-generated' }
    });

    // ...

    logger.info('Müşteri oluşturuldu (API)', { customerId, companyId: body.companyId });

    return res.status(201).json({
      ok: true,
      customerId,
      message: 'Müşteri oluşturuldu'
    });
  } catch (error: any) {
    logger.error('Müşteri oluşturma hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Müşteri oluşturulamadı'
    });
  }
});

/**
 * PUT /api/customers/:id
 * Müşteri güncelle
 */
router.put('/:id', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const body = req.body as UpdateCustomerInput;

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
    if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Mevcut müşteriyi al (audit log için)
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }

    const oldCustomer = customerDoc.data();
    if (oldCustomer?.companyId !== body.companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    await updateCustomer({
      ...body,
      customerId,
      userId
    });

    // Audit log
    await logAuditEvent({
      companyId: body.companyId,
      entityType: 'customer',
      entityId: customerId,
      action: 'update',
      actorUserId: userId,
      result: 'success',
      metadata: { changedFields: Object.keys(body).filter((k) => k !== 'companyId' && k !== 'userId') }
    });

    logger.info('Müşteri güncellendi (API)', { customerId, companyId: body.companyId });

    return res.json({
      ok: true,
      message: 'Müşteri güncellendi'
    });
  } catch (error: any) {
    logger.error('Müşteri güncelleme hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Müşteri güncellenemedi'
    });
  }
});

/**
 * POST /api/customers/:id/approve
 * Müşteri onayla
 */
router.post('/:id/approve', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const body = req.body as { companyId: string };

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
    if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Onay yetkisi kontrolü
    const userRole = userData?.companyRoleKey || userData?.companyRole || '';
    const canApprove = canApproveCustomer(userRole);
    if (!canApprove) {
      return res.status(403).json({
        ok: false,
        error: 'Müşteri onaylama yetkiniz yok. Sadece yönetici kadrosu, satış müdürü ve satış yöneticisi onaylayabilir.'
      });
    }

    // Müşteriyi al
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }

    const customerData = customerDoc.data();
    if (customerData?.companyId !== body.companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Müşteriyi onayla
    await db.collection('customers').doc(customerId).update({
      status: 'approved',
      approvedBy: userId,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log
    await logAuditEvent({
      companyId: body.companyId,
      entityType: 'customer',
      entityId: customerId,
      action: 'approve',
      actorUserId: userId,
      result: 'success'
    });

    logger.info('Müşteri onaylandı (API)', { customerId, companyId: body.companyId });

    return res.json({
      ok: true,
      message: 'Müşteri onaylandı'
    });
  } catch (error: any) {
    logger.error('Müşteri onaylama hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Müşteri onaylanamadı'
    });
  }
});

/**
 * POST /api/customers/:id/reject
 * Müşteri reddet
 */
router.post('/:id/reject', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const body = req.body as { companyId: string; reason?: string };

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
    if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Onay yetkisi kontrolü
    const userRole = userData?.companyRoleKey || userData?.companyRole || '';
    const canApprove = canApproveCustomer(userRole);
    if (!canApprove) {
      return res.status(403).json({
        ok: false,
        error: 'Müşteri reddetme yetkiniz yok. Sadece yönetici kadrosu, satış müdürü ve satış yöneticisi reddedebilir.'
      });
    }

    // Müşteriyi al
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }

    const customerData = customerDoc.data();
    if (customerData?.companyId !== body.companyId) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Müşteriyi reddet
    await db.collection('customers').doc(customerId).update({
      status: 'rejected',
      rejectedBy: userId,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectionReason: body.reason || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log
    await logAuditEvent({
      companyId: body.companyId,
      entityType: 'customer',
      entityId: customerId,
      action: 'reject',
      actorUserId: userId,
      result: 'success',
      metadata: { reason: body.reason }
    });

    logger.info('Müşteri reddedildi (API)', { customerId, companyId: body.companyId });

    return res.json({
      ok: true,
      message: 'Müşteri reddedildi'
    });
  } catch (error: any) {
    logger.error('Müşteri reddetme hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Müşteri reddedilemedi'
    });
  }
});

/**
 * Onay yetkisi kontrolü
 * Yönetim kadrosu (görseldeki roller) + supplier:satis_muduru + supplier:satis_yoneticisi
 */
function canApproveCustomer(userRole: string): boolean {
  const approvalRoles = [
    // Yönetim kadrosu (görseldeki roller)
    'buyer:isveren',
    'buyer:yonetim_kurulu_baskani',
    'buyer:yonetim_kurulu_uyesi',
    'buyer:ceo',
    'buyer:genel_mudur',
    'buyer:genel_mudur_yardimcisi',
    'supplier:isveren',
    'supplier:yonetim_kurulu_baskani',
    'supplier:yonetim_kurulu_uyesi',
    'supplier:ceo',
    'supplier:genel_mudur',
    'supplier:genel_mudur_yardimcisi',
    // Satış rolleri
    'supplier:satis_muduru',
    'supplier:satis_yoneticisi',
    // Prefix'siz versiyonlar (geriye dönük uyumluluk)
    'isveren',
    'yonetim_kurulu_baskani',
    'yonetim_kurulu_uyesi',
    'ceo',
    'genel_mudur',
    'genel_mudur_yardimcisi',
    'satis_muduru',
    'satis_yoneticisi'
  ];

  return approvalRoles.includes(userRole);
}

/**
 * POST /api/customers/:id/archive
 * Müşteri arşivle (soft delete)
 */
router.post('/:id/archive', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const body = req.body as { companyId: string; userId: string };

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
    if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    await archiveCustomer(customerId, body.companyId, userId);

    // Audit log
    await logAuditEvent({
      companyId: body.companyId,
      entityType: 'customer',
      entityId: customerId,
      action: 'archive',
      actorUserId: userId,
      result: 'success'
    });

    logger.info('Müşteri arşivlendi (API)', { customerId, companyId: body.companyId });

    return res.json({
      ok: true,
      message: 'Müşteri arşivlendi'
    });
  } catch (error: any) {
    logger.error('Müşteri arşivleme hatası (API)', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Müşteri arşivlenemedi'
    });
  }
});

/**
 * GET /api/customers/:id/movements
 * Müşteri hareketlerini getir (satışlar, faturalar, irsaliyeler)
 */
router.get('/:id/movements', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const startDate = req.query.startDate && req.query.startDate !== '' ? new Date(req.query.startDate as string) : null;
    const endDate = req.query.endDate && req.query.endDate !== '' ? new Date(req.query.endDate as string) : null;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // Müşteri kontrolü
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }

    const customer = customerDoc.data();
    const companyId = customer?.companyId;
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Müşteri şirket bilgisi eksik' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    const movements = [];

    // Satışlar
    let salesQuery = db.collection('sales')
      .where('companyId', '==', companyId)
      .where('customerId', '==', customerId)
      ;

    if (startDate) {
      salesQuery = salesQuery.where('createdAt', '>=', startDate);
    }
    if (endDate) {
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);
      salesQuery = salesQuery.where('createdAt', '<=', endDateWithTime);
    }

    const salesSnapshot = await salesQuery.get();
    salesSnapshot.forEach((doc) => {
      const sale = doc.data();
      movements.push({
        id: doc.id,
        type: 'sale',
        documentNumber: sale.saleNumber || '',
        date: sale.createdAt,
        amount: sale.totalAmount || 0,
        currency: sale.currency || 'TRY',
        status: sale.status || 'draft'
      });
    });

    // Faturalar
    let invoicesQuery = db.collection('invoices')
      .where('companyId', '==', companyId)
      .where('customerId', '==', customerId)
      ;

    if (startDate) {
      invoicesQuery = invoicesQuery.where('invoiceDate', '>=', startDate);
    }
    if (endDate) {
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);
      invoicesQuery = invoicesQuery.where('invoiceDate', '<=', endDateWithTime);
    }

    const invoicesSnapshot = await invoicesQuery.get();
    invoicesSnapshot.forEach((doc) => {
      const invoice = doc.data();
      movements.push({
        id: doc.id,
        type: 'invoice',
        documentNumber: invoice.invoiceNumber || '',
        date: invoice.invoiceDate,
        amount: invoice.totalAmount || 0,
        currency: invoice.currency || 'TRY',
        paymentStatus: invoice.paymentStatus || 'unpaid'
      });
    });

    // İrsaliyeler (delivery notes)
    // İrsaliyeler sales üzerinden customerId ile ilişkilendirilmiş
    const deliveryNotesQuery = db.collection('delivery_notes')
      .where('companyId', '==', companyId)
      ;

    const deliveryNotesSnapshot = await deliveryNotesQuery.get();
    for (const doc of deliveryNotesSnapshot.docs) {
      const deliveryNote = doc.data();
      // Sale'i kontrol et
      if (deliveryNote.saleId) {
        const saleDoc = await db.collection('sales').doc(deliveryNote.saleId).get();
        if (saleDoc.exists && saleDoc.data()?.customerId === customerId) {
          // Tarih filtresi
          const noteDate = deliveryNote.createdAt?.toDate ? deliveryNote.createdAt.toDate() : new Date(deliveryNote.createdAt);
          if (startDate && noteDate < startDate) continue;
          if (endDate) {
            const endDateWithTime = new Date(endDate);
            endDateWithTime.setHours(23, 59, 59, 999);
            if (noteDate > endDateWithTime) continue;
          }

          movements.push({
            id: doc.id,
            type: 'deliveryNote',
            documentNumber: deliveryNote.deliveryNoteNumber || '',
            date: deliveryNote.createdAt,
            amount: 0, // İrsaliyede tutar yok
            currency: 'TRY',
            status: deliveryNote.status || 'delivered'
          });
        }
      }
    }

    // Tarihe göre sırala (en yeni en üstte)
    movements.sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    logger.info('Müşteri hareketleri getirildi', { customerId, count: movements.length });

    return res.json({
      ok: true,
      movements
    });
  } catch (error: any) {
    logger.error('Müşteri hareketleri getirme hatası', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Hareketler getirilemedi'
    });
  }
});

/**
 * GET /api/customers/:id/extre
 * Müşteri extre çıktısı (Excel)
 */
router.get('/:id/extre', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const startDate = req.query.startDate && req.query.startDate !== '' ? new Date(req.query.startDate as string) : null;
    const endDate = req.query.endDate && req.query.endDate !== '' ? new Date(req.query.endDate as string) : null;

    // Teklifbul Rule v1.0 — seçilebilir extre türleri
    const ALL_EXPORT_TYPES = ['customerInfo', 'sale', 'invoice', 'deliveryNote', 'payment'] as const;
    const rawTypes = String(req.query.types || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const selectedTypes = new Set(
      (rawTypes.length > 0 ? rawTypes : [...ALL_EXPORT_TYPES]).filter((t) =>
        (ALL_EXPORT_TYPES as readonly string[]).includes(t)
      )
    );
    if (selectedTypes.size === 0) {
      return res.status(400).json({ ok: false, error: 'En az bir extre türü seçiniz' });
    }

    const includeCustomerInfo = selectedTypes.has('customerInfo');
    const includeSale = selectedTypes.has('sale');
    const includeInvoice = selectedTypes.has('invoice');
    const includeDeliveryNote = selectedTypes.has('deliveryNote');
    const includePayment = selectedTypes.has('payment');

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // Müşteri kontrolü
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }

    const customer = customerDoc.data();
    const companyId = customer?.companyId;

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Hareketleri getir (movements endpoint mantığını tekrarla)
    const movements: any[] = [];

    // Satışlar
    if (includeSale) {
    let salesQuery = db.collection('sales')
      .where('companyId', '==', companyId)
      .where('customerId', '==', customerId)
      ;

    if (startDate) {
      salesQuery = salesQuery.where('createdAt', '>=', startDate);
    }
    if (endDate) {
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);
      salesQuery = salesQuery.where('createdAt', '<=', endDateWithTime);
    }

    const salesSnapshot = await salesQuery.get();
    salesSnapshot.forEach((doc) => {
      const sale = doc.data();
      movements.push({
        id: doc.id,
        type: 'sale',
        documentNumber: sale.saleNumber || '',
        date: sale.createdAt,
        amount: sale.totalAmount || 0,
        subTotal: sale.subTotal || 0,
        taxAmount: sale.taxAmount || 0,
        notes: sale.notes || '',
        currency: sale.currency || 'TRY',
        status: sale.status || 'draft'
      });
    });
    }

    // Faturalar
    if (includeInvoice) {
    let invoicesQuery = db.collection('invoices')
      .where('companyId', '==', companyId)
      .where('customerId', '==', customerId)
      ;

    if (startDate) {
      invoicesQuery = invoicesQuery.where('invoiceDate', '>=', startDate);
    }
    if (endDate) {
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);
      invoicesQuery = invoicesQuery.where('invoiceDate', '<=', endDateWithTime);
    }

    const invoicesSnapshot = await invoicesQuery.get();
    invoicesSnapshot.forEach((doc) => {
      const invoice = doc.data();
      movements.push({
        id: doc.id,
        type: 'invoice',
        documentNumber: invoice.invoiceNumber || '',
        date: invoice.invoiceDate,
        amount: invoice.totalAmount || 0,
        subTotal: invoice.subTotal || 0,
        taxAmount: invoice.taxAmount || 0,
        notes: invoice.notes || '',
        currency: invoice.currency || 'TRY',
        paymentStatus: invoice.paymentStatus || 'unpaid'
      });
    });
    }

    // İrsaliyeler
    if (includeDeliveryNote) {
    const deliveryNotesQuery = db.collection('delivery_notes')
      .where('companyId', '==', companyId)
      ;

    const deliveryNotesSnapshot = await deliveryNotesQuery.get();
    for (const doc of deliveryNotesSnapshot.docs) {
      const deliveryNote = doc.data();
      if (deliveryNote.saleId) {
        const saleDoc = await db.collection('sales').doc(deliveryNote.saleId).get();
        if (saleDoc.exists && saleDoc.data()?.customerId === customerId) {
          const noteDate = deliveryNote.createdAt?.toDate ? deliveryNote.createdAt.toDate() : new Date(deliveryNote.createdAt);
          if (startDate && noteDate < startDate) continue;
          if (endDate) {
            const endDateWithTime = new Date(endDate);
            endDateWithTime.setHours(23, 59, 59, 999);
            if (noteDate > endDateWithTime) continue;
          }

          movements.push({
            id: doc.id,
            type: 'deliveryNote',
            documentNumber: deliveryNote.deliveryNoteNumber || '',
            date: deliveryNote.createdAt,
            amount: 0,
            subTotal: 0,
            taxAmount: 0,
            notes: deliveryNote.notes || '',
            currency: 'TRY',
            status: deliveryNote.status || 'delivered'
          });
        }
      }
    }
    }

    // Tahsilatlar & Cari İşlemler
    if (includePayment) {
    let transactionsQuery = db.collection('customer_transactions')
      .where('companyId', '==', companyId)
      .where('customerId', '==', customerId)
      ;

    if (startDate) {
      transactionsQuery = transactionsQuery.where('date', '>=', startDate);
    }
    if (endDate) {
      const endDateWithTime = new Date(endDate);
      endDateWithTime.setHours(23, 59, 59, 999);
      transactionsQuery = transactionsQuery.where('date', '<=', endDateWithTime);
    }

    try {
      const transactionsSnapshot = await transactionsQuery.get();
      transactionsSnapshot.forEach((doc) => {
        const tx = doc.data();
        if (tx.transactionType === 'payment' || tx.type === 'credit') {
          movements.push({
            id: doc.id,
            type: 'payment',
            documentNumber: tx.documentNumber || '',
            date: tx.date || tx.createdAt,
            amount: tx.amount || 0,
            subTotal: 0,
            taxAmount: 0,
            notes: tx.description || '',
            currency: tx.currency || 'TRY',
            status: 'completed'
          });
        }
      });
    } catch (txErr: any) {
      const msg = String(txErr?.message || '');
      if (!msg.includes('FAILED_PRECONDITION') && !msg.includes('requires an index')) {
        throw txErr;
      }
      logger.warn('Extre tahsilat: index yok, fallback sorgu', { customerId, companyId });
      const fallbackSnap = await db.collection('customer_transactions')
        .where('customerId', '==', customerId)
        .limit(300)
        .get();
      fallbackSnap.docs.forEach((doc) => {
        const tx = doc.data();
        if (tx.companyId !== companyId) return;
        if (!(tx.transactionType === 'payment' || tx.type === 'credit')) return;
        const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : null);
        if (startDate && txDate && txDate < startDate) return;
        if (endDate && txDate) {
          const endDateWithTime = new Date(endDate);
          endDateWithTime.setHours(23, 59, 59, 999);
          if (txDate > endDateWithTime) return;
        }
        movements.push({
          id: doc.id,
          type: 'payment',
          documentNumber: tx.documentNumber || '',
          date: tx.date || tx.createdAt,
          amount: tx.amount || 0,
          subTotal: 0,
          taxAmount: 0,
          notes: tx.description || '',
          currency: tx.currency || 'TRY',
          status: 'completed'
        });
      });
    }
    }

    // Tarihe göre sırala
    movements.sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    // Excel oluştur (ExcelJS)
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Teklifbul';

    const addressStr = [
      customer?.address?.street,
      customer?.address?.avenue,
      customer?.address?.neighborhood,
      customer?.address?.district,
      customer?.address?.city
    ].filter(Boolean).join(', ');

    const phone = customer?.contact?.persons?.[0]?.phone || customer?.contact?.phone || '';

    const extInvoices = movements.filter(m => m.type === 'invoice');
    const totalMovementsAmount = movements
      .filter(m => m.type === 'invoice' || m.type === 'sale')
      .reduce((sum, m) => sum + (m.amount || 0), 0);
    const paidMovementsAmount = extInvoices
       .filter(m => m.paymentStatus === 'paid')
       .reduce((sum, m) => sum + (m.amount || 0), 0);
    // Tahsilatları ayrı toplayalım
    const totalCollected = movements
       .filter(m => m.type === 'payment')
       .reduce((sum, m) => sum + (m.amount || 0), 0);
    // Bakiye (Fatura - Tahsilat)
    const balance = totalMovementsAmount - totalCollected - paidMovementsAmount;

    const sheets: ExcelJS.Worksheet[] = [];

    // --- Müşteri Bilgileri Sayfası ---
    if (includeCustomerInfo) {
    const customerSheet = workbook.addWorksheet('Müşteri Bilgileri');
    customerSheet.columns = [
      { header: 'Özellik', key: 'key', width: 25 },
      { header: 'Değer', key: 'val', width: 50 },
    ];

    customerSheet.addRow({ key: 'Müşteri Kodu', val: customer?.code || '' });
    customerSheet.addRow({ key: 'Müşteri Adı', val: customer?.name || '' });
    customerSheet.addRow({ key: 'Yetkili/Telefon', val: phone });
    customerSheet.addRow({ key: 'E-posta', val: customer?.contact?.email || '' });
    customerSheet.addRow({ key: 'Adres', val: addressStr });
    customerSheet.addRow({ key: 'VKN/TCKN', val: customer?.taxNumber || '' });
    customerSheet.addRow({ key: 'Vergi Dairesi', val: customer?.taxOffice || '' });
    customerSheet.addRow({ key: 'Vade (Gün)', val: customer?.paymentTerms || '' });
    customerSheet.addRow({ key: 'Kredi Limiti', val: customer?.creditLimit || 0 });
    customerSheet.addRow({ key: 'Toplam İşlem Tutarı', val: totalMovementsAmount });
    customerSheet.addRow({ key: 'Toplam Tahsilat', val: (totalCollected + paidMovementsAmount) });
    customerSheet.addRow({ key: 'Kalan Bakiye', val: balance });
    customerSheet.addRow({ key: 'Para Birimi', val: customer?.currency || 'TRY' });
    sheets.push(customerSheet);
    }

    // --- Hareketler Sayfası ---
    if (includeSale || includeInvoice || includeDeliveryNote || includePayment) {
    const movementsSheet = workbook.addWorksheet('Hareketler');
    movementsSheet.columns = [
      { header: 'Tarih', key: 'date', width: 15 },
      { header: 'Tip', key: 'type', width: 15 },
      { header: 'Belge No', key: 'doc', width: 20 },
      { header: 'Ara Toplam', key: 'sub', width: 15 },
      { header: 'KDV Tutarı', key: 'tax', width: 15 },
      { header: 'Genel Toplam', key: 'total', width: 15 },
      { header: 'Birim', key: 'curr', width: 10 },
      { header: 'Durum', key: 'status', width: 20 },
      { header: 'Notlar / Açıklama', key: 'notes', width: 50 },
    ];

    movements.forEach(m => {
      const dateObj = m.date?.toDate ? m.date.toDate() : new Date(m.date);
      let durum = m.paymentStatus || m.status || '';
      if (m.type === 'sale') {
        const saleMap: Record<string, string> = { saved: 'Faturalanmadı', invoiced: 'Faturalandı', cancelled: 'İptal', archived: 'Arşiv' };
        durum = saleMap[durum] || durum;
      }
      
      let typeLabel = m.type;
      if (m.type === 'sale') typeLabel = 'Satış';
      if (m.type === 'invoice') typeLabel = 'Fatura';
      if (m.type === 'deliveryNote') typeLabel = 'İrsaliye';
      if (m.type === 'payment') typeLabel = 'Tahsilat';

      movementsSheet.addRow({
        date: dateObj.toLocaleDateString('tr-TR'),
        type: typeLabel,
        doc: m.documentNumber || '',
        sub: m.subTotal || 0,
        tax: m.taxAmount || 0,
        total: m.amount || 0,
        curr: m.currency || 'TRY',
        status: durum,
        notes: m.notes || ''
      });
    });

    movementsSheet.autoFilter = 'A1:I1';
    sheets.push(movementsSheet);
    }

    if (sheets.length === 0) {
      return res.status(400).json({ ok: false, error: 'İndirilecek içerik seçilmedi' });
    }

    // Stil Ekle (Tüm Sayfalar için Header kalın ve Border)
    sheets.forEach(sheet => {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // Response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=musteri-extre-${customer?.code || customerId}-${new Date().toISOString().split('T')[0]}.xlsx`);

    logger.info('Müşteri extre çıktısı oluşturuldu', {
      customerId,
      movementsCount: movements.length,
      types: Array.from(selectedTypes)
    });

    return res.send(Buffer.from(buffer));
  } catch (error: any) {
    logger.error('Müşteri extre çıktısı oluşturma hatası', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Extre çıktısı oluşturulamadı'
    });
  }
});

/**
 * GET /api/customers/:id/transactions
 * Müşteri cari hareketlerini getir
 */
router.get('/:id/transactions', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    // Company kontrolü
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    // Müşteriyi kontrol et
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }
    const customer = customerDoc.data();
    const companyId = customer?.companyId;
    if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Hareketleri çek
    // Teklifbul Rule v1.0 — composite index yoksa customerId sorgusu + bellek içi sıralama
    let transactions: any[] = [];

    try {
      const snapshot = await db.collection('customer_transactions')
        .where('customerId', '==', customerId)
        .where('companyId', '==', companyId)
        .orderBy('date', 'desc')
        .limit(limit)
        .get();

      transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate?.() || doc.data().date || null,
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
      }));
    } catch (indexErr: any) {
      const msg = String(indexErr?.message || '');
      if (!msg.includes('FAILED_PRECONDITION') && !msg.includes('requires an index')) {
        throw indexErr;
      }

      logger.warn('Cari hareketler: index yok, fallback sorgu kullanılıyor', {
        customerId,
        companyId
      });

      const fallbackSnap = await db.collection('customer_transactions')
        .where('customerId', '==', customerId)
        .limit(Math.min(Math.max(limit * 3, 100), 300))
        .get();

      transactions = fallbackSnap.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate?.() || doc.data().date || null,
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
        }))
        .filter((tx: any) => tx.companyId === companyId)
        .sort((a: any, b: any) => {
          const da = a.date ? new Date(a.date).getTime() : 0;
          const dbTime = b.date ? new Date(b.date).getTime() : 0;
          return dbTime - da;
        })
        .slice(0, limit);
    }

    return res.json({
      ok: true,
      transactions
    });
  } catch (error: any) {
    logger.error('Cari hareketleri getirme hatası', error);
    return res.status(400).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/customers/:id/payment
 * Manuel tahsilat ekle
 */
router.post('/:id/payment', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const customerId = req.params.id;
    const body = req.body; // amount, description, date, currency, paymentMethod

    if (!body.amount || body.amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Geçerli bir tutar giriniz' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
    }
    const customer = customerDoc.data();
    const companyId = customer?.companyId;

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!(await userBelongsToCompanyAsync(userData, companyId, userId))) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
    }

    // Transaction servisini çağır
    const { addTransaction } = await import('../services/transactionService.js');

    await addTransaction({
      customerId,
      companyId,
      userId,
      type: 'credit', // Tahsilat = Alacak
      transactionType: 'payment',
      amount: Number(body.amount),
      currency: body.currency || 'TRY',
      description: body.description || 'Manuel Tahsilat',
      date: body.date ? new Date(body.date) : new Date(),
      // Metadata
      documentNumber: body.reference || null
    });

    return res.json({
      ok: true,
      message: 'Tahsilat eklendi'
    });
  } catch (error: any) {
    logger.error('Tahsilat ekleme hatası', error);
    return res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
