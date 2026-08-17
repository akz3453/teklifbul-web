import { getPgPool } from '../../../db/connection.js';
import { logger } from '../../../shared/log/logger.js';
import { randomBytes } from 'crypto';
export class InventoryEventService {
    /**
     * Event-driven check: Triggered typically after stock movements or batch state updates.
     * Checks for expired and critically expiring stocks to generate Alias Barcodes or block.
     */
    static async checkExpirationEvents(batchId) {
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let query = `
        SELECT b.batch_id, b.expiry_date, b.status, p.critical_skt_threshold_days, p.allow_expired_sale
        FROM fefo_inventory_batches b
        JOIN fefo_products p ON b.product_id = p.product_id
        WHERE b.status = 'ACTIVE'
      `;
            const params = [];
            if (batchId) {
                query += ` AND b.batch_id = $1`;
                params.push(batchId);
            }
            // We only lock the specific rows we evaluate
            query += ` FOR UPDATE SKIP LOCKED`;
            const res = await client.query(query, params);
            const today = new Date();
            for (const row of res.rows) {
                const expiry = new Date(row.expiry_date);
                const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    // EXPIRED
                    if (!row.allow_expired_sale) {
                        await client.query(`UPDATE fefo_inventory_batches SET status = 'EXPIRED' WHERE batch_id = $1`, [row.batch_id]);
                        logger.info(`Batch ${row.batch_id} marked as EXPIRED.`);
                    }
                }
                else if (diffDays <= row.critical_skt_threshold_days) {
                    // Check if Alias Barcode exists
                    const aliasCheck = await client.query(`SELECT 1 FROM fefo_alias_barcodes WHERE batch_id = $1`, [row.batch_id]);
                    if (aliasCheck.rows.length === 0) {
                        // SkT-{BatchID}-{YYYYMMDD}-{RANDOM4}
                        const yyyy = expiry.getFullYear();
                        const mm = String(expiry.getMonth() + 1).padStart(2, '0');
                        const dd = String(expiry.getDate()).padStart(2, '0');
                        const rand4 = randomBytes(2).toString('hex').toUpperCase(); // 4 chars
                        const shortBatchId = row.batch_id.split('-')[0]; // Using short prefix for readability
                        const newAlias = `SKT-${shortBatchId}-${yyyy}${mm}${dd}-${rand4}`;
                        await client.query(`
              INSERT INTO fefo_alias_barcodes (batch_id, alias_barcode_value) 
              VALUES ($1, $2)
            `, [row.batch_id, newAlias]);
                        logger.info(`Generated Alias Barcode ${newAlias} for Batch ${row.batch_id}`);
                    }
                }
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            logger.error('Inventory Event Check basarisiz oldu:', error);
        }
        finally {
            client.release();
        }
    }
}
