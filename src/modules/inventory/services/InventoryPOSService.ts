import { getPgPool } from '../../../db/connection.js';
import { logger } from '../../../shared/log/logger.js';
import { randomUUID } from 'crypto';

interface SaleRequest {
  idempotency_key: string;
  barcode: string; // MasterBarcode veya AliasBarcode
  warehouse_id: string;
  quantity: number;
  user_id: string;
}

interface SaleResponse {
  success: boolean;
  message: string;
  transaction_group_id?: string;
  processed_batches?: { batch_id: string, qty: number }[];
  warning?: string;
  discount_rate?: number;
}

export class InventoryPOSService {
  /**
   * SAP-Level POS Sales Engine v2
   * Multi-Batch Split, Idempotency and REPEATABLE READ support.
   */
  static async processSale(payload: SaleRequest, attempt = 1): Promise<SaleResponse> {
    const MAX_RETRIES = 3;
    const pool = getPgPool();
    const client = await pool.connect();
    
    try {
      // 1. Idempotency Check (Fast Reject/Return)
      if (attempt === 1 && payload.idempotency_key) {
        const idempRes = await client.query('SELECT response_body FROM fefo_idempotency_keys WHERE idempotency_key = $1', [payload.idempotency_key]);
        if (idempRes.rows.length > 0) {
          logger.info(`Idempotency hit! Returning cached response for key: ${payload.idempotency_key}`);
          return idempRes.rows[0].response_body as SaleResponse;
        }
      }

      await client.query('BEGIN');
      // SAP Standard: Strong isolation against phantom reads
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

      const correlation_id = randomUUID();
      const transaction_group_id = randomUUID();

      // 2. Barcode Resolution
      let product_id = null;
      let target_batch_id = null;

      const aliasRes = await client.query(`SELECT batch_id FROM fefo_alias_barcodes WHERE alias_barcode_value = $1 AND status = 'ACTIVE'`, [payload.barcode]);
      if (aliasRes.rows.length > 0) {
        target_batch_id = aliasRes.rows[0].batch_id;
      } else {
        const prodRes = await client.query(`SELECT product_id FROM fefo_products WHERE master_barcode = $1 AND is_deleted = false`, [payload.barcode]);
        if (prodRes.rows.length > 0) {
          product_id = prodRes.rows[0].product_id;
        } else {
          throw new Error('Barkod sistemde bulunamadi veya urun silinmis!');
        }
      }

      // 3. Multi-Batch Collection Logic
      let remaining_qty = payload.quantity;
      const processed_batches: { batch_id: string, qty: number }[] = [];
      let total_allocated = 0;

      let discount_rate = 0;
      let warning = undefined;
      const today = new Date();

      if (target_batch_id) {
        // Alias is strictly targeting ONE specific batch. We handle partial from this batch only.
        const batchQuery = `
          SELECT b.batch_id, b.expiry_date, p.allow_expired_sale, p.expired_sale_grace_days, p.critical_skt_threshold_days, s.current_stock
          FROM fefo_inventory_batches b
          JOIN fefo_products p ON b.product_id = p.product_id
          JOIN fefo_inventory_batch_stock s ON b.batch_id = s.batch_id
          WHERE b.batch_id = $1 AND b.status = 'ACTIVE' AND b.is_deleted = false AND s.current_stock > 0
          FOR UPDATE
        `;
        const bRes = await client.query(batchQuery, [target_batch_id]);
        if (bRes.rows.length === 0) throw new Error('Alias_Barcode ile eslesen gecerli ve stoklu Batch bulunamadi.');
        
        const b = bRes.rows[0];
        if (b.current_stock < remaining_qty) {
          throw new Error(`Alias stok yetersiz (Istenen: ${remaining_qty}, Mevcut: ${b.current_stock}). Partial Alias satisi reddedildi.`);
        }
        
        processed_batches.push({ batch_id: b.batch_id, qty: remaining_qty });
        total_allocated = remaining_qty;

        // Soft warning check for this dedicated batch
        const diffDays = Math.ceil((new Date(b.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0 && !b.allow_expired_sale) throw new Error('HARD BLOCK: Tarihi gecmis urun satisi engellendi.');
        
        if (diffDays >= 0 && diffDays <= b.critical_skt_threshold_days) {
          warning = `SAP WARNING: Aliasli urunun SKT'sine ${diffDays} gun kaldi!`;
          if (diffDays < 5) discount_rate = 40;
          else if (diffDays < 10) discount_rate = 20;
        }

      } else {
        // Master Barcode -> FEFO Multi-Batch Sweep
        const fefoQuery = `
          SELECT b.batch_id, b.expiry_date, p.allow_expired_sale, p.expired_sale_grace_days, p.critical_skt_threshold_days, s.current_stock
          FROM fefo_inventory_batches b
          JOIN fefo_products p ON b.product_id = p.product_id
          JOIN fefo_inventory_batch_stock s ON b.batch_id = s.batch_id
          WHERE p.product_id = $1 
            AND b.warehouse_id = $2
            AND b.status = 'ACTIVE' 
            AND b.is_deleted = false
            AND s.current_stock > 0
          ORDER BY (CASE WHEN p.stock_rotation_type = 'FIFO' THEN b.received_date ELSE b.expiry_date END) ASC
          LIMIT 100
          FOR UPDATE SKIP LOCKED
        `;
        const bRes = await client.query(fefoQuery, [product_id, payload.warehouse_id]);
        
        for (const row of bRes.rows) {
          if (remaining_qty <= 0) break;

          // Checking Expiration boundaries per batch
          const diffDays = Math.ceil((new Date(row.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            if (!row.allow_expired_sale || Math.abs(diffDays) > row.expired_sale_grace_days) {
              continue; // Skip this expired batch, move to next!
            }
          }

          const take_qty = Math.min(row.current_stock, remaining_qty);
          processed_batches.push({ batch_id: row.batch_id, qty: take_qty });
          total_allocated += take_qty;
          remaining_qty -= take_qty;

          // Track warnings (aggregating worst-case for the payload)
          if (diffDays >= 0 && diffDays <= row.critical_skt_threshold_days) {
            warning = `SAP WARNING: Satilan parti/partilerin icinde SKT eksiğine dusen urun mevcut. (Min. ${diffDays} gun)`;
            if (diffDays < 5) discount_rate = Math.max(discount_rate, 40);
            else if (diffDays < 10) discount_rate = Math.max(discount_rate, 20);
          }
        }

        if (total_allocated < payload.quantity) {
          throw new Error(`SAP BLOCK: Talep edilen miktar karsilanamadi. Sadece ${total_allocated} adet satilabilir stok bulundu. Islem Rollback edildi.`);
        }
      }

      // 4. Batch Deduction Sub-routine (Execute Movements)
      for (const p of processed_batches) {
        await client.query(`
          INSERT INTO fefo_stock_movements 
            (batch_id, transaction_group_id, movement_type, quantity, user_id, correlation_id) 
          VALUES ($1, $2, 'OUT', $3, $4, $5)
        `, [p.batch_id, transaction_group_id, p.qty, payload.user_id, correlation_id]);
      }

      // 5. Finalize Response and Idempotency
      const resultPayload: SaleResponse = {
        success: true,
        message: `Satis gerceklesti. (${processed_batches.length} farkli batch kullanildi).`,
        transaction_group_id: transaction_group_id,
        processed_batches: processed_batches,
        warning: warning,
        discount_rate: discount_rate > 0 ? discount_rate : undefined
      };

      if (payload.idempotency_key) {
        await client.query(`
          INSERT INTO fefo_idempotency_keys (idempotency_key, response_body)
          VALUES ($1, $2)
        `, [payload.idempotency_key, JSON.stringify(resultPayload)]);
      }

      await client.query('COMMIT');
      return resultPayload;

    } catch (error: any) {
      await client.query('ROLLBACK');
      
      // PostgreSQL deadlock handler (40P01 / 40001 serialization_failure)
      if ((error.code === '40P01' || error.code === '40001') && attempt < MAX_RETRIES) {
        logger.warn(`Isolation/Deadlock hatasi yakalandi, operasyon retry ediliyor... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, attempt * 100)); // Exponential backoff
        return this.processSale(payload, attempt + 1);
      }
      
      logger.error('POS Satis Islemi Hata aldi:', { error, payload });
      return {
        success: false,
        message: error.message || 'Satis hatasi.',
      };
    } finally {
      client.release();
    }
  }
}
