/**
 * Teklif API Endpoints
 * 
 * POST /api/offers/parse → raw UI/Excel → schema
 * POST /api/offers/validate → schema → rapor
 * POST /api/offers → kalıcı kaydet + ilişkilendir (satfkCode)
 * POST /api/offers/:id/submit → kontrol → gönder
 */

import express, { Response } from 'express';
import multer from 'multer';
import { OfferSchema, Offer } from '../../../src/domain/offer/schema';
import { importSupplierOffer } from '../../../src/import/excel/supplierOfferImport';
import { exportSupplierOffer } from '../../../src/export/excel/supplierOfferExport';
import { ZodError } from 'zod';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';

const router = express.Router();

// Teklifbul Rule v1.0 - Ortak yardimci: kullanici/sirket dogrulamasi
function getActorCompany(req: AuthenticatedRequest): { uid: string; companyId: string | null } | null {
  const user = req.user;
  if (!user?.uid) return null;
  const companyId = (user as any).activeCompanyId
    || (user as any).companyId
    || (Array.isArray((user as any).companies) && (user as any).companies[0])
    || (req.headers['x-company-id'] as string | undefined)
    || null;
  return { uid: user.uid, companyId };
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/offers/parse
 * Excel veya JSON'dan teklif şemasına parse et
 * 
 * @route POST /api/offers/parse
 * @param {Express.Multer.File} req.file - Excel dosyası (opsiyonel)
 * @param {Object} req.body.offer - JSON formatında teklif verisi (opsiyonel)
 * @returns {Object} { ok: boolean, offer?: Offer, error?: string, details?: ZodError[] }
 */
router.post('/parse', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = getActorCompany(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    }
    // Excel dosyasi yuklenmisse
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
    logger.error('Parse error', error);
    return res.status(400).json({
      ok: false,
      error: error.message || 'Parse hatası',
      details: error instanceof ZodError ? error.issues : undefined,
    });
  }
});

/**
 * POST /api/offers/validate
 * Teklif şemasını doğrula ve rapor döndür
 * 
 * @route POST /api/offers/validate
 * @param {Offer|Object} req.body.offer - Doğrulanacak teklif verisi
 * @returns {Object} { ok: boolean, valid: boolean, offer?: Offer, businessRules?: string[], errors?: ZodError[] }
 */
router.post('/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = getActorCompany(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    }
    const offerData = req.body.offer || req.body;
    
    // Zod validation
    const result = OfferSchema.safeParse(offerData);
    
    if (!result.success) {
      return res.json({
        ok: false,
        valid: false,
        errors: result.error.issues,
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
    logger.error('Validate error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Validation hatası',
    });
  }
});

/**
 * İş kuralları doğrulama
 * 
 * @param offer - Doğrulanacak teklif verisi
 * @returns {Object} { valid: boolean, issues: string[] }
 * 
 * @example
 * ```typescript
 * const result = validateBusinessRules(offer);
 * if (!result.valid) {
 *   console.log('İş kuralı ihlalleri:', result.issues);
 * }
 * ```
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
 * 
 * @route POST /api/offers
 * @param {Offer|Object} req.body.offer - Kaydedilecek teklif verisi
 * @returns {Object} { ok: boolean, offer?: Offer, message?: string, error?: string }
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = getActorCompany(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    }
    const offerData = req.body.offer || req.body;

    // Validation
    const validated = OfferSchema.parse(offerData);

    // Firestore'a kaydet (sirket/kullanici sahipligi sunucu tarafindan zorlanir)
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore unavailable, offer not persisted');
      return res.status(503).json({ ok: false, error: 'DB_UNAVAILABLE' });
    }

    const offerDoc = {
      ...validated,
      ownerUserId: actor.uid,
      ownerCompanyId: actor.companyId,
      companyId: actor.companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let savedOffer: any;
    try {
      const docRef = await db.collection('offers').add(offerDoc);
      savedOffer = {
        id: docRef.id,
        ...offerDoc,
        createdAt: offerDoc.createdAt.toISOString(),
        updatedAt: offerDoc.updatedAt.toISOString(),
      };
      logger.info('Teklif kaydedildi', { offerId: docRef.id, ownerUserId: actor.uid });
    } catch (error: any) {
      logger.error('Firestore kayit hatasi', error);
      return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' });
    }

    return res.json({
      ok: true,
      offer: savedOffer,
      message: 'Teklif kaydedildi',
    });
  } catch (error: any) {
    logger.error('Save error', error);
    
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation hatası',
        details: error.issues,
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
 * 
 * @route POST /api/offers/:id/submit
 * @param {string} req.params.id - Teklif ID'si
 * @param {Offer} req.body.offer - Teklif verisi (Firestore erişilemezse)
 * @returns {Object} { ok: boolean, offer?: Offer, message?: string, error?: string, issues?: string[] }
 */
router.post('/:id/submit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = getActorCompany(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    }
    const offerId = req.params.id;

    // Firestore'dan teklifi getir
    const db = await getAdminDb();
    if (!db) {
      return res.status(503).json({ ok: false, error: 'DB_UNAVAILABLE' });
    }

    if (!offerId) {
      return res.status(400).json({ ok: false, error: 'OFFER_ID_REQUIRED' });
    }

    let offer: Offer;
    let storedDoc: any = null;
    try {
      const offerDoc = await db.collection('offers').doc(offerId).get();
      if (!offerDoc.exists) {
        return res.status(404).json({ ok: false, error: 'Teklif bulunamadi' });
      }
      storedDoc = offerDoc.data();
      // Sahiplik dogrulamasi
      if (storedDoc?.ownerUserId && storedDoc.ownerUserId !== actor.uid) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }
      if (storedDoc?.ownerCompanyId && actor.companyId && storedDoc.ownerCompanyId !== actor.companyId) {
        return res.status(403).json({ ok: false, error: 'COMPANY_MISMATCH' });
      }
      offer = storedDoc as Offer;
      logger.info('Teklif Firestore\'dan getirildi', { offerId });
    } catch (error: any) {
      logger.error('Firestore okuma hatasi', error);
      return res.status(500).json({ ok: false, error: 'READ_ERROR' });
    }
    
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
      updatedAt: new Date(),
    };
    
    // Firestore'da durumu guncelle
    try {
      await db.collection('offers').doc(offerId).update(submittedOffer);
      logger.info('Teklif durumu guncellendi', { offerId, status: 'submitted' });
    } catch (error: any) {
      logger.error('Firestore guncelleme hatasi', error);
      return res.status(500).json({ ok: false, error: 'UPDATE_ERROR' });
    }
    
    return res.json({
      ok: true,
      offer: {
        ...submittedOffer,
        updatedAt: submittedOffer.updatedAt.toISOString(),
      },
      message: 'Teklif başarıyla gönderildi',
    });
  } catch (error: any) {
    logger.error('Submit error', error);
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
router.post('/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = getActorCompany(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    }
    const offerData = req.body.offer || req.body;
    const validated = OfferSchema.parse(offerData);
    
    const buffer = await exportSupplierOffer(validated);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Teklif_${validated.header.satfkCode}_${Date.now()}.xlsx"`);
    
    return res.send(buffer);
  } catch (error: any) {
    logger.error('Export error', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Export hatası',
    });
  }
});

export default router;

