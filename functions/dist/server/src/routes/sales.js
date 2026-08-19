/**
 * Sales Routes - Satış Modülü Faz 2
 * Satış CRUD API endpoint'leri
 * Teklifbul Rule v1.0 - Transaction güvenliği, validation, state machine, audit log
 */
import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { saleDocumentCreationLimiter } from '../middleware/rateLimit.js';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { generateSaleNumber } from '../services/numberGenerator.js';
import { assertValidStatusTransition, isEditableStatus } from '../services/saleStateMachine.js';
import { logAuditEvent } from '../services/auditService.js';
import { approveSale, cancelSale, rejectSale } from '../services/saleService.js';
import { createSaleFromBid } from '../services/bidToSaleService.js';
import { hasPermission, getCompanyIdFromRequest } from '../services/permissionService.js';
import { userBelongsToCompanyAsync } from '../../utils/companyAccess.js';
import { createInvoiceDraftFromSale } from '../services/invoiceService.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';
import { createDeliveryNoteDraftFromSale } from '../services/deliveryNoteService.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createSaleRevision, hasCriticalFieldChanges, calculateDiff } from '../services/saleRevisionService.js';
import { saleIdParamSchema, saleIdParamsSchema, createInvoiceFromSaleBodySchema, createDeliveryFromSaleBodySchema, updateSaleBodySchema, listSalesQuerySchema, createSaleBodySchema } from '../schemas/salesSchemas.js';
const router = express.Router();
// Tüm route'lar authentication gerektirir
router.use(verifyToken);
/**
 * POST /api/sales
 * Yeni satış oluştur
 * Permission: sales.create
 */
router.post('/', validate({ body: createSaleBodySchema }), requirePermission('sales.create'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const body = req.body;
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
        // Status kontrolü (sadece draft veya saved olabilir)
        if (body.status && !['draft', 'saved'].includes(body.status)) {
            return res.status(400).json({ ok: false, error: 'Yeni sat�� sadece draft veya saved durumunda olu�turulabilir' });
        }
        const targetStatus = body.status || 'draft';
        // Satış numarası üret
        const saleNumber = await generateSaleNumber(body.companyId);
        // Müşteri bilgilerini al
        const customerDoc = await db.collection('customers').doc(body.customerId).get();
        if (!customerDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Müşteri bulunamadı' });
        }
        const customer = customerDoc.data();
        // Satış verisi hazırla
        const saleData = {
            companyId: body.companyId,
            saleNumber: saleNumber,
            customerId: body.customerId,
            customerCode: customer?.code || '',
            customerName: customer?.name || '',
            status: targetStatus,
            items: body.items.map((item) => ({
                id: item.id || generateUUID(),
                sku: item.sku,
                stockId: item.stockId,
                name: item.name,
                quantity: item.quantity,
                deliveredQuantity: item.deliveredQuantity || 0,
                remainingQuantity: item.remainingQuantity || item.quantity,
                unit: item.unit,
                locationId: item.locationId,
                locationName: item.locationName || '',
                unitPrice: item.unitPrice,
                vatRate: item.vatRate || 18,
                discount: item.discount || 0,
                discountAmount: item.discountAmount || 0,
                totalPrice: item.totalPrice,
                vatAmount: item.vatAmount,
                totalWithVat: item.totalWithVat,
                currency: item.currency || body.currency || 'TRY'
            })),
            subtotal: body.subtotal || 0,
            totalDiscount: body.totalDiscount || 0,
            totalVat: body.totalVat || 0,
            totalAmount: body.totalAmount || 0,
            currency: body.currency || 'TRY',
            exchangeRate: body.exchangeRate || null,
            exchangeRateSource: body.exchangeRateSource || null,
            exchangeRateDate: body.exchangeRate ? FieldValue.serverTimestamp() : null,
            invoiceIds: [], // Teklifbul Rule v1.0 - Invoice link array
            deliveryNoteIds: [],
            stockMovementIds: [],
            stockMovementCreated: false,
            approvalHistory: [],
            notes: body.notes || null,
            delivery: body.delivery || null, // Teklifbul Rule v1.0 - Nakliye bilgileri
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdBy: userId,
            updatedBy: userId
        };
        // Eğer onaya gönderiliyorsa
        if (targetStatus === 'pending_approval') {
            saleData.approval = {
                submittedAt: FieldValue.serverTimestamp(),
                submittedBy: userId
            };
            // Teklifbul Rule v1.0 - Array içinde serverTimestamp() kullanılamaz, Timestamp.now() kullan
            saleData.approvalHistory = [
                {
                    action: 'submitted',
                    userId: userId,
                    timestamp: Timestamp.now()
                }
            ];
        }
        const saleRef = await db.collection('sales').add(saleData);
        const saleId = saleRef.id;
        // Audit log
        await logAuditEvent({
            companyId: body.companyId,
            entityType: 'sale',
            entityId: saleId,
            action: 'create',
            actorUserId: userId,
            result: 'success',
            metadata: { saleNumber, status: targetStatus, itemsCount: body.items.length }
        });
        logger.info('Satış oluşturuldu (API)', { saleId, companyId: body.companyId, saleNumber });
        return res.status(201).json({
            ok: true,
            saleId,
            saleNumber,
            message: 'Satış oluşturuldu'
        });
    }
    catch (error) {
        logger.error('Satış oluşturma hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış oluşturulamadı'
        });
    }
});
/**
 * PUT /api/sales/:id
 * Satış güncelle
 * Permission: sales.edit (draft ise) veya sales.edit_after_approve (onay sonrası)
 */
