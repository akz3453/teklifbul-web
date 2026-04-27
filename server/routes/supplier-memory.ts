/**
 * Supplier Memory API Routes
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * POST /api/supplier-memory/save-mapping - Kolon eşleştirme kaydetme
 */

import { Router } from 'express';
import { getSupplierMemoryStore } from '../services/supplierMemory.js';
import { logger } from '../../src/shared/log/logger.js';

const router = Router();

/**
 * POST /api/supplier-memory/save-mapping
 * Kolon eşleştirme kaydını kaydet
 * Teklifbul Rule v1.0 - Öğrenme algoritması
 */
router.post('/save-mapping', async (req, res) => {
  logger.group('Supplier Memory - Mapping Kaydetme');
  
  try {
    const { 
      supplierId, 
      filename, 
      mappings 
    } = req.body || {};
    
    if (!Array.isArray(mappings)) {
      logger.error('Geçersiz request', { mappings });
      logger.end();
      return res.status(400).json({ 
        ok: false, 
        error: 'mappings_required', 
        details: 'Mappings array gerekli' 
      });
    }

    const store = getSupplierMemoryStore();
    let saved = 0;
    
    mappings.forEach((mapping: any) => {
      if (mapping.field && mapping.columnLabel) {
        const confidence = mapping.confidence || mapping.score || 0.8;
        store.remember(
          supplierId || null,
          mapping.columnLabel,
          mapping.field,
          confidence,
          filename // Dosya adı pattern
        );
        saved++;
      }
    });

    logger.info('Eşleştirme kaydedildi', { supplierId, filename, saved });
    logger.end();
    
    return res.json({ 
      ok: true, 
      message: 'Eşleştirme kaydedildi',
      saved 
    });
  } catch (e: any) {
    logger.error('Mapping kayıt hatası', e);
    logger.end();
    return res.status(500).json({ 
      ok: false, 
      error: 'server_error', 
      details: e.message || String(e) 
    });
  }
});

export default router;

