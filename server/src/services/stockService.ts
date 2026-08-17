/**
 * Stock Service - Satış Modülü Faz 3
 * Stok düşüşü, reversal logic, avgCost hesaplama
 * Teklifbul Rule v1.0 - Transaction güvenli, avgCost logic, negatif stok kontrolü
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
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

export type ManualStockMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';

export interface ManualStockMovementInput {
  companyId: string;
  userId: string;
  createdByName?: string;
  type: ManualStockMovementType;
  stockId: string;
  sku: string;
  stockName?: string;
  unit?: string;
  locationId: string;
  siteId?: string | null;
  toLocationId?: string | null;
  qty: number;
  unitCost?: number;
  extras?: Array<{ name: string; amount: number }>;
  ref?: { kind: string; id: string; lineId?: string };
  lotNo?: string | null;
  expiryDate?: Date | null;
  toSiteName?: string | null;
  /** Client confirm for negative stock when company allows it */
  confirmNegative?: boolean;
}

/**
 * Manuel stok hareketi — tek transaction (movement + balances + opsiyonel stock avgCost)
 * Teklifbul Rule v1.0
 */
export async function recordManualStockMovement(input: ManualStockMovementInput): Promise<{
  movementId: string;
  quantity: number;
  avgCost: number;
  toQuantity?: number;
}> {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore unavailable');

  const {
    companyId,
    userId,
    createdByName,
    type,
    stockId,
    sku,
    stockName,
    unit = 'ADT',
    locationId,
    siteId = null,
    toLocationId = null,
    qty,
    unitCost = 0,
    extras = [],
    ref = { kind: 'MANUAL', id: '' },
    lotNo = null,
    expiryDate = null,
    toSiteName = null,
    confirmNegative = false,
  } = input;

  if (!companyId || !userId || !stockId || !sku || !locationId) {
    throw new Error('Zorunlu alanlar eksik');
  }
  if (!['IN', 'OUT', 'TRANSFER', 'ADJUST'].includes(type)) {
    throw new Error('Geçersiz hareket tipi');
  }
  if (type !== 'ADJUST' && (!(qty > 0) || Number.isNaN(qty))) {
    throw new Error('Miktar pozitif olmalıdır');
  }
  if (type === 'ADJUST' && (qty < 0 || Number.isNaN(qty))) {
    throw new Error('Düzeltme miktarı 0 veya pozitif olmalıdır');
  }
  if (type === 'TRANSFER' && !toLocationId) {
    throw new Error('Transfer için hedef lokasyon zorunlu');
  }

  const companyDoc = await db.collection('companies').doc(companyId).get();
  const companyData = companyDoc.exists ? companyDoc.data() || {} : {};
  const allowNegativeStock = companyData.allowNegativeStock === true;

  const sourceBalanceId = getBalanceDocId(companyId, sku, locationId);
  const sourceBalanceRef = db.collection('stock_balances').doc(sourceBalanceId);
  const movementRef = db.collection('stock_movements').doc();
  const stockRef = db.collection('stocks').doc(stockId);

  const result = await db.runTransaction(async (tx) => {
    const sourceSnap = await tx.get(sourceBalanceRef);
    const source = sourceSnap.exists ? sourceSnap.data() || {} : {};
    const oldQty = Number(source.quantity) || 0;
    const oldAvg = Number(source.avgCost) || 0;

    let newQty = oldQty;
    let newAvg = oldAvg;
    let effectiveUnitCost = unitCost;
    let toQty: number | undefined;

    if (type === 'IN') {
      newQty = oldQty + qty;
      newAvg = weightedAvgCost(oldQty, oldAvg, qty, unitCost);
      effectiveUnitCost = unitCost;
    } else if (type === 'OUT' || type === 'TRANSFER') {
      if (oldQty <= 0) {
        throw new Error(`Bu lokasyonda stok yok (mevcut: ${oldQty}).`);
      }
      if (!allowNegativeStock && oldQty < qty) {
        throw new Error(`Yetersiz stok. Mevcut: ${oldQty}, istenen: ${qty}`);
      }
      if (allowNegativeStock && oldQty < qty && !confirmNegative) {
        const err: any = new Error('NEGATIVE_STOCK_CONFIRM_REQUIRED');
        err.code = 'NEGATIVE_STOCK_CONFIRM_REQUIRED';
        err.currentQty = oldQty;
        throw err;
      }
      newQty = allowNegativeStock ? oldQty - qty : Math.max(0, oldQty - qty);
      newAvg = oldAvg;
      effectiveUnitCost = oldAvg;
    } else if (type === 'ADJUST') {
      newQty = qty;
      newAvg = oldAvg;
      effectiveUnitCost = 0;
    }

    let toBalanceRef: DocumentReference | null = null;
    let toOldQty = 0;
    let toOldAvg = 0;
    if (type === 'TRANSFER' && toLocationId) {
      toBalanceRef = db.collection('stock_balances').doc(getBalanceDocId(companyId, sku, toLocationId));
      const toSnap = await tx.get(toBalanceRef);
      const toData = toSnap.exists ? toSnap.data() || {} : {};
      toOldQty = Number(toData.quantity) || 0;
      toOldAvg = Number(toData.avgCost) || 0;
      toQty = toOldQty + qty;
      // Transfer: hedef avgCost kaynak unitCost (eski avg) ile ağırlıklı
      const toNewAvg = weightedAvgCost(toOldQty, toOldAvg, qty, effectiveUnitCost);

      tx.set(
        toBalanceRef,
        {
          companyId,
          sku,
          locationId: toLocationId,
          stockId,
          quantity: toQty,
          avgCost: toNewAvg,
          lastUpdated: FieldValue.serverTimestamp(),
          lastMovementId: movementRef.id,
        },
        { merge: true }
      );
    }

    const movementData: Record<string, unknown> = {
      companyId,
      stockId,
      sku,
      locationId,
      siteId: siteId || null,
      type,
      qty,
      unit,
      unitCost: effectiveUnitCost,
      totalCost: effectiveUnitCost * (type === 'ADJUST' ? 0 : qty),
      extras: extras || [],
      ref: {
        kind: ref?.kind || 'MANUAL',
        id: ref?.id || '',
        ...(ref?.lineId ? { lineId: String(ref.lineId).slice(0, 120) } : {}),
      },
      stockName: stockName || null,
      lotNo: lotNo || null,
      expiryDate: expiryDate || null,
      toSiteName: toSiteName || null,
      createdBy: userId,
      createdByName: createdByName || null,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (type === 'TRANSFER' && toLocationId) {
      movementData.toLocationId = toLocationId;
      if (!ref?.id) {
        movementData.ref = { kind: 'MANUAL', id: toLocationId };
      }
    }

    tx.set(movementRef, movementData);

    tx.set(
      sourceBalanceRef,
      {
        companyId,
        sku,
        locationId,
        stockId,
        quantity: newQty,
        avgCost: newAvg,
        lastUpdated: FieldValue.serverTimestamp(),
        lastMovementId: movementRef.id,
      },
      { merge: true }
    );

    if (type === 'IN') {
      tx.set(
        stockRef,
        {
          avgCost: newAvg,
          lastPurchasePrice: unitCost,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      movementId: movementRef.id,
      quantity: newQty,
      avgCost: newAvg,
      toQuantity: toQty,
    };
  });

  await logAuditEvent({
    companyId,
    entityType: 'stock_movement',
    entityId: result.movementId,
    action: `manual_${type.toLowerCase()}`,
    actorUserId: userId,
    result: 'success',
    metadata: { sku, qty, locationId, toLocationId: toLocationId || null },
  });

  logger.info('Manual stock movement recorded', {
    movementId: result.movementId,
    type,
    sku,
    qty,
    companyId,
  });

  return result;
}