router.put('/:id', validate({
    params: saleIdParamSchema,
    body: updateSaleBodySchema
}), requireAnyPermission(['sales.edit', 'sales.edit_after_approve']), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.id;
        const body = req.body;
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
        // Mevcut satışı al (transaction öncesi kontroller için)
        const saleRef = db.collection('sales').doc(saleId);
        const saleDoc = await saleRef.get();
        if (!saleDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Satış bulunamadı' });
        }
        const oldSale = saleDoc.data();
        if (oldSale?.companyId !== body.companyId) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        // Düzenleme kontrolü
        if (!isEditableStatus(oldSale.status)) {
            return res.status(400).json({
                ok: false,
                error: `Bu satış düzenlenemez. Mevcut durum: ${oldSale.status}`
            });
        }
        // Teklifbul Rule v1.0 - Permission kontrolü: draft ise sales.edit, değilse sales.edit_after_approve
        const isDraft = ['draft', 'saved'].includes(oldSale.status);
        const requiredPerm = isDraft ? 'sales.edit' : 'sales.edit_after_approve';
        const hasRequiredPerm = await hasPermission(userId, body.companyId, requiredPerm, req);
        if (!hasRequiredPerm) {
            logger.warn('PUT /sales/:id: Permission denied for status', {
                userId,
                companyId: body.companyId,
                saleId,
                saleStatus: oldSale.status,
                requiredPerm,
                path: req.path
            });
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN',
                message: `Bu satışı düzenlemek için ${requiredPerm} yetkisi gereklidir`,
                perm: requiredPerm
            });
        }
        // Teklifbul Rule v1.0 - Onay sonrası düzenleme: editReason zorunlu
        if (!isDraft) {
            const editReason = body.editReason?.trim();
            if (!editReason || editReason.length < 10) {
                return res.status(400).json({
                    ok: false,
                    error: 'VALIDATION_ERROR',
                    details: ['editReason zorunludur ve en az 10 karakter olmalıdır']
                });
            }
        }
        // Teklifbul Rule v1.0 - Invoice/Delivery note kontrolü (sent/accepted ise bloklama)
        let docLinkedLock = false;
        let lockReason = null;
        const invoiceIds = oldSale.invoiceIds || [];
        const deliveryNoteIds = oldSale.deliveryNoteIds || [];
        if (invoiceIds.length > 0 || deliveryNoteIds.length > 0) {
            const invoiceDocs = await Promise.all(invoiceIds.map((id) => db.collection('invoices').doc(id).get()));
            const deliveryNoteDocs = await Promise.all(deliveryNoteIds.map((id) => db.collection('delivery_notes').doc(id).get()));
            const hasSentInvoice = invoiceDocs.some((doc) => doc.exists && ['sent', 'accepted'].includes(doc.data()?.status));
            const hasSentDeliveryNote = deliveryNoteDocs.some((doc) => doc.exists && ['sent', 'accepted'].includes(doc.data()?.status));
            if (hasSentInvoice || hasSentDeliveryNote) {
                docLinkedLock = true;
                if (hasSentInvoice && hasSentDeliveryNote) {
                    lockReason = 'sent_both';
                }
                else if (hasSentInvoice) {
                    lockReason = 'sent_invoice';
                }
                else {
                    lockReason = 'sent_delivery';
                }
            }
        }
        // Status transition kontrolü (eğer status değişiyorsa)
        if (body.status && body.status !== oldSale.status) {
            try {
                assertValidStatusTransition(oldSale.status, body.status);
            }
            catch (transitionError) {
                return res.status(400).json({
                    ok: false,
                    error: transitionError.message || 'Geçersiz durum geçişi'
                });
            }
        }
        // Teklifbul Rule v1.0 - Before snapshot (revision için)
        const beforeSnapshot = {};
        const allowedFieldsForSnapshot = [
            'customerId', 'customerName', 'items', 'subtotal', 'totalDiscount',
            'totalVat', 'totalAmount', 'currency', 'exchangeRate', 'notes',
            'dueDate', 'deliveryAddress', 'billingAddress', 'delivery'
        ];
        for (const field of allowedFieldsForSnapshot) {
            if (oldSale[field] !== undefined) {
                beforeSnapshot[field] = oldSale[field];
            }
        }
        // Güncelleme verisi hazırla
        const updateData = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        };
        // Sadece düzenlenebilir alanları güncelle
        if (body.items) {
            updateData.items = body.items.map((item) => ({
                id: item.id || generateUUID(),
                sku: item.sku,
                stockId: item.stockId,
                name: item.name,
                quantity: item.quantity,
                deliveredQuantity: item.deliveredQuantity || 0,
                remainingQuantity: item.remainingQuantity || item.quantity,
                unit: item.unit,
                locationId: item.locationId,
                locationName: item.locationName || '',
                unitPrice: item.unitPrice,
                vatRate: item.vatRate || 18,
                discount: item.discount || 0,
                discountAmount: item.discountAmount || 0,
                totalPrice: item.totalPrice,
                vatAmount: item.vatAmount,
                totalWithVat: item.totalWithVat,
                currency: item.currency || body.currency || 'TRY'
            }));
        }
        if (body.subtotal !== undefined)
            updateData.subtotal = body.subtotal;
        if (body.totalDiscount !== undefined)
            updateData.totalDiscount = body.totalDiscount;
        if (body.totalVat !== undefined)
            updateData.totalVat = body.totalVat;
        if (body.totalAmount !== undefined)
            updateData.totalAmount = body.totalAmount;
        if (body.currency !== undefined)
            updateData.currency = body.currency;
        if (body.exchangeRate !== undefined) {
            updateData.exchangeRate = body.exchangeRate;
            updateData.exchangeRateSource = body.exchangeRateSource || 'MANUAL';
            updateData.exchangeRateDate = body.exchangeRate ? FieldValue.serverTimestamp() : null;
        }
        if (body.notes !== undefined)
            updateData.notes = body.notes || null;
        if (body.dueDate !== undefined)
            updateData.dueDate = body.dueDate || null;
        if (body.deliveryAddress !== undefined)
            updateData.deliveryAddress = body.deliveryAddress || null;
        if (body.billingAddress !== undefined)
            updateData.billingAddress = body.billingAddress || null;
        if (body.delivery !== undefined)
            updateData.delivery = body.delivery || null; // Teklifbul Rule v1.0 - Nakliye bilgileri
        // Status güncelleme (eğer değişiyorsa)
        if (body.status && body.status !== oldSale.status) {
            updateData.status = body.status;
            // Onaya gönderiliyorsa approval bilgilerini ekle
            if (body.status === 'pending_approval') {
                updateData.approval = {
                    submittedAt: FieldValue.serverTimestamp(),
                    submittedBy: userId
                };
                // Teklifbul Rule v1.0 - FieldValue.arrayUnion() içinde serverTimestamp() kullanılamaz
                // Mevcut approvalHistory array'ini al, yeni entry ekle, tüm array'i güncelle
                const existingHistory = oldSale.approvalHistory || [];
                updateData.approvalHistory = [
                    ...existingHistory,
                    {
                        action: 'submitted',
                        userId: userId,
                        timestamp: Timestamp.now()
                    }
                ];
            }
        }
        // Teklifbul Rule v1.0 - After snapshot (revision için)
        const afterSnapshot = {};
        for (const field of allowedFieldsForSnapshot) {
            if (updateData[field] !== undefined) {
                afterSnapshot[field] = updateData[field];
            }
            else if (oldSale[field] !== undefined) {
                afterSnapshot[field] = oldSale[field];
            }
        }
        // Teklifbul Rule v1.0 - Kritik alan değişikliği kontrolü (e-doc locked ise)
        if (docLinkedLock) {
            // Diff hesapla (sadece kontrol için)
            const tempDiff = calculateDiff(beforeSnapshot, afterSnapshot);
            const hasCriticalChanges = hasCriticalFieldChanges(tempDiff.changedFields, beforeSnapshot, afterSnapshot);
            if (hasCriticalChanges) {
                logger.warn('PUT /sales/:id: Critical fields blocked due to e-doc lock', {
                    saleId,
                    lockReason,
                    changedFields: tempDiff.changedFields
                });
                // Sale doc'a edocLock flag ekle (opsiyonel ama faydalı)
                try {
                    await saleRef.update({
                        edocLock: {
                            locked: true,
                            reason: lockReason,
                            lockedAt: FieldValue.serverTimestamp()
                        }
                    });
                }
                catch (lockUpdateError) {
                    logger.warn('Sale edocLock güncellenemedi', lockUpdateError);
                }
                return respondError(res, Errors.edocLockedSale('E-belge kilidi: kritik alanlar değiştirilemez', [
                    'Bu satış, GİB\'e gönderilmiş/Onaylanmış e-belgeye bağlı. Kalem/tutar/vergi/adres gibi kritik alanlar değiştirilemez.',
                    'Düzeltme için: ilgili faturayı/irsaliyeyi iptal edin veya iade/düzeltme belgesi süreci kullanın.'
                ]));
            }
            // Kritik olmayan alanlar değişiyorsa (notes gibi) -> devam et
        }
        // Teklifbul Rule v1.0 - Optimistic locking: Transaction içinde version kontrolü ve update
        const currentVersion = oldSale.version || 0;
        const newVersion = currentVersion + 1;
        updateData.version = newVersion;
        try {
            await db.runTransaction(async (transaction) => {
                // Transaction içinde tekrar oku (concurrent update kontrolü için)
                const currentSaleDoc = await transaction.get(saleRef);
                if (!currentSaleDoc.exists) {
                    throw new Error('Satış bulunamadı (transaction içinde)');
                }
                const currentSale = currentSaleDoc.data();
                // Teklifbul Rule v1.0 - Optimistic locking: Version kontrolü
                if (body.version !== undefined) {
                    const transactionVersion = currentSale.version || 0;
                    if (body.version !== transactionVersion) {
                        logger.warn('PUT /sales/:id: Version conflict detected in transaction', {
                            saleId,
                            userId,
                            expectedVersion: body.version,
                            transactionVersion,
                            path: req.path
                        });
                        throw new Error('CONCURRENT_UPDATE');
                    }
                }
                // Update sale (transaction içinde)
                transaction.update(saleRef, updateData);
            });
        }
        catch (transactionError) {
            if (transactionError.message === 'CONCURRENT_UPDATE') {
                return res.status(409).json({
                    ok: false,
                    error: 'CONCURRENT_UPDATE',
                    code: 'CONCURRENT_UPDATE',
                    message: 'Bu satış başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.'
                });
            }
            throw transactionError;
        }
        // Teklifbul Rule v1.0 - Create revision if not draft
        let revisionId = null;
        let saleVersion = newVersion;
        if (!isDraft) {
            try {
                // Get user info for revision
                const userDoc = await db.collection('users').doc(userId).get();
                const userData = userDoc.data();
                const revisionResult = await createSaleRevision({
                    saleId,
                    companyId: body.companyId,
                    userId,
                    userEmail: userData?.email || null,
                    userDisplayName: userData?.displayName || userData?.name || null,
                    reason: body.editReason.trim(),
                    statusAtEdit: oldSale.status,
                    beforeSnapshot,
                    afterSnapshot,
                    source: 'api',
                    requestMeta: {
                        path: req.path,
                        method: req.method,
                        ip: req.ip || req.headers['x-forwarded-for'] || undefined,
                        userAgent: req.headers['user-agent']
                    }
                });
                revisionId = revisionResult.revisionId;
                saleVersion = revisionResult.saleVersion;
                logger.info('Sale revision oluşturuldu', { saleId, revisionId, saleVersion });
            }
            catch (revisionError) {
                logger.error('Sale revision oluşturulurken hata', revisionError);
                // Revision hatası update'i engellemez, sadece log'lanır
            }
        }
        else {
            // Draft edit'te version artırmak opsiyonel (şimdilik yapmıyoruz)
        }
        // Audit log
        await logAuditEvent({
            companyId: body.companyId,
            entityType: 'sale',
            entityId: saleId,
            action: 'update',
            actorUserId: userId,
            result: 'success',
            metadata: {
                changedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt' && k !== 'updatedBy'),
                oldStatus: oldSale.status,
                newStatus: body.status || oldSale.status,
                revisionId: revisionId || undefined,
                saleVersion: saleVersion,
                hasImmutableDocuments: docLinkedLock
            }
        });
        logger.info('Satış güncellendi (API)', {
            saleId,
            companyId: body.companyId,
            revisionId,
            saleVersion,
            isDraft
        });
        return res.json({
            ok: true,
            message: 'Satış güncellendi',
            saleId,
            version: saleVersion,
            revisionId: revisionId || undefined
        });
    }
    catch (error) {
        logger.error('Satış güncelleme hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış güncellenemedi'
        });
    }
});
/**
 * GET /api/sales/:id
 * Satış detayını getir
 * Permission: sales.view
 */
