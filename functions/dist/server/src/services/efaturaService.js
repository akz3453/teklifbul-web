/**
 * E-Fatura Service - Satış Modülü Faz 6
 * E-fatura gönderim servisi (placeholder)
 * Teklifbul Rule v1.0 - E-fatura entegrasyonu hazırlığı, validasyon, audit log
 */
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import { validateEInvoiceData } from './efaturaValidator.js';
import { logAuditEvent } from './auditService.js';
import { getEdocProvider } from '../providers/edoc/index.js';
/**
 * E-Fatura gönder
 * @param invoiceId - Fatura ID
 * @param userId - Kullanıcı ID
 * @param companyId - Şirket ID
 * @returns E-fatura UUID (GIB'den dönen)
 */
export async function sendEInvoice(invoiceId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    logger.group('E-Fatura Gönderimi');
    // 1. Fatura bilgilerini al
    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
    if (!invoiceDoc.exists) {
        throw new Error('Fatura bulunamadı');
    }
    const invoice = invoiceDoc.data();
    // Company kontrolü
    if (invoice.companyId !== companyId) {
        throw new Error('Yetkisiz erişim');
    }
    // 2. Müşteri bilgilerini al
    const customerDoc = await db.collection('customers').doc(invoice.customerId).get();
    const customer = customerDoc.exists ? customerDoc.data() : null;
    if (!customer) {
        throw new Error('Müşteri bulunamadı');
    }
    // 3. Şirket bilgilerini al
    const companyDoc = await db.collection('companies').doc(companyId).get();
    const company = companyDoc.exists ? companyDoc.data() : null;
    // 4. E-fatura verilerini hazırla
    const invoiceDate = invoice.invoiceDate?.toDate?.() || new Date();
    const eInvoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoiceDate,
        customerVKN: customer.taxNumber || undefined,
        customerTCKN: undefined, // TCKN varsa eklenebilir
        customerName: customer.name,
        customerAddress: customer.address || undefined,
        items: invoice.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            totalPrice: item.totalPrice,
            vatAmount: item.vatAmount
        })),
        currency: invoice.currency || 'TRY',
        exchangeRate: invoice.exchangeRate || undefined,
        exchangeRateDate: invoice.exchangeRateDate?.toDate?.() || undefined,
        scenario: 'SALE',
        type: 'SATIS',
        companyVKN: company?.taxNumber || undefined,
        companyTaxOffice: company?.taxOffice || undefined
    };
    // 5. Validasyon
    const validation = validateEInvoiceData(eInvoiceData);
    if (!validation.valid) {
        logger.error('E-Fatura validasyon hatası', { errors: validation.errors });
        throw new Error(`E-Fatura validasyon hatası: ${validation.errors.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
        logger.warn('E-Fatura uyarıları', { warnings: validation.warnings });
    }
    if (process.env.NODE_ENV === 'production' || (process.env.K_SERVICE && process.env.NODE_ENV !== 'test')) {
        logger.warn('E-Fatura gönderimi production\'da kapalı (GİB entegrasyonu yok)');
        logger.end();
        throw new Error('E-fatura gönderimi henüz aktif değil.');
    }
    // 6. E-fatura durumunu güncelle (pending → sending)
    await db.collection('invoices').doc(invoiceId).update({
        'efatura.status': 'sending',
        'efatura.sentAt': FieldValue.serverTimestamp(),
        'efatura.sentBy': userId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    });
    // 7. E-fatura gönderimi (placeholder)
    // TODO: Gerçek GIB e-fatura API entegrasyonu
    // Burada GIB'in e-fatura API'sine istek gönderilecek
    // Örnek: GIB API'ye XML/JSON gönderimi, UUID alınması
    logger.info('E-Fatura gönderimi başlatıldı (placeholder)', {
        invoiceId: invoiceId,
        invoiceNumber: invoice.invoiceNumber
    });
    // Placeholder: Şimdilik UUID oluşturuyoruz
    const eInvoiceUUID = generateUUID();
    // 8. E-fatura durumunu güncelle (sending → sent)
    await db.collection('invoices').doc(invoiceId).update({
        'efatura.status': 'sent',
        'efatura.uuid': eInvoiceUUID,
        'efatura.sentAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    });
    // 9. Audit log
    await logAuditEvent({
        companyId: companyId,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'efatura_send',
        actorUserId: userId,
        result: 'success',
        metadata: {
            eInvoiceUUID: eInvoiceUUID,
            invoiceNumber: invoice.invoiceNumber
        }
    });
    logger.info('E-Fatura gönderildi (placeholder)', {
        invoiceId: invoiceId,
        eInvoiceUUID: eInvoiceUUID
    });
    logger.end();
    return eInvoiceUUID;
}
/**
 * E-İrsaliye gönder
 * @param deliveryNoteId - İrsaliye ID
 * @param userId - Kullanıcı ID
 * @param companyId - Şirket ID
 * @returns E-irsaliye UUID
 */
export async function sendEDeliveryNote(deliveryNoteId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    logger.group('E-İrsaliye Gönderimi');
    // 1. İrsaliye bilgilerini al
    const deliveryNoteDoc = await db.collection('delivery_notes').doc(deliveryNoteId).get();
    if (!deliveryNoteDoc.exists) {
        throw new Error('İrsaliye bulunamadı');
    }
    const deliveryNote = deliveryNoteDoc.data();
    // Company kontrolü
    if (deliveryNote.companyId !== companyId) {
        throw new Error('Yetkisiz erişim');
    }
    if (process.env.NODE_ENV === 'production') {
        logger.warn('E-irsaliye gönderimi production\'da kapalı (GİB entegrasyonu yok)');
        logger.end();
        throw new Error('E-irsaliye gönderimi henüz aktif değil.');
    }
    // 2. E-irsaliye durumunu güncelle
    await db.collection('delivery_notes').doc(deliveryNoteId).update({
        'eirsaliye.status': 'sending',
        'eirsaliye.sentAt': FieldValue.serverTimestamp(),
        'eirsaliye.sentBy': userId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    });
    // 3. E-irsaliye gönderimi (placeholder)
    // TODO: Gerçek GIB e-irsaliye API entegrasyonu
    const eDeliveryNoteUUID = generateUUID();
    // 4. E-irsaliye durumunu güncelle
    await db.collection('delivery_notes').doc(deliveryNoteId).update({
        'eirsaliye.status': 'sent',
        'eirsaliye.uuid': eDeliveryNoteUUID,
        'eirsaliye.sentAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    });
    // 5. Audit log
    await logAuditEvent({
        companyId: companyId,
        entityType: 'delivery_note',
        entityId: deliveryNoteId,
        action: 'eirsaliye_send',
        actorUserId: userId,
        result: 'success',
        metadata: {
            eDeliveryNoteUUID: eDeliveryNoteUUID,
            deliveryNoteNumber: deliveryNote.deliveryNoteNumber
        }
    });
    logger.info('E-İrsaliye gönderildi (placeholder)', {
        deliveryNoteId: deliveryNoteId,
        eDeliveryNoteUUID: eDeliveryNoteUUID
    });
    logger.end();
    return eDeliveryNoteUUID;
}
/**
 * Helper: UUID generate
 */
/**
 * Gelen Faturaları Kontrol Et ve Stoğa İşle
 * Cron job veya manuel tetikleme ile çalışır
 */
export async function checkIncomingInvoices(companyId, userId) {
    const db = await getAdminDb();
    if (!db)
        throw new Error('Firestore unavailable');
    logger.group('Gelen Faturaları Kontrol Et');
    // 1. Provider'dan faturaları çek
    const { provider, credentials } = await getEdocProvider(companyId);
    // Son 7 günü kontrol et (veya son kontrol tarihinden itibaren)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    let incomingInvoices = [];
    try {
        incomingInvoices = await provider.getIncomingInvoices(startDate, endDate, credentials);
    }
    catch (err) {
        logger.error('Gelen faturalar çekilemedi', err);
        throw new Error(`Provider hatası: ${err.message}`);
    }
    logger.info(`${incomingInvoices.length} fatura bulundu.`);
    let processedCount = 0;
    const errors = [];
    for (const inv of incomingInvoices) {
        try {
            // 2. Fatura incoming_edocs veya processed koleksiyonunda var mı?
            const incomingRef = db.collection('incoming_edocs').doc(inv.uuid);
            const incomingDoc = await incomingRef.get();
            if (incomingDoc.exists) {
                logger.debug(`Fatura zaten taslaklarda veya işlenmiş: ${inv.uuid}`);
                continue;
            }
            // Daha önce işlendiyse (eski sistem) atla
            const processedRef = db.collection('processed_incoming_invoices').doc(inv.uuid);
            const processedDoc = await processedRef.get();
            if (processedDoc.exists) {
                continue;
            }
            // 3. gelen fatura taslağını oluştur
            await incomingRef.set({
                companyId,
                uuid: inv.uuid,
                externalId: inv.externalId,
                ettn: inv.ettn || null,
                type: 'invoice', // Gelen E-Fatura
                senderVkn: inv.sender.vkn,
                senderTitle: inv.sender.title,
                issueDate: inv.issueDate,
                totalAmount: inv.totals.totalAmount,
                currency: inv.totals.currency,
                items: inv.items.map((item, itemIndex) => ({
                    id: `item-${itemIndex}`, // frontend array matching için
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    unitPrice: item.unitPrice,
                    vatRate: item.vatRate || 0,
                    totalPrice: item.totalPrice || (item.quantity * item.unitPrice),
                    mappedInternalStockId: null, // null = Eşlenmedi
                    conversionMultiplier: 1,
                    calculatedQuantity: item.quantity,
                    calculatedUnitPrice: item.unitPrice
                })),
                status: 'pending_mapping',
                createdAt: FieldValue.serverTimestamp(),
                createdBy: 'SYSTEM_AUTO_INVOICE'
            });
            processedCount++;
            logger.info(`Fatura gelen evraklar (taslak) havuzuna eklendi: ${inv.uuid}`);
        }
        catch (invError) {
            logger.error(`Fatura işlenirken hata: ${inv.uuid}`, invError);
            errors.push(`${inv.uuid}: ${invError.message}`);
        }
    }
    logger.end();
    return { processedCount, errors };
}
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
