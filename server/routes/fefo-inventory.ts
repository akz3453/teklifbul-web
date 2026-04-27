import express from 'express';
import { InventoryInboundService } from '../../src/modules/inventory/services/InventoryInboundService';
import { InventoryPOSService } from '../../src/modules/inventory/services/InventoryPOSService';
import { InventoryEventService } from '../../src/modules/inventory/services/InventoryEventService';
import { getPgPool } from '../../src/db/connection.js';

const router = express.Router();

/**
 * 1. Mal Kabul (Inbound)
 */
router.post('/inbound', async (req, res) => {
  try {
    const { batch_id } = await InventoryInboundService.processInbound(req.body);
    // Asenkron Event Tetiklemesi (Expiration check ve alias gerekirse)
    InventoryEventService.checkExpirationEvents(batch_id).catch((err: any) => console.error(err));
    res.json({ success: true, batch_id });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * 2. POS SatÄ±ÅŸÄ±
 */
router.post('/sale', async (req, res) => {
  try {
    const result = await InventoryPOSService.processSale(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    // Asenkron Event - SatÄ±lan herbir batch iÃ§in kontrol gerekebilir
    if (result.processed_batches) {
      for (const b of result.processed_batches) {
        InventoryEventService.checkExpirationEvents(b.batch_id).catch((err: any) => console.error(err));
      }
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 3. KPI Dashboard Verisi (Read-Only Analytical Pool Gerekir Normalde)
 */
router.get('/dashboard-stats', async (req, res) => {
  try {
    const pool = getPgPool();
    // Complex queries for:
    // - Stock Aging Report
    // - Inventory Turnover Rate
    // - Days Sales of Inventory (DSI)
    // - Expiry Loss Forecast
    
    // Yalnizca ornek amacli Expiry Loss Forecast
    const expiryLossQ = `
      SELECT sum(s.current_stock) as total_units_expiring_soon
      FROM fefo_inventory_batches b
      JOIN fefo_inventory_batch_stock s ON b.batch_id = s.batch_id
      WHERE b.expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '30 days')
      AND b.status = 'ACTIVE'
    `;
    const lossRes = await pool.query(expiryLossQ);

    res.json({
      success: true,
      stats: {
        expiryLossForecast: lossRes.rows[0].total_units_expiring_soon || 0,
        // DSI and Turnover requires massive historical aggregation.
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