router.get('/:id', requirePermission('sales.view'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.id;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const saleDoc = await db.collection('sales').doc(saleId).get();
        if (!saleDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Satış bulunamadı' });
        }
        const sale = saleDoc.data();
        // Company kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!(await userBelongsToCompanyAsync(userData, sale?.companyId, userId))) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        return res.json({
            ok: true,
            sale: { id: saleDoc.id, ...sale }
        });
    }
    catch (error) {
        logger.error('Satış getirme hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış getirilemedi'
        });
    }
});
/**
 * POST /api/sales/:id/approve
 * Satış onayı
 * Permission: sales.approve
 */
router.post('/:id/approve', requirePermission('sales.approve'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.id;
        const body = req.body;
        // CompanyId kontrolü
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Company ID bulunamadı' });
        }
        // Teklifbul Rule v1.0 - Opsiyonel: Duty separation (aynı kişi onaylayamasın)
        const companyDoc = await db.collection('companies').doc(companyId).get();
        const companyData = companyDoc.data();
        const strictApprovalSeparation = companyData?.settings?.strictApprovalSeparation === true;
        if (strictApprovalSeparation) {
            const saleDoc = await db.collection('sales').doc(saleId).get();
            if (!saleDoc.exists) {
                return res.status(404).json({ ok: false, error: 'Satış bulunamadı' });
            }
            const saleData = saleDoc.data();
            if (!saleData) {
                return res.status(404).json({ ok: false, error: 'Satış verisi bulunamadı' });
            }
            if (saleData.createdBy === userId) {
                logger.warn('PUT /sales/:id/approve: Duty separation violation', {
                    userId,
                    saleId,
                    createdBy: saleData.createdBy
                });
                return res.status(403).json({
                    ok: false,
                    error: 'FORBIDDEN',
                    message: 'Kendi oluşturduğunuz satışı onaylayamazsınız'
                });
            }
        }
        // Onay işlemi
        const result = await approveSale(saleId, userId, companyId, body.requestId);
        if (!result.success) {
            return res.status(400).json({
                ok: false,
                error: 'Yetersiz stok',
                insufficientStockItems: result.insufficientStockItems
            });
        }
        return res.json({
            ok: true,
            message: 'Satış onaylandı'
        });
    }
    catch (error) {
        logger.error('Satış onayı hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış onaylanamadı'
        });
    }
});
/**
 * POST /api/sales/:id/cancel
 * Satış iptali
 * Permission: sales.cancel
 */
