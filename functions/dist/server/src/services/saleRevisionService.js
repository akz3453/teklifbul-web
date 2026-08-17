/**
 * Sale Revision Service
 * Teklifbul Rule v1.0 - Onay sonrası satış düzenlemesi için revision tracking
 */
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
/**
 * Check if any critical fields are being changed
 * Teklifbul Rule v1.0 - Critical field detection for e-doc locked sales
 */
export function hasCriticalFieldChanges(changedFields, before, after) {
    // Kritik alan prefix'leri
    const criticalPrefixes = [
        'items.',
        'totals.',
        'customerId',
        'customer.taxNumber',
        'buyer.taxNumber',
        'invoiceAddress.',
        'currency',
        'exchangeRate',
        'saleDate',
        'issueDate',
        'shipDate',
        'dueDate' // Fatura vade tarihi de kritik
    ];
    // Changed fields içinde kritik alan var mı?
    for (const field of changedFields) {
        // Exact match
        if (criticalPrefixes.includes(field)) {
            return true;
        }
        // Prefix match
        for (const prefix of criticalPrefixes) {
            if (field.startsWith(prefix)) {
                return true;
            }
        }
    }
    // Items length değişikliği kontrolü
    const beforeItemsLength = Array.isArray(before.items) ? before.items.length : 0;
    const afterItemsLength = Array.isArray(after.items) ? after.items.length : 0;
    if (beforeItemsLength !== afterItemsLength) {
        return true;
    }
    // Customer ID değişikliği
    if (before.customerId !== undefined && after.customerId !== undefined && before.customerId !== after.customerId) {
        return true;
    }
    return false;
}
/**
 * Calculate diff between two objects
 * Returns changed fields (dot notation) and before/after values
 * Teklifbul Rule v1.0 - Export edilebilir hale getirildi (sales.ts'de kullanım için)
 */
export function calculateDiff(before, after) {
    const changedFields = [];
    const beforeDiff = {};
    const afterDiff = {};
    // Helper to flatten nested objects
    const flatten = (obj, prefix = '') => {
        const result = {};
        for (const key in obj) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Timestamp) && !(value.toDate)) {
                Object.assign(result, flatten(value, newKey));
            }
            else {
                result[newKey] = value;
            }
        }
        return result;
    };
    const beforeFlat = flatten(before);
    const afterFlat = flatten(after);
    // Find changed fields
    const allKeys = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]);
    for (const key of allKeys) {
        const beforeVal = beforeFlat[key];
        const afterVal = afterFlat[key];
        // Deep comparison (handle arrays and objects)
        if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
            changedFields.push(key);
            beforeDiff[key] = beforeVal;
            afterDiff[key] = afterVal;
        }
    }
    return {
        changedFields,
        before: beforeDiff,
        after: afterDiff
    };
}
/**
 * Create sale revision
 * Teklifbul Rule v1.0 - Revision tracking for approved sales
 */
export async function createSaleRevision({ saleId, companyId, userId, userEmail, userDisplayName, reason, statusAtEdit, beforeSnapshot, afterSnapshot, source = 'api', requestMeta }) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const saleRef = db.collection('sales').doc(saleId);
    return await db.runTransaction(async (transaction) => {
        // Get current sale version
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists) {
            throw new Error('Satış bulunamadı');
        }
        const currentSale = saleDoc.data();
        const currentVersion = currentSale.version || 0;
        const newVersion = currentVersion + 1;
        // Calculate diff
        const diff = calculateDiff(beforeSnapshot, afterSnapshot);
        // Create revision doc
        const revisionRef = db.collection('sale_revisions').doc();
        const revisionId = revisionRef.id;
        const revision = {
            id: revisionId,
            companyId,
            saleId,
            saleVersion: newVersion,
            editedAt: FieldValue.serverTimestamp(),
            editedBy: {
                userId,
                email: userEmail || null,
                displayName: userDisplayName || null
            },
            reason,
            statusAtEdit,
            diff,
            source,
            requestMeta: requestMeta || undefined
        };
        transaction.set(revisionRef, revision);
        // Update sale version
        transaction.update(saleRef, {
            version: newVersion,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        logger.info('Sale revision oluşturuldu', {
            saleId,
            revisionId,
            saleVersion: newVersion,
            changedFields: diff.changedFields.length
        });
        return { revisionId, saleVersion: newVersion };
    });
}
/**
 * Get sale revisions
 */
export async function getSaleRevisions(saleId, companyId) {
    const db = await getAdminDb();
    if (!db) {
        throw new Error('Firestore unavailable');
    }
    const revisionsSnapshot = await db
        .collection('sale_revisions')
        .where('saleId', '==', saleId)
        .where('companyId', '==', companyId)
        .orderBy('saleVersion', 'desc')
        .get();
    return revisionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
    }));
}
