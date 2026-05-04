// Teklifbul Rule v1.0 - Contracts (Sözleşmeler) Yönetim Sistemi
import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import ExcelJS from 'exceljs';
// Teklifbul Rule v1.0 - Input Validation
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();

// Tüm route'lar authentication gerektirir
router.use(verifyToken);

/**
 * Company ID helper - Teklifbul Rule v1.0
 */
async function getCompanyId(req: AuthenticatedRequest): Promise<string | null> {
  const userId = req.user?.uid;
  if (!userId) return null;

  const db = await getAdminDb();
  if (!db) return null;

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;

  const userData = userDoc.data();
  return userData?.companyId || userData?.activeCompanyId || null;
}

// Teklifbul Rule v1.0 - Input Validation Schema for list
const listQuerySchema = z.object({
  siteId: z.string().min(1).optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

/**
 * Contracts listesi - GET /api/contracts
 */
router.get('/',
  validateRequest({ query: listQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:list');
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Kullanıcı doğrulanamadı' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
    }

    // Filtreleme parametreleri
    const { siteId, status, search } = req.query;

    let query: any = db.collection('contracts')
      .where('companyId', '==', companyId);

    if (siteId) {
      query = query.where('siteId', '==', siteId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    let contracts: any[] = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString(),
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString(),
    }));

    // Client-side search (contractName, contractNo)
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      contracts = contracts.filter((c: any) => 
        (c.contractName || '').toLowerCase().includes(searchTerm) ||
        (c.contractNo || '').toLowerCase().includes(searchTerm)
      );
    }

    logger.info('Sözleşmeler listelendi', { count: contracts.length, companyId });
    logger.end();
    return res.json({ contracts });
  } catch (error: any) {
    logger.error('Sözleşme listesi hatası', error);
    logger.end();
    return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
  }
});

// Teklifbul Rule v1.0 - Input Validation Schema for get by id
const contractIdParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * Contract detayı - GET /api/contracts/:id
 */
router.get('/:id',
  validateRequest({ params: contractIdParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:get');
  try {
    const userId = req.user?.uid;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const doc = await db.collection('contracts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const data = doc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (data?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    logger.info('Sözleşme detayı alındı', { id });
    logger.end();
    return res.json({
      id: doc.id,
      ...data,
      createdAt: data?.createdAt?.toDate?.()?.toISOString(),
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString(),
    });
  } catch (error: any) {
    logger.error('Sözleşme detay hatası', error);
    logger.end();
    return res.status(500).json({ error: 'GET_ERROR', message: error.message });
  }
});

// Teklifbul Rule v1.0 - Input Validation Schema for create
const createBodySchema = z.object({
  contractNo: z.string().optional(),
  contractName: z.string().min(1),
  siteId: z.string().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  contractValue: z.coerce.number().min(0).optional().default(0),
  kdvRate: z.coerce.number().min(0).max(100).optional().default(20),
  stopajRate: z.coerce.number().min(0).max(100).optional().default(5),
  guaranteeRate: z.coerce.number().min(0).max(100).optional().default(6),
  advanceRate: z.coerce.number().min(0).max(100).optional().default(10),
  status: z.string().optional().default('active'),
});

/**
 * Yeni sözleşme oluştur - POST /api/contracts
 */
router.post('/',
  validateRequest({ body: createBodySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:create');
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Kullanıcı doğrulanamadı' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
    }

    const {
      contractNo,
      contractName,
      siteId,
      startDate,
      endDate,
      contractValue = 0,
      kdvRate = 20,
      stopajRate = 5,
      guaranteeRate = 6,
      advanceRate = 10,
      status = 'active',
    } = req.body;

    // Validasyon
    if (!contractName) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Sözleşme adı zorunludur' });
    }

    // Contract numarası otomatik oluştur (yoksa)
    let finalContractNo = contractNo;
    if (!finalContractNo) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      
      // Aynı ay içindeki sözleşme sayısını bul
      const monthStart = new Date(year, now.getMonth(), 1);
      const monthEnd = new Date(year, now.getMonth() + 1, 0);
      const existingContracts = await db.collection('contracts')
        .where('companyId', '==', companyId)
        .where('createdAt', '>=', monthStart)
        .where('createdAt', '<=', monthEnd)
        .get();
      
      const sequenceNumber = String(existingContracts.size + 1).padStart(3, '0');
      finalContractNo = `SOZ-${year}-${month}-${sequenceNumber}`;
    }

    const contractData = {
      companyId,
      contractNo: finalContractNo,
      contractName,
      siteId: siteId || null,
      startDate: startDate || null,
      endDate: endDate || null,
      contractValue: Number(contractValue) || 0,
      kdvRate: Number(kdvRate) || 20,
      stopajRate: Number(stopajRate) || 5,
      guaranteeRate: Number(guaranteeRate) || 6,
      advanceRate: Number(advanceRate) || 10,
      status: status || 'active',
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('contracts').add(contractData);

    logger.info('Yeni sözleşme oluşturuldu', { id: docRef.id, contractNo: finalContractNo });
    logger.end();
    return res.status(201).json({ id: docRef.id, ...contractData });
  } catch (error: any) {
    logger.error('Sözleşme oluşturma hatası', error);
    logger.end();
    return res.status(500).json({ error: 'CREATE_ERROR', message: error.message });
  }
});

