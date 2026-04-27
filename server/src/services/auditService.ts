/**
 * Audit Service - Satış Modülü Faz 1
 * Merkezi audit log servisi
 * Teklifbul Rule v1.0 - Structured logging, audit trail
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';

export type AuditEntityType =
  | 'user'
  | 'company'
  | 'product'
  | 'customer'
  | 'sale'
  | 'invoice'
  | 'delivery_note'
  | 'customer_transaction'
  | 'cash_account'
  | 'cash_transaction'
  | 'cash_transfer'
  | 'demand'
  | 'offer'
  | 'stock'
  | 'stock_movement';

export interface AuditEventParams {
  companyId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  field?: string;
  oldValue?: any;
  newValue?: any;
  actorUserId: string;
  actorRoleKey?: string;
  result: 'success' | 'failed' | 'blocked';
  reason?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

/**
 * Audit log event kaydet
 * Teklifbul Rule v1.0 - Her kritik işlemde audit log yazılır
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Audit log: Firestore unavailable', { entityType: params.entityType, entityId: params.entityId });
      return;
    }

    // Teklifbul Rule v1.0 - undefined değerleri filtrele (Firestore undefined kabul etmez)
    const cleanMetadata: Record<string, any> = {};
    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        if (value !== undefined) {
          cleanMetadata[key] = value;
        }
      }
    }

    // oldValue ve newValue'yu JSON stringify et (büyük objeler için)
    const auditData: any = {
      companyId: params.companyId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorUserId: params.actorUserId,
      result: params.result,
      createdAt: FieldValue.serverTimestamp()
    };

    if (params.field) {
      auditData.field = params.field;
    }

    if (params.oldValue !== undefined) {
      // Büyük objeler için JSON stringify
      auditData.oldValue = typeof params.oldValue === 'object'
        ? JSON.stringify(params.oldValue)
        : params.oldValue;
    }

    if (params.newValue !== undefined) {
      // Büyük objeler için JSON stringify
      auditData.newValue = typeof params.newValue === 'object'
        ? JSON.stringify(params.newValue)
        : params.newValue;
    }

    if (params.actorRoleKey) {
      auditData.actorRoleKey = params.actorRoleKey;
    }

    if (params.reason) {
      auditData.reason = params.reason;
    }

    if (Object.keys(cleanMetadata).length > 0) {
      auditData.metadata = cleanMetadata;
    }

    if (params.ip) {
      auditData.ip = params.ip;
    }

    if (params.userAgent) {
      auditData.userAgent = params.userAgent;
    }

    await db.collection('audit_logs').add(auditData);

    logger.info('Audit log kaydedildi', {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorUserId: params.actorUserId,
      result: params.result
    });
  } catch (error: any) {
    // Audit log hatası kritik değil, sadece logla
    logger.error('Audit log kaydetme hatası', {
      error: error?.message || String(error),
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action
    });
  }
}
