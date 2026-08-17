/**
 * Customer Service - Satış Modülü Faz 1
 * Müşteri yönetimi servisi
 * Teklifbul Rule v1.0 - Code generation, validation, transaction güvenliği
 */
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
/**
 * Müşteri kodu üretimi
 * Format: CUST-YYYY-XXXXX (Base36)
 * Örnek: CUST-2025-00001, CUST-2025-0000A
 */
export async function generateCustomerCode(companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const year = new Date().getFullYear();
    const counterRef = db.collection('counters').doc(`customerCode_${companyId}_${year}`);
    return await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentCount = counterDoc.exists ? (counterDoc.data()?.count || 0) : 0;
        const newCount = currentCount + 1;
        const base36 = newCount.toString(36).toUpperCase();
        const padded = base36.padStart(5, '0');
        transaction.set(counterRef, {
            count: newCount,
            lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true });
        return `CUST-${year}-${padded}`;
    });
}
/**
 * VKN/TCKN doğrulama
 * 10 haneli VKN veya 11 haneli TCKN
 */
export function validateVKN(vkn) {
    if (!/^\d{10,11}$/.test(vkn))
        return false;
    // VKN algoritması (mod 10)
    if (vkn.length === 10) {
        const digits = vkn.split('').map(Number);
        const sum = digits.slice(0, 9).reduce((acc, val, idx) => acc + val * (idx + 1), 0);
        const check = sum % 11;
        return check === digits[9] || (check === 10 && digits[9] === 0);
    }
    // TCKN doğrulama
    if (vkn.length === 11) {
        const digits = vkn.split('').map(Number);
        if (digits[0] === 0)
            return false;
        const sum1 = digits.slice(0, 10).reduce((acc, val) => acc + val, 0);
        const sum2 = digits.slice(0, 9).reduce((acc, val, idx) => acc + val * (idx + 1), 0);
        return sum1 % 10 === digits[10] && sum2 % 11 === digits[9];
    }
    return false;
}
/**
 * Müşteri kodu benzersizlik kontrolü
 */
export async function isCustomerCodeUnique(companyId, code, excludeCustomerId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const query = db
        .collection('customers')
        .where('companyId', '==', companyId)
        .where('code', '==', code)
        .limit(1);
    const snapshot = await query.get();
    if (snapshot.empty) {
        return true;
    }
    // Eğer excludeCustomerId verilmişse ve bu ID'ye aitse benzersiz sayılır
    if (excludeCustomerId && snapshot.docs[0].id === excludeCustomerId) {
        return true;
    }
    return false;
}
export async function createCustomer(input) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    // VKN doğrulama
    if (input.taxNumber && !validateVKN(input.taxNumber)) {
        throw new Error('Geçersiz VKN/TCKN');
    }
    // Müşteri kodu üret
    const code = await generateCustomerCode(input.companyId);
    // Kodu benzersizlik kontrolü (nadir durumda çakışma olabilir)
    const isUnique = await isCustomerCodeUnique(input.companyId, code);
    if (!isUnique) {
        // Retry: Yeni kod üret
        const retryCode = await generateCustomerCode(input.companyId);
        const retryUnique = await isCustomerCodeUnique(input.companyId, retryCode);
        if (!retryUnique) {
            throw new Error('Müşteri kodu oluşturulamadı. Lütfen tekrar deneyin.');
        }
    }
    const customerRef = db.collection('customers').doc();
    const now = FieldValue.serverTimestamp();
    await customerRef.set({
        companyId: input.companyId,
        code: code,
        name: input.name,
        taxNumber: input.taxNumber || null,
        taxOffice: input.taxOffice || null,
        taxOfficeCode: input.taxOfficeCode || null,
        // Teklifbul Rule v1.0 - E-Belge alanları
        invoiceAddress: input.invoiceAddress || null,
        email: input.email || null,
        isEFaturaUser: input.isEFaturaUser || null,
        efaturaQueryLastAt: input.efaturaQueryLastAt || null,
        defaultScenario: input.defaultScenario || null,
        address: input.address || {},
        contact: input.contact || {},
        paymentTerms: input.paymentTerms || 30,
        creditLimit: input.creditLimit || null,
        currency: input.currency || 'TRY',
        customerType: input.customerType || 'cari',
        isActive: input.isActive !== undefined ? input.isActive : true,
        isArchived: false,
        status: input.status || 'pending', // pending, approved, rejected
        notes: input.notes || null,
        supplierId: input.supplierId || null,
        createdAt: now,
        updatedAt: now,
        createdBy: input.userId,
        updatedBy: input.userId
    });
    logger.info('Müşteri oluşturuldu', {
        customerId: customerRef.id,
        companyId: input.companyId,
        code: code
    });
    return customerRef.id;
}
export async function updateCustomer(input) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const customerRef = db.collection('customers').doc(input.customerId);
    const customerDoc = await customerRef.get();
    if (!customerDoc.exists) {
        throw new Error('Müşteri bulunamadı');
    }
    const customerData = customerDoc.data();
    if (customerData?.companyId !== input.companyId) {
        throw new Error('Yetkisiz erişim');
    }
    // VKN doğrulama
    if (input.taxNumber && !validateVKN(input.taxNumber)) {
        throw new Error('Geçersiz VKN/TCKN');
    }
    const updateData = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.userId
    };
    if (input.name !== undefined)
        updateData.name = input.name;
    if (input.taxNumber !== undefined)
        updateData.taxNumber = input.taxNumber || null;
    if (input.taxOffice !== undefined)
        updateData.taxOffice = input.taxOffice || null;
    if (input.taxOfficeCode !== undefined)
        updateData.taxOfficeCode = input.taxOfficeCode || null;
    // Teklifbul Rule v1.0 - E-Belge alanları
    if (input.invoiceAddress !== undefined)
        updateData.invoiceAddress = input.invoiceAddress || null;
    if (input.email !== undefined)
        updateData.email = input.email || null;
    if (input.isEFaturaUser !== undefined)
        updateData.isEFaturaUser = input.isEFaturaUser || null;
    if (input.efaturaQueryLastAt !== undefined)
        updateData.efaturaQueryLastAt = input.efaturaQueryLastAt || null;
    if (input.defaultScenario !== undefined)
        updateData.defaultScenario = input.defaultScenario || null;
    if (input.address !== undefined)
        updateData.address = input.address || {};
    if (input.contact !== undefined)
        updateData.contact = input.contact || {};
    if (input.paymentTerms !== undefined)
        updateData.paymentTerms = input.paymentTerms;
    if (input.creditLimit !== undefined)
        updateData.creditLimit = input.creditLimit || null;
    if (input.currency !== undefined)
        updateData.currency = input.currency;
    if (input.customerType !== undefined)
        updateData.customerType = input.customerType;
    if (input.isActive !== undefined)
        updateData.isActive = input.isActive;
    if (input.notes !== undefined)
        updateData.notes = input.notes || null;
    await customerRef.update(updateData);
    logger.info('Müşteri güncellendi', {
        customerId: input.customerId,
        companyId: input.companyId
    });
}
/**
 * Müşteri arşivleme (soft delete)
 */