// Teklifbul Rule v1.0 - Input Validation Schema for update
const updateBodySchema = z.object({
  contractNo: z.string().optional(),
  contractName: z.string().min(1).optional(),
  siteId: z.string().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  contractValue: z.coerce.number().min(0).optional(),
  kdvRate: z.coerce.number().min(0).max(100).optional(),
  stopajRate: z.coerce.number().min(0).max(100).optional(),
  guaranteeRate: z.coerce.number().min(0).max(100).optional(),
  advanceRate: z.coerce.number().min(0).max(100).optional(),
  status: z.string().optional(),
});

/**
 * Sözleşme güncelle - PUT /api/contracts/:id
 */
router.put('/:id',
  validateRequest({ params: contractIdParamsSchema, body: updateBodySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:update');
  try {
    const userId = req.user?.uid;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const doc = await db.collection('contracts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const data = doc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (data?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId,
    };

    await db.collection('contracts').doc(id).update(updateData);

    logger.info('Sözleşme güncellendi', { id });
    logger.end();
    return res.json({ id, ...updateData });
  } catch (error: any) {
    logger.error('Sözleşme güncelleme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
  }
});

/**
 * Sözleşme sil - DELETE /api/contracts/:id
 */
router.delete('/:id',
  validateRequest({ params: contractIdParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:delete');
  try {
    const userId = req.user?.uid;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const doc = await db.collection('contracts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const data = doc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (data?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    // Sözleşme pozlarını da sil (subcollection)
    const itemsSnapshot = await db.collection('contracts').doc(id).collection('items').get();
    const deletePromises = itemsSnapshot.docs.map(itemDoc => itemDoc.ref.delete());
    await Promise.all(deletePromises);

    // Sözleşmeyi sil
    await db.collection('contracts').doc(id).delete();

    logger.info('Sözleşme silindi', { id, itemsDeleted: itemsSnapshot.docs.length });
    logger.end();
    return res.json({ ok: true, itemsDeleted: itemsSnapshot.docs.length });
  } catch (error: any) {
    logger.error('Sözleşme silme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
  }
});

/**
 * Sözleşme pozları listesi - GET /api/contracts/:id/items
 */
router.get('/:id/items',
  validateRequest({ params: contractIdParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:items-list');
  try {
    const userId = req.user?.uid;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Sözleşme kontrolü
    const contractDoc = await db.collection('contracts').doc(id).get();
    if (!contractDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const contractData = contractDoc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (contractData?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    // Pozları al
    const itemsSnapshot = await db.collection('contracts').doc(id).collection('items').get();
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString(),
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString(),
    }));

    logger.info('Sözleşme pozları alındı', { contractId: id, count: items.length });
    logger.end();
    return res.json({ items });
  } catch (error: any) {
    logger.error('Sözleşme pozları listesi hatası', error);
    logger.end();
    return res.status(500).json({ error: 'ITEMS_LIST_ERROR', message: error.message });
  }
});

// Teklifbul Rule v1.0 - Input Validation Schema for item create
const itemCreateBodySchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0).optional().default(0),
  contractQtyLimit: z.coerce.number().min(0).optional().nullable(),
});

/**
 * Sözleşme poz ekle - POST /api/contracts/:id/items
 */
router.post('/:id/items',
  validateRequest({ params: contractIdParamsSchema, body: itemCreateBodySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:item-create');
  try {
    const userId = req.user?.uid;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Sözleşme kontrolü
    const contractDoc = await db.collection('contracts').doc(id).get();
    if (!contractDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const contractData = contractDoc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (contractData?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    const {
      code,
      description,
      unit,
      unitPrice = 0,
      contractQtyLimit = null,
    } = req.body;

    // Validasyon
    if (!code || !description || !unit) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Poz kodu, açıklama ve birim zorunludur' });
    }

    const itemData = {
      code: String(code).trim(),
      description: String(description).trim(),
      unit: String(unit).trim(),
      unitPrice: Number(unitPrice) || 0,
      contractQtyLimit: contractQtyLimit ? Number(contractQtyLimit) : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: userId,
    };

    const itemRef = await db.collection('contracts').doc(id).collection('items').add(itemData);

    logger.info('Sözleşme poz eklendi', { contractId: id, itemId: itemRef.id, code });
    logger.end();
    return res.status(201).json({ id: itemRef.id, ...itemData });
  } catch (error: any) {
    logger.error('Sözleşme poz ekleme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'ITEM_CREATE_ERROR', message: error.message });
  }
});

// Teklifbul Rule v1.0 - Input Validation Schema for item update/delete
const itemIdParamsSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
});

const itemUpdateBodySchema = z.object({
  code: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  contractQtyLimit: z.coerce.number().min(0).optional().nullable(),
});

/**
 * Sözleşme poz güncelle - PUT /api/contracts/:id/items/:itemId
 */
router.put('/:id/items/:itemId',
  validateRequest({ params: itemIdParamsSchema, body: itemUpdateBodySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:item-update');
  try {
    const userId = req.user?.uid;
    const { id, itemId } = req.params;

    if (!userId || !id || !itemId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Sözleşme kontrolü
    const contractDoc = await db.collection('contracts').doc(id).get();
    if (!contractDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const contractData = contractDoc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (contractData?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    // Poz kontrolü
    const itemDoc = await db.collection('contracts').doc(id).collection('items').doc(itemId).get();
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Poz bulunamadı' });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId,
    };

    await db.collection('contracts').doc(id).collection('items').doc(itemId).update(updateData);

    logger.info('Sözleşme poz güncellendi', { contractId: id, itemId });
    logger.end();
    return res.json({ id: itemId, ...updateData });
  } catch (error: any) {
    logger.error('Sözleşme poz güncelleme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'ITEM_UPDATE_ERROR', message: error.message });
  }
});

/**
 * Sözleşme poz sil - DELETE /api/contracts/:id/items/:itemId
 */
router.delete('/:id/items/:itemId',
  validateRequest({ params: itemIdParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:item-delete');
  try {
    const userId = req.user?.uid;
    const { id, itemId } = req.params;

    if (!userId || !id || !itemId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Sözleşme kontrolü
    const contractDoc = await db.collection('contracts').doc(id).get();
    if (!contractDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const contractData = contractDoc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (contractData?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    // Poz kontrolü
    const itemDoc = await db.collection('contracts').doc(id).collection('items').doc(itemId).get();
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Poz bulunamadı' });
    }

    await db.collection('contracts').doc(id).collection('items').doc(itemId).delete();

    logger.info('Sözleşme poz silindi', { contractId: id, itemId });
    logger.end();
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error('Sözleşme poz silme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'ITEM_DELETE_ERROR', message: error.message });
  }
});

/**
 * Metraj Excel Şablonu İndir - GET /api/contracts/:id/metraj-template
 * Teklifbul Rule v1.0 - Hakediş için Excel metraj şablonu oluşturur
 */
router.get('/:id/metraj-template',
  validateRequest({ params: contractIdParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('contracts:metraj-template');
  try {
    const userId = req.user?.uid;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Sözleşme kontrolü
    const contractDoc = await db.collection('contracts').doc(id).get();
    if (!contractDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Sözleşme bulunamadı' });
    }

    const contractData = contractDoc.data();
    
    // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
    const companyId = await getCompanyId(req);
    if (contractData?.companyId !== companyId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
    }

    // Pozları al
    const itemsSnapshot = await db.collection('contracts').doc(id).collection('items').get();
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (items.length === 0) {
      return res.status(400).json({ error: 'NO_ITEMS', message: 'Sözleşmede poz bulunmuyor. Önce poz ekleyiniz.' });
    }

    // Excel şablonu oluştur
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Metraj');

    // Başlık satırı
    worksheet.addRow(['PozNo', 'Açıklama', 'Birim', 'Birim Fiyat', 'Bu Hakediş Miktarı']);
    
    // Başlık stil
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Pozları ekle
    items.forEach((item: any) => {
      const row = worksheet.addRow([
        item.code || '',
        item.description || '',
        item.unit || '',
        item.unitPrice || 0,
        '' // Bu Hakediş Miktarı - kullanıcı dolduracak
      ]);

      // A-D kolonları readonly (protection)
      row.getCell(1).protection = { locked: true }; // PozNo
      row.getCell(2).protection = { locked: true }; // Açıklama
      row.getCell(3).protection = { locked: true }; // Birim
      row.getCell(4).protection = { locked: true }; // Birim Fiyat
      row.getCell(5).protection = { locked: false }; // Bu Hakediş Miktarı - düzenlenebilir

      // Sayı formatları
      row.getCell(4).numFmt = '#,##0.00'; // Birim Fiyat
      row.getCell(5).numFmt = '#,##0.00'; // Bu Hakediş Miktarı
    });

    // Kolon genişlikleri
    worksheet.getColumn(1).width = 15; // PozNo
    worksheet.getColumn(2).width = 40; // Açıklama
    worksheet.getColumn(3).width = 12; // Birim
    worksheet.getColumn(4).width = 15; // Birim Fiyat
    worksheet.getColumn(5).width = 20; // Bu Hakediş Miktarı

    // Worksheet'i koruma altına al (sadece E kolonu düzenlenebilir)
    worksheet.protect('', {
      selectLockedCells: false,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
    });

    // Excel dosyasını buffer'a yaz
    const buffer = await workbook.xlsx.writeBuffer();

    // Dosya adı
    const contractNo = contractData?.contractNo || id;
    const filename = `metraj-sablon-${contractNo}.xlsx`;

    // Response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    // Teklifbul Rule v1.0 - ExcelJS Buffer tipi 'length' yerine 'byteLength' kullaniyor
    res.setHeader('Content-Length', (buffer as any).byteLength ?? (buffer as any).length ?? 0);

    logger.info('Metraj şablonu oluşturuldu', { contractId: id, itemCount: items.length, filename });
    logger.end();
    return res.send(buffer);
  } catch (error: any) {
    logger.error('Metraj şablonu oluşturma hatası', error);
    logger.end();
    return res.status(500).json({ error: 'TEMPLATE_ERROR', message: error.message });
  }
});

export default router;
