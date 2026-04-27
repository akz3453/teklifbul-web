/**
 * Number Generator Service - Satış Modülü Faz 2
 * Satış, fatura ve irsaliye numarası üretimi
 * Teklifbul Rule v1.0 - Transaction güvenli, Base36 encoding
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Satış numarası üretimi
 * Format: SALE-YYYYMMDD-XXXXX (Base36)
 * Örnek: SALE-20250120-00001
 */
export async function generateSaleNumber(companyId: string): Promise<string> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.collection('counters').doc(`saleCode_${companyId}_${dateStr}`);

  return await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const currentCount = counterDoc.exists ? (counterDoc.data()?.count || 0) : 0;
    const newCount = currentCount + 1;

    const base36 = newCount.toString(36).toUpperCase();
    const padded = base36.padStart(5, '0');

    transaction.set(
      counterRef,
      {
        count: newCount,
        lastUpdated: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return `SALE-${dateStr}-${padded}`;
  });
}

/**
 * Fatura numarası üretimi
 * Format: INV-YYYYMMDD-XXXXX (Base36)
 * Örnek: INV-20250120-00001
 */
export async function generateInvoiceNumber(companyId: string): Promise<string> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.collection('counters').doc(`invoiceCode_${companyId}_${dateStr}`);

  return await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const currentCount = counterDoc.exists ? (counterDoc.data()?.count || 0) : 0;
    const newCount = currentCount + 1;

    const base36 = newCount.toString(36).toUpperCase();
    const padded = base36.padStart(5, '0');

    transaction.set(
      counterRef,
      {
        count: newCount,
        lastUpdated: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return `INV-${dateStr}-${padded}`;
  });
}

/**
 * İrsaliye numarası üretimi
 * Format: IRS-YYYYMMDD-XXXXX (Base36)
 * Örnek: IRS-20250120-00001
 */
export async function generateDeliveryNoteNumber(companyId: string): Promise<string> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterRef = db.collection('counters').doc(`deliveryNoteCode_${companyId}_${dateStr}`);

  return await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const currentCount = counterDoc.exists ? (counterDoc.data()?.count || 0) : 0;
    const newCount = currentCount + 1;

    const base36 = newCount.toString(36).toUpperCase();
    const padded = base36.padStart(5, '0');

    transaction.set(
      counterRef,
      {
        count: newCount,
        lastUpdated: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return `IRS-${dateStr}-${padded}`;
  });
}
