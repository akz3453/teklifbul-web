/**
 * Stock Service - Satış Modülü Faz 3
 * Stok düşüşü, reversal logic, avgCost hesaplama
 * Teklifbul Rule v1.0 - Transaction güvenli, avgCost logic, negatif stok kontrolü
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logAuditEvent } from './auditService.js';

/**
 * Ağırlıklı ortalama maliyet hesaplama
 * Teklifbul Rule v1.0 - Mevcut sistemle uyumlu
 */
export function weightedAvgCost(oldQty: number, oldAvg: number, inQty: number, inUnitCost: number): number {
  if (!oldQty || oldQty === 0) return inUnitCost;
  return ((oldQty * oldAvg) + (inQty * inUnitCost)) / (oldQty + inQty);
}

/**
 * Stock balance document ID oluştur
 * Format: {companyId}_{sku}_{locationId}
 */
function getBalanceDocId(companyId: string, sku: string, locationId: string): string {
  return `${companyId}_${sku}_${locationId}`;
}

/**
 * Satış onayında stok düşüşü (OUT movement) oluştur
 * @param saleItems - Satış kalemleri
 * @param companyId - Şirket ID
 * @param saleId - Satış ID
 * @param userId - Kullanıcı ID
 * @param allowNegativeStock - Negatif stok izni
 * @returns Movement ID'leri ve yetersiz stok bilgileri
 */