router.post('/:id/cancel', requirePermission('sales.cancel'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.id;
        const body = req.body;
        // CompanyId kontrolü
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Company ID bulunamadı' });
        }
        // İptal işlemi
        await cancelSale(saleId, userId, companyId, body.reason);
        return res.json({
            ok: true,
            message: 'Satış iptal edildi'
        });
    }
    catch (error) {
        logger.error('Satış iptali hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış iptal edilemedi'
        });
    }
});
/**
 * POST /api/sales/:id/reject
 * Satış reddetme (pending_approval → draft)
 * Permission: sales.approve (onaycı)
 */
router.post('/:id/reject', requirePermission('sales.approve'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.id;
        const body = req.body;
        if (!body.reason || !body.reason.trim()) {
            return res.status(400).json({ ok: false, error: 'Red nedeni zorunludur' });
        }
        // CompanyId kontrolü
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Company ID bulunamadı' });
        }
        // Reddetme işlemi
        await rejectSale(saleId, userId, companyId, body.reason.trim());
        return res.json({
            ok: true,
            message: 'Satış reddedildi'
        });
    }
    catch (error) {
        logger.error('Satış reddetme hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış reddedilemedi'
        });
    }
});
/**
 * POST /api/sales/from-bid/:bidId
 * Tekliften satış oluştur
 * Permission: sales.create
 */
