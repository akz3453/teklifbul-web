
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logAuditEvent } from './auditService.js';

export interface TransactionInput {
    customerId: string;
    companyId: string;
    userId: string;
    type: 'debit' | 'credit'; // debit=borç (fatura), credit=alacak (ödeme)
    transactionType: 'invoice' | 'payment' | 'opening_balance' | 'adjustment';
    amount: number;
    currency: string;
    description?: string;
    documentId?: string; // invoiceId or paymentId
    documentNumber?: string;
    date: Date;
}

/**
 * Cari hesap hareketi ekle ve müşteri bakiyesini güncelle
 * Teklifbul Rule v1.0 - Atomic transaction
 */
export async function addTransaction(input: TransactionInput): Promise<string> {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }

    const { customerId, companyId, type, amount } = input;

    // Amount validasyonu
    if (amount < 0) {
        throw new Error('Tutar negatif olamaz');
    }

    const customerRef = db.collection('customers').doc(customerId);
    const transactionRef = db.collection('customer_transactions').doc();
    const transactionId = transactionRef.id;

    try {
        await db.runTransaction(async (transaction) => {
            // Müşteriyi oku
            const customerDoc = await transaction.get(customerRef);
            if (!customerDoc.exists) {
                throw new Error('Müşteri bulunamadı');
            }

            const customer = customerDoc.data();
            if (customer?.companyId !== companyId) {
                throw new Error('Müşteri companyId uyuşmazlığı');
            }

            // Hesaplamalar
            // Debit (Borç) -> balance artar
            // Credit (Alacak) -> balance azalır
            const balanceChange = type === 'debit' ? amount : -amount;

            const newTotalDebt = (customer?.totalDebt || 0) + (type === 'debit' ? amount : 0);
            const newTotalPaid = (customer?.totalPaid || 0) + (type === 'credit' ? amount : 0);
            const newBalance = (customer?.balance || 0) + balanceChange;

            // Transaction kaydı oluştur
            transaction.set(transactionRef, {
                id: transactionId,
                customerId,
                companyId,
                type,
                transactionType: input.transactionType,
                amount,
                currency: input.currency || 'TRY',
                description: input.description || null,
                documentId: input.documentId || null,
                documentNumber: input.documentNumber || null,
                date: Timestamp.fromDate(input.date),
                createdBy: input.userId,
                createdAt: FieldValue.serverTimestamp()
            });

            // Müşteri bakiyesini güncelle
            transaction.update(customerRef, {
                balance: newBalance,
                totalDebt: newTotalDebt,
                totalPaid: newTotalPaid,
                lastTransactionDate: Timestamp.fromDate(input.date),
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: input.userId
            });
        });

        // Audit log (transaction dışında)
        await logAuditEvent({
            companyId,
            entityType: 'customer_transaction',
            entityId: transactionId,
            action: 'create',
            actorUserId: input.userId,
            result: 'success',
            metadata: {
                customerId,
                type,
                amount,
                transactionType: input.transactionType
            }
        });

        logger.info('Cari hareket eklendi', {
            transactionId,
            customerId,
            type,
            amount
        });

        return transactionId;

    } catch (error) {
        logger.error('Cari hareket ekleme hatası', error);
        throw error;
    }
}