export async function createStockMovements(
  saleItems: Array<{
    sku: string;
    stockId: string;
    name: string;
    quantity: number;
    locationId: string;
    locationName?: string;
    unit: string;
  }>,
  companyId: string,
  saleId: string,
  userId: string,
  allowNegativeStock: boolean = false
): Promise<{
  movementIds: string[];
  insufficientStockItems: Array<{
    sku: string;
    requested: number;
    available: number;
    locationId: string;
  }>;
}> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const movementIds: string[] = [];
  const insufficientStockItems: Array<{
    sku: string;
    requested: number;
    available: number;
    locationId: string;
  }> = [];

  // Şirket ayarlarını kontrol et (negatif stok izni)
  const companyDoc = await db.collection('companies').doc(companyId).get();
  const companyData = companyDoc.exists ? companyDoc.data() : {};
  const allowNegative = allowNegativeStock || companyData?.allowNegativeStock === true;

  // Her kalem için stok düşüşü oluştur
  for (const item of saleItems) {
    const balanceDocId = getBalanceDocId(companyId, item.sku, item.locationId);
    const balanceRef = db.collection('stock_balances').doc(balanceDocId);
    const balanceDoc = await balanceRef.get();
    const balance = balanceDoc.exists ? balanceDoc.data() : null;

    const currentQty = balance?.quantity || 0;
    const avgCost = balance?.avgCost || 0;

    // Stok kontrolü
    if (!allowNegative && currentQty < item.quantity) {
      insufficientStockItems.push({
        sku: item.sku,
        requested: item.quantity,
        available: currentQty,
        locationId: item.locationId
      });
      continue; // Bu kalem için movement oluşturma
    }

    // Yeni miktar hesapla
    const newQty = allowNegative ? currentQty - item.quantity : Math.max(0, currentQty - item.quantity);

    // OUT movement oluştur
    const movementRef = await db.collection('stock_movements').add({
      companyId: companyId,
      stockId: item.stockId,
      sku: item.sku,
      locationId: item.locationId,
      type: 'OUT',
      qty: item.quantity,
      unit: item.unit,
      unitCost: avgCost, // Satış anındaki ortalama maliyet
      totalCost: avgCost * item.quantity,
      ref: {
        kind: 'SALE',
        id: saleId
      },
      stockName: item.name,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    movementIds.push(movementRef.id);

    // Balance güncelle (OUT: miktar düşer, avgCost değişmez)
    const balanceUpdate: any = {
      companyId: companyId,
      sku: item.sku,
      locationId: item.locationId,
      stockId: item.stockId,
      quantity: newQty,
      avgCost: avgCost, // OUT'ta avgCost değişmez
      lastUpdated: FieldValue.serverTimestamp(),
      lastMovementId: movementRef.id
    };

    if (balanceDoc.exists) {
      await balanceRef.update(balanceUpdate);
    } else {
      await balanceRef.set(balanceUpdate);
    }

    logger.info('Stock movement created (OUT)', {
      movementId: movementRef.id,
      sku: item.sku,
      locationId: item.locationId,
      qty: item.quantity,
      avgCost: avgCost
    });

    // Audit log
    await logAuditEvent({
      companyId: companyId,
      entityType: 'stock_movement',
      entityId: movementRef.id,
      action: 'stock_out',
      actorUserId: userId,
      result: 'success',
      metadata: {
        sku: item.sku,
        qty: item.quantity,
        saleId: saleId
      }
    });
  }

  return { movementIds, insufficientStockItems };
}

/**
 * Satış iptalinde stok geri alma (reversal movement) oluştur
 * @param saleItems - Satış kalemleri (orijinal miktarlar)
 * @param movementIds - Orijinal movement ID'leri (reversal için referans)
 * @param companyId - Şirket ID
 * @param saleId - Satış ID
 * @param userId - Kullanıcı ID
 * @returns Reversal movement ID'leri
 */
export async function createReversalMovements(
  saleItems: Array<{
    sku: string;
    stockId: string;
    name: string;
    quantity: number;
    locationId: string;
    locationName?: string;
    unit: string;
  }>,
  movementIds: string[],
  companyId: string,
  saleId: string,
  userId: string
): Promise<string[]> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const reversalMovementIds: string[] = [];

  // Orijinal movement'leri al (unitCost bilgisi için)
  const originalMovements = await Promise.all(
    movementIds.map(async (movementId) => {
      const movementDoc = await db.collection('stock_movements').doc(movementId).get();
      return movementDoc.exists ? { id: movementDoc.id, ...movementDoc.data() } : null;
    })
  );

  // Her kalem için reversal movement oluştur
  for (let i = 0; i < saleItems.length; i++) {
    const item = saleItems[i];
    const originalMovement = originalMovements[i];

    if (!originalMovement) {
      logger.warn('Original movement not found for reversal', { movementId: movementIds[i] });
      continue;
    }

    const balanceDocId = getBalanceDocId(companyId, item.sku, item.locationId);
    const balanceRef = db.collection('stock_balances').doc(balanceDocId);
    const balanceDoc = await balanceRef.get();
    const balance = balanceDoc.exists ? balanceDoc.data() : null;

    const currentQty = balance?.quantity || 0;
    const oldAvg = balance?.avgCost || 0;

    // Reversal: Stok geri eklenir (IN movement)
    // Reversal için unitCost = orijinal movement'in unitCost'i (satış anındaki maliyet)
    const reversalUnitCost = (originalMovement as any).unitCost || oldAvg;

    // Yeni miktar ve avgCost hesapla (IN logic)
    const newQty = currentQty + item.quantity;
    const newAvgCost = weightedAvgCost(currentQty, oldAvg, item.quantity, reversalUnitCost);

    // Reversal movement oluştur (IN type)
    const reversalMovementRef = await db.collection('stock_movements').add({
      companyId: companyId,
      stockId: item.stockId,
      sku: item.sku,
      locationId: item.locationId,
      type: 'IN', // Reversal = IN (stok geri eklenir)
      qty: item.quantity,
      unit: item.unit,
      unitCost: reversalUnitCost,
      totalCost: reversalUnitCost * item.quantity,
      ref: {
        kind: 'SALE_REVERSAL',
        id: saleId,
        originalMovementId: originalMovement.id
      },
      stockName: item.name,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    reversalMovementIds.push(reversalMovementRef.id);

    // Balance güncelle (IN: miktar artar, avgCost ağırlıklı ortalama ile güncellenir)
    const balanceUpdate: any = {
      companyId: companyId,
      sku: item.sku,
      locationId: item.locationId,
      stockId: item.stockId,
      quantity: newQty,
      avgCost: newAvgCost, // IN'ta avgCost güncellenir
      lastUpdated: FieldValue.serverTimestamp(),
      lastMovementId: reversalMovementRef.id
    };

    if (balanceDoc.exists) {
      await balanceRef.update(balanceUpdate);
    } else {
      await balanceRef.set(balanceUpdate);
    }

    logger.info('Reversal movement created (IN)', {
      reversalMovementId: reversalMovementRef.id,
      sku: item.sku,
      locationId: item.locationId,
      qty: item.quantity,
      newAvgCost: newAvgCost
    });

    // Audit log
    await logAuditEvent({
      companyId: companyId,
      entityType: 'stock_movement',
      entityId: reversalMovementRef.id,
      action: 'stock_reversal',
      actorUserId: userId,
      result: 'success',
      metadata: {
        sku: item.sku,
        qty: item.quantity,
        saleId: saleId
      }
    });
  }

  return reversalMovementIds;
}

/**
 * Alım faturası ile stok girişi (PURCHASE movement) oluştur
 * @param purchaseItems - Alım kalemleri
 * @param companyId - Şirket ID
 * @param invoiceId - Fatura ID
 * @param userId - Kullanıcı ID
 * @returns Movement ID'leri
 */
export async function createPurchaseMovements(
  purchaseItems: Array<{
    sku: string;
    stockId: string;
    name: string;
    quantity: number;
    locationId: string;
    unit: string;
    unitPrice: number; // KDV hariç birim fiyat
  }>,
  companyId: string,
  invoiceId: string,
  userId: string
): Promise<string[]> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const movementIds: string[] = [];

  for (const item of purchaseItems) {
    const balanceDocId = getBalanceDocId(companyId, item.sku, item.locationId);
    const balanceRef = db.collection('stock_balances').doc(balanceDocId);
    const balanceDoc = await balanceRef.get();
    const balance = balanceDoc.exists ? balanceDoc.data() : null;

    const currentQty = balance?.quantity || 0;
    const oldAvg = balance?.avgCost || 0;

    // Yeni miktar ve avgCost hesapla (IN logic)
    // Alım fiyatı = unitPrice
    const newQty = currentQty + item.quantity;
    const newAvgCost = weightedAvgCost(currentQty, oldAvg, item.quantity, item.unitPrice);

    // Purchase movement oluştur (IN type, subType=PURCHASE)
    const movementRef = await db.collection('stock_movements').add({
      companyId: companyId,
      stockId: item.stockId,
      sku: item.sku,
      locationId: item.locationId,
      type: 'IN', // Stok artışı
      subType: 'PURCHASE', // Alt tip
      qty: item.quantity,
      unit: item.unit,
      unitCost: item.unitPrice,
      totalCost: item.unitPrice * item.quantity,
      ref: {
        kind: 'INVOICE',
        id: invoiceId
      },
      stockName: item.name,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    movementIds.push(movementRef.id);

    // Balance güncelle
    const balanceUpdate: any = {
      companyId: companyId,
      sku: item.sku,
      locationId: item.locationId,
      stockId: item.stockId,
      quantity: newQty,
      avgCost: newAvgCost,
      lastUpdated: FieldValue.serverTimestamp(),
      lastMovementId: movementRef.id
    };

    if (balanceDoc.exists) {
      await balanceRef.update(balanceUpdate);
    } else {
      await balanceRef.set(balanceUpdate);
    }

    logger.info('Purchase movement created (IN)', {
      movementId: movementRef.id,
      sku: item.sku,
      locationId: item.locationId,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      newAvgCost: newAvgCost
    });

    // Audit log
    await logAuditEvent({
      companyId: companyId,
      entityType: 'stock_movement',
      entityId: movementRef.id,
      action: 'stock_purchase',
      actorUserId: userId,
      result: 'success',
      metadata: {
        sku: item.sku,
        qty: item.quantity,
        invoiceId: invoiceId
      }
    });
  }

  return movementIds;
}