router.post('/from-bid/:bidId', requirePermission('sales.create'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const bidId = req.params.bidId;
        const body = req.body;
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
        // Tekliften satış oluştur
        const saleId = await createSaleFromBid(bidId, userId, companyId);
        return res.status(201).json({
            ok: true,
            saleId,
            message: 'Satış tekliften oluşturuldu'
        });
    }
    catch (error) {
        logger.error('Tekliften satış oluşturma hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış oluşturulamadı'
        });
    }
});
/**
 * Helper: UUID generate
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
/**
 * GET /api/sales
 * Satış listesi (pagination desteği)
 * Teklifbul Rule v1.0 - Pagination, filtreler
 * Permission: sales.view
 */
router.get('/', validate({ query: listSalesQuerySchema }), requirePermission('sales.view'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Company ID bulunamadı' });
        }
        const pageSize = Math.min(parseInt(req.query.pageSize) || 25, 100);
        const cursor = req.query.cursor;
        const status = req.query.status;
        const searchQuery = req.query.q; // Teklifbul Rule v1.0 - Search query
        const showArchived = req.query.showArchived === 'true';
        const includeDeleted = req.query.includeDeleted === 'true'; // Admin için opsiyonel
        const shouldFilterByStatus = !!status && status !== 'all';
        // Query oluştur
        let salesQuery = db.collection('sales')
            .where('companyId', '==', companyId)
            .orderBy('createdAt', 'desc')
            .limit(pageSize + 1); // +1 to check if there's more
        // Teklifbul Rule v1.0 - Retention: Soft delete filtreleme (default: isDeleted != true)
        // Not: Firestore'da != true kontrolü için composite index gerekebilir
        // Alternatif: Client-side filtreleme kullanılabilir (aşağıda)
        // if (!includeDeleted) {
        //   salesQuery = salesQuery.where('isDeleted', '!=', true);
        // }
        // Teklifbul Rule v1.0 - PERFORMANCE: Önce server-side filtreleme denenir
        // Gerekli index yoksa kontrollü biçimde client-side fallback'e dönülür.
        if (!showArchived) {
            salesQuery = salesQuery.where('isArchived', '==', false);
        }
        if (shouldFilterByStatus) {
            salesQuery = salesQuery.where('status', '==', status);
        }
        // Teklifbul Rule v1.0 - Sunucu tarafı arama (q parametresi)
        // NOT: Firestore composite index gerektirdiği için, arama client-side'da yapılıyor
        // Gelecekte searchTokens alanı eklenerek array-contains ile arama yapılabilir
        if (searchQuery && searchQuery.trim().length >= 2) {
            logger.info('Satış listesi araması istemci tarafında yapılacak', { q: searchQuery.trim(), companyId });
            // Client-side filtreleme için searchQuery parametresi response'a eklenebilir
        }
        // Cursor-based pagination
        if (cursor) {
            try {
                const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
                const cursorDoc = await db.collection('sales').doc(cursorData.docId).get();
                if (cursorDoc.exists) {
                    salesQuery = salesQuery.startAfter(cursorDoc);
                }
            }
            catch (e) {
                logger.warn('Invalid cursor, ignoring', { cursor });
            }
        }
        let docs = [];
        let usedClientSideFilteringFallback = false;
        try {
            const snapshot = await salesQuery.get();
            docs = snapshot.docs;
        }
        catch (queryError) {
            const queryErrorMessage = String(queryError?.message || '');
            const isMissingIndexError = queryError?.code === 9 || /index/i.test(queryErrorMessage);
            if (!isMissingIndexError) {
                throw queryError;
            }
            usedClientSideFilteringFallback = true;
            logger.warn('Sales list query index eksik; client-side fallback kullaniliyor', {
                companyId,
                showArchived,
                status: status || null
            });
            // Index eksikliğinde güvenli fallback: temel query ile devam et.
            let fallbackQuery = db.collection('sales')
                .where('companyId', '==', companyId)
                .orderBy('createdAt', 'desc')
                .limit(pageSize + 1);
            if (cursor) {
                try {
                    const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
                    const cursorDoc = await db.collection('sales').doc(cursorData.docId).get();
                    if (cursorDoc.exists) {
                        fallbackQuery = fallbackQuery.startAfter(cursorDoc);
                    }
                }
                catch (e) {
                    logger.warn('Invalid cursor in fallback query, ignoring', { cursor });
                }
            }
            const fallbackSnapshot = await fallbackQuery.get();
            docs = fallbackSnapshot.docs;
        }
        const hasMore = docs.length > pageSize;
        const results = hasMore ? docs.slice(0, pageSize) : docs;
        // Cursor oluştur
        let nextCursor = null;
        if (hasMore && results.length > 0) {
            const lastDoc = results[results.length - 1];
            nextCursor = Buffer.from(JSON.stringify({
                docId: lastDoc.id,
                createdAt: lastDoc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
            })).toString('base64');
        }
        const sales = results.map(doc => ({
            id: doc.id,
            ...doc.data()
        })).filter((sale) => {
            // Teklifbul Rule v1.0 - Index yoksa client-side fallback filtreleri
            if (usedClientSideFilteringFallback && !showArchived && (sale.isArchived === true || sale.status === 'archived')) {
                return false;
            }
            if (usedClientSideFilteringFallback && shouldFilterByStatus && sale.status !== status) {
                return false;
            }
            // Teklifbul Rule v1.0 - Retention: Soft delete filtreleme (client-side fallback)
            if (!includeDeleted && sale.isDeleted === true) {
                return false;
            }
            return true;
        });
        logger.info('Satışlar listelendi (API)', {
            count: sales.length,
            hasMore,
            companyId
        });
        return res.json({
            ok: true,
            sales,
            pagination: {
                pageSize,
                hasMore,
                nextCursor
            }
        });
    }
    catch (error) {
        logger.error('Satış listesi hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satışlar getirilemedi'
        });
    }
});
/**
 * POST /api/sales/:id/archive
 * Satış arşivle
 * Teklifbul Rule v1.0 - Audit log
 * Permission: sales.archive
 */
