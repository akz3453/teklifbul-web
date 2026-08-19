/**
 * SKU Merge Service — Admin SDK
 * Teklifbul Rule v1.0
 */

import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { logAuditEvent } from './auditService.js';
import { weightedAvgCost } from './stockService.js';

const BATCH_LIMIT = 400;

function getBalanceDocId(companyId: string, sku: string, locationId: string): string {
  return `${companyId}_${sku}_${locationId}`;
}

async function commitInChunks(
  db: Firestore,
  ops: Array<(batch: WriteBatch) => void>
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function mergeSkusAdmin(params: {
  companyId: string;
  sourceSku: string;
  targetSku: string;
  userId: string;
}): Promise<{
  sourceSku: string;
  targetSku: string;
  movementsUpdated: number;
  balancesMerged: number;
}> {
  const { companyId, sourceSku, targetSku, userId } = params;
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore unavailable');

  if (!companyId || !sourceSku || !targetSku || !userId) {
    throw new Error('Eksik parametreler');
  }
  if (sourceSku === targetSku) {
    throw new Error('Kaynak ve hedef SKU aynı olamaz');
  }

  const [sourceStockSnap, targetStockSnap] = await Promise.all([
    db.collection('stocks').where('companyId', '==', companyId).where('sku', '==', sourceSku).limit(1).get(),
    db.collection('stocks').where('companyId', '==', companyId).where('sku', '==', targetSku).limit(1).get(),
  ]);

  if (sourceStockSnap.empty) throw new Error(`Kaynak SKU bulunamadı: ${sourceSku}`);
  if (targetStockSnap.empty) throw new Error(`Hedef SKU bulunamadı: ${targetSku}`);

  const sourceStock = { id: sourceStockSnap.docs[0].id, ...sourceStockSnap.docs[0].data() } as any;
  const targetStock = { id: targetStockSnap.docs[0].id, ...targetStockSnap.docs[0].data() } as any;

  const [sourceBalancesSnap, targetBalancesSnap, sourceMovementsSnap] = await Promise.all([
    db.collection('stock_balances').where('companyId', '==', companyId).where('sku', '==', sourceSku).get(),
    db.collection('stock_balances').where('companyId', '==', companyId).where('sku', '==', targetSku).get(),
    db.collection('stock_movements').where('companyId', '==', companyId).where('sku', '==', sourceSku).get(),
  ]);

  const sourceBalances = sourceBalancesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const targetBalances = targetBalancesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const ops: Array<(batch: WriteBatch) => void> = [];

  for (const sourceBalance of sourceBalances) {
    const locationId = sourceBalance.locationId;
    const sourceQty = Number(sourceBalance.quantity) || 0;
    const sourceAvgCost = Number(sourceBalance.avgCost) || 0;
    if (sourceQty <= 0) {
      ops.push((batch) => batch.delete(db.collection('stock_balances').doc(sourceBalance.id)));
      continue;
    }

    const targetBalance = targetBalances.find((b) => b.locationId === locationId);
    const balanceDocId = getBalanceDocId(companyId, targetSku, locationId);
    const balanceRef = db.collection('stock_balances').doc(balanceDocId);

    if (targetBalance) {
      const targetQty = Number(targetBalance.quantity) || 0;
      const targetAvgCost = Number(targetBalance.avgCost) || 0;
      const newQty = sourceQty + targetQty;
      const newAvgCost = weightedAvgCost(targetQty, targetAvgCost, sourceQty, sourceAvgCost);
      ops.push((batch) =>
        batch.set(
          balanceRef,
          {
            companyId,
            sku: targetSku,
            locationId,
            stockId: targetStock.id,
            quantity: newQty,
            avgCost: newAvgCost,
            lastUpdated: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      );
    } else {
      ops.push((batch) =>
        batch.set(balanceRef, {
          companyId,
          sku: targetSku,
          locationId,
          stockId: targetStock.id,
          quantity: sourceQty,
          avgCost: sourceAvgCost,
          lastUpdated: FieldValue.serverTimestamp(),
          lastMovementId: null,
        })
      );
    }

    ops.push((batch) =>
      batch.delete(db.collection('stock_balances').doc(getBalanceDocId(companyId, sourceSku, locationId)))
    );
  }

  for (const movementDoc of sourceMovementsSnap.docs) {
    ops.push((batch) =>
      batch.update(movementDoc.ref, {
        sku: targetSku,
        stockId: targetStock.id,
        stockName: targetStock.name || null,
        mergedFrom: sourceSku,
        mergedAt: FieldValue.serverTimestamp(),
      })
    );
  }

  let totalQty = 0;
  let totalCost = 0;
  for (const balance of [...sourceBalances, ...targetBalances]) {
    const qty = Number(balance.quantity) || 0;
    const avgCost = Number(balance.avgCost) || 0;
    totalQty += qty;
    totalCost += qty * avgCost;
  }
  const newAvgCost = totalQty > 0 ? totalCost / totalQty : Number(targetStock.avgCost) || 0;
  const newLastPurchasePrice = Math.max(
    Number(sourceStock.lastPurchasePrice) || 0,
    Number(targetStock.lastPurchasePrice) || 0
  );
  const newSalePrice = Math.max(Number(sourceStock.salePrice) || 0, Number(targetStock.salePrice) || 0);

  ops.push((batch) =>
    batch.update(db.collection('stocks').doc(targetStock.id), {
      avgCost: newAvgCost,
      lastPurchasePrice: newLastPurchasePrice,
      salePrice: newSalePrice,
      updatedAt: FieldValue.serverTimestamp(),
    })
  );

  ops.push((batch) =>
    batch.update(db.collection('stocks').doc(sourceStock.id), {
      merged: true,
      mergedTo: targetSku,
      mergedAt: FieldValue.serverTimestamp(),
      mergedBy: userId,
      archived: true,
    })
  );

  await commitInChunks(db, ops);

  await logAuditEvent({
    companyId,
    entityType: 'stock',
    entityId: targetStock.id,
    action: 'sku_merge',
    actorUserId: userId,
    result: 'success',
    metadata: {
      sourceSku,
      targetSku,
      movementsUpdated: sourceMovementsSnap.size,
      balancesMerged: sourceBalances.length,
    },
  });

  logger.info('SKU merge completed', {
    companyId,
    sourceSku,
    targetSku,
    movementsUpdated: sourceMovementsSnap.size,
  });

  return {
    sourceSku,
    targetSku,
    movementsUpdated: sourceMovementsSnap.size,
    balancesMerged: sourceBalances.length,
  };
}
