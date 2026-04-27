import { getPgPool } from '../../../db/connection.js';
import { logger } from '../../../shared/log/logger.js';
import { randomUUID } from 'crypto';

interface InboundPayload {
  product_id: string;
  warehouse_id: string;
  lot_number: string;
  received_quantity: number;
  expiry_date: string; // YYYY-MM-DD
  user_id: string;
}

export class InventoryInboundService {
  /**
   * Mal kabul iÅŸlemi. Transaction yÃ¶netimi ile izolasyon saÄŸlanÄ±r.
   */
  static async processInbound(payload: InboundPayload): Promise<{batch_id: string, transaction_group_id: string}> {
    if (!payload.expiry_date) {
      throw new Error('ExpiryDate NULL olamaz, Mal Kabul KaydÄ± Engellendi.');
    }

    const pool = getPgPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const correlation_id = randomUUID();
      const transaction_group_id = randomUUID();

      // 1. Batch Control
      const batchQuery = `
        SELECT batch_id, status 
        FROM fefo_inventory_batches 
        WHERE product_id = $1 AND warehouse_id = $2 AND lot_number = $3 AND expiry_date = $4 AND is_deleted = false
      `;
      const batchRes = await client.query(batchQuery, [
        payload.product_id, 
        payload.warehouse_id, 
        payload.lot_number, 
        payload.expiry_date
      ]);

      let batch_id: string;

      if (batchRes.rows.length > 0) {
        batch_id = batchRes.rows[0].batch_id;
      } else {
        const insertBatch = `
          INSERT INTO fefo_inventory_batches 
            (product_id, warehouse_id, lot_number, expiry_date, status) 
          VALUES ($1, $2, $3, $4, 'QUARANTINE') 
          RETURNING batch_id
        `;
        const res = await client.query(insertBatch, [
          payload.product_id,
          payload.warehouse_id,
          payload.lot_number,
          payload.expiry_date
        ]);
        batch_id = res.rows[0].batch_id;

        await client.query(
          `INSERT INTO fefo_quality_inspections (batch_id, status) VALUES ($1, 'PENDING')`,
          [batch_id]
        );
      }

      // 2. Hareket KaydÄ± (Stock Movement) -> Transaction Group Id dahil edildi (SAP PARTITION UYUMLU)
      const insertMovement = `
        INSERT INTO fefo_stock_movements 
          (batch_id, transaction_group_id, movement_type, quantity, user_id, correlation_id) 
        VALUES ($1, $2, 'IN', $3, $4, $5)
      `;
      await client.query(insertMovement, [
        batch_id, 
        transaction_group_id,
        payload.received_quantity, 
        payload.user_id, 
        correlation_id
      ]);

      await client.query('COMMIT');
      logger.info(`Mal Kabul (Inbound) tamamlandÄ±. BatchID: ${batch_id}`);
      return { batch_id, transaction_group_id };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Inbound iÅŸlemi hata aldÄ± ve Rollback edildi.', { error, payload });
      throw error;
    } finally {
      client.release();
    }
  }
}