router.post('/:id/archive', requirePermission('sales.archive'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.id;
        const body = req.body;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!(await userBelongsToCompanyAsync(userData, body.companyId, userId))) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        const saleRef = db.collection('sales').doc(saleId);
        const saleDoc = await saleRef.get();
        if (!saleDoc.exists) {
            return res.status(404).json({ ok: false, error: 'Satış bulunamadı' });
        }
        const oldSale = saleDoc.data();
        if (oldSale?.companyId !== body.companyId) {
            return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
        }
        await saleRef.update({
            isArchived: true,
            status: 'archived',
            archivedAt: FieldValue.serverTimestamp(),
            archivedBy: userId,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log
        await logAuditEvent({
            companyId: body.companyId,
            entityType: 'sale',
            entityId: saleId,
            action: 'archive',
            actorUserId: userId,
            result: 'success',
            metadata: {
                oldStatus: oldSale?.status
            }
        });
        logger.info('Satış arşivlendi (API)', { saleId, companyId: body.companyId });
        return res.json({
            ok: true,
            message: 'Satış arşivlendi'
        });
    }
    catch (error) {
        logger.error('Satış arşivleme hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Satış arşivlenemedi'
        });
    }
});
/**
 * DELETE /api/sales/:id
 * Satış soft delete (hard delete yok)
 * Teklifbul Rule v1.0 - Retention + Soft Delete Policy
 * Permission: sales.delete
 */
