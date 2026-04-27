/**
 * Template API Routes
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * GET /api/template/demand - Talep şablonu indirme
 * POST /api/template/demand/custom - Özelleştirilmiş talep şablonu oluşturma
 */

import express, { Request, Response } from 'express';
import { generateDemandTemplate, generateCustomDemandTemplate } from '../services/templateGenerator.js';
import { logger } from '../../src/shared/log/logger.js';
import { requirePremium } from '../middleware/requirePremium.js';

const router = express.Router();

/**
 * GET /api/template/demand
 * Talep şablonu Excel dosyasını döndürür
 * Teklifbul Rule v1.0 - Excel export endpoint
 */
router.get('/demand', async (req: Request, res: Response) => {
  logger.group('Talep Şablonu İndirme');
  
  try {
    const buffer = await generateDemandTemplate();
    
    // Response headers
    const filename = `Talep_Sablonu_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    
    logger.info('Şablon gönderildi', { filename, size: buffer.length });
    logger.end();
    
    res.send(buffer);
  } catch (error: any) {
    logger.error('Şablon oluşturma hatası', error);
    logger.end();
    
    res.status(500).json({
      ok: false,
      error: 'Şablon oluşturulamadı',
      message: error.message || 'Beklenmeyen bir hata oluştu'
    });
  }
});

/**
 * POST /api/template/demand/custom
 * Özelleştirilmiş talep şablonu Excel dosyasını döndürür
 * Teklifbul Rule v1.0 - Özelleştirilmiş şablon oluşturma
 */
router.post('/demand/custom', requirePremium, async (req: Request, res: Response) => {
  logger.group('Özelleştirilmiş Talep Şablonu Oluşturma');
  
  try {
    const { demandFields, itemFields } = req.body;
    
    if (!demandFields || !itemFields) {
      return res.status(400).json({
        ok: false,
        error: 'Geçersiz istek',
        message: 'demandFields ve itemFields gerekli'
      });
    }
    
    const buffer = await generateCustomDemandTemplate(demandFields, itemFields);
    
    // Response headers
    const filename = `Ozel_Talep_Sablonu_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    
    logger.info('Özelleştirilmiş şablon gönderildi', { 
      filename, 
      size: buffer.length,
      demandFieldsCount: demandFields.length,
      itemFieldsCount: itemFields.length
    });
    logger.end();
    
    res.send(buffer);
  } catch (error: any) {
    logger.error('Özelleştirilmiş şablon oluşturma hatası', error);
    logger.end();
    
    res.status(500).json({
      ok: false,
      error: 'Şablon oluşturulamadı',
      message: error.message || 'Beklenmeyen bir hata oluştu'
    });
  }
});

export default router;

