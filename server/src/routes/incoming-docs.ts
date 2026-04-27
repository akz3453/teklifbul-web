/**
 * Incoming Docs Routes - Faturalama Modulu
 * Gelen e-belgelerin stoga islenmesi (server-side, guvenli).
 * Teklifbul Rule v1.0 - Transaction guvenli, validasyon, audit log, idempotency.
 */

import express from 'express';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import { weightedAvgCost } from './../services/stockService.js';
import { logAuditEvent } from '../services/auditService.js';
import { requirePermission } from '../../middleware/requirePermission.js';

const router = express.Router();

// Firestore transaction kalem limiti: her kalem ~4 yazma + ~3 okuma uretir.
// 500 islem limitine takilmamak icin guvenli bir tavan koyuyoruz.
const MAX_ITEMS_PER_TX = 80;

function getBalanceDocId(companyId: string, sku: string, locationId: string): string {
  return `${companyId}_${sku}_${locationId}`;
}

/**
 * POST /api/incoming-docs/:id/process-to-stock
 * Gelen e-belgeyi (tum eslenmis kalemleri) stoga isle.
 * Body: { locationId: string, companyId: string }
 */
router.post('/:id/process-to-stock', requirePermission('stock.movements.in'), async (req: any, res) => {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const incomingId = req.params.id;
  const { locationId, companyId } = req.body || {};

  if (!incomingId || !companyId || !locationId) {
    return res.status(400).json({ ok: false, error: 'id, companyId ve locationId zorunludur' });
  }

  const db = await getAdminDb();
  if (!db) {
    return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
  }

  try {
    // Sirket sahipligi (ek dogrulama; requirePermission da companyId/aktif sirket esleSir).
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData || (userData.companyId !== companyId && userData.activeCompanyId !== companyId)) {
      return res.status(403).json({ ok: false, error: 'Yetkisiz erisim' });
    }

    const incomingRef = db.collection('incoming_edocs').doc(incomingId);

    logger.group('Process Incoming to Stock');
    logger.info('Islem baslatildi', { incomingId, companyId, locationId });

    // Teklifbul Rule v1.0 - Transaction: idempotency + atomik stok islemleri
    const result = await db.runTransaction(async (tx) => {
      const incomingSnap = await tx.get(incomingRef);
      if (!incomingSnap.exists) {
        const e: any = new Error('Gelen belge bulunamadi');
        e.statusCode = 404;
        throw e;
      }
      const incoming = incomingSnap.data() as any;

      if (incoming.companyId !== companyId) {
        const e: any = new Error('Belge bu sirkete ait degil');
        e.statusCode = 403;
        throw e;
      }
      if (incoming.status === 'processed') {
        const e: any = new Error('Belge zaten stoga islenmis');
        e.statusCode = 409;
        throw e;
      }

      const items: any[] = Array.isArray(incoming.items) ? incoming.items : [];
      if (items.length === 0) {
        const e: any = new Error('Belgede kalem bulunamadi');
        e.statusCode = 400;
        throw e;
      }
      if (items.length > MAX_ITEMS_PER_TX) {
        const e: any = new Error(`Bir transaction icin azami ${MAX_ITEMS_PER_TX} kalem isleyebiliriz. Belgeyi bolun.`);
        e.statusCode = 400;
        throw e;
      }

      const unmapped = items.filter((it) => !it.mappedInternalStockId);
      if (unmapped.length > 0) {
        const e: any = new Error(`${unmapped.length} kalem hala eslenmedi: ${unmapped.map((u: any) => u.name).join(', ')}`);
        e.statusCode = 400;
        throw e;
      }

      // 1) Tum stok dokumanlarini oku
      const stockRefs = items.map((it) => db.collection('stocks').doc(it.mappedInternalStockId));
      const stockSnaps = await Promise.all(stockRefs.map((ref) => tx.get(ref)));
      for (let i = 0; i < stockSnaps.length; i++) {
        if (!stockSnaps[i].exists) {
          const e: any = new Error(`Eslenen stok bulunamadi: ${items[i].mappedInternalStockId}`);
          e.statusCode = 400;
          throw e;
        }
      }

      // 2) Balance dokumanlarini oku (sku stok'tan turetilir)
      const balanceRefs: FirebaseFirestore.DocumentReference[] = [];
      const skus: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const stockData = stockSnaps[i].data() as any;
        const sku = stockData.sku || stockData.sku_norm || items[i].mappedInternalStockId;
        skus.push(sku);
        balanceRefs.push(db.collection('stock_balances').doc(getBalanceDocId(companyId, sku, locationId)));
      }
      const balanceSnaps = await Promise.all(balanceRefs.map((ref) => tx.get(ref)));

      // 3) Yazma fazi: her kalem icin movement (yeni doc), balance (set/update), stock (update)
      const movementIds: string[] = [];
      const summaries: Array<{ name: string; qty: number; sku: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const stockData = stockSnaps[i].data() as any;
        const sku = skus[i];
        const unit = stockData.unit || item.unit || 'AD';

        const multiplier = Number(item.conversionMultiplier) || 1;
        const finalQty = (Number(item.quantity) || 0) * multiplier;
        const finalUnitCost = multiplier ? (Number(item.unitPrice) || 0) / multiplier : 0;

        if (finalQty <= 0) {
          const e: any = new Error(`Gecersiz miktar: ${item.name}`);
          e.statusCode = 400;
          throw e;
        }

        const balanceSnap = balanceSnaps[i];
        const balance = balanceSnap.exists ? (balanceSnap.data() as any) : null;
        const currentQty = Number(balance?.quantity) || 0;
        const oldAvg = Number(balance?.avgCost) || 0;
        const newQty = currentQty + finalQty;
        const newAvgCost = weightedAvgCost(currentQty, oldAvg, finalQty, finalUnitCost);

        // Movement: yeni doc id'sini onceden al, sonra tx.set ile yaz.
        const movementRef = db.collection('stock_movements').doc();
        tx.set(movementRef, {
          companyId,
          stockId: item.mappedInternalStockId,
          sku,
          locationId,
          type: 'IN',
          subType: 'PURCHASE',
          qty: finalQty,
          unit,
          unitCost: finalUnitCost,
          totalCost: Number(item.totalPrice) || finalQty * finalUnitCost,
          ref: {
            kind: 'INCOMING_EDOC',
            id: incomingId,
            documentNumber: incoming.documentNumber || incoming.uuid || null
          },
          stockName: stockData.name || item.name || '',
          description: `${incoming.senderTitle || 'Tedarikci'} - Gelen Belge`,
          createdBy: userId,
          createdAt: FieldValue.serverTimestamp()
        });
        movementIds.push(movementRef.id);

        const balancePayload: any = {
          companyId,
          sku,
          locationId,
          stockId: item.mappedInternalStockId,
          quantity: newQty,
          avgCost: newAvgCost,
          lastUpdated: FieldValue.serverTimestamp(),
          lastMovementId: movementRef.id
        };
        if (balanceSnap.exists) {
          tx.update(balanceRefs[i], balancePayload);
        } else {
          tx.set(balanceRefs[i], balancePayload);
        }

        tx.update(stockRefs[i], {
          quantity: FieldValue.increment(finalQty),
          lastPurchasePrice: finalUnitCost,
          avgCost: newAvgCost,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: userId
        });

        summaries.push({ name: item.name, qty: finalQty, sku });
      }

      // 4) incoming_edocs status guncelle (ayni transaction icinde idempotency)
      tx.update(incomingRef, {
        status: 'processed',
        processedAt: FieldValue.serverTimestamp(),
        processedBy: userId,
        processedLocationId: locationId,
        processedMovementIds: movementIds
      });

      return { movementIds, summaries };
    });

    // Audit log transaction disinda (idempotent ihtiyaci yok)
    await logAuditEvent({
      companyId,
      entityType: 'incoming_edoc',
      entityId: incomingId,
      action: 'process_to_stock',
      actorUserId: userId,
      result: 'success',
      metadata: {
        locationId,
        itemCount: result.summaries.length,
        movementIds: result.movementIds
      }
    });

    logger.info('Stoga isleme tamamlandi', { incomingId, count: result.summaries.length });
    logger.end();

    return res.status(200).json({
      ok: true,
      processed: result.summaries.length,
      movementIds: result.movementIds,
      summaries: result.summaries
    });
  } catch (err: any) {
    logger.error('processToStock hatasi', err);
    logger.end();
    const status = err?.statusCode || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || 'Islem basarisiz'
    });
  }
});

export default router;