router.delete('/:id', requirePermission('sales.edit'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return respondError(res, Errors.forbidden('Kimlik doğrulama gerekli'), 401);
        }
        const saleId = req.params.id;
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return respondError(res, Errors.forbidden('Şirket bilgisi bulunamadı'));
        }
        const db = await getAdminDb();
        if (!db) {
            return respondError(res, Errors.internal('Firestore unavailable'), 500);
        }
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const saleRef = db.collection('sales').doc(saleId);
        const saleDoc = await saleRef.get();
        if (!saleDoc.exists) {
            return respondError(res, Errors.notFound('Satış bulunamadı'));
        }
        const sale = saleDoc.data();
        if (sale?.companyId !== companyId) {
            return respondError(res, Errors.forbidden('Yetkisiz erişim'));
        }
        // Idempotent: Zaten silinmişse ok:true dön
        if (sale.isDeleted === true) {
            logger.info('Satış zaten silinmiş (idempotent)', { saleId, companyId });
            return res.json({
                ok: true,
                message: 'Satış zaten silinmiş'
            });
        }
        // Teklifbul Rule v1.0 - E-belge bağlı satışlar silinemez
        const invoiceIds = sale.invoiceIds || [];
        const deliveryNoteIds = sale.deliveryNoteIds || [];
        // Invoice kontrolü
        if (invoiceIds.length > 0) {
            for (const invoiceId of invoiceIds) {
                try {
                    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
                    if (invoiceDoc.exists) {
                        const invoice = invoiceDoc.data();
                        if (invoice?.status === 'sent' || invoice?.status === 'accepted') {
                            return respondError(res, Errors.conflict('E-belgeye bağlı satış silinemez; arşivleyin veya iptal/iade süreci kullanın.'));
                        }
                    }
                }
                catch (err) {
                    logger.warn('Invoice kontrolü hatası (soft delete)', { invoiceId, error: err });
                }
            }
        }
        // Delivery note kontrolü
        if (deliveryNoteIds.length > 0) {
            for (const deliveryNoteId of deliveryNoteIds) {
                try {
                    const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
                    if (deliveryNoteDoc.exists) {
                        const deliveryNote = deliveryNoteDoc.data();
                        if (deliveryNote?.status === 'sent' || deliveryNote?.status === 'accepted') {
                            return respondError(res, Errors.conflict('E-belgeye bağlı satış silinemez; arşivleyin veya iptal/iade süreci kullanın.'));
                        }
                    }
                }
                catch (err) {
                    logger.warn('Delivery note kontrolü hatası (soft delete)', { deliveryNoteId, error: err });
                }
            }
        }
        // Soft delete: isDeleted, deletedAt, deletedBy set et
        const beforeSnapshot = {
            isDeleted: sale.isDeleted || false,
            isArchived: sale.isArchived || false
        };
        const updateData = {
            isDeleted: true,
            deletedAt: FieldValue.serverTimestamp(),
            deletedBy: {
                userId: userId,
                email: userData?.email || null,
                displayName: userData?.displayName || null
            },
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        };
        // Opsiyonel: isArchived de set et
        if (!sale.isArchived) {
            updateData.isArchived = true;
            updateData.archivedAt = FieldValue.serverTimestamp();
            updateData.archivedBy = userId;
        }
        await saleRef.update(updateData);
        // Teklifbul Rule v1.0 - Soft delete için revision ekle
        try {
            const afterSnapshot = {
                isDeleted: true,
                isArchived: updateData.isArchived !== undefined ? true : (sale.isArchived || false)
            };
            await createSaleRevision({
                saleId,
                companyId,
                userId,
                userEmail: userData?.email || null,
                userDisplayName: userData?.displayName || null,
                reason: 'SOFT_DELETE', // Sistem reason
                statusAtEdit: sale.status || 'unknown',
                beforeSnapshot,
                afterSnapshot,
                source: 'api',
                requestMeta: {
                    path: req.path,
                    method: req.method,
                    ip: req.ip || req.socket.remoteAddress || 'unknown',
                    userAgent: req.get('user-agent')
                }
            });
        }
        catch (revisionError) {
            logger.warn('Soft delete revision oluşturulamadı', { saleId, error: revisionError });
            // Revision hatası kritik değil, devam et
        }
        // Audit log
        await logAuditEvent({
            companyId,
            entityType: 'sale',
            entityId: saleId,
            action: 'soft_delete',
            actorUserId: userId,
            result: 'success',
            metadata: {
                saleNumber: sale.saleNumber,
                customerName: sale.customerName,
                totalAmount: sale.totalAmount,
                wasArchived: sale.isArchived || false
            }
        });
        logger.info('Satış soft delete edildi (API)', { saleId, companyId });
        return res.json({
            ok: true,
            message: 'Satış silindi'
        });
    }
    catch (error) {
        logger.error('Satış soft delete hatası (API)', error);
        return respondError(res, Errors.internal(error.message || 'Satış silinemedi'));
    }
});
/**
 * POST /api/sales/:id/restore
 * Soft delete yapılmış satışı geri yükle
 * Teklifbul Rule v1.0 - Retention + Soft Delete Policy
 * Permission: sales.delete (ileride sales.restore ayrılabilir)
 */
