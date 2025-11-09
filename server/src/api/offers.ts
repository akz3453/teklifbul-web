/**
 * Teklif API Endpoints
 * 
 * POST /api/offers/parse → raw UI/Excel → schema
 * POST /api/offers/validate → schema → rapor
 * POST /api/offers → kalıcı kaydet + ilişkilendir (satfkCode)
 * POST /api/offers/:id/submit → kontrol → gönder
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { OfferSchema, Offer } from '../../../src/domain/offer/schema';
import { importSupplierOffer } from '../../../src/import/excel/supplierOfferImport';
import { exportSupplierOffer } from '../../../src/export/excel/supplierOfferExport';
import { ZodError } from 'zod';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/offers/parse
 * Excel veya JSON'dan teklif şemasına parse et
 */
router.post('/parse', upload.single('file'), async (req: Request, res: Response) => {
  try {
    // Excel dosyası yüklenmişse
    if (req.file) {
      const buffer = req.file.buffer;
      const offer = await importSupplierOffer(buffer);
      
      return res.json({
        ok: true,
        offer,
      });
    }
    
    // JSON body varsa
    if (req.body && req.body.offer) {
      const parsed = OfferSchema.parse(req.body.offer);
      return res.json({
        ok: true,
        offer: parsed,
      });
    }
    
    return res.status(400).json({
      ok: false,
      error: 'Excel dosyası veya JSON body gerekli',
    });
  } catch (error: any) {
    console.error('Parse error:', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Parse hatası',
      details: error instanceof ZodError ? error.errors : undefined,
    });
  }
});

/**
 * POST /api/offers/validate
 * Teklif şemasını doğrula ve rapor döndür
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const offerData = req.body.offer || req.body;
    
    // Zod validation
    const result = OfferSchema.safeParse(offerData);
    
    if (!result.success) {
      return res.json({
        ok: false,
        valid: false,
        errors: result.error.errors,
      });
    }
    
    // İş kuralları kontrolü
    const businessRules = validateBusinessRules(result.data);
    
    return res.json({
      ok: true,
      valid: businessRules.valid,
      offer: result.data,
      businessRules: businessRules.issues,
    });
  } catch (error: any) {
    console.error('Validate error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Validation hatası',
    });
  }
});

/**
 * İş kuralları doğrulama
 */
function validateBusinessRules(offer: Offer): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Zorunlu alanlar
  if (!offer.header.satfkCode) {
    issues.push('SATFK kodu zorunludur');
  }
  
  if (!offer.header.title) {
    issues.push('Başlık zorunludur');
  }
  
  if (offer.lines.length === 0) {
    issues.push('En az 1 satır zorunludur');
  }
  
  // Tarih kontrolleri
  if (offer.header.dueDate) {
    const dueDate = new Date(offer.header.dueDate);
    const now = new Date();
    if (dueDate < now) {
      issues.push('Termin tarihi geçmiş olamaz');
    }
  }
  
  if (offer.validUntil) {
    const validUntil = new Date(offer.validUntil);
    const now = new Date();
    if (validUntil < now) {
      issues.push('Geçerlilik tarihi bugünden önce olamaz');
    }
  }
  
  // Satır kontrolleri
  offer.lines.forEach((line, index) => {
    if (line.quantity <= 0) {
      issues.push(`Satır ${index + 1}: Miktar 0'dan büyük olmalı`);
    }
    
    if (line.unitPrice < 0) {
      issues.push(`Satır ${index + 1}: Birim fiyat negatif olamaz`);
    }
    
    if (line.deliveryDate) {
      const deliveryDate = new Date(line.deliveryDate);
      const now = new Date();
      if (deliveryDate < now) {
        issues.push(`Satır ${index + 1}: Teslim tarihi geçmiş olamaz`);
      }
    }
  });
  
  // Gizli teklif kontrolü
  if (offer.header.isSealedBid && offer.status !== 'draft' && offer.status !== 'submitted') {
    issues.push('Gizli teklifler sadece draft veya submitted durumunda olabilir');
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * POST /api/offers
 * Teklifi kalıcı kaydet
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const offerData = req.body.offer || req.body;
    
    // Validation
    const validated = OfferSchema.parse(offerData);
    
    // Mock: Firestore/DB'ye kaydet
    // TODO: Gerçek Firestore adaptörü ekle
    const savedOffer = {
      ...validated,
      id: `offer_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Mock: Firestore collection'a ekle
    // await db.collection('offers').add(savedOffer);
    
    return res.json({
      ok: true,
      offer: savedOffer,
      message: 'Teklif kaydedildi',
    });
  } catch (error: any) {
    console.error('Save error:', error);
    
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation hatası',
        details: error.errors,
      });
    }
    
    return res.status(500).json({
      ok: false,
      error: error.message || 'Kaydetme hatası',
    });
  }
});

/**
 * POST /api/offers/:id/submit
 * Teklifi gönder (kontroller + durum güncelleme)
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const offerId = req.params.id;
    
    // Mock: Firestore'dan teklifi getir
    // const offerDoc = await db.collection('offers').doc(offerId).get();
    // if (!offerDoc.exists) {
    //   return res.status(404).json({ ok: false, error: 'Teklif bulunamadı' });
    // }
    // const offer = offerDoc.data() as Offer;
    
    // Şimdilik mock offer
    const offer = req.body.offer as Offer;
    
    // Validation
    const validated = OfferSchema.parse(offer);
    
    // İş kuralları
    const businessRules = validateBusinessRules(validated);
    if (!businessRules.valid) {
      return res.status(400).json({
        ok: false,
        error: 'İş kuralları ihlali',
        issues: businessRules.issues,
      });
    }
    
    // Gizli teklif kontrolü
    if (validated.header.isSealedBid && validated.status !== 'draft') {
      return res.status(400).json({
        ok: false,
        error: 'Gizli teklifler düzenlenemez',
      });
    }
    
    // Durum güncelleme
    const submittedOffer = {
      ...validated,
      status: 'submitted' as const,
      updatedAt: new Date().toISOString(),
    };
    
    // Mock: Firestore'a kaydet
    // await db.collection('offers').doc(offerId).update(submittedOffer);
    
    return res.json({
      ok: true,
      offer: submittedOffer,
      message: 'Teklif başarıyla gönderildi',
    });
  } catch (error: any) {
    console.error('Submit error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Gönderme hatası',
    });
  }
});

/**
 * POST /api/offers/export
 * Excel export
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    const offerData = req.body.offer || req.body;
    const validated = OfferSchema.parse(offerData);
    
    const buffer = await exportSupplierOffer(validated);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Teklif_${validated.header.satfkCode}_${Date.now()}.xlsx"`);
    
    return res.send(buffer);
  } catch (error: any) {
    console.error('Export error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Export hatası',
    });
  }
});

export default router;

