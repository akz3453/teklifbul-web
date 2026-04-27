/**
 * Waybill upload & comparison API
 * Teklifbul Rule v1.0 - Structured logging, async/await, DRY
 */

import { Router } from 'express';
import multer from 'multer';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { logger } from '../../src/shared/log/logger.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { getAdminDb } from '../utils/firestore.js';
import { getAdminStorage, uploadFile } from '../utils/storage.js';
import { extractWaybillText } from '../services/waybillText.js';
import { parseWaybill } from '../services/waybillParser.js';
import { compareWaybills } from '../services/waybillComparator.js';
// Teklifbul Rule v1.0 - Input Validation
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ROLE_KEYS = {
  supplier: 'supplierWaybills',
  buyer: 'buyerWaybills',
} as const;

function safeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140);
}

// Helper to check if user is authorized for waybills (Requester or Winning Supplier)
async function getAuthorizedWaybillAccess(db: Firestore, demandId: string, userId: string, companyId?: string) {
  const demandSnap = await db.collection('demands').doc(demandId).get();
  if (!demandSnap.exists) return { authorized: false, error: 'NOT_FOUND' };
  
  const demandData = demandSnap.data() || {};
  const isOwner = demandData.createdBy === userId || (companyId && demandData.creatorCompanyId === companyId);

  // Find accepted bid
  const bidsSnap = await db.collection('bids')
    .where('demandId', '==', demandId)
    .where('status', '==', 'accepted')
    .limit(1)
    .get();

  if (bidsSnap.empty) {
    return { authorized: false, error: 'NO_ACCEPTED_BID', isOwner };
  }

  const acceptedBid = bidsSnap.docs[0].data();
  const isWinner = acceptedBid.supplierId === userId || (companyId && acceptedBid.companyId === companyId);

  return { 
    authorized: isOwner || isWinner, 
    isOwner, 
    isWinner, 
    acceptedBidId: bidsSnap.docs[0].id,
    supplierCompanyId: acceptedBid.companyId 
  };
}

// Teklifbul Rule v1.0 - Input Validation Schema for upload
const uploadParamsSchema = z.object({
  demandId: z.string().min(1),
});

const uploadBodySchema = z.object({
  role: z.enum(['supplier', 'buyer']),
});

router.post('/:demandId/upload',
  verifyToken,
  requirePremium,
  validateRequest({ params: uploadParamsSchema, body: uploadBodySchema }),
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
  logger.group('waybill:upload');
  try {
    const { demandId } = req.params;
    const { role } = req.body || {};
    const userId = req.user?.uid;
    const companyId = req.user?.activeCompanyId;

    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Oturum gerekli' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'NO_FILE', message: 'Dosya yüklenmedi' });
    }

    const db = await getAdminDb();
    const bucket = await getAdminStorage();

    if (!db || !bucket) {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Veritabanı veya storage kullanılamıyor' });
    }

    // CHECK AUTHORIZATION
    const auth = await getAuthorizedWaybillAccess(db, demandId, userId as string, companyId);
    if (!auth.authorized) {
      return res.status(403).json({ 
        error: 'FORBIDDEN', 
        message: auth.error === 'NO_ACCEPTED_BID' 
          ? 'İrsaliye yüklemek için önce bir teklif kabul edilmelidir.' 
          : 'Bu işlemin yetkisi sadece alıcı ve kazanan tedarikçidedir.' 
      });
    }

    // Role vs Auth check
    if (role === 'buyer' && !auth.isOwner) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Alıcı irsaliyesini sadece talep sahibi yükleyebilir.' });
    }
    if (role === 'supplier' && !auth.isWinner) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Tedarikçi irsaliyesini sadece kazanan tedarikçi yükleyebilir.' });
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cleanName = safeFileName(req.file.originalname || 'irsaliye');
    const storagePath = `waybills/${demandId}/${role}/${fileId}-${cleanName}`;

    const fileUrl = await uploadFile(
      bucket,
      storagePath,
      req.file.buffer,
      req.file.mimetype || 'application/octet-stream',
      { uploadedBy: userId, demandId, role }
    );

    const textResult = await extractWaybillText(req.file.buffer, req.file.mimetype || '');
    const parsed = await parseWaybill(textResult);

    const docRef = db.collection('waybills').doc(demandId);
    const snapshot = await docRef.get();

    const roleKey = ROLE_KEYS[role as keyof typeof ROLE_KEYS];
    const updatedPayload = {
      id: fileId,
      fileUrl,
      fileName: cleanName,
      mimeType: req.file.mimetype,
      uploadedBy: userId,
      uploadedAt: new Date(), // FieldValue.serverTimestamp() works in .set but let's use Date for array push if needed
      parsed,
    };

    // Note: Comparison logic might need to handle arrays now. 
    // For MVP, we compare the LATEST one from each side if both exist.
    let comparison = null;
    const currentData = snapshot.exists ? snapshot.data() : {};
    
    const supplierList = (role === 'supplier' ? [updatedPayload] : (currentData?.supplierWaybills || []));
    const buyerList = (role === 'buyer' ? [updatedPayload] : (currentData?.buyerWaybills || []));
    
    const latestSupplier = supplierList[supplierList.length - 1];
    const latestBuyer = buyerList[buyerList.length - 1];

    if (latestSupplier?.parsed && latestBuyer?.parsed) {
      comparison = await compareWaybills(latestSupplier.parsed, latestBuyer.parsed);
    }

    // Atomic update to prevent deletion/overwriting of previous uploads
    if (!snapshot.exists) {
      await docRef.set({
        demandId,
        [roleKey]: [updatedPayload],
        comparison: comparison || null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      await docRef.update({
        [roleKey]: FieldValue.arrayUnion(updatedPayload),
        comparison: comparison || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    logger.info('waybill uploaded to list', { demandId, role, hasComparison: !!comparison });
    logger.end();

    return res.json({
      ok: true,
      waybill: updatedPayload,
      comparison: comparison || null,
    });
  } catch (error: any) {
    logger.error('waybill upload error', { error: error?.message });
    logger.end();
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error?.message || 'İrsaliye yüklenemedi',
    });
  }
});

router.get('/:demandId',
  verifyToken,
  requirePremium,
  validateRequest({ params: uploadParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('waybill:get');
  try {
    const { demandId } = req.params;
    const userId = req.user?.uid;
    const companyId = req.user?.activeCompanyId;

    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Oturum gerekli' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Veritabanı kullanılamıyor' });
    }

    // CHECK AUTHORIZATION
    const auth = await getAuthorizedWaybillAccess(db, demandId, userId as string, companyId);
    if (!auth.authorized) {
      return res.status(403).json({ 
        error: 'FORBIDDEN', 
        message: 'Bu talebin irsaliye bilgilerine sadece alıcı ve kazanan tedarikçi erişebilir.' 
      });
    }

    const snap = await db.collection('waybills').doc(demandId).get();
    
    if (!snap.exists) {
      logger.info('waybill not found (expected)', { demandId });
      logger.end();
      return res.status(200).json({ ok: true, data: null, exists: false });
    }

    logger.info('waybill fetched', { demandId });
    logger.end();
    return res.json({ ok: true, data: snap.data(), exists: true });
  } catch (error: any) {
    logger.error('waybill get error', { error: error?.message });
    logger.end();
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error?.message || 'Sunucu hatası' });
  }
});

export default router;


