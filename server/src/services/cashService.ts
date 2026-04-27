/**
 * Cash Service - Kasa Modülü
 * Teklifbul Rule v1.0 - ETA uyumlu kasa yönetimi
 * Transaction güvenli, atomic bakiye güncellemesi
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logAuditEvent } from './auditService.js';
import type {
    CashAccount,
    CashTransaction,
    CreateCashAccountInput,
    UpdateCashAccountInput,
    CashTransactionInput,
    CashTransferInput,
    CashAccountSummary
} from '../types/cash.js';

/**
 * Kasa kodu üretimi
 * Format: KASA-XXXX
 */
async function generateCashAccountCode(companyId: string): Promise<string> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const snapshot = await db
        .collection('cash_accounts')
        .where('companyId', '==', companyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

    let nextNumber = 1;
    if (!snapshot.empty) {
        const lastCode = snapshot.docs[0].data().code || '';
        const match = lastCode.match(/KASA-(\d+)/);
        if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
        }
    }

    return `KASA-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Kasa kartı oluştur
 */
export async function createCashAccount(input: CreateCashAccountInput): Promise<string> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const { companyId, name, currency, openingBalance, isDefault, notes, userId } = input;

    // Kod üret veya kullan
    const code = input.code || await generateCashAccountCode(companyId);

    // Kod benzersizlik kontrolü
    const existingCode = await db
        .collection('cash_accounts')
        .where('companyId', '==', companyId)
        .where('code', '==', code)
        .limit(1)
        .get();

    if (!existingCode.empty) {
        throw new Error(`Bu kasa kodu zaten kullanılıyor: ${code}`);
    }

    // Eğer bu varsayılan olacaksa, diğerlerinin varsayılan işaretini kaldır
    if (isDefault) {
        const defaultAccounts = await db
            .collection('cash_accounts')
            .where('companyId', '==', companyId)
            .where('isDefault', '==', true)
            .get();

        const batch = db.batch();
        defaultAccounts.docs.forEach((doc) => {
            batch.update(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
        });
        await batch.commit();
    }

    // Kasa kartı oluştur
    const cashAccountRef = db.collection('cash_accounts').doc();
    const cashAccountId = cashAccountRef.id;

    const cashAccountData: Partial<CashAccount> = {
        id: cashAccountId,
        companyId,
        code,
        name,
        currency: currency || 'TRY',
        balance: openingBalance || 0,
        isActive: true,
        isDefault: isDefault || false,
        notes: notes || undefined,
        createdAt: FieldValue.serverTimestamp() as any,
        updatedAt: FieldValue.serverTimestamp() as any,
        createdBy: userId
    };

    await cashAccountRef.set(cashAccountData);

    // Açılış bakiyesi varsa hareket oluştur
    if (openingBalance && openingBalance > 0) {
        await recordCashTransaction({
            companyId,
            cashAccountId,
            type: 'in',
            transactionType: 'opening_balance',
            amount: openingBalance,
            currency: currency || 'TRY',
            description: 'Açılış Bakiyesi',
            date: new Date(),
            userId
        });
    }

    // Audit log
    await logAuditEvent({
        companyId,
        entityType: 'cash_account',
        entityId: cashAccountId,
        action: 'create',
        actorUserId: userId,
        result: 'success',
        metadata: { code, name, currency, openingBalance }
    });

    logger.info('Kasa kartı oluşturuldu', { cashAccountId, code, name });

    return cashAccountId;
}

/**
 * Kasa kartı güncelle
 */
export async function updateCashAccount(input: UpdateCashAccountInput): Promise<void> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const { cashAccountId, companyId, userId, ...updateFields } = input;

    const cashAccountRef = db.collection('cash_accounts').doc(cashAccountId);
    const cashAccountDoc = await cashAccountRef.get();

    if (!cashAccountDoc.exists) {
        throw new Error('Kasa bulunamadı');
    }

    const cashAccount = cashAccountDoc.data() as CashAccount;
    if (cashAccount.companyId !== companyId) {
        throw new Error('Yetkisiz erişim');
    }

    // Eğer varsayılan yapılacaksa, diğerlerini güncelle
    if (updateFields.isDefault === true) {
        const defaultAccounts = await db
            .collection('cash_accounts')
            .where('companyId', '==', companyId)
            .where('isDefault', '==', true)
            .get();

        const batch = db.batch();
        defaultAccounts.docs.forEach((doc) => {
            if (doc.id !== cashAccountId) {
                batch.update(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
            }
        });
        await batch.commit();
    }

    // Güncelle
    const updateData: any = {
        ...updateFields,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
    };

    // undefined değerleri temizle
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) delete updateData[key];
    });

    await cashAccountRef.update(updateData);

    // Audit log
    await logAuditEvent({
        companyId,
        entityType: 'cash_account',
        entityId: cashAccountId,
        action: 'update',
        actorUserId: userId,
        result: 'success',
        metadata: updateFields
    });

    logger.info('Kasa kartı güncellendi', { cashAccountId });
}

/**
 * Kasa listesi getir
 */
export async function getCashAccounts(companyId: string): Promise<CashAccountSummary[]> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const snapshot = await db
        .collection('cash_accounts')
        .where('companyId', '==', companyId)
        .where('isActive', '==', true)
        .orderBy('code', 'asc')
        .get();

    return snapshot.docs.map((doc) => {
        const data = doc.data() as CashAccount;
        return {
            id: data.id,
            code: data.code,
            name: data.name,
            currency: data.currency,
            balance: data.balance || 0,
            isDefault: data.isDefault || false,
            transactionCount: 0, // Performans için ayrı sorgulanmalı
            lastTransactionDate: undefined
        };
    });
}

/**
 * Kasa hareketi kaydet
 * Transaction güvenli, atomic bakiye güncellemesi
 */
export async function recordCashTransaction(input: CashTransactionInput): Promise<string> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const {
        companyId,
        cashAccountId,
        type,
        transactionType,
        amount,
        exchangeRate,
        relatedEntityType,
        relatedEntityId,
        relatedEntityName,
        documentNumber,
        description,
        date,
        userId
    } = input;

    if (amount <= 0) {
        throw new Error('Tutar sıfırdan büyük olmalıdır');
    }

    const cashAccountRef = db.collection('cash_accounts').doc(cashAccountId);
    const transactionRef = db.collection('cash_transactions').doc();
    const transactionId = transactionRef.id;

    let balanceAfter = 0;
    let cashAccountData: CashAccount | null = null;

    await db.runTransaction(async (transaction) => {
        const cashAccountDoc = await transaction.get(cashAccountRef);

        if (!cashAccountDoc.exists) {
            throw new Error('Kasa bulunamadı');
        }

        cashAccountData = cashAccountDoc.data() as CashAccount;

        if (cashAccountData.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }

        if (!cashAccountData.isActive) {
            throw new Error('Bu kasa pasif durumda');
        }

        // Bakiye hesapla
        const currentBalance = cashAccountData.balance || 0;
        const balanceChange = type === 'in' ? amount : -amount;
        balanceAfter = currentBalance + balanceChange;

        // Negatif bakiye kontrolü (opsiyonel - şimdilik uyarı verme)
        if (balanceAfter < 0 && type === 'out') {
            logger.warn('Kasa bakiyesi negatife düşüyor', {
                cashAccountId,
                currentBalance,
                amount,
                balanceAfter
            });
        }

        // Hareket kaydı
        const transactionData: Partial<CashTransaction> = {
            id: transactionId,
            companyId,
            cashAccountId,
            cashAccountCode: cashAccountData.code,
            cashAccountName: cashAccountData.name,
            type,
            transactionType,
            amount,
            currency: input.currency || cashAccountData.currency,
            exchangeRate: exchangeRate || undefined,
            balanceAfter,
            relatedEntityType: relatedEntityType || undefined,
            relatedEntityId: relatedEntityId || undefined,
            relatedEntityName: relatedEntityName || undefined,
            documentNumber: documentNumber || undefined,
            description,
            date: Timestamp.fromDate(date),
            createdAt: FieldValue.serverTimestamp() as any,
            createdBy: userId
        };

        transaction.set(transactionRef, transactionData);

        // Kasa bakiyesini güncelle
        transaction.update(cashAccountRef, {
            balance: balanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
    });

    // Audit log
    await logAuditEvent({
        companyId,
        entityType: 'cash_transaction',
        entityId: transactionId,
        action: 'create',
        actorUserId: userId,
        result: 'success',
        metadata: {
            cashAccountId,
            type,
            transactionType,
            amount,
            balanceAfter
        }
    });

    logger.info('Kasa hareketi kaydedildi', {
        transactionId,
        cashAccountId,
        type,
        amount,
        balanceAfter
    });

    return transactionId;
}

/**
 * Kasa hareketleri listesi
 */
export async function getCashTransactions(
    companyId: string,
    cashAccountId: string,
    options?: {
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }
): Promise<CashTransaction[]> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    let query = db
        .collection('cash_transactions')
        .where('companyId', '==', companyId)
        .where('cashAccountId', '==', cashAccountId)
        .orderBy('date', 'desc');

    if (options?.startDate) {
        query = query.where('date', '>=', Timestamp.fromDate(options.startDate));
    }

    if (options?.endDate) {
        query = query.where('date', '<=', Timestamp.fromDate(options.endDate));
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => doc.data() as CashTransaction);
}

/**
 * Kasalar arası virman
 * Atomic transaction ile iki kasa güncellenir
 */
export async function transferBetweenCashAccounts(input: CashTransferInput): Promise<{
    fromTransactionId: string;
    toTransactionId: string;
}> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const {
        companyId,
        fromCashAccountId,
        toCashAccountId,
        amount,
        exchangeRate,
        description,
        date,
        userId
    } = input;

    if (fromCashAccountId === toCashAccountId) {
        throw new Error('Aynı kasaya transfer yapılamaz');
    }

    if (amount <= 0) {
        throw new Error('Tutar sıfırdan büyük olmalıdır');
    }

    const fromRef = db.collection('cash_accounts').doc(fromCashAccountId);
    const toRef = db.collection('cash_accounts').doc(toCashAccountId);
    const fromTxRef = db.collection('cash_transactions').doc();
    const toTxRef = db.collection('cash_transactions').doc();

    const fromTransactionId = fromTxRef.id;
    const toTransactionId = toTxRef.id;

    await db.runTransaction(async (transaction) => {
        const [fromDoc, toDoc] = await Promise.all([
            transaction.get(fromRef),
            transaction.get(toRef)
        ]);

        if (!fromDoc.exists || !toDoc.exists) {
            throw new Error('Kasa bulunamadı');
        }

        const fromAccount = fromDoc.data() as CashAccount;
        const toAccount = toDoc.data() as CashAccount;

        if (fromAccount.companyId !== companyId || toAccount.companyId !== companyId) {
            throw new Error('Yetkisiz erişim');
        }

        const fromBalanceAfter = (fromAccount.balance || 0) - amount;
        const toAmount = exchangeRate ? amount * exchangeRate : amount;
        const toBalanceAfter = (toAccount.balance || 0) + toAmount;

        // Çıkış hareketi
        transaction.set(fromTxRef, {
            id: fromTransactionId,
            companyId,
            cashAccountId: fromCashAccountId,
            cashAccountCode: fromAccount.code,
            cashAccountName: fromAccount.name,
            type: 'out',
            transactionType: 'cash_transfer_out',
            amount,
            currency: fromAccount.currency,
            balanceAfter: fromBalanceAfter,
            relatedEntityType: 'cash_account',
            relatedEntityId: toCashAccountId,
            relatedEntityName: toAccount.name,
            description: description || `${toAccount.name} kasasına transfer`,
            date: Timestamp.fromDate(date),
            createdAt: FieldValue.serverTimestamp(),
            createdBy: userId
        });

        // Giriş hareketi
        transaction.set(toTxRef, {
            id: toTransactionId,
            companyId,
            cashAccountId: toCashAccountId,
            cashAccountCode: toAccount.code,
            cashAccountName: toAccount.name,
            type: 'in',
            transactionType: 'cash_transfer_in',
            amount: toAmount,
            currency: toAccount.currency,
            exchangeRate: exchangeRate || undefined,
            balanceAfter: toBalanceAfter,
            relatedEntityType: 'cash_account',
            relatedEntityId: fromCashAccountId,
            relatedEntityName: fromAccount.name,
            description: description || `${fromAccount.name} kasasından transfer`,
            date: Timestamp.fromDate(date),
            createdAt: FieldValue.serverTimestamp(),
            createdBy: userId
        });

        // Bakiyeleri güncelle
        transaction.update(fromRef, {
            balance: fromBalanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });

        transaction.update(toRef, {
            balance: toBalanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
    });

    // Audit log
    await logAuditEvent({
        companyId,
        entityType: 'cash_transfer',
        entityId: fromTransactionId,
        action: 'create',
        actorUserId: userId,
        result: 'success',
        metadata: {
            fromCashAccountId,
            toCashAccountId,
            amount,
            exchangeRate
        }
    });

    logger.info('Kasalar arası virman yapıldı', {
        fromCashAccountId,
        toCashAccountId,
        amount
    });

    return { fromTransactionId, toTransactionId };
}

/**
 * Kasa kartı sil (soft delete)
 */
export async function deleteCashAccount(
    cashAccountId: string,
    companyId: string,
    userId: string
): Promise<void> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const cashAccountRef = db.collection('cash_accounts').doc(cashAccountId);
    const cashAccountDoc = await cashAccountRef.get();

    if (!cashAccountDoc.exists) {
        throw new Error('Kasa bulunamadı');
    }

    const cashAccount = cashAccountDoc.data() as CashAccount;
    if (cashAccount.companyId !== companyId) {
        throw new Error('Yetkisiz erişim');
    }

    // Hareket kontrolü
    const transactions = await db
        .collection('cash_transactions')
        .where('cashAccountId', '==', cashAccountId)
        .limit(1)
        .get();

    if (!transactions.empty) {
        // Hareketi varsa sadece pasifleştir
        await cashAccountRef.update({
            isActive: false,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });

        logger.info('Kasa kartı pasifleştirildi (hareketi var)', { cashAccountId });
    } else {
        // Hareketi yoksa tamamen sil
        await cashAccountRef.delete();
        logger.info('Kasa kartı silindi', { cashAccountId });
    }

    // Audit log
    await logAuditEvent({
        companyId,
        entityType: 'cash_account',
        entityId: cashAccountId,
        action: 'delete',
        actorUserId: userId,
        result: 'success'
    });
}

/**
 * Varsayılan kasa getir
 */
export async function getDefaultCashAccount(companyId: string): Promise<CashAccount | null> {
    const db = await getAdminDb();
    if (!db) throw new Error('Firestore unavailable');

    const snapshot = await db
        .collection('cash_accounts')
        .where('companyId', '==', companyId)
        .where('isDefault', '==', true)
        .where('isActive', '==', true)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    return snapshot.docs[0].data() as CashAccount;
}
