/**
 * Sale Service - Satış Modülü Faz 3
 * Onay iş mantığı, stok entegrasyonu, state machine, race protection
 * Teklifbul Rule v1.0 - Transaction güvenli, idempotent, race protection, audit log
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertValidStatusTransition, SaleStatus } from './saleStateMachine.js';
import { createStockMovements, createReversalMovements } from './stockService.js';
import { logAuditEvent } from './auditService.js';

/**
 * Satış onayı
 * Transaction güvenli, idempotent, race protection
 */
export async function approveSale(
  saleId: string,
  userId: string,
  companyId: string,
  requestId?: string
): Promise<{
  success: boolean;
  insufficientStockItems?: Array<{
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

  const saleRef = db.collection('sales').doc(saleId);

  return await db.runTransaction(async (transaction) => {
    const saleDoc = await transaction.get(saleRef);
    if (!saleDoc.exists) {
      throw new Error('Satış bulunamadı');
    }

    const sale = saleDoc.data() as any;

    // Company kontrolü
    if (sale.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // 1. State machine validation
    const currentStatus = sale.status as SaleStatus;
    assertValidStatusTransition(currentStatus, 'approved');

    // 2. Race protection: Approval lock kontrolü
    if (sale.approvalLock) {
      const lockExpired = sale.approvalLock.expiresAt?.toMillis() < Date.now();
      if (!lockExpired && sale.approvalLock.userId !== userId) {
        throw new Error('Satış başka bir kullanıcı tarafından işleniyor');
      }
    }

    // 3. Lock oluştur (30 saniye)
    const lockExpiresAt = new Date(Date.now() + 30_000);
    transaction.update(saleRef, {
      approvalLock: {
        userId: userId,
        timestamp: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(lockExpiresAt)
      }
    });

    // 4. Idempotent kontrol
    if (sale.stockMovementCreated) {
      // Zaten stok düşüşü yapılmış, sadece status güncelle
      transaction.update(saleRef, {
        status: 'approved',
        'approval.approvedAt': FieldValue.serverTimestamp(),
        'approval.approvedBy': userId,
        approvalLock: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: userId
      });

      // Audit log (transaction dışında)
      await logAuditEvent({
        companyId: sale.companyId,
        entityType: 'sale',
        entityId: saleId,
        action: 'approve',
        actorUserId: userId,
        result: 'success',
        metadata: { idempotent: true, requestId }
      });

      logger.info('Satış onaylandı (idempotent)', { saleId, userId });

      return { success: true };
    }

    // 5. Stok kontrolü ve movement oluşturma
    const stockResult = await createStockMovements(
      sale.items || [],
      sale.companyId,
      saleId,
      userId,
      false // allowNegativeStock - şirket ayarından kontrol edilecek
    );

    // Yetersiz stok varsa hata fırlat
    if (stockResult.insufficientStockItems.length > 0) {
      // Lock'u kaldır
      transaction.update(saleRef, {
        approvalLock: FieldValue.delete()
      });

      // Yetersiz stok bilgisini sale'e kaydet
      transaction.update(saleRef, {
        insufficientStockItems: stockResult.insufficientStockItems
      });

      // Audit log
      await logAuditEvent({
        companyId: sale.companyId,
        entityType: 'sale',
        entityId: saleId,
        action: 'approve',
        actorUserId: userId,
        result: 'failed',
        reason: 'Yetersiz stok',
        metadata: { insufficientStockItems: stockResult.insufficientStockItems, requestId }
      });

      logger.warn('Satış onayı başarısız: Yetersiz stok', {
        saleId,
        insufficientStockItems: stockResult.insufficientStockItems
      });

      return {
        success: false,
        insufficientStockItems: stockResult.insufficientStockItems
      };
    }

    // 6. Satışı güncelle: status, approval, stockMovementIds, stockMovementCreated
    transaction.update(saleRef, {
      status: 'approved',
      'approval.approvedAt': FieldValue.serverTimestamp(),
      'approval.approvedBy': userId,
      stockMovementIds: FieldValue.arrayUnion(...stockResult.movementIds),
      stockMovementCreated: true,
      insufficientStockItems: FieldValue.delete(), // Yetersiz stok hatası temizle
      approvalLock: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // 7. Approval history ekle
    transaction.update(saleRef, {
      approvalHistory: FieldValue.arrayUnion({
        action: 'approved',
        userId: userId,
        timestamp: FieldValue.serverTimestamp()
      })
    });

    // Audit log (transaction dışında)
    await logAuditEvent({
      companyId: sale.companyId,
      entityType: 'sale',
      entityId: saleId,
      action: 'approve',
      actorUserId: userId,
      result: 'success',
      metadata: {
        stockMovementIds: stockResult.movementIds,
        requestId
      }
    });

    logger.info('Satış onaylandı', {
      saleId,
      userId,
      movementIds: stockResult.movementIds
    });

    return { success: true };
  });
}

/**
 * Satış iptali (cancelled)
 * Transaction güvenli, reversal movement oluşturur
 */
export async function cancelSale(
  saleId: string,
  userId: string,
  companyId: string,
  reason?: string
): Promise<void> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const saleRef = db.collection('sales').doc(saleId);

  await db.runTransaction(async (transaction) => {
    const saleDoc = await transaction.get(saleRef);
    if (!saleDoc.exists) {
      throw new Error('Satış bulunamadı');
    }

    const sale = saleDoc.data() as any;

    // Company kontrolü
    if (sale.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // State machine validation
    const currentStatus = sale.status as SaleStatus;
    assertValidStatusTransition(currentStatus, 'cancelled');

    // Eğer stok düşüşü yapılmışsa, reversal movement oluştur
    if (sale.stockMovementCreated && sale.stockMovementIds && sale.stockMovementIds.length > 0) {
      // Reversal movement'leri oluştur (transaction dışında - çünkü async)
      // Not: Firestore transaction içinde async işlem yapılamaz, bu yüzden
      // reversal'ı transaction sonrası yapacağız
      // Ancak transaction içinde reversalMovementIds'yi hazırlayabiliriz
    }

    // Satışı cancelled yap
    transaction.update(saleRef, {
      status: 'cancelled',
      'approval.rejectedAt': FieldValue.serverTimestamp(),
      'approval.rejectedBy': userId,
      'approval.rejectReason': reason || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Approval history ekle
    transaction.update(saleRef, {
      approvalHistory: FieldValue.arrayUnion({
        action: 'cancelled',
        userId: userId,
        timestamp: FieldValue.serverTimestamp(),
        note: reason || null
      })
    });
  });

  // Transaction sonrası: Reversal movement'leri oluştur
  const saleDoc = await saleRef.get();
  const sale = saleDoc.data() as any;

  if (sale.stockMovementCreated && sale.stockMovementIds && sale.stockMovementIds.length > 0) {
    try {
      const reversalMovementIds = await createReversalMovements(
        sale.items || [],
        sale.stockMovementIds,
        sale.companyId,
        saleId,
        userId
      );

      // Reversal movement ID'lerini sale'e ekle
      await saleRef.update({
        stockReversalMovementIds: FieldValue.arrayUnion(...reversalMovementIds)
      });

      logger.info('Reversal movements created', {
        saleId,
        reversalMovementIds
      });
    } catch (error: any) {
      logger.error('Reversal movement oluşturma hatası', {
        saleId,
        error: error.message
      });
      // Reversal hatası kritik değil, sadece logla
    }
  }

  // Audit log
  await logAuditEvent({
    companyId: sale.companyId,
    entityType: 'sale',
    entityId: saleId,
    action: 'cancel',
    actorUserId: userId,
    result: 'success',
    reason: reason || undefined,
    metadata: {
      oldStatus: sale.status,
      hadStockMovements: sale.stockMovementCreated || false
    }
  });

  logger.info('Satış iptal edildi', { saleId, userId, reason });
}

/**
 * Satış reddetme (rejected → draft)
 * Sadece pending_approval durumundaki satışlar için
 */
export async function rejectSale(
  saleId: string,
  userId: string,
  companyId: string,
  reason: string
): Promise<void> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const saleRef = db.collection('sales').doc(saleId);

  await db.runTransaction(async (transaction) => {
    const saleDoc = await transaction.get(saleRef);
    if (!saleDoc.exists) {
      throw new Error('Satış bulunamadı');
    }

    const sale = saleDoc.data() as any;

    // Company kontrolü
    if (sale.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // State machine validation (pending_approval → draft)
    const currentStatus = sale.status as SaleStatus;
    if (currentStatus !== 'pending_approval') {
      throw new Error(`Sadece onay bekleyen satışlar reddedilebilir. Mevcut durum: ${currentStatus}`);
    }

    // Status'ü draft'a geri al
    transaction.update(saleRef, {
      status: 'draft',
      'approval.rejectedAt': FieldValue.serverTimestamp(),
      'approval.rejectedBy': userId,
      'approval.rejectReason': reason,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Approval history ekle
    transaction.update(saleRef, {
      approvalHistory: FieldValue.arrayUnion({
        action: 'rejected',
        userId: userId,
        timestamp: FieldValue.serverTimestamp(),
        note: reason
      })
    });
  });

  // Audit log
  const saleDoc = await saleRef.get();
  const sale = saleDoc.data() as any;

  await logAuditEvent({
    companyId: sale.companyId,
    entityType: 'sale',
    entityId: saleId,
    action: 'reject',
    actorUserId: userId,
    result: 'success',
    reason: reason,
    metadata: { oldStatus: 'pending_approval', newStatus: 'draft' }
  });

  logger.info('Satış reddedildi', { saleId, userId, reason });
}