export async function archiveCustomer(customerId, companyId, userId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const customerRef = db.collection('customers').doc(customerId);
    const customerDoc = await customerRef.get();
    if (!customerDoc.exists) {
        throw new Error('Müşteri bulunamadı');
    }
    const customerData = customerDoc.data();
    if (customerData?.companyId !== companyId) {
        throw new Error('Yetkisiz erişim');
    }
    await customerRef.update({
        isArchived: true,
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    });
    logger.info('Müşteri arşivlendi', {
        customerId: customerId,
        companyId: companyId
    });
}
/**
 * Supplier'dan müşteri bul veya oluştur (Satış Modülü Faz 5)
 * @param companyId - Şirket ID
 * @param supplierId - Supplier ID (users collection'ında supplier olarak işaretlenmiş)
 * @param userId - Kullanıcı ID (createdBy için)
 * @returns Customer ID
 */
export async function findOrCreateCustomerFromSupplier(companyId, supplierId, userId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    // 1. Supplier bilgilerini al (users collection'dan)
    const supplierDoc = await db.collection('users').doc(supplierId).get();
    if (!supplierDoc.exists) {
        throw new Error('Supplier bulunamadı');
    }
    const supplier = supplierDoc.data();
    if (!supplier) {
        throw new Error('Supplier verisi okunamadı');
    }
    // 2. Mevcut müşteri ara (supplierId ile)
    const existingCustomerQuery = await db
        .collection('customers')
        .where('companyId', '==', companyId)
        .where('supplierId', '==', supplierId)
        .limit(1)
        .get();
    if (!existingCustomerQuery.empty) {
        const existingCustomerId = existingCustomerQuery.docs[0].id;
        logger.info('Mevcut müşteri bulundu (supplier mapping)', {
            customerId: existingCustomerId,
            supplierId: supplierId
        });
        return existingCustomerId;
    }
    // 3. Yeni müşteri oluştur
    const customerCode = await generateCustomerCode(companyId);
    // Supplier'dan müşteri bilgilerini al
    const supplierProfile = supplier.profile || {};
    const supplierCompany = supplier.companyName || supplierProfile.companyName || supplier.displayName || 'Bilinmeyen Şirket';
    const supplierTaxNumber = supplierProfile.taxNumber || null;
    const supplierTaxOffice = supplierProfile.taxOffice || null;
    const supplierAddress = supplierProfile.address || {};
    const supplierContact = supplierProfile.contact || {};
    const customerRef = db.collection('customers').doc();
    const customerId = customerRef.id;
    await customerRef.set({
        companyId: companyId,
        code: customerCode,
        name: supplierCompany,
        taxNumber: supplierTaxNumber,
        taxOffice: supplierTaxOffice,
        address: supplierAddress,
        contact: {
            email: supplier.email || supplierContact.email || null,
            phone: supplierContact.phone || null,
            contactPerson: supplier.displayName || supplierContact.contactPerson || null
        },
        paymentTerms: 30, // Default
        creditLimit: null,
        currency: 'TRY',
        customerType: 'cari',
        isActive: true,
        isArchived: false,
        notes: `Otomatik oluşturuldu (Supplier: ${supplierId})`,
        supplierId: supplierId, // Mapping
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: userId,
        updatedBy: userId
    });
    logger.info('Yeni müşteri oluşturuldu (supplier mapping)', {
        customerId: customerId,
        supplierId: supplierId,
        customerCode: customerCode
    });
    return customerId;
}
