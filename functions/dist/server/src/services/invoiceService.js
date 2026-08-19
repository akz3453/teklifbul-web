/**
 * Invoice Service - E-Belge Modülü
 * Teklifbul Rule v1.0 - Snapshot bazlı invoice oluşturma, immutability, idempotency
 */
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { generateInvoiceNumber } from './numberGenerator.js';
import { logAuditEvent } from './auditService.js';
import { getEdocProvider } from '../providers/edoc/index.js';
import { addTransaction } from './transactionService.js';
/**
 * Sale'dan invoice draft oluştur (snapshot bazlı)
 * Teklifbul Rule v1.0 - Snapshot immutable, idempotency desteği
 */
export async function createInvoiceDraftFromSale(options) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const { companyId, saleId, userId, requestId } = options;
    const saleRef = db.collection('sales').doc(saleId);
    const companyRef = db.collection('companies').doc(companyId);
    return await db.runTransaction(async (transaction) => {
        // 1. Sale doc'u çek
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists) {
            throw new Error('Satış bulunamadı');
        }
        const sale = saleDoc.data();
        // Company kontrolü
        if (sale.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // Status kontrolü (saved, approved veya delivered olmalı)
        if (sale.status !== 'saved' && sale.status !== 'approved' && sale.status !== 'delivered') {
            throw new Error(`Fatura oluşturulamaz. Satış durumu: ${sale.status}`);
        }
        // 2. Company doc'u çek (edoc.sender)
        const companyDoc = await transaction.get(companyRef);
        if (!companyDoc.exists) {
            throw new Error('Şirket bulunamadı');
        }
        const company = companyDoc.data();
        const edocSender = company?.edoc?.sender;
        if (!edocSender || !edocSender.vkn || !edocSender.title) {
            throw new Error('Şirket e-belge gönderici bilgileri eksik. Lütfen E-Belge Ayarları\'ndan gönderici bilgilerini doldurun.');
        }
        // 3. Customer doc'u çek (taxNumber/address/email vs.)
        const customerDoc = await transaction.get(db.collection('customers').doc(sale.customerId));
        if (!customerDoc.exists) {
            throw new Error('Müşteri bulunamadı');
        }
        const customer = customerDoc.data();
        // Idempotency kontrolü
        if (requestId) {
            const existingInvoiceQuery = await db
                .collection('invoices')
                .where('companyId', '==', companyId)
                .where('saleId', '==', saleId)
                .where('requestId', '==', requestId)
                .limit(1)
                .get();
            if (!existingInvoiceQuery.empty) {
                const existingInvoice = existingInvoiceQuery.docs[0];
                logger.info('Idempotency: Mevcut invoice döndürülüyor', {
                    invoiceId: existingInvoice.id,
                    saleId,
                    requestId
                });
                return {
                    invoiceId: existingInvoice.id,
                    number: existingInvoice.data().number
                };
            }
        }
        // 4. Snapshot oluştur
        // Seller snapshot
        const sellerSnapshot = {
            vkn: edocSender.vkn,
            title: edocSender.title,
            taxOffice: edocSender.taxOffice || null,
            address: {
                line1: edocSender.address?.line1 || '',
                line2: edocSender.address?.line2 || null,
                city: edocSender.address?.city || '',
                district: edocSender.address?.district || null,
                postalCode: edocSender.address?.postalCode || null,
                country: edocSender.address?.country || 'TR'
            }
        };
        // Buyer snapshot
        const buyerSnapshot = {
            taxNumber: customer.taxNumber || customer.invoiceAddress?.taxNumber || null,
            name: customer.name || null,
            title: customer.name || null, // Müşteri adı title olarak kullanılabilir
            taxOffice: customer.taxOffice || null,
            address: {
                line1: (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
                line2: (customer.invoiceAddress?.line2 || customer.address?.line2) || null,
                city: (customer.invoiceAddress?.city || customer.address?.city) || '',
                district: (customer.invoiceAddress?.district || customer.address?.district) || null,
                postalCode: (customer.invoiceAddress?.postalCode || customer.address?.postalCode) || null,
                country: (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
            },
            email: customer.email || null
        };
        // Item snapshot
        const itemSnapshots = sale.items.map((item) => ({
            sku: item.sku || '',
            name: item.name || '',
            quantity: item.quantity || 0,
            unit: item.unit || 'AD',
            unitPrice: item.unitPrice || 0,
            discount: item.discount || 0,
            discountAmount: item.discountAmount || 0,
            vatRate: item.vatRate || 18,
            vatAmount: item.vatAmount || 0,
            totalPrice: item.totalPrice || 0,
            totalWithVat: item.totalWithVat || 0,
            saleItemId: item.id
        }));
        // Totals snapshot
        const totalsSnapshot = {
            subtotal: sale.subtotal || 0,
            totalDiscount: sale.totalDiscount || 0,
            totalVat: sale.totalVat || 0,
            totalAmount: sale.totalAmount || 0,
            currency: sale.currency || 'TRY',
            exchangeRate: sale.exchangeRate || null
        };
        // Dates snapshot
        const now = Timestamp.now();
        const paymentTerms = customer.paymentTerms || 30;
        const dueDate = new Date(now.toDate());
        dueDate.setDate(dueDate.getDate() + paymentTerms);
        const datesSnapshot = {
            issueDate: now,
            dueDate: Timestamp.fromDate(dueDate),
            createdFromSaleAt: now
        };
        // Invoice snapshot
        const invoiceSnapshot = {
            seller: sellerSnapshot,
            buyer: buyerSnapshot,
            items: itemSnapshots,
            totals: totalsSnapshot,
            dates: datesSnapshot
        };
        // 5. Invoice numarası üret
        const invoiceNumber = await generateInvoiceNumber(companyId);
        // Company defaults'dan invoiceType ve scenario al
        const invoiceTypeDefault = company?.edoc?.defaults?.invoiceTypeDefault || null;
        const scenarioDefault = company?.edoc?.defaults?.scenarioDefault || customer.defaultScenario || null;
        // 6. Invoice doc'u create et (status='draft')
        const invoiceRef = db.collection('invoices').doc();
        const invoiceId = invoiceRef.id;
        const invoiceData = {
            companyId,
            saleId,
            number: invoiceNumber,
            status: 'draft',
            invoiceType: invoiceTypeDefault,
            scenario: scenarioDefault,
            snapshot: invoiceSnapshot,
            edoc: {
                providerKey: company?.edoc?.providerKey || null,
                externalId: null,
                uuid: null,
                ettn: null,
                sentAt: null,
                responseLogs: [],
                pdfUrl: null
            },
            requestId: requestId || null,
            createdAt: now,
            createdBy: userId,
            updatedAt: now,
            updatedBy: userId
        };
        // Teklifbul Rule v1.0 - Cleanup undefined fields to prevent Firestore errors
        Object.keys(invoiceData).forEach(key => {
            // @ts-ignore
            if (invoiceData[key] === undefined) {
                // @ts-ignore
                invoiceData[key] = null;
            }
        });
        // Cleanup snapshot fields too
        const cleanObject = (obj) => {
            Object.keys(obj).forEach(k => {
                if (obj[k] === undefined)
                    obj[k] = null;
                else if (obj[k] && typeof obj[k] === 'object' && !obj[k].toDate)
                    cleanObject(obj[k]);
            });
        };
        cleanObject(invoiceData.snapshot);
        transaction.set(invoiceRef, invoiceData);
        // 7. Sale doc'unda invoiceIds array'ine ekle ve lastInvoicedAt set et
        const currentInvoiceIds = sale.invoiceIds || [];
        const updatedInvoiceIds = [...currentInvoiceIds, invoiceId];
        transaction.update(saleRef, {
            invoiceIds: updatedInvoiceIds,
            lastInvoicedAt: now,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log (transaction dışında)
        await logAuditEvent({
            companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'create_draft',
            actorUserId: userId,
            result: 'success',
            metadata: {
                saleId,
                invoiceNumber,
                requestId: requestId || null
            }
        });
        logger.info('Invoice draft oluşturuldu (snapshot)', {
            invoiceId,
            saleId,
            invoiceNumber,
            userId
        });
        return { invoiceId, number: invoiceNumber };
    });
}
/**
 * Direkt fatura oluştur (satışsız) - kullanıcının seçtiği müşteri + kalemler ile.
 * Teklifbul Rule v1.0 - Snapshot bazlı, idempotency desteği, transaction güvenli.
 */
export async function createDirectInvoiceDraft(options) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const { companyId, userId, customerId, items, currency, exchangeRate, paymentTermsDays, requestId } = options;
    if (!customerId) {
        throw new Error('Müşteri seçimi zorunludur');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('En az bir kalem eklenmelidir');
    }
    for (const it of items) {
        if (!it.name || !Number.isFinite(Number(it.quantity)) || !Number.isFinite(Number(it.unitPrice))) {
            throw new Error('Kalemlerde ad, miktar ve birim fiyat zorunludur');
        }
        if (Number(it.quantity) <= 0) {
            throw new Error(`Miktar 0'dan büyük olmalıdır: ${it.name}`);
        }
    }
    const companyRef = db.collection('companies').doc(companyId);
    const customerRef = db.collection('customers').doc(customerId);
    return await db.runTransaction(async (transaction) => {
        const [companyDoc, customerDoc] = await Promise.all([
            transaction.get(companyRef),
            transaction.get(customerRef)
        ]);
        if (!companyDoc.exists) {
            throw new Error('Şirket bulunamadı');
        }
        if (!customerDoc.exists) {
            throw new Error('Müşteri bulunamadı');
        }
        const company = companyDoc.data();
        const customer = customerDoc.data();
        if (customer.companyId && customer.companyId !== companyId) {
            throw new Error('Müşteri bu şirkete ait değil');
        }
        const edocSender = company?.edoc?.sender;
        if (!edocSender || !edocSender.vkn || !edocSender.title) {
            throw new Error("Şirket e-belge gönderici bilgileri eksik. Lütfen E-Belge Ayarları'ndan gönderici bilgilerini doldurun.");
        }
        if (requestId) {
            const dupQuery = await db
                .collection('invoices')
                .where('companyId', '==', companyId)
                .where('requestId', '==', requestId)
                .limit(1)
                .get();
            if (!dupQuery.empty) {
                const existing = dupQuery.docs[0];
                logger.info('Idempotency: Mevcut direct invoice döndürülüyor', {
                    invoiceId: existing.id,
                    requestId
                });
                return { invoiceId: existing.id, number: existing.data().number };
            }
        }
        const sellerSnapshot = {
            vkn: edocSender.vkn,
            title: edocSender.title,
            taxOffice: edocSender.taxOffice || null,
            address: {
                line1: edocSender.address?.line1 || '',
                line2: edocSender.address?.line2 || null,
                city: edocSender.address?.city || '',
                district: edocSender.address?.district || null,
                postalCode: edocSender.address?.postalCode || null,
                country: edocSender.address?.country || 'TR'
            }
        };
        const buyerSnapshot = {
            taxNumber: customer.taxNumber || customer.invoiceAddress?.taxNumber || null,
            name: customer.name || null,
            title: customer.name || null,
            taxOffice: customer.taxOffice || null,
            address: {
                line1: (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
                line2: (customer.invoiceAddress?.line2 || customer.address?.line2) || null,
                city: (customer.invoiceAddress?.city || customer.address?.city) || '',
                district: (customer.invoiceAddress?.district || customer.address?.district) || null,
                postalCode: (customer.invoiceAddress?.postalCode || customer.address?.postalCode) || null,
                country: (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
            },
            email: customer.email || null
        };
        let subtotal = 0;
        let totalDiscount = 0;
        let totalVat = 0;
        let totalAmount = 0;
        const itemSnapshots = items.map((item, idx) => {
            const qty = Number(item.quantity) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            const discount = Number(item.discount) || 0;
            const vatRate = item.vatRate != null ? Number(item.vatRate) : 20;
            const lineGross = qty * unitPrice;
            const discountAmount = (lineGross * discount) / 100;
            const lineNet = lineGross - discountAmount;
            const vatAmount = (lineNet * vatRate) / 100;
            const lineWithVat = lineNet + vatAmount;
            subtotal += lineGross;
            totalDiscount += discountAmount;
            totalVat += vatAmount;
            totalAmount += lineWithVat;
            return {
                sku: item.sku || '',
                name: item.name,
                quantity: qty,
                unit: item.unit || 'AD',
                unitPrice,
                discount,
                discountAmount,
                vatRate,
                vatAmount,
                totalPrice: lineNet,
                totalWithVat: lineWithVat,
                saleItemId: `direct_${idx}`
            };
        });
        const totalsSnapshot = {
            subtotal,
            totalDiscount,
            totalVat,
            totalAmount,
            currency: currency || 'TRY',
            exchangeRate: exchangeRate ?? undefined
        };
        const now = Timestamp.now();
        const paymentTerms = Number.isFinite(Number(paymentTermsDays))
            ? Number(paymentTermsDays)
            : (Number(customer.paymentTerms) || 30);
        const dueDate = new Date(now.toDate());
        dueDate.setDate(dueDate.getDate() + paymentTerms);
        const datesSnapshot = {
            issueDate: now,
            dueDate: Timestamp.fromDate(dueDate),
            createdFromSaleAt: null
        };
        const invoiceSnapshot = {
            seller: sellerSnapshot,
            buyer: buyerSnapshot,
            items: itemSnapshots,
            totals: totalsSnapshot,
            dates: datesSnapshot
        };
        const invoiceNumber = await generateInvoiceNumber(companyId);
        const invoiceTypeDefault = company?.edoc?.defaults?.invoiceTypeDefault || null;
        const scenarioDefault = company?.edoc?.defaults?.scenarioDefault || customer.defaultScenario || null;
        const invoiceRef = db.collection('invoices').doc();
        const invoiceId = invoiceRef.id;
        const invoiceData = {
            companyId,
            saleId: null,
            number: invoiceNumber,
            status: 'draft',
            invoiceType: invoiceTypeDefault,
            scenario: scenarioDefault,
            snapshot: invoiceSnapshot,
            edoc: {
                providerKey: company?.edoc?.providerKey || null,
                externalId: null,
                uuid: null,
                ettn: null,
                sentAt: null,
                responseLogs: [],
                pdfUrl: null
            },
            requestId: requestId || null,
            createdAt: now,
            createdBy: userId,
            updatedAt: now,
            updatedBy: userId,
            origin: 'direct'
        };
        Object.keys(invoiceData).forEach((key) => {
            // @ts-ignore
            if (invoiceData[key] === undefined) {
                // @ts-ignore
                invoiceData[key] = null;
            }
        });
        const cleanObject = (obj) => {
            Object.keys(obj).forEach((k) => {
                if (obj[k] === undefined)
                    obj[k] = null;
                else if (obj[k] && typeof obj[k] === 'object' && !obj[k].toDate)
                    cleanObject(obj[k]);
            });
        };
        cleanObject(invoiceData.snapshot);
        transaction.set(invoiceRef, invoiceData);
        await logAuditEvent({
            companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'create_direct_draft',
            actorUserId: userId,
            result: 'success',
            metadata: {
                invoiceNumber,
                customerId,
                itemCount: items.length,
                requestId: requestId || null
            }
        });
        logger.info('Direct invoice draft oluşturuldu', {
            invoiceId,
            invoiceNumber,
            customerId,
            userId,
            itemCount: items.length
        });
        return { invoiceId, number: invoiceNumber };
    });
}
/**
 * Invoice güncelleme (immutability kontrolü ile)
 * Teklifbul Rule v1.0 - Snapshot immutable after sent/accepted
 */
export async function updateInvoice(invoiceId, userId, companyId, updateData) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    return await db.runTransaction(async (transaction) => {
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists) {
            throw new Error('Fatura bulunamadı');
        }
        const invoice = invoiceDoc.data();
        // Company kontrolü
        if (invoice.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // Immutability kontrolü
        const immutableStatuses = ['sent', 'accepted'];
        if (immutableStatuses.includes(invoice.status)) {
            // Snapshot alanlarına update reddet
            if (updateData.snapshot) {
                throw new Error(`Fatura durumu '${invoice.status}' olduğu için snapshot alanları güncellenemez.`);
            }
        }
        // Ready durumunda snapshot update sadece muhasebe/tam yetki ile mümkün olabilir
        // (Bu kontrol PROMPT 4/5'te permission guard ile yapılacak)
        if (invoice.status === 'ready' && updateData.snapshot) {
            // Şimdilik uyarı ver, PROMPT 4/5'te permission kontrolü eklenecek
            logger.warn('Invoice ready durumunda snapshot güncelleme denemesi', {
                invoiceId,
                userId
            });
        }
        // Güncelleme verisi hazırla
        const finalUpdateData = {
            ...updateData,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        };
        // Snapshot'ı updateData'dan çıkar (immutability kontrolü geçtiyse)
        if (immutableStatuses.includes(invoice.status)) {
            delete finalUpdateData.snapshot;
        }
        transaction.update(invoiceRef, finalUpdateData);
        logger.info('Invoice güncellendi', {
            invoiceId,
            userId,
            changedFields: Object.keys(updateData)
        });
    });
}
/**
 * Ödeme kaydı ekleme (mevcut fonksiyon korunuyor)
 * invoice_payments subcollection kullanılır (performans için)
 */
export async function recordPayment(invoiceId, userId, companyId, paymentData) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    return await db.runTransaction(async (transaction) => {
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists) {
            throw new Error('Fatura bulunamadı');
        }
        const invoice = invoiceDoc.data();
        // Company kontrolü
        if (invoice.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // Ödeme kaydı oluştur (subcollection)
        const paymentRef = invoiceRef.collection('invoice_payments').doc();
        const paymentId = paymentRef.id;
        transaction.set(paymentRef, {
            invoiceId: invoiceId,
            amount: paymentData.amount,
            date: Timestamp.fromDate(paymentData.date),
            method: paymentData.method,
            reference: paymentData.reference || null,
            createdBy: userId,
            createdAt: FieldValue.serverTimestamp()
        });
        // Invoice'daki payments array'ini güncelle (cache için)
        const currentPayments = invoice.payments || [];
        const newPayments = [
            ...currentPayments,
            {
                id: paymentId,
                amount: paymentData.amount,
                date: Timestamp.fromDate(paymentData.date),
                method: paymentData.method,
                reference: paymentData.reference || null,
                createdBy: userId,
                createdAt: FieldValue.serverTimestamp()
            }
        ];
        // Payment status hesapla
        const totalPaid = newPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalAmount = invoice.snapshot?.totals?.totalAmount || invoice.totalAmount || 0;
        const paymentStatus = totalPaid >= totalAmount
            ? 'paid'
            : totalPaid > 0
                ? 'partial'
                : 'unpaid';
        // Invoice güncelle
        transaction.update(invoiceRef, {
            payments: newPayments,
            paymentStatus: paymentStatus,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log (transaction dışında)
        await logAuditEvent({
            companyId: companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'record_payment',
            actorUserId: userId,
            result: 'success',
            metadata: {
                paymentId,
                amount: paymentData.amount,
                method: paymentData.method,
                newPaymentStatus: paymentStatus
            }
        });
        logger.info('Ödeme kaydedildi', {
            invoiceId,
            paymentId,
            amount: paymentData.amount,
            userId
        });
    });
    // Cari hesaba işle (Transaction başarılı olduktan sonra)
    // Invoice'u tekrar okuyup cari işlem yapıyoruz
    const dbAfterTx = await getAdminDb();
    const invoiceDocAfterTx = await dbAfterTx.collection('invoices').doc(invoiceId).get();
    const invoiceData = invoiceDocAfterTx.data();
    const saleId = invoiceData?.saleId;
    if (saleId) {
        // Sale dökümanından customerId'yi al (daha güvenilir)
        const saleDoc = await dbAfterTx.collection('sales').doc(saleId).get();
        const saleData = saleDoc.data();
        const currency = invoiceData?.currency;
        const invoiceNumber = invoiceData?.number;
        const customerId = saleData?.customerId;
        if (customerId) {
            try {
                await addTransaction({
                    customerId,
                    companyId,
                    userId,
                    type: 'credit', // Ödeme = Alacak
                    transactionType: 'payment',
                    amount: paymentData.amount,
                    currency: currency || 'TRY',
                    description: `Fatura Ödemesi: ${invoiceNumber || invoiceId}`,
                    documentId: invoiceId,
                    documentNumber: invoiceNumber,
                    date: paymentData.date
                });
            }
            catch (err) {
                logger.error('Cari işlem hatası (Ödeme)', err);
                // Kritik hata değil, ödeme kaydoldu ama cariye işlenemedi.
                // TODO: Queue sistemine atılabilir.
            }
        }
    }
}
/**
 * Invoice prepare (validasyon + status=ready)
 * Teklifbul Rule v1.0 - Validasyon kuralları
 */
export async function prepareInvoice(invoiceId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    return await db.runTransaction(async (transaction) => {
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists) {
            throw new Error('Fatura bulunamadı');
        }
        const invoice = invoiceDoc.data();
        // Company kontrolü
        if (invoice.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // Status kontrolü
        if (invoice.status !== 'draft') {
            throw new Error(`Fatura durumu '${invoice.status}' olduğu için hazırlanamaz. Sadece taslak durumundaki faturalar hazırlanabilir.`);
        }
        // Validasyonlar
        const validationErrors = [];
        // Company edoc.sender kontrolü
        const companyDoc = await transaction.get(db.collection('companies').doc(companyId));
        const company = companyDoc.data();
        const sender = company?.edoc?.sender;
        if (!sender || !sender.vkn || !sender.title) {
            validationErrors.push('Şirket e-belge gönderici bilgileri eksik (vkn, title)');
        }
        if (!sender?.address?.line1 || !sender?.address?.city || !sender?.address?.country) {
            validationErrors.push('Şirket e-belge gönderici adresi eksik (line1, city, country)');
        }
        // Buyer validasyonları
        const buyer = invoice.snapshot.buyer;
        if (!buyer.taxNumber) {
            validationErrors.push('Alıcı vergi numarası (VKN/TCKN) zorunludur');
        }
        if (!buyer.address?.line1 || !buyer.address?.city || !buyer.address?.country) {
            validationErrors.push('Alıcı adresi eksik (line1, city, country)');
        }
        if (!buyer.address?.district) {
            validationErrors.push('Alıcı adresi ilçe bilgisi zorunludur');
        }
        // Totals validasyonu
        if (!invoice.snapshot.totals || invoice.snapshot.totals.totalAmount <= 0) {
            validationErrors.push('Fatura toplam tutarı 0\'dan büyük olmalıdır');
        }
        // Items validasyonu
        if (!invoice.snapshot.items || invoice.snapshot.items.length === 0) {
            validationErrors.push('Fatura en az 1 kalem içermelidir');
        }
        if (validationErrors.length > 0) {
            throw new Error(`Validasyon hatası: ${validationErrors.join('; ')}`);
        }
        // Status'u ready yap
        transaction.update(invoiceRef, {
            status: 'ready',
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log
        await logAuditEvent({
            companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'prepare',
            actorUserId: userId,
            result: 'success',
            metadata: { invoiceNumber: invoice.number }
        });
        logger.info('Invoice hazırlandı', { invoiceId, invoiceNumber: invoice.number });
    });
}
/**
 * Invoice send (provider'a gönder)
 * Teklifbul Rule v1.0 - Idempotent, provider-agnostic
 */
export async function sendInvoice(invoiceId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    return await db.runTransaction(async (transaction) => {
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists) {
            throw new Error('Fatura bulunamadı');
        }
        const invoice = invoiceDoc.data();
        // Company kontrolü
        if (invoice.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // Status kontrolü
        if (invoice.status === 'draft') {
            throw new Error('Fatura önce hazırlanmalıdır (prepare).');
        }
        if (invoice.status !== 'ready') {
            throw new Error(`Fatura durumu '${invoice.status}' olduğu için gönderilemez.`);
        }
        // Idempotency: Eğer zaten gönderilmişse mevcut state'i dön
        if (invoice.edoc.externalId) {
            logger.info('Invoice zaten gönderilmiş (idempotent)', {
                invoiceId,
                externalId: invoice.edoc.externalId
            });
            return {
                externalId: invoice.edoc.externalId,
                uuid: invoice.edoc.uuid || ''
            };
        }
        // Provider'ı al
        const { provider, credentials } = await getEdocProvider(companyId);
        // Provider'a gönder
        const sendResult = await provider.sendInvoice(invoice.snapshot, invoice.edoc, credentials);
        // Response'u sanitize et (secret bilgileri çıkar)
        const sanitizedResponse = {
            externalId: sendResult.externalId,
            uuid: sendResult.uuid,
            ettn: sendResult.ettn,
            pdfUrl: sendResult.pdfUrl,
            timestamp: new Date().toISOString()
        };
        // Invoice'ı güncelle
        const updatedEdoc = {
            ...invoice.edoc,
            providerKey: invoice.edoc.providerKey || (await db.collection('companies').doc(companyId).get()).data()?.edoc?.providerKey || null,
            externalId: sendResult.externalId,
            uuid: sendResult.uuid,
            ettn: sendResult.ettn || null,
            pdfUrl: sendResult.pdfUrl || null,
            sentAt: Timestamp.now(),
            responseLogs: [...(invoice.edoc.responseLogs || []), sanitizedResponse]
        };
        transaction.update(invoiceRef, {
            status: 'sent',
            edoc: updatedEdoc,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log
        await logAuditEvent({
            companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'send',
            actorUserId: userId,
            result: 'success',
            metadata: {
                invoiceNumber: invoice.number,
                externalId: sendResult.externalId,
                uuid: sendResult.uuid
            }
        });
        logger.info('Invoice gönderildi', {
            invoiceId,
            invoiceNumber: invoice.number,
            externalId: sendResult.externalId,
            uuid: sendResult.uuid
        });
        return {
            externalId: sendResult.externalId,
            uuid: sendResult.uuid
        };
    });
}
/**
 * Invoice status sync (provider'dan durum çek)
 */
export async function syncInvoiceStatus(invoiceId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    return await db.runTransaction(async (transaction) => {
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists) {
            throw new Error('Fatura bulunamadı');
        }
        const invoice = invoiceDoc.data();
        // Company kontrolü
        if (invoice.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // ExternalId kontrolü
        if (!invoice.edoc.externalId) {
            throw new Error('Fatura henüz gönderilmemiş (externalId yok)');
        }
        // Provider'ı al
        const { provider, credentials } = await getEdocProvider(companyId);
        // Provider'dan durum çek
        const statusResult = await provider.getInvoiceStatus(invoice.edoc.externalId, credentials);
        // Status mapping
        let newStatus = invoice.status;
        if (statusResult.status === 'accepted') {
            newStatus = 'accepted';
        }
        else if (statusResult.status === 'rejected') {
            newStatus = 'rejected';
        }
        // Response'u sanitize et
        const sanitizedResponse = {
            status: statusResult.status,
            ettn: statusResult.ettn,
            pdfUrl: statusResult.pdfUrl,
            rejectionReason: statusResult.rejectionReason,
            timestamp: new Date().toISOString()
        };
        // Invoice'ı güncelle
        const updatedEdoc = {
            ...invoice.edoc,
            pdfUrl: statusResult.pdfUrl || invoice.edoc.pdfUrl || null,
            responseLogs: [...(invoice.edoc.responseLogs || []), sanitizedResponse]
        };
        transaction.update(invoiceRef, {
            status: newStatus,
            edoc: updatedEdoc,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log
        await logAuditEvent({
            companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'status_sync',
            actorUserId: userId,
            result: 'success',
            metadata: {
                invoiceNumber: invoice.number,
                oldStatus: invoice.status,
                newStatus,
                externalId: invoice.edoc.externalId
            }
        });
        logger.info('Invoice durum senkronize edildi', {
            invoiceId,
            invoiceNumber: invoice.number,
            oldStatus: invoice.status,
            newStatus
        });
        return {
            status: newStatus,
            ettn: statusResult.ettn,
            pdfUrl: statusResult.pdfUrl || invoice.edoc.pdfUrl || undefined
        };
    });
}
/**
 * Invoice PDF al
 */
export async function getInvoicePdf(invoiceId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    // Invoice'ı al
    const invoiceDoc = await invoiceRef.get();
    if (!invoiceDoc.exists) {
        throw new Error('Fatura bulunamadı');
    }
    const invoice = invoiceDoc.data();
    // Company kontrolü
    if (invoice.companyId !== companyId) {
        throw new Error('Yetkisiz erişim');
    }
    // Eğer zaten pdfUrl varsa dön
    if (invoice.edoc.pdfUrl) {
        return { pdfUrl: invoice.edoc.pdfUrl };
    }
    // ExternalId kontrolü
    if (!invoice.edoc.externalId) {
        throw new Error('Fatura henüz gönderilmemiş (externalId yok)');
    }
    // Provider'ı al
    const { provider, credentials } = await getEdocProvider(companyId);
    // Provider'dan PDF al
    const pdfResult = await provider.getInvoicePdf(invoice.edoc.externalId, credentials);
    // PDF URL'i kaydet
    await invoiceRef.update({
        'edoc.pdfUrl': pdfResult.pdfUrl,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    });
    logger.info('Invoice PDF alındı', {
        invoiceId,
        invoiceNumber: invoice.number,
        pdfUrl: pdfResult.pdfUrl
    });
    return { pdfUrl: pdfResult.pdfUrl };
}
/**
 * Invoice cancel
 */
export async function cancelInvoice(invoiceId, userId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const invoiceRef = db.collection('invoices').doc(invoiceId);
    return await db.runTransaction(async (transaction) => {
        const invoiceDoc = await transaction.get(invoiceRef);
        if (!invoiceDoc.exists) {
            throw new Error('Fatura bulunamadı');
        }
        const invoice = invoiceDoc.data();
        // Company kontrolü
        if (invoice.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }
        // Status kontrolü
        if (invoice.status !== 'sent' && invoice.status !== 'accepted') {
            throw new Error(`Fatura durumu '${invoice.status}' olduğu için iptal edilemez. Sadece gönderilmiş veya kabul edilmiş faturalar iptal edilebilir.`);
        }
        // ExternalId kontrolü
        if (!invoice.edoc.externalId) {
            throw new Error('Fatura henüz gönderilmemiş (externalId yok)');
        }
        // Provider'ı al
        const { provider, credentials } = await getEdocProvider(companyId);
        // Provider'a iptal isteği gönder
        const cancelResult = await provider.cancelInvoice(invoice.edoc.externalId, credentials);
        if (!cancelResult.cancelled) {
            throw new Error('Fatura iptal edilemedi');
        }
        // Response'u sanitize et
        const sanitizedResponse = {
            cancelled: true,
            cancelledAt: cancelResult.cancelledAt?.toISOString(),
            cancellationReason: cancelResult.cancellationReason,
            timestamp: new Date().toISOString()
        };
        // Invoice'ı güncelle
        transaction.update(invoiceRef, {
            status: 'cancelled',
            'edoc.responseLogs': FieldValue.arrayUnion(sanitizedResponse),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Audit log
        await logAuditEvent({
            companyId,
            entityType: 'invoice',
            entityId: invoiceId,
            action: 'cancel',
            actorUserId: userId,
            result: 'success',
            metadata: {
                invoiceNumber: invoice.number,
                externalId: invoice.edoc.externalId
            }
        });
        logger.info('Invoice iptal edildi', {
            invoiceId,
            invoiceNumber: invoice.number,
            externalId: invoice.edoc.externalId
        });
    });
}