router.post('/:id/restore', requirePermission('sales.edit'), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return respondError(res, Errors.forbidden('Kimlik doğrulama gerekli'), 401);
        }
        const saleId = req.params.id;
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return respondError(res, Errors.forbidden('Şirket bilgisi bulunamadı'));
        }
        const db = await getAdminDb();
        if (!db) {
            return respondError(res, Errors.internal('Firestore unavailable'), 500);
        }
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const saleRef = db.collection('sales').doc(saleId);
        const saleDoc = await saleRef.get();
        if (!saleDoc.exists) {
            return respondError(res, Errors.notFound('Satış bulunamadı'));
        }
        const sale = saleDoc.data();
        if (sale?.companyId !== companyId) {
            return respondError(res, Errors.forbidden('Yetkisiz erişim'));
        }
        // Idempotent: Zaten aktifse ok:true dön
        if (sale.isDeleted !== true) {
            logger.info('Satış zaten aktif (idempotent)', { saleId, companyId });
            return res.json({
                ok: true,
                message: 'Satış zaten aktif'
            });
        }
        // Teklifbul Rule v1.0 - E-belge bağlı satışlar restore edilemez
        const invoiceIds = sale.invoiceIds || [];
        const deliveryNoteIds = sale.deliveryNoteIds || [];
        // Invoice kontrolü
        if (invoiceIds.length > 0) {
            for (const invoiceId of invoiceIds) {
                try {
                    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
                    if (invoiceDoc.exists) {
                        const invoice = invoiceDoc.data();
                        if (invoice?.status === 'sent' || invoice?.status === 'accepted') {
                            return respondError(res, Errors.conflict('E-belgeye bağlı satış geri yüklenemez; iptal/iade süreci gereklidir.'));
                        }
                    }
                }
                catch (err) {
                    logger.warn('Invoice kontrolü hatası (restore)', { invoiceId, error: err });
                }
            }
        }
        // Delivery note kontrolü
        if (deliveryNoteIds.length > 0) {
            for (const deliveryNoteId of deliveryNoteIds) {
                try {
                    const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
                    if (deliveryNoteDoc.exists) {
                        const deliveryNote = deliveryNoteDoc.data();
                        if (deliveryNote?.status === 'sent' || deliveryNote?.status === 'accepted') {
                            return respondError(res, Errors.conflict('E-belgeye bağlı satış geri yüklenemez; iptal/iade süreci gereklidir.'));
                        }
                    }
                }
                catch (err) {
                    logger.warn('Delivery note kontrolü hatası (restore)', { deliveryNoteId, error: err });
                }
            }
        }
        // Restore: isDeleted, deletedAt, deletedBy, isArchived temizle
        const beforeSnapshot = {
            isDeleted: sale.isDeleted || false,
            deletedAt: sale.deletedAt || null,
            deletedBy: sale.deletedBy || null,
            isArchived: sale.isArchived || false
        };
        const updateData = {
            isDeleted: false,
            deletedAt: FieldValue.delete(),
            deletedBy: FieldValue.delete(),
            isArchived: false, // Opsiyonel ama önerilir
            archivedAt: FieldValue.delete(),
            archivedBy: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        };
        await saleRef.update(updateData);
        // Teklifbul Rule v1.0 - Restore için revision ekle
        try {
            const afterSnapshot = {
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                isArchived: false
            };
            await createSaleRevision({
                saleId,
                companyId,
                userId,
                userEmail: userData?.email || null,
                userDisplayName: userData?.displayName || null,
                reason: 'RESTORE', // Sistem reason
                statusAtEdit: sale.status || 'unknown',
                beforeSnapshot,
                afterSnapshot,
                source: 'api',
                requestMeta: {
                    path: req.path,
                    method: req.method,
                    ip: req.ip || req.socket.remoteAddress || 'unknown',
                    userAgent: req.get('user-agent')
                }
            });
        }
        catch (revisionError) {
            logger.warn('Restore revision oluşturulamadı', { saleId, error: revisionError });
            // Revision hatası kritik değil, devam et
        }
        // Audit log
        await logAuditEvent({
            companyId,
            entityType: 'sale',
            entityId: saleId,
            action: 'restore',
            actorUserId: userId,
            result: 'success',
            metadata: {
                saleNumber: sale.saleNumber,
                customerName: sale.customerName,
                totalAmount: sale.totalAmount
            }
        });
        logger.info('Satış restore edildi (API)', { saleId, companyId });
        return res.json({
            ok: true,
            message: 'Satış geri yüklendi'
        });
    }
    catch (error) {
        logger.error('Satış restore hatası (API)', error);
        return respondError(res, Errors.internal(error.message || 'Satış geri yüklenemedi'));
    }
});
/**
 * POST /api/sales/:saleId/invoice
 * Sale'dan invoice draft oluştur
 * Permission: sales.invoice OR einvoice.create
 * Teklifbul Rule v1.0 - Snapshot bazlı invoice oluşturma
 */
router.post('/:saleId/invoice', validate({
    params: saleIdParamsSchema,
    body: createInvoiceFromSaleBodySchema
}), saleDocumentCreationLimiter, requireAnyPermission(['sales.invoice', 'einvoice.create']), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.saleId;
        const body = req.body;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Company ID bulunamadı' });
        }
        // Invoice draft oluştur
        const result = await createInvoiceDraftFromSale({
            companyId,
            saleId,
            userId,
            requestId: body.requestId
        });
        logger.info('Invoice draft oluşturuldu (API)', {
            invoiceId: result.invoiceId,
            saleId,
            invoiceNumber: result.number
        });
        return res.status(201).json({
            ok: true,
            invoiceId: result.invoiceId,
            number: result.number,
            message: 'Fatura taslağı oluşturuldu'
        });
    }
    catch (error) {
        logger.error('Invoice draft oluşturma hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'Fatura taslağı oluşturulamadı'
        });
    }
});
/**
 * POST /api/sales/:saleId/delivery-note
 * Sale'dan delivery note draft oluştur
 * Permission: sales.delivery OR edespatch.create
 * Teklifbul Rule v1.0 - Snapshot bazlı delivery note oluşturma
 */
router.post('/:saleId/delivery-note', validate({
    params: saleIdParamsSchema,
    body: createDeliveryFromSaleBodySchema
}), saleDocumentCreationLimiter, requireAnyPermission(['sales.delivery', 'edespatch.create']), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const saleId = req.params.saleId;
        const body = req.body;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ ok: false, error: 'Company ID bulunamadı' });
        }
        // shipDate parse et
        const shipDate = body.shipDate ? new Date(body.shipDate) : undefined;
        // Delivery note draft oluştur
        const result = await createDeliveryNoteDraftFromSale({
            companyId,
            saleId,
            userId,
            requestId: body.requestId,
            shipDate,
            shipToAddress: body.shipToAddress
        });
        logger.info('Delivery note draft oluşturuldu (API)', {
            deliveryNoteId: result.deliveryNoteId,
            saleId,
            deliveryNoteNumber: result.number
        });
        return res.status(201).json({
            ok: true,
            deliveryNoteId: result.deliveryNoteId,
            number: result.number,
            message: 'İrsaliye taslağı oluşturuldu'
        });
    }
    catch (error) {
        logger.error('Delivery note draft oluşturma hatası (API)', error);
        return res.status(400).json({
            ok: false,
            error: error.message || 'İrsaliye taslağı oluşturulamadı'
        });
    }
});
export default router;
