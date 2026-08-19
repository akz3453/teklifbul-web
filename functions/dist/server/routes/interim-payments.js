// Teklifbul Rule v1.0 - Hakediş Yönetim Sistemi
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requirePremiumPlus } from '../middleware/requirePremiumPlus.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { sendChat } from '../ai/index.js';
import { getUserAIProvider } from '../services/userService.js';
import { consumeTokensTransactional } from '../services/aiTokenPackService.js';
import { logAiUsage } from '../services/aiUsageService.js';
import { getUserPlan } from '../services/userService.js';
import multer from 'multer';
import { getAdminStorage, uploadFile, deleteFile } from '../utils/storage.js';
// Teklifbul Rule v1.0 - Input Validation
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
const router = Router();
/** UI date (YYYY-MM-DD) veya ISO datetime → ISO string */
function normalizeDateInput(val, endOfDay = false) {
    const v = String(val || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return endOfDay ? `${v}T23:59:59.999Z` : `${v}T00:00:00.000Z`;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
        throw new Error('Geçersiz tarih formatı');
    }
    return d.toISOString();
}
const dateOrDateTimeSchema = z.string().min(1).transform((val, ctx) => {
    try {
        return normalizeDateInput(val, false);
    }
    catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz tarih formatı' });
        return z.NEVER;
    }
});
const dateOrDateTimeEndSchema = z.string().min(1).transform((val, ctx) => {
    try {
        return normalizeDateInput(val, true);
    }
    catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz tarih formatı' });
        return z.NEVER;
    }
});
/** UI `sent` (muhasebeye gönderildi); `paid` geriye dönük uyumluluk */
const interimStatusSchema = z.enum([
    'draft',
    'pending',
    'approved',
    'rejected',
    'sent',
    'paid',
    'cancelled',
]);
// Teklifbul Rule v1.0 — status burada YOK; onay/red/gönder ayrı route'larda
const INTERIM_UPDATE_ALLOWLIST = [
    'siteId',
    'contractId',
    'periodStart',
    'periodEnd',
    'items',
    'costs',
    'deductions',
    'summary',
    'previousTotal',
    'contractValue',
    'siteName',
    'contractName',
];
async function enrichPaymentsWithNames(db, payments) {
    if (!payments.length)
        return payments;
    const siteIds = [...new Set(payments.map((p) => p.siteId).filter(Boolean))];
    const contractIds = [...new Set(payments.map((p) => p.contractId).filter(Boolean))];
    const siteNameById = new Map();
    const contractNameById = new Map();
    await Promise.all([
        ...siteIds.map(async (id) => {
            try {
                const snap = await db.collection('stock_locations').doc(id).get();
                if (snap.exists) {
                    const d = snap.data() || {};
                    siteNameById.set(id, d.title || d.siteName || d.name || id);
                }
            }
            catch {
                /* ignore */
            }
        }),
        ...contractIds.map(async (id) => {
            try {
                const snap = await db.collection('contracts').doc(id).get();
                if (snap.exists) {
                    const d = snap.data() || {};
                    contractNameById.set(id, d.contractName || d.name || d.contractNo || id);
                }
            }
            catch {
                /* ignore */
            }
        }),
    ]);
    return payments.map((p) => ({
        ...p,
        siteName: p.siteName || siteNameById.get(p.siteId) || p.siteId || '-',
        contractName: p.contractName || contractNameById.get(p.contractId) || p.contractId || '-',
    }));
}
// Multer upload middleware - Teklifbul Rule v1.0 - Dosya yükleme için
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // İzin verilen dosya tipleri
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Geçersiz dosya tipi. Sadece resim, PDF, Word ve Excel dosyaları yüklenebilir.'));
        }
    }
});
// Tüm route'lar Premium Plus gerektirir
router.use(verifyToken);
router.use(requirePremiumPlus);
// Teklifbul Rule v1.0 - Input Validation Schema
const listQuerySchema = z.object({
    siteId: z.string().min(1).optional(),
    contractId: z.string().min(1).optional(),
    status: interimStatusSchema.optional(),
    periodStart: dateOrDateTimeSchema.optional(),
    periodEnd: dateOrDateTimeEndSchema.optional(),
    paymentNumber: z.string().min(1).optional(),
    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),
    siteIds: z.string().optional(), // Comma-separated
    contractIds: z.string().optional(), // Comma-separated
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
});
/**
 * Hakediş listesi - GET /api/interim-payments
 */
router.get('/', validateRequest({ query: listQuerySchema }), async (req, res) => {
    logger.group('interim-payments:list');
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Kullanıcı doğrulanamadı' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Kullanıcının şirket ID'sini al
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
        }
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(400).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        // Teklifbul Rule v1.0 - Gelişmiş filtreleme
        const { siteId, contractId, status, periodStart, periodEnd, paymentNumber, // Hakediş numarasına göre arama
        minAmount, // Minimum tutar
        maxAmount, // Maximum tutar
        siteIds, // Birden fazla şantiye (comma-separated)
        contractIds, // Birden fazla sözleşme (comma-separated)
        limit = 50, offset = 0, } = req.query;
        let query = db.collection('interim_payments')
            .where('companyId', '==', companyId);
        // Tek şantiye filtresi (geriye dönük uyumluluk)
        if (siteId && !siteIds) {
            query = query.where('siteId', '==', siteId);
        }
        // Birden fazla şantiye filtresi
        if (siteIds) {
            const siteIdArray = siteIds.split(',').filter(id => id.trim());
            if (siteIdArray.length > 0) {
                // Firestore 'in' operatörü maksimum 10 değer kabul eder
                if (siteIdArray.length <= 10) {
                    query = query.where('siteId', 'in', siteIdArray);
                }
                else {
                    // 10'dan fazla şantiye varsa, client-side filtreleme yapacağız
                    // Şimdilik ilk 10'unu al
                    query = query.where('siteId', 'in', siteIdArray.slice(0, 10));
                }
            }
        }
        // Tek sözleşme filtresi (geriye dönük uyumluluk)
        if (contractId && !contractIds) {
            query = query.where('contractId', '==', contractId);
        }
        // Birden fazla sözleşme filtresi
        if (contractIds) {
            const contractIdArray = contractIds.split(',').filter(id => id.trim());
            if (contractIdArray.length > 0 && contractIdArray.length <= 10) {
                query = query.where('contractId', 'in', contractIdArray);
            }
        }
        if (status) {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.get();
        const payments = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString(),
            updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString(),
            periodStart: doc.data().periodStart,
            periodEnd: doc.data().periodEnd,
        }));
        // Teklifbul Rule v1.0 - Client-side gelişmiş filtreleme
        let filteredPayments = payments;
        // Hakediş numarasına göre arama (client-side)
        if (paymentNumber) {
            const searchTerm = paymentNumber.toLowerCase();
            filteredPayments = filteredPayments.filter((p) => p.paymentNumber?.toLowerCase().includes(searchTerm));
        }
        // Tutar aralığına göre filtreleme (client-side)
        if (minAmount || maxAmount) {
            const min = minAmount ? parseFloat(minAmount) : 0;
            const max = maxAmount ? parseFloat(maxAmount) : Infinity;
            filteredPayments = filteredPayments.filter((p) => {
                const netAmount = p.summary?.netAmount || p.summary?.totalAmount || 0;
                return netAmount >= min && netAmount <= max;
            });
        }
        // Birden fazla şantiye filtresi (10'dan fazla varsa client-side)
        if (siteIds) {
            const siteIdArray = siteIds.split(',').filter(id => id.trim());
            if (siteIdArray.length > 10) {
                filteredPayments = filteredPayments.filter((p) => siteIdArray.includes(p.siteId));
            }
        }
        // Client-side tarih filtresi (Firestore index gerektirmemek için)
        // Önceki filtrelerin üzerine yazmamak için filteredPayments üzerinden zincirle
        if (periodStart || periodEnd) {
            filteredPayments = filteredPayments.filter((p) => {
                try {
                    const pStart = p.periodStart
                        ? normalizeDateInput(String(p.periodStart).includes('T')
                            ? String(p.periodStart)
                            : String(p.periodStart).slice(0, 10), false)
                        : null;
                    const pEnd = p.periodEnd
                        ? normalizeDateInput(String(p.periodEnd).includes('T')
                            ? String(p.periodEnd)
                            : String(p.periodEnd).slice(0, 10), true)
                        : null;
                    if (periodStart && pStart && pStart < String(periodStart))
                        return false;
                    if (periodEnd && pEnd && pEnd > String(periodEnd))
                        return false;
                    return true;
                }
                catch {
                    return true;
                }
            });
        }
        const total = filteredPayments.length;
        const pageLimit = Number(limit) || 50;
        const pageOffset = Number(offset) || 0;
        const pageItems = filteredPayments.slice(pageOffset, pageOffset + pageLimit);
        const enriched = await enrichPaymentsWithNames(db, pageItems);
        logger.info('Hakedişler listelendi', { count: enriched.length, total, limit: pageLimit, offset: pageOffset });
        logger.end();
        return res.json({
            payments: enriched,
            total,
            limit: pageLimit,
            offset: pageOffset,
        });
    }
    catch (error) {
        logger.error('Hakediş listesi hatası', error);
        logger.end();
        return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
    }
});
/**
 * Hakediş önerileri - GET /api/interim-payments/suggestions
 * Son hakediş tarihinden sonra yeni metraj, stok veya gider hareketi oluşan projeler için öneriler
 * Teklifbul Rule v1.0 - Route sıralaması: /suggestions route'u /:id route'undan ÖNCE olmalı
 */
// Teklifbul Rule v1.0 - Input Validation Schema for suggestions
const suggestionsQuerySchema = z.object({
    siteId: z.string().min(1).optional(),
    contractId: z.string().min(1).optional(),
});
router.get('/suggestions', validateRequest({ query: suggestionsQuerySchema }), async (req, res) => {
    logger.group('interim-payments:suggestions');
    // Kontekst bilgilerini üst scope'ta tutalım ki hata durumunda loglayabilelim
    let userId;
    let companyId;
    try {
        userId = req.user?.uid;
        const hasAuthHeader = Boolean(req.headers.authorization);
        if (!userId) {
            logger.error('interim-payments:suggestions unauthorized request', {
                path: req.path,
                query: req.query,
                context: {
                    userId,
                    companyId: null,
                    hasAuthHeader
                }
            });
            return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        }
        const db = await getAdminDb();
        if (!db) {
            logger.error('interim-payments:suggestions - getAdminDb returned null', {
                path: req.path,
                query: req.query,
                context: {
                    userId,
                    companyId: null,
                    hasAuthHeader,
                    env: {
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        nodeEnv: process.env.NODE_ENV
                    }
                }
            });
            return res.status(500).json({
                error: 'Database connection is not available',
                code: 'DB_UNAVAILABLE'
            });
        }
        // Kullanıcının şirket ID'sini al
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            logger.error('interim-payments:suggestions - user not found', {
                path: req.path,
                context: {
                    userId,
                    hasAuthHeader
                }
            });
            return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        }
        const userData = userDoc.data();
        // Güvenlik: query companyId'ye güvenme — her zaman kullanıcının şirketi
        companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            logger.error('interim-payments:suggestions - companyId missing', {
                path: req.path,
                query: req.query,
                context: {
                    userId,
                    companyId,
                    hasAuthHeader
                }
            });
            return res.status(400).json({
                error: 'companyId required',
                code: 'COMPANY_ID_REQUIRED'
            });
        }
        logger.info('interim-payments:suggestions - context', {
            path: req.path,
            query: req.query,
            context: {
                userId,
                companyId,
                hasAuthHeader
            }
        });
        // Şantiyeleri al (stock_locations koleksiyonundan)
        const sitesSnapshot = await db.collection('stock_locations')
            .where('companyId', '==', companyId)
            .where('type', 'in', ['warehouse', 'site'])
            .get();
        const sites = sitesSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const suggestions = [];
        // Her şantiye için kontrol et
        for (const site of sites) {
            if (site.isActive === false)
                continue;
            // Bu şantiye için son hakedişi bul
            const lastPaymentSnapshot = await db.collection('interim_payments')
                .where('companyId', '==', companyId)
                .where('siteId', '==', site.id)
                .orderBy('periodEnd', 'desc')
                .limit(1)
                .get();
            const lastPayment = lastPaymentSnapshot.empty ? null : lastPaymentSnapshot.docs[0].data();
            const lastPaymentDate = lastPayment?.periodEnd ? new Date(lastPayment.periodEnd) : null;
            // Son hakedişten sonraki tarih aralığını belirle
            const now = new Date();
            const periodStart = lastPaymentDate || new Date(now.getFullYear(), now.getMonth(), 1);
            const periodEnd = now;
            // Bu dönemde stok hareketi var mı kontrol et
            const movementsSnapshot = await db.collection('stock_movements')
                .where('companyId', '==', companyId)
                .where('siteId', '==', site.id)
                .where('createdAt', '>=', periodStart)
                .where('createdAt', '<=', periodEnd)
                .limit(1)
                .get();
            // Bu dönemde gider var mı kontrol et (invoices koleksiyonundan)
            let costAmount = 0;
            try {
                const invoicesSnapshot = await db.collection('invoices')
                    .where('companyId', '==', companyId)
                    .where('siteId', '==', site.id)
                    .where('invoiceDate', '>=', periodStart)
                    .where('invoiceDate', '<=', periodEnd)
                    .get();
                costAmount = invoicesSnapshot.docs.reduce((sum, doc) => {
                    const data = doc.data();
                    return sum + (data.totalAmount || data.amount || 0);
                }, 0);
            }
            catch (error) {
                logger.warn('Gider hesaplama hatası', { siteId: site.id, error });
            }
            if (!movementsSnapshot.empty || lastPaymentDate === null || costAmount > 0) {
                // Sözleşme bilgisini al (varsa)
                const contractsSnapshot = await db.collection('contracts')
                    .where('companyId', '==', companyId)
                    .where('siteId', '==', site.id)
                    .limit(1)
                    .get();
                const contractDoc = contractsSnapshot.empty ? null : contractsSnapshot.docs[0];
                const contract = contractDoc ? { id: contractDoc.id, ...contractDoc.data() } : null;
                // Sözleşme pozlarını al ve tahmini tutarı hesapla
                let estimatedAmount = 0;
                if (contract && contract.id) {
                    try {
                        // Teklifbul Rule v1.0 - Limit ekle (performans için)
                        const itemsSnapshot = await db.collection('contracts').doc(contract.id).collection('items').limit(500).get();
                        const contractItems = itemsSnapshot.docs.map(doc => doc.data());
                        // Bu dönemdeki stok hareketlerinden metraj çıkar
                        const periodMovements = await db.collection('stock_movements')
                            .where('companyId', '==', companyId)
                            .where('siteId', '==', site.id)
                            .where('type', '==', 'OUT')
                            .where('createdAt', '>=', periodStart)
                            .where('createdAt', '<=', periodEnd)
                            .get();
                        // Poz bazlı metraj topla
                        const itemQuantities = new Map();
                        periodMovements.docs.forEach(doc => {
                            const movement = doc.data();
                            const itemCode = movement.itemCode || movement.code;
                            if (itemCode) {
                                const current = itemQuantities.get(itemCode) || 0;
                                itemQuantities.set(itemCode, current + (movement.quantity || 0));
                            }
                        });
                        // Tahmini tutarı hesapla (poz bazlı birim fiyat × metraj)
                        estimatedAmount = contractItems.reduce((sum, item) => {
                            const quantity = itemQuantities.get(item.code) || 0;
                            const unitPrice = item.unitPrice || 0;
                            return sum + (quantity * unitPrice);
                        }, 0);
                    }
                    catch (error) {
                        logger.warn('Tahmini tutar hesaplama hatası', { contractId: contract.id, error });
                    }
                }
                suggestions.push({
                    siteId: site.id,
                    siteName: site.siteName || site.title || 'İsimsiz Şantiye',
                    contractId: contract?.id || null,
                    contractName: contract?.name || contract?.contractName || 'Sözleşme Yok',
                    lastPaymentDate: lastPaymentDate?.toISOString() || null,
                    suggestedPeriodStart: periodStart.toISOString(),
                    suggestedPeriodEnd: periodEnd.toISOString(),
                    estimatedAmount: estimatedAmount > 0 ? estimatedAmount : null,
                    costAmount: costAmount > 0 ? costAmount : null,
                });
            }
        }
        logger.info('Hakediş önerileri oluşturuldu', { count: suggestions.length });
        return res.json({ items: suggestions });
    }
    catch (error) {
        const hasAuthHeader = Boolean(req.headers.authorization);
        const errorCode = typeof error?.code === 'string' || typeof error?.code === 'number'
            ? String(error.code)
            : 'SUGGESTIONS_ERROR';
        logger.error('Hakediş önerileri hatası', {
            message: error?.message,
            stack: error?.stack,
            code: errorCode,
            context: {
                userId,
                companyId,
                path: req.path,
                query: req.query,
                hasAuthHeader
            }
        });
        return res.status(500).json({
            error: 'Suggestions fetch failed',
            code: errorCode
        });
    }
    finally {
        logger.end();
    }
});
/**
 * Hakediş detayı - GET /api/interim-payments/:id
 */
// Teklifbul Rule v1.0 - Input Validation Schema for get by id
const getByIdParamsSchema = z.object({
    id: z.string().min(1),
});
router.get('/:id', validateRequest({ params: getByIdParamsSchema }), async (req, res) => {
    logger.group('interim-payments:get');
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
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        logger.info('Hakediş detayı alındı', { id });
        logger.end();
        return res.json({
            id: doc.id,
            ...data,
            createdAt: data?.createdAt?.toDate?.()?.toISOString(),
            updatedAt: data?.updatedAt?.toDate?.()?.toISOString(),
        });
    }
    catch (error) {
        logger.error('Hakediş detay hatası', error);
        logger.end();
        return res.status(500).json({ error: 'GET_ERROR', message: error.message });
    }
});
// Teklifbul Rule v1.0 - Input Validation Schema for create
const createBodySchema = z.object({
    siteId: z.string().min(1),
    contractId: z.string().min(1),
    periodStart: dateOrDateTimeSchema,
    periodEnd: dateOrDateTimeEndSchema,
    status: interimStatusSchema.optional().default('draft'),
    items: z.array(z.any()).optional().default([]),
    costs: z.array(z.any()).optional().default([]),
    deductions: z.record(z.any()).optional().default({}),
    summary: z.record(z.any()).optional().default({}),
    previousTotal: z.coerce.number().min(0).optional().default(0),
    contractValue: z.coerce.number().min(0).optional().default(0),
    siteName: z.string().optional(),
    contractName: z.string().optional(),
});
/**
 * Yeni hakediş oluştur - POST /api/interim-payments
 */
router.post('/', validateRequest({ body: createBodySchema }), async (req, res) => {
    logger.group('interim-payments:create');
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Kullanıcı doğrulanamadı' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Kullanıcının şirket ID'sini al
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
        }
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(400).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        const { siteId, contractId, periodStart, periodEnd, status = 'draft', items = [], costs = [], deductions = {}, summary = {}, previousTotal = 0, contractValue = 0, siteName: bodySiteName, contractName: bodyContractName, } = req.body;
        // Validasyon
        if (!siteId || !contractId || !periodStart || !periodEnd) {
            return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Gerekli alanlar eksik' });
        }
        // Şantiye / sözleşme adlarını kaydet (liste zenginleştirme için)
        let siteName = typeof bodySiteName === 'string' ? bodySiteName.trim() : '';
        let contractName = typeof bodyContractName === 'string' ? bodyContractName.trim() : '';
        try {
            if (!siteName) {
                const siteDoc = await db.collection('stock_locations').doc(siteId).get();
                if (siteDoc.exists) {
                    const d = siteDoc.data() || {};
                    siteName = d.title || d.siteName || d.name || '';
                }
            }
            if (!contractName) {
                const contractDoc = await db.collection('contracts').doc(contractId).get();
                if (contractDoc.exists) {
                    const d = contractDoc.data() || {};
                    contractName = d.contractName || d.name || d.contractNo || '';
                }
            }
        }
        catch (nameErr) {
            logger.warn('Hakediş oluşturma: isim zenginleştirme atlandı', { message: nameErr?.message });
        }
        // Hakediş numarası oluştur (YYYY-MM-XXX formatında)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        // Aynı ay içindeki hakediş sayısını bul
        const monthStart = new Date(year, now.getMonth(), 1);
        const monthEnd = new Date(year, now.getMonth() + 1, 0);
        const existingPayments = await db.collection('interim_payments')
            .where('companyId', '==', companyId)
            .where('createdAt', '>=', monthStart)
            .where('createdAt', '<=', monthEnd)
            .get();
        // Sıra numarasını hesapla (mevcut hakedişlerin sayısına göre)
        const sequenceNumber = String(existingPayments.size + 1).padStart(3, '0');
        const paymentNumber = `${year}-${month}-${sequenceNumber}`;
        const paymentData = {
            companyId,
            siteId,
            contractId,
            siteName: siteName || null,
            contractName: contractName || null,
            paymentNumber,
            periodStart,
            periodEnd,
            status,
            items,
            costs: costs || [],
            deductions: deductions || {},
            summary: summary || {},
            previousTotal: previousTotal || 0,
            contractValue: contractValue || 0,
            createdBy: userId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        const docRef = await db.collection('interim_payments').add(paymentData);
        logger.info('Yeni hakediş oluşturuldu', { id: docRef.id, paymentNumber });
        logger.end();
        return res.status(201).json({ id: docRef.id, ...paymentData });
    }
    catch (error) {
        logger.error('Hakediş oluşturma hatası', error);
        logger.end();
        return res.status(500).json({ error: 'CREATE_ERROR', message: error.message });
    }
});
/**
 * Versiyon kaydetme helper fonksiyonu
 * Teklifbul Rule v1.0 - Versiyon geçmişi yönetimi
 */
async function saveVersion(db, paymentId, currentData, userId, changeReason) {
    try {
        const paymentDoc = await db.collection('interim_payments').doc(paymentId).get();
        if (!paymentDoc.exists)
            return;
        const existingData = paymentDoc.data();
        const versions = existingData.versions || [];
        const nextVersion = versions.length + 1;
        // Mevcut veriyi versiyon olarak kaydet
        const versionData = {
            version: nextVersion,
            data: {
                ...currentData,
                // Timestamp'leri kaldır (versiyon kaydında tutarsızlık olmasın)
                createdAt: existingData.createdAt,
                updatedAt: existingData.updatedAt,
            },
            changedBy: userId,
            changedAt: FieldValue.serverTimestamp(),
            changeReason: changeReason || null,
        };
        versions.push(versionData);
        // Versiyonları güncelle (sadece son 50 versiyonu tut)
        const maxVersions = 50;
        const trimmedVersions = versions.slice(-maxVersions);
        await db.collection('interim_payments').doc(paymentId).update({
            versions: trimmedVersions,
            versionCount: trimmedVersions.length,
        });
        logger.info('Versiyon kaydedildi', { paymentId, version: nextVersion });
    }
    catch (error) {
        logger.warn('Versiyon kaydetme hatası (devam ediliyor)', { error: error.message });
        // Versiyon kaydetme hatası kritik değil, işleme devam et
    }
}
/**
 * Hakediş güncelle - PUT /api/interim-payments/:id
 */
router.put('/:id', async (req, res) => {
    logger.group('interim-payments:update');
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
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Teklifbul Rule v1.0 - Versiyon geçmişi: Güncellemeden önce mevcut veriyi kaydet
        const changeReason = req.body.changeReason || null;
        await saveVersion(db, id, data, userId, changeReason);
        // Allowlist: companyId / createdBy / paymentNumber client'tan yazılamaz
        const updateData = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        for (const key of INTERIM_UPDATE_ALLOWLIST) {
            if (req.body[key] === undefined)
                continue;
            if (key === 'periodStart') {
                updateData.periodStart = normalizeDateInput(String(req.body.periodStart), false);
            }
            else if (key === 'periodEnd') {
                updateData.periodEnd = normalizeDateInput(String(req.body.periodEnd), true);
            }
            else {
                updateData[key] = req.body[key];
            }
        }
        await db.collection('interim_payments').doc(id).update(updateData);
        logger.info('Hakediş güncellendi', { id });
        logger.end();
        return res.json({ id, ...updateData });
    }
    catch (error) {
        logger.error('Hakediş güncelleme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
});
/**
 * Hakediş sil - DELETE /api/interim-payments/:id
 */
router.delete('/:id', validateRequest({ params: getByIdParamsSchema }), async (req, res) => {
    logger.group('interim-payments:delete');
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
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        await db.collection('interim_payments').doc(id).delete();
        logger.info('Hakediş silindi', { id });
        logger.end();
        return res.json({ ok: true });
    }
    catch (error) {
        logger.error('Hakediş silme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
    }
});
/**
 * Hakedişi onaya gönder - POST /api/interim-payments/:id/send-approval
 */
// Teklifbul Rule v1.0 - Input Validation Schema for send-approval
const sendApprovalBodySchema = z.object({
    comment: z.string().optional(),
});
router.post('/:id/send-approval', validateRequest({ params: getByIdParamsSchema, body: sendApprovalBodySchema }), async (req, res) => {
    logger.group('interim-payments:send-approval');
    try {
        const userId = req.user?.uid;
        const { id } = req.params;
        const { comment } = req.body;
        if (!userId || !id) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Status kontrolü - sadece draft hakedişler onaya gönderilebilir
        if (paymentData?.status !== 'draft') {
            return res.status(400).json({
                error: 'INVALID_STATUS',
                message: `Sadece taslak (draft) durumundaki hakedişler onaya gönderilebilir. Mevcut durum: ${paymentData?.status}`
            });
        }
        // Kullanıcı bilgilerini al
        const userEmail = req.user?.email || userData?.email || '';
        // Approval policy'den onaylayıcıları belirle
        const companyDoc = await db.collection('companies').doc(companyId).get();
        const companyData = companyDoc.exists ? companyDoc.data() : {};
        const approvalPolicy = companyData?.approvalPolicy || {};
        // Şirketteki aktif kullanıcıları al
        const activeUsersSnapshot = await db.collection('users')
            .where('companyId', '==', companyId)
            .get();
        const topApproverRoles = approvalPolicy.top_approver_roles || [
            'buyer:genel_mudur',
            'buyer:genel_mudur_yardimcisi',
            'buyer:ceo',
            'buyer:isveren',
            'buyer:yonetim_kurulu_baskani',
            'buyer:yonetim_kurulu_uyesi'
        ];
        // Onaylayıcıları bul
        const approvers = [];
        activeUsersSnapshot.docs.forEach((doc) => {
            const user = doc.data();
            const userRole = user.companyRoleKey || user.companyRole || '';
            if (topApproverRoles.includes(userRole) && user.isActive !== false) {
                approvers.push({
                    userId: doc.id,
                    email: user.email || '',
                    role: userRole
                });
            }
        });
        if (approvers.length === 0) {
            return res.status(400).json({
                error: 'NO_APPROVERS',
                message: 'Şirkette onay yetkisine sahip aktif kullanıcı bulunamadı'
            });
        }
        // Approval history'ye ekle
        const approvalHistory = paymentData?.approvalHistory || [];
        approvalHistory.push({
            userId,
            userEmail,
            action: 'submitted',
            comment: comment || null,
            timestamp: FieldValue.serverTimestamp()
        });
        // Approval objesi oluştur - Teklifbul Rule v1.0
        const approval = {
            pendingApproverUserIds: approvers.map(a => a.userId),
            currentApproverUserId: approvers[0]?.userId || null,
            submittedAt: FieldValue.serverTimestamp(),
            submittedBy: userId,
        };
        // Hakedişi güncelle
        await db.collection('interim_payments').doc(id).update({
            status: 'pending',
            approvalHistory,
            approval, // Teklifbul Rule v1.0 - Yeni approval objesi
            pendingApprovers: approvers.map(a => a.userId), // Geriye dönük uyumluluk
            currentApprover: approvers[0]?.userId || null, // Geriye dönük uyumluluk
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Bildirimler oluştur - Teklifbul Rule v1.0
        const notificationPromises = approvers.map(async (approver) => {
            try {
                await db.collection('notifications').add({
                    companyId,
                    toUserId: approver.userId,
                    type: 'interim_payment_approval_request',
                    refType: 'interim_payment',
                    refId: id,
                    title: 'Hakediş Onay Bekliyor',
                    body: `Hakediş No: ${paymentData.paymentNumber || id} onayınızı bekliyor`,
                    isRead: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
            catch (notifError) {
                logger.warn('Bildirim oluşturulamadı', { approverId: approver.userId, error: notifError.message });
            }
        });
        await Promise.all(notificationPromises);
        logger.info('Hakediş onaya gönderildi', { id, approversCount: approvers.length });
        logger.end();
        return res.json({
            success: true,
            message: 'Hakediş onaya gönderildi',
            approvers: approvers.map(a => ({ userId: a.userId, email: a.email, role: a.role }))
        });
    }
    catch (error) {
        logger.error('Hakediş onaya gönderme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'SEND_APPROVAL_ERROR', message: error.message });
    }
});
/**
 * Hakedişi onayla - POST /api/interim-payments/:id/approve
 */
router.post('/:id/approve', validateRequest({ params: getByIdParamsSchema, body: sendApprovalBodySchema }), async (req, res) => {
    logger.group('interim-payments:approve');
    try {
        const userId = req.user?.uid;
        const { id } = req.params;
        const { comment } = req.body;
        if (!userId || !id) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Status kontrolü - sadece pending hakedişler onaylanabilir
        if (paymentData?.status !== 'pending') {
            return res.status(400).json({
                error: 'INVALID_STATUS',
                message: `Sadece onay bekleyen (pending) hakedişler onaylanabilir. Mevcut durum: ${paymentData?.status}`
            });
        }
        // Kullanıcının onay yetkisi var mı kontrol et
        const pendingApprovers = paymentData?.pendingApprovers || [];
        if (!pendingApprovers.includes(userId)) {
            return res.status(403).json({
                error: 'NO_PERMISSION',
                message: 'Bu hakedişi onaylama yetkiniz yok'
            });
        }
        // Kullanıcı bilgilerini al
        const userEmail = req.user?.email || userData?.email || '';
        const userRole = userData?.companyRoleKey || userData?.companyRole || '';
        // Approval history'ye ekle
        const approvalHistory = paymentData?.approvalHistory || [];
        approvalHistory.push({
            userId,
            userEmail,
            userRole,
            action: 'approved',
            comment: comment || null,
            timestamp: FieldValue.serverTimestamp()
        });
        // Kullanıcıyı pending approvers listesinden çıkar
        const updatedPendingApprovers = pendingApprovers.filter((uid) => uid !== userId);
        // Tüm onaylayıcılar onayladıysa status'u 'approved' yap
        const newStatus = updatedPendingApprovers.length === 0 ? 'approved' : 'pending';
        const nextApprover = updatedPendingApprovers.length > 0 ? updatedPendingApprovers[0] : null;
        // Hakedişi güncelle
        await db.collection('interim_payments').doc(id).update({
            status: newStatus,
            approvalHistory,
            pendingApprovers: updatedPendingApprovers,
            currentApprover: nextApprover,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        logger.info('Hakediş onaylandı', { id, newStatus, remainingApprovers: updatedPendingApprovers.length });
        logger.end();
        return res.json({
            success: true,
            message: newStatus === 'approved' ? 'Hakediş onaylandı' : 'Onayınız kaydedildi',
            newStatus,
            remainingApprovers: updatedPendingApprovers.length
        });
    }
    catch (error) {
        logger.error('Hakediş onaylama hatası', error);
        logger.end();
        return res.status(500).json({ error: 'APPROVE_ERROR', message: error.message });
    }
});
/**
 * Hakedişi reddet - POST /api/interim-payments/:id/reject
 */
router.post('/:id/reject', validateRequest({ params: getByIdParamsSchema, body: sendApprovalBodySchema }), async (req, res) => {
    logger.group('interim-payments:reject');
    try {
        const userId = req.user?.uid;
        const { id } = req.params;
        const { comment } = req.body;
        if (!userId || !id) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'COMMENT_REQUIRED', message: 'Red nedeni belirtilmelidir' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Status kontrolü - sadece pending hakedişler reddedilebilir
        if (paymentData?.status !== 'pending') {
            return res.status(400).json({
                error: 'INVALID_STATUS',
                message: `Sadece onay bekleyen (pending) hakedişler reddedilebilir. Mevcut durum: ${paymentData?.status}`
            });
        }
        // Kullanıcının onay yetkisi var mı kontrol et
        const pendingApprovers = paymentData?.pendingApprovers || [];
        if (!pendingApprovers.includes(userId)) {
            return res.status(403).json({
                error: 'NO_PERMISSION',
                message: 'Bu hakedişi reddetme yetkiniz yok'
            });
        }
        // Kullanıcı bilgilerini al
        const userEmail = req.user?.email || userData?.email || '';
        const userRole = userData?.companyRoleKey || userData?.companyRole || '';
        // Approval history'ye ekle
        const approvalHistory = paymentData?.approvalHistory || [];
        approvalHistory.push({
            userId,
            userEmail,
            userRole,
            action: 'rejected',
            comment: comment.trim(),
            timestamp: FieldValue.serverTimestamp()
        });
        // Approval objesi güncelle - Teklifbul Rule v1.0
        const approval = paymentData?.approval || {};
        const updatedApproval = {
            ...approval,
            pendingApproverUserIds: [],
            currentApproverUserId: null,
            rejectedAt: FieldValue.serverTimestamp(),
            rejectedBy: userId,
            rejectReason: comment.trim(),
        };
        // Hakedişi güncelle - reddedildi, rejected status'a geç
        await db.collection('interim_payments').doc(id).update({
            status: 'rejected',
            approvalHistory,
            approval: updatedApproval, // Teklifbul Rule v1.0 - Güncellenmiş approval objesi
            pendingApprovers: [], // Geriye dönük uyumluluk
            currentApprover: null, // Geriye dönük uyumluluk
            rejectionReason: comment.trim(), // Geriye dönük uyumluluk
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        // Bildirim oluştur - Teklifbul Rule v1.0
        const createdBy = paymentData?.createdBy;
        if (createdBy && createdBy !== userId) {
            try {
                await db.collection('notifications').add({
                    companyId,
                    toUserId: createdBy,
                    type: 'interim_payment_rejected',
                    refType: 'interim_payment',
                    refId: id,
                    title: 'Hakediş Reddedildi',
                    body: `Hakediş No: ${paymentData.paymentNumber || id} reddedildi. Sebep: ${comment.trim()}`,
                    isRead: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
            catch (notifError) {
                logger.warn('Bildirim oluşturulamadı', { createdBy, error: notifError.message });
            }
        }
        logger.info('Hakediş reddedildi', { id, rejectedBy: userId });
        logger.end();
        return res.json({
            success: true,
            message: 'Hakediş reddedildi'
        });
    }
    catch (error) {
        logger.error('Hakediş reddetme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'REJECT_ERROR', message: error.message });
    }
});
/**
 * Hakedişi muhasebeye gönder - POST /api/interim-payments/:id/send-to-accountant
 * Teklifbul Rule v1.0 - Onaylanmış hakedişi muhasebeye gönderir
 */
router.post('/:id/send-to-accountant', validateRequest({ params: getByIdParamsSchema, body: sendApprovalBodySchema }), async (req, res) => {
    logger.group('interim-payments:send-to-accountant');
    try {
        const userId = req.user?.uid;
        const { id } = req.params;
        const { comment } = req.body;
        if (!userId || !id) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Status kontrolü - sadece approved hakedişler muhasebeye gönderilebilir
        if (paymentData?.status !== 'approved') {
            return res.status(400).json({
                error: 'INVALID_STATUS',
                message: `Sadece onaylanmış (approved) hakedişler muhasebeye gönderilebilir. Mevcut durum: ${paymentData?.status}`
            });
        }
        // Kullanıcı bilgilerini al
        const userEmail = req.user?.email || userData?.email || '';
        // Approval history'ye ekle
        const approvalHistory = paymentData?.approvalHistory || [];
        approvalHistory.push({
            userId,
            userEmail,
            action: 'sent',
            comment: comment || null,
            timestamp: FieldValue.serverTimestamp()
        });
        // Hakedişi güncelle
        await db.collection('interim_payments').doc(id).update({
            status: 'sent',
            approvalHistory,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        });
        logger.info('Hakediş muhasebeye gönderildi', { id });
        logger.end();
        return res.json({
            success: true,
            message: 'Hakediş muhasebeye gönderildi'
        });
    }
    catch (error) {
        logger.error('Hakediş muhasebeye gönderme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'SEND_TO_ACCOUNTANT_ERROR', message: error.message });
    }
});
/**
 * Hakediş onay geçmişi - GET /api/interim-payments/:id/approval-history
 */
router.get('/:id/approval-history', async (req, res) => {
    logger.group('interim-payments:approval-history');
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
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        const approvalHistory = paymentData?.approvalHistory || [];
        // Timestamp'leri ISO string'e çevir
        const formattedHistory = approvalHistory.map((entry) => ({
            ...entry,
            timestamp: entry.timestamp?.toDate?.()?.toISOString() || entry.timestamp
        }));
        logger.info('Onay geçmişi alındı', { id, historyCount: formattedHistory.length });
        logger.end();
        // Approval objesi ve bilgileri - Teklifbul Rule v1.0
        const approval = paymentData?.approval || {};
        const pendingApprovers = paymentData?.pendingApprovers || approval.pendingApproverUserIds || [];
        const currentApprover = paymentData?.currentApprover || approval.currentApproverUserId || null;
        // Onaylayıcı bilgilerini al
        const approverInfo = [];
        if (currentApprover) {
            try {
                const approverDoc = await db.collection('users').doc(currentApprover).get();
                if (approverDoc.exists) {
                    const approverData = approverDoc.data();
                    approverInfo.push({
                        userId: currentApprover,
                        name: approverData?.name || approverData?.displayName || '',
                        email: approverData?.email || '',
                    });
                }
            }
            catch (error) {
                logger.warn('Onaylayıcı bilgisi alınamadı', { userId: currentApprover });
            }
        }
        return res.json({
            approvalHistory: formattedHistory,
            currentStatus: paymentData?.status,
            pendingApprovers: pendingApprovers,
            currentApprover: currentApprover,
            currentApproverInfo: approverInfo[0] || null,
            approval: {
                ...approval,
                submittedAt: approval.submittedAt?.toDate?.()?.toISOString(),
                approvedAt: approval.approvedAt?.toDate?.()?.toISOString(),
                rejectedAt: approval.rejectedAt?.toDate?.()?.toISOString(),
            }
        });
    }
    catch (error) {
        logger.error('Onay geçmişi alma hatası', error);
        logger.end();
        return res.status(500).json({ error: 'HISTORY_ERROR', message: error.message });
    }
});
/**
 * Hakediş PDF export - GET /api/interim-payments/:id/export/pdf
 */
router.get('/:id/export/pdf', async (req, res) => {
    logger.group('interim-payments:export-pdf');
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
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Şantiye bilgisini al
        const siteDoc = await db.collection('stock_locations').doc(paymentData.siteId).get();
        const siteData = siteDoc.exists ? siteDoc.data() : {};
        const siteName = siteData?.title || siteData?.siteName || 'Şantiye';
        // Sözleşme bilgisini al
        const contractDoc = await db.collection('contracts').doc(paymentData.contractId).get();
        const contractData = contractDoc.exists ? contractDoc.data() : {};
        const contractName = contractData?.name || contractData?.contractName || 'Sözleşme';
        // Şirket bilgisini al
        const companyDoc = await db.collection('companies').doc(companyId).get();
        const companyData = companyDoc.exists ? companyDoc.data() : {};
        const companyName = companyData?.name || 'Şirket';
        // PDF oluştur - Teklifbul Rule v1.0 - Profesyonel Hakediş Formatı
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            autoFirstPage: false
        });
        // Response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="hakedis-${paymentData.paymentNumber || id}.pdf"`);
        doc.pipe(res);
        // Helper fonksiyonlar
        const formatCurrency = (amount) => {
            return (amount || 0).toLocaleString('tr-TR', {
                style: 'currency',
                currency: 'TRY',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        };
        const formatNumber = (num) => {
            return (num || 0).toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        };
        const addPageNumber = (pageNum, totalPages) => {
            doc.fontSize(8).font('Helvetica');
            doc.text(`Sayfa ${pageNum} / ${totalPages}`, doc.page.width / 2, doc.page.height - 30, {
                align: 'center',
                width: 100
            });
        };
        // Watermark ekle - Teklifbul Rule v1.0
        const addWatermark = (status) => {
            const statusMap = {
                draft: 'TASLAK',
                pending: 'ONAYDA',
                approved: 'ONAYLI',
                sent: 'MUHASEBEYE GÖNDERİLDİ',
                rejected: 'REDDEDİLDİ',
            };
            const watermarkText = statusMap[status] || '';
            if (!watermarkText)
                return;
            // Sayfa ortasında diagonal watermark
            doc.save();
            doc.opacity(0.08); // Düşük opacity (tablonun okunmasını engellemez)
            doc.fontSize(60).font('Helvetica-Bold');
            doc.fillColor('#999999'); // Gri renk
            // Diagonal rotation (45 derece)
            const centerX = doc.page.width / 2;
            const centerY = doc.page.height / 2;
            doc.rotate(45, { origin: [centerX, centerY] });
            doc.text(watermarkText, centerX, centerY, { align: 'center' });
            doc.restore();
            // Renk ve opacity'yi geri al
            doc.fillColor('#000000'); // Siyah
            doc.opacity(1.0);
        };
        // Sayfa sayısını deterministik hesapla - Teklifbul Rule v1.0
        const items = paymentData.items || [];
        const deductions = paymentData.deductions || {};
        // Pozlar için sayfa hesabı
        const tableStartY = 130; // Tablo başlangıç Y pozisyonu
        const rowHeight = 20; // Her satır yüksekliği
        const pageBottom = doc.page.height - 80; // Sayfa alt margin
        const headerHeight = 30; // Başlık + çizgi yüksekliği
        const availableHeight = pageBottom - tableStartY - headerHeight; // Kullanılabilir yükseklik
        const itemsPerPage = Math.floor(availableHeight / rowHeight); // Sayfa başına poz sayısı
        // Pozlar için sayfa sayısı
        const itemsPages = items.length > 0 ? Math.ceil(items.length / itemsPerPage) : 0;
        // Kesintiler için sayfa hesabı
        const deductionsStartY = 150;
        const deductionsLineHeight = 25;
        const deductionsAvailableHeight = pageBottom - deductionsStartY - 50; // Alt margin için
        const deductionsPerPage = Math.floor(deductionsAvailableHeight / deductionsLineHeight);
        let deductionsLines = 0;
        if (deductions.stopajRate !== undefined || deductions.stopajAmount !== undefined)
            deductionsLines++;
        if (deductions.guaranteeRate !== undefined || deductions.guaranteeAmount !== undefined)
            deductionsLines++;
        if (deductions.advanceRate !== undefined || deductions.advanceAmount !== undefined)
            deductionsLines++;
        if (deductions.manualDeductions && Array.isArray(deductions.manualDeductions)) {
            deductionsLines += deductions.manualDeductions.length;
        }
        deductionsLines++; // Toplam satırı
        const deductionsPages = deductionsLines > 0 ? Math.ceil(deductionsLines / deductionsPerPage) : 1;
        // Toplam sayfa sayısı (deterministik)
        const totalPages = 1 + // Ön kapak
            1 + // Dizi pusulası
            1 + // İcmal
            itemsPages + // Pozlar (çarşaf)
            deductionsPages + // Kesintiler
            1; // Arka kapak
        let currentPage = 0;
        // ============================================
        // 1. ÖN KAPAK
        // ============================================
        doc.addPage();
        currentPage++;
        // Watermark ekle - Teklifbul Rule v1.0
        addWatermark(paymentData.status || 'draft');
        doc.rect(50, 50, doc.page.width - 100, doc.page.height - 100).stroke();
        // Logo ekle (varsa) - Teklifbul Rule v1.0
        const logoY = 70;
        if (companyData?.logoUrl) {
            try {
                // Logo URL'den yükleme (PDFKit image desteği için)
                // Not: PDFKit doğrudan URL'den yükleyemez, buffer gerekir
                // Şimdilik logo placeholder olarak bırakılıyor
                // Gelecekte logo buffer olarak saklanırsa buraya eklenebilir
            }
            catch (error) {
                // Logo yükleme hatası PDF'i bozmasın
                logger.warn('Logo yüklenemedi', { error: error.message });
            }
        }
        doc.fontSize(24).font('Helvetica-Bold').text('HAKEDİŞ', doc.page.width / 2, 150, { align: 'center' });
        doc.moveDown(3);
        doc.fontSize(14).font('Helvetica');
        const coverY = 250;
        let coverCurrentY = coverY;
        doc.font('Helvetica-Bold').text('Proje / Şantiye:', 100, coverCurrentY);
        doc.font('Helvetica').text(siteName || '-', 250, coverCurrentY);
        coverCurrentY += 30;
        doc.font('Helvetica-Bold').text('Sözleşme No:', 100, coverCurrentY);
        doc.font('Helvetica').text(contractData?.contractNo || '-', 250, coverCurrentY);
        coverCurrentY += 30;
        doc.font('Helvetica-Bold').text('Hakediş No:', 100, coverCurrentY);
        doc.font('Helvetica').text(paymentData.paymentNumber || '-', 250, coverCurrentY);
        coverCurrentY += 30;
        doc.font('Helvetica-Bold').text('Dönem:', 100, coverCurrentY);
        const periodStart = paymentData.periodStart ? new Date(paymentData.periodStart).toLocaleDateString('tr-TR') : '-';
        const periodEnd = paymentData.periodEnd ? new Date(paymentData.periodEnd).toLocaleDateString('tr-TR') : '-';
        doc.font('Helvetica').text(`${periodStart} - ${periodEnd}`, 250, coverCurrentY);
        coverCurrentY += 30;
        // Yüklenici / Firma bilgileri (zenginleştirilmiş) - Teklifbul Rule v1.0
        doc.font('Helvetica-Bold').text('Yüklenici / Firma:', 100, coverCurrentY);
        const companyInfo = [];
        if (companyName)
            companyInfo.push(companyName);
        if (companyData?.taxNo || companyData?.vergiNo) {
            companyInfo.push(`Vergi No: ${companyData.taxNo || companyData.vergiNo}`);
        }
        if (companyData?.taxOffice || companyData?.vergiDairesi) {
            companyInfo.push(`Vergi Dairesi: ${companyData.taxOffice || companyData.vergiDairesi}`);
        }
        if (companyData?.address || companyData?.adres) {
            companyInfo.push(`Adres: ${(companyData.address || companyData.adres || '').substring(0, 50)}`);
        }
        if (companyData?.phone || companyData?.telefon) {
            companyInfo.push(`Telefon: ${companyData.phone || companyData.telefon}`);
        }
        if (companyInfo.length > 0) {
            doc.font('Helvetica').fontSize(11);
            companyInfo.forEach((info, idx) => {
                doc.text(info, 250, coverCurrentY + (idx * 18), { width: 300 });
            });
            coverCurrentY += companyInfo.length * 18;
        }
        else {
            doc.font('Helvetica').text('-', 250, coverCurrentY);
            coverCurrentY += 30;
        }
        doc.fontSize(14); // Font size'ı geri al
        coverCurrentY += 10;
        doc.font('Helvetica-Bold').text('Tarih:', 100, coverCurrentY);
        const currentDate = new Date().toLocaleDateString('tr-TR');
        doc.font('Helvetica').text(currentDate, 250, coverCurrentY);
        addPageNumber(currentPage, totalPages);
        // ============================================
        // 2. DİZİ PUSULASI
        // ============================================
        doc.addPage();
        currentPage++;
        // Watermark ekle - Teklifbul Rule v1.0
        addWatermark(paymentData.status || 'draft');
        doc.fontSize(18).font('Helvetica-Bold').text('DİZİ PUSULASI', doc.page.width / 2, 80, { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(11).font('Helvetica');
        const tocY = 150;
        let tocCurrentY = tocY;
        const tocLineHeight = 25;
        doc.font('Helvetica-Bold').text('Sıra', 80, tocCurrentY);
        doc.text('Belge Adı', 150, tocCurrentY);
        doc.text('Sayfa', 450, tocCurrentY);
        tocCurrentY += tocLineHeight;
        doc.moveTo(80, tocCurrentY).lineTo(500, tocCurrentY).stroke();
        tocCurrentY += 10;
        // Dizi pusulası sayfa numaraları (deterministik) - Teklifbul Rule v1.0
        const tocItems = [
            { name: 'Ön Kapak', page: 1 },
            { name: 'Dizi Pusulası', page: 2 },
            { name: 'Hakediş İcmali', page: 3 },
            { name: 'Yapılan İşler Listesi (Çarşaf)', page: 4 },
            { name: 'Kesintiler Tablosu', page: 4 + itemsPages },
            { name: 'Arka Kapak', page: 4 + itemsPages + deductionsPages },
        ];
        tocItems.forEach((item, index) => {
            doc.font('Helvetica').text(String(index + 1), 80, tocCurrentY);
            doc.text(item.name, 150, tocCurrentY);
            doc.text(String(item.page), 450, tocCurrentY);
            tocCurrentY += tocLineHeight;
        });
        addPageNumber(currentPage, totalPages);
        // ============================================
        // 3. HAKEDİŞ İCMALİ
        // ============================================
        doc.addPage();
        currentPage++;
        // Watermark ekle - Teklifbul Rule v1.0
        addWatermark(paymentData.status || 'draft');
        doc.fontSize(18).font('Helvetica-Bold').text('HAKEDİŞ İCMALİ', doc.page.width / 2, 80, { align: 'center' });
        doc.moveDown(2);
        const summary = paymentData.summary || {};
        doc.fontSize(12).font('Helvetica');
        const icmalY = 150;
        let icmalCurrentY = icmalY;
        const icmalLineHeight = 30;
        doc.font('Helvetica-Bold').text('Brüt Tutar:', 100, icmalCurrentY);
        doc.font('Helvetica').text(formatCurrency(summary.grossAmount || 0), 300, icmalCurrentY, { align: 'right', width: 200 });
        icmalCurrentY += icmalLineHeight;
        doc.font('Helvetica-Bold').text('Kesintiler Toplamı:', 100, icmalCurrentY);
        doc.font('Helvetica').text(formatCurrency(deductions.total || summary.deductionsTotal || 0), 300, icmalCurrentY, { align: 'right', width: 200 });
        icmalCurrentY += icmalLineHeight;
        doc.font('Helvetica-Bold').text('Net Tutar:', 100, icmalCurrentY);
        doc.font('Helvetica').text(formatCurrency(summary.netAmount || 0), 300, icmalCurrentY, { align: 'right', width: 200 });
        icmalCurrentY += icmalLineHeight;
        doc.font('Helvetica-Bold').text(`KDV (%${summary.kdvRate || 20}):`, 100, icmalCurrentY);
        doc.font('Helvetica').text(formatCurrency(summary.kdvAmount || 0), 300, icmalCurrentY, { align: 'right', width: 200 });
        icmalCurrentY += icmalLineHeight + 10;
        doc.moveTo(100, icmalCurrentY).lineTo(500, icmalCurrentY).stroke();
        icmalCurrentY += 15;
        doc.fontSize(14).font('Helvetica-Bold').text('Ödenecek Toplam:', 100, icmalCurrentY);
        doc.fontSize(14).font('Helvetica-Bold').text(formatCurrency(summary.totalAmount || 0), 300, icmalCurrentY, { align: 'right', width: 200 });
        addPageNumber(currentPage, totalPages);
        // ============================================
        // 4. YAPILAN İŞLER LİSTESİ (ÇARŞAF)
        // ============================================
        doc.addPage();
        currentPage++;
        // Watermark ekle - Teklifbul Rule v1.0
        addWatermark(paymentData.status || 'draft');
        doc.fontSize(18).font('Helvetica-Bold').text('YAPILAN İŞLER LİSTESİ (ÇARŞAF)', doc.page.width / 2, 80, { align: 'center' });
        doc.moveDown(1.5);
        if (items.length > 0) {
            const tableStartY = 130;
            let tableY = tableStartY;
            const rowHeight = 20;
            const pageBottom = doc.page.height - 80; // Sayfa alt margin (sayfa numarası için)
            // Tablo başlıkları
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Poz No', 50, tableY);
            doc.text('Açıklama', 120, tableY);
            doc.text('Önceki', 280, tableY);
            doc.text('Bu Hakediş', 340, tableY);
            doc.text('Toplam', 400, tableY);
            doc.text('Birim Fiyat', 450, tableY);
            doc.text('Tutar', 500, tableY);
            tableY += rowHeight;
            doc.moveTo(50, tableY).lineTo(550, tableY).stroke();
            tableY += 5;
            // Pozlar
            doc.fontSize(8).font('Helvetica');
            let grossTotal = 0;
            items.forEach((item, index) => {
                // Sayfa taşması kontrolü - Teklifbul Rule v1.0
                if (tableY > pageBottom) {
                    doc.addPage();
                    currentPage++;
                    // Watermark ekle - Teklifbul Rule v1.0
                    addWatermark(paymentData.status || 'draft');
                    tableY = tableStartY; // Tablo başlangıç pozisyonuna dön
                    // Yeni sayfada başlıkları tekrar yaz
                    doc.fontSize(9).font('Helvetica-Bold');
                    doc.text('Poz No', 50, tableY);
                    doc.text('Açıklama', 120, tableY);
                    doc.text('Önceki', 280, tableY);
                    doc.text('Bu Hakediş', 340, tableY);
                    doc.text('Toplam', 400, tableY);
                    doc.text('Birim Fiyat', 450, tableY);
                    doc.text('Tutar', 500, tableY);
                    tableY += rowHeight;
                    doc.moveTo(50, tableY).lineTo(550, tableY).stroke();
                    tableY += 5;
                    doc.fontSize(8).font('Helvetica');
                }
                const code = (item.code || '-').substring(0, 12);
                const description = (item.description || '-').substring(0, 25);
                const previousQty = formatNumber(item.previousQuantity || 0);
                const currentQty = formatNumber(item.quantity || 0);
                const totalQty = formatNumber(item.totalQuantity || (item.previousQuantity || 0) + (item.quantity || 0));
                const unitPrice = formatCurrency(item.unitPrice || 0);
                const amount = (item.amount || (item.quantity || 0) * (item.unitPrice || 0));
                grossTotal += amount;
                const amountFormatted = formatCurrency(amount);
                doc.text(code, 50, tableY);
                doc.text(description, 120, tableY, { width: 150 });
                doc.text(previousQty, 280, tableY, { width: 50, align: 'right' });
                doc.text(currentQty, 340, tableY, { width: 50, align: 'right' });
                doc.text(totalQty, 400, tableY, { width: 40, align: 'right' });
                doc.text(unitPrice, 450, tableY, { width: 50, align: 'right' });
                doc.text(amountFormatted, 500, tableY, { width: 50, align: 'right' });
                tableY += rowHeight;
                // Her 5 satırda bir çizgi
                if ((index + 1) % 5 === 0) {
                    doc.moveTo(50, tableY - 2).lineTo(550, tableY - 2).stroke();
                }
            });
            // Toplam satırı
            tableY += 5;
            doc.moveTo(50, tableY).lineTo(550, tableY).stroke();
            tableY += 10;
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('TOPLAM:', 400, tableY);
            doc.text(formatCurrency(grossTotal), 500, tableY, { width: 50, align: 'right' });
            // Son poz sayfasının sayfa numarasını ekle
            addPageNumber(currentPage, totalPages);
        }
        else {
            doc.fontSize(11).font('Helvetica').text('Henüz poz eklenmemiş', doc.page.width / 2, 200, { align: 'center' });
            addPageNumber(currentPage, totalPages);
        }
        // ============================================
        // 5. KESİNTİLER TABLOSU
        // ============================================
        doc.addPage();
        currentPage++;
        doc.fontSize(18).font('Helvetica-Bold').text('KESİNTİLER TABLOSU', doc.page.width / 2, 80, { align: 'center' });
        doc.moveDown(2);
        const deductionsY = 150;
        let deductionsCurrentY = deductionsY;
        const deductionsPageBottom = doc.page.height - 80; // Sayfa alt margin
        doc.fontSize(10).font('Helvetica');
        // Stopaj
        if (deductions.stopajRate !== undefined || deductions.stopajAmount !== undefined) {
            doc.font('Helvetica-Bold').text('Stopaj:', 100, deductionsCurrentY);
            const stopajRate = deductions.stopajRate || 5;
            const stopajAmount = deductions.stopajAmount || (summary.grossAmount || 0) * (stopajRate / 100);
            doc.font('Helvetica').text(`%${stopajRate}`, 200, deductionsCurrentY);
            doc.text(formatCurrency(stopajAmount), 450, deductionsCurrentY, { align: 'right', width: 100 });
            deductionsCurrentY += deductionsLineHeight;
        }
        // Teminat
        if (deductions.guaranteeRate !== undefined || deductions.guaranteeAmount !== undefined) {
            doc.font('Helvetica-Bold').text('Teminat:', 100, deductionsCurrentY);
            const guaranteeRate = deductions.guaranteeRate || 6;
            const guaranteeAmount = deductions.guaranteeAmount || (summary.grossAmount || 0) * (guaranteeRate / 100);
            doc.font('Helvetica').text(`%${guaranteeRate}`, 200, deductionsCurrentY);
            doc.text(formatCurrency(guaranteeAmount), 450, deductionsCurrentY, { align: 'right', width: 100 });
            deductionsCurrentY += deductionsLineHeight;
        }
        // Avans
        if (deductions.advanceRate !== undefined || deductions.advanceAmount !== undefined) {
            doc.font('Helvetica-Bold').text('Avans:', 100, deductionsCurrentY);
            const advanceRate = deductions.advanceRate || 10;
            const advanceAmount = deductions.advanceAmount || (summary.grossAmount || 0) * (advanceRate / 100);
            doc.font('Helvetica').text(`%${advanceRate}`, 200, deductionsCurrentY);
            doc.text(formatCurrency(advanceAmount), 450, deductionsCurrentY, { align: 'right', width: 100 });
            deductionsCurrentY += deductionsLineHeight;
        }
        // Manuel kesintiler
        if (deductions.manualDeductions && Array.isArray(deductions.manualDeductions) && deductions.manualDeductions.length > 0) {
            deductions.manualDeductions.forEach((manual) => {
                // Sayfa taşması kontrolü - Teklifbul Rule v1.0
                if (deductionsCurrentY > pageBottom) {
                    doc.addPage();
                    currentPage++;
                    // Watermark ekle - Teklifbul Rule v1.0
                    addWatermark(paymentData.status || 'draft');
                    doc.fontSize(18).font('Helvetica-Bold').text('KESİNTİLER TABLOSU (Devam)', doc.page.width / 2, 80, { align: 'center' });
                    doc.moveDown(2);
                    deductionsCurrentY = deductionsY;
                }
                doc.font('Helvetica-Bold').text(manual.name || 'Manuel Kesinti:', 100, deductionsCurrentY);
                doc.font('Helvetica').text(manual.description || '', 200, deductionsCurrentY, { width: 200 });
                doc.text(formatCurrency(manual.amount || 0), 450, deductionsCurrentY, { align: 'right', width: 100 });
                deductionsCurrentY += deductionsLineHeight;
            });
        }
        deductionsCurrentY += 10;
        doc.moveTo(100, deductionsCurrentY).lineTo(550, deductionsCurrentY).stroke();
        deductionsCurrentY += 15;
        doc.fontSize(12).font('Helvetica-Bold').text('KESİNTİLER TOPLAMI:', 100, deductionsCurrentY);
        doc.text(formatCurrency(deductions.total || summary.deductionsTotal || 0), 450, deductionsCurrentY, { align: 'right', width: 100 });
        addPageNumber(currentPage, totalPages);
        // ============================================
        // 6. ARKA KAPAK
        // ============================================
        doc.addPage();
        currentPage++;
        // Watermark ekle - Teklifbul Rule v1.0
        addWatermark(paymentData.status || 'draft');
        doc.rect(50, 50, doc.page.width - 100, doc.page.height - 100).stroke();
        doc.fontSize(18).font('Helvetica-Bold').text('ÖZET BİLGİLER', doc.page.width / 2, 100, { align: 'center' });
        doc.moveDown(2);
        const backY = 180;
        let backCurrentY = backY;
        const backLineHeight = 35;
        doc.fontSize(12).font('Helvetica');
        doc.font('Helvetica-Bold').text('Toplam Tahakkuk:', 100, backCurrentY);
        doc.font('Helvetica').text(formatCurrency(summary.totalAmount || 0), 350, backCurrentY, { align: 'right', width: 150 });
        backCurrentY += backLineHeight;
        doc.font('Helvetica-Bold').text('Ödeme Bilgisi:', 100, backCurrentY);
        doc.font('Helvetica').text('Banka hesap bilgileri buraya eklenecek', 350, backCurrentY, { width: 150 });
        backCurrentY += backLineHeight * 2;
        // İmza alanları
        doc.fontSize(11).font('Helvetica-Bold').text('İMZALAR', doc.page.width / 2, backCurrentY, { align: 'center' });
        backCurrentY += 50;
        const signatureY = backCurrentY;
        doc.moveTo(100, signatureY).lineTo(250, signatureY).stroke();
        doc.fontSize(9).font('Helvetica').text('Yüklenici / Firma', 100, signatureY + 5, { width: 150, align: 'center' });
        doc.moveTo(350, signatureY).lineTo(500, signatureY).stroke();
        doc.fontSize(9).font('Helvetica').text('İşveren / Müşavir', 350, signatureY + 5, { width: 150, align: 'center' });
        addPageNumber(currentPage, totalPages);
        doc.end();
        logger.info('PDF export tamamlandı', { id });
        logger.end();
    }
    catch (error) {
        logger.error('PDF export hatası', error);
        logger.end();
        if (!res.headersSent) {
            return res.status(500).json({ error: 'PDF_EXPORT_ERROR', message: error.message });
        }
    }
});
/**
 * Hakediş Excel export - GET /api/interim-payments/:id/export/excel
 */
router.get('/:id/export/excel', async (req, res) => {
    logger.group('interim-payments:export-excel');
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
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Şantiye bilgisini al
        const siteDoc = await db.collection('stock_locations').doc(paymentData.siteId).get();
        const siteData = siteDoc.exists ? siteDoc.data() : {};
        const siteName = siteData?.title || siteData?.siteName || 'Şantiye';
        // Sözleşme bilgisini al
        const contractDoc = await db.collection('contracts').doc(paymentData.contractId).get();
        const contractData = contractDoc.exists ? contractDoc.data() : {};
        const contractName = contractData?.name || contractData?.contractName || 'Sözleşme';
        // Şirket bilgisini al
        const companyDoc = await db.collection('companies').doc(companyId).get();
        const companyData = companyDoc.exists ? companyDoc.data() : {};
        const companyName = companyData?.name || 'Şirket';
        // Excel workbook oluştur
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Hakediş');
        // Başlık satırı
        worksheet.mergeCells('A1:F1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'HAKEDİŞ';
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 25;
        // Hakediş bilgileri
        let currentRow = 3;
        worksheet.getCell(`A${currentRow}`).value = 'Hakediş No:';
        worksheet.getCell(`B${currentRow}`).value = paymentData.paymentNumber || '-';
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;
        worksheet.getCell(`A${currentRow}`).value = 'Şirket:';
        worksheet.getCell(`B${currentRow}`).value = companyName;
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;
        worksheet.getCell(`A${currentRow}`).value = 'Şantiye:';
        worksheet.getCell(`B${currentRow}`).value = siteName;
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;
        worksheet.getCell(`A${currentRow}`).value = 'Sözleşme:';
        worksheet.getCell(`B${currentRow}`).value = contractName;
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;
        worksheet.getCell(`A${currentRow}`).value = 'Dönem:';
        worksheet.getCell(`B${currentRow}`).value = `${paymentData.periodStart ? new Date(paymentData.periodStart).toLocaleDateString('tr-TR') : '-'} - ${paymentData.periodEnd ? new Date(paymentData.periodEnd).toLocaleDateString('tr-TR') : '-'}`;
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;
        worksheet.getCell(`A${currentRow}`).value = 'Durum:';
        worksheet.getCell(`B${currentRow}`).value = paymentData.status === 'draft' ? 'Taslak' : paymentData.status === 'pending' ? 'Onay Bekliyor' : paymentData.status === 'approved' ? 'Onaylandı' : paymentData.status || '-';
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow += 2;
        // Pozlar tablosu
        if (paymentData.items && paymentData.items.length > 0) {
            worksheet.getCell(`A${currentRow}`).value = 'Pozlar ve Metraj';
            worksheet.getCell(`A${currentRow}`).font = { size: 12, bold: true };
            currentRow++;
            // Tablo başlıkları
            const headerRow = worksheet.getRow(currentRow);
            headerRow.values = ['Poz', 'Açıklama', 'Birim', 'Miktar', 'Birim Fiyat', 'Tutar'];
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
            headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
            currentRow++;
            // Pozlar
            paymentData.items.forEach((item) => {
                const row = worksheet.getRow(currentRow);
                row.values = [
                    item.code || '-',
                    item.description || '-',
                    item.unit || '-',
                    item.quantity || 0,
                    item.unitPrice || 0,
                    (item.quantity || 0) * (item.unitPrice || 0)
                ];
                // Sayısal sütunları formatla
                row.getCell(4).numFmt = '#,##0.00';
                row.getCell(5).numFmt = '#,##0.00 ₺';
                row.getCell(6).numFmt = '#,##0.00 ₺';
                currentRow++;
            });
            currentRow++;
        }
        // Kesintiler
        if (paymentData.deductions) {
            worksheet.getCell(`A${currentRow}`).value = 'Kesintiler';
            worksheet.getCell(`A${currentRow}`).font = { size: 12, bold: true };
            currentRow++;
            const deductions = paymentData.deductions;
            if (deductions.stopaj) {
                worksheet.getCell(`A${currentRow}`).value = `Stopaj (%${deductions.stopajRate || 5}):`;
                worksheet.getCell(`B${currentRow}`).value = deductions.stopaj;
                worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
                worksheet.getCell(`A${currentRow}`).font = { bold: true };
                currentRow++;
            }
            if (deductions.kdv) {
                worksheet.getCell(`A${currentRow}`).value = `KDV (%${deductions.kdvRate || 20}):`;
                worksheet.getCell(`B${currentRow}`).value = deductions.kdv;
                worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
                worksheet.getCell(`A${currentRow}`).font = { bold: true };
                currentRow++;
            }
            if (deductions.avans) {
                worksheet.getCell(`A${currentRow}`).value = 'Avans Kesintisi:';
                worksheet.getCell(`B${currentRow}`).value = deductions.avans;
                worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
                worksheet.getCell(`A${currentRow}`).font = { bold: true };
                currentRow++;
            }
            if (deductions.teminat) {
                worksheet.getCell(`A${currentRow}`).value = 'Teminat Kesintisi:';
                worksheet.getCell(`B${currentRow}`).value = deductions.teminat;
                worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
                worksheet.getCell(`A${currentRow}`).font = { bold: true };
                currentRow++;
            }
            currentRow++;
        }
        // Özet
        if (paymentData.summary) {
            worksheet.getCell(`A${currentRow}`).value = 'Özet';
            worksheet.getCell(`A${currentRow}`).font = { size: 12, bold: true };
            currentRow++;
            const summary = paymentData.summary;
            worksheet.getCell(`A${currentRow}`).value = 'Brüt Tutar:';
            worksheet.getCell(`B${currentRow}`).value = summary.grossAmount || 0;
            worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
            worksheet.getCell(`A${currentRow}`).font = { bold: true };
            currentRow++;
            worksheet.getCell(`A${currentRow}`).value = 'Toplam Kesinti:';
            worksheet.getCell(`B${currentRow}`).value = summary.deductionsTotal || 0;
            worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
            worksheet.getCell(`A${currentRow}`).font = { bold: true };
            currentRow++;
            worksheet.getCell(`A${currentRow}`).value = 'Net Tutar:';
            worksheet.getCell(`B${currentRow}`).value = summary.netAmount || 0;
            worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
            worksheet.getCell(`A${currentRow}`).font = { bold: true };
            currentRow++;
            if (summary.kdvAmount) {
                worksheet.getCell(`A${currentRow}`).value = 'KDV Tutarı:';
                worksheet.getCell(`B${currentRow}`).value = summary.kdvAmount;
                worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
                worksheet.getCell(`A${currentRow}`).font = { bold: true };
                currentRow++;
            }
            if (summary.totalAmount) {
                worksheet.getCell(`A${currentRow}`).value = 'Ödenecek Tutar:';
                worksheet.getCell(`B${currentRow}`).value = summary.totalAmount;
                worksheet.getCell(`B${currentRow}`).numFmt = '#,##0.00 ₺';
                worksheet.getCell(`A${currentRow}`).font = { size: 11, bold: true };
                worksheet.getCell(`B${currentRow}`).font = { size: 11, bold: true };
            }
        }
        // Sütun genişliklerini ayarla
        worksheet.columns = [
            { width: 15 },
            { width: 40 },
            { width: 10 },
            { width: 12 },
            { width: 15 },
            { width: 15 }
        ];
        // Response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="hakedis-${paymentData.paymentNumber || id}.xlsx"`);
        // Excel dosyasını gönder
        await workbook.xlsx.write(res);
        res.end();
        logger.info('Excel export tamamlandı', { id });
        logger.end();
    }
    catch (error) {
        logger.error('Excel export hatası', error);
        logger.end();
        if (!res.headersSent) {
            return res.status(500).json({ error: 'EXCEL_EXPORT_ERROR', message: error.message });
        }
    }
});
/**
 * AI ile hakediş taslağı oluştur - POST /api/interim-payments/:id/ai-draft
 */
router.post('/:id/ai-draft', async (req, res) => {
    logger.group('interim-payments:ai-draft');
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Kullanıcı doğrulanamadı' });
        }
        const { id } = req.params;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakedişi bul
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        const companyId = paymentData.companyId;
        // Sözleşme bilgilerini al
        const contractDoc = await db.collection('contracts').doc(paymentData.contractId).get();
        const contractData = contractDoc.exists ? contractDoc.data() : null;
        // Sözleşme pozlarını al
        // Teklifbul Rule v1.0 - Limit ekle (performans için)
        const itemsSnapshot = await db.collection('contracts').doc(paymentData.contractId).collection('items').limit(500).get();
        const contractItems = itemsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        // Teklifbul Rule v1.0 - Stok hareketlerinden poz bazlı miktar hesaplama
        const periodStart = paymentData.periodStart?.toDate?.() || new Date(paymentData.periodStart);
        const periodEnd = paymentData.periodEnd?.toDate?.() || new Date(paymentData.periodEnd);
        // Bu dönemdeki stok hareketlerini al (OUT tipi - çıkışlar)
        const stockMovementsSnapshot = await db.collection('stock_movements')
            .where('companyId', '==', companyId)
            .where('siteId', '==', paymentData.siteId)
            .where('type', '==', 'OUT')
            .where('createdAt', '>=', periodStart)
            .where('createdAt', '<=', periodEnd)
            .get();
        // Poz bazlı metraj topla
        const itemQuantities = new Map();
        stockMovementsSnapshot.docs.forEach(doc => {
            const movement = doc.data();
            const itemCode = movement.itemCode || movement.code;
            if (itemCode) {
                const current = itemQuantities.get(itemCode) || 0;
                itemQuantities.set(itemCode, current + (movement.quantity || 0));
            }
        });
        // Teklifbul Rule v1.0 - Önceki hakedişlerden kümülatif metraj hesaplama
        const previousPaymentsSnapshot = await db.collection('interim_payments')
            .where('companyId', '==', companyId)
            .where('siteId', '==', paymentData.siteId)
            .where('contractId', '==', paymentData.contractId)
            .where('status', 'in', ['approved', 'sent'])
            .where('periodEnd', '<', periodStart)
            .orderBy('periodEnd', 'desc')
            .limit(1)
            .get();
        const previousPayment = previousPaymentsSnapshot.empty ? null : previousPaymentsSnapshot.docs[0].data();
        const previousItems = previousPayment?.items || [];
        // Poz bazlı önceki metrajları topla
        const previousQuantities = new Map();
        previousItems.forEach((item) => {
            if (item.code) {
                previousQuantities.set(item.code, (previousQuantities.get(item.code) || 0) + (item.quantity || 0));
            }
        });
        // Teklifbul Rule v1.0 - Pozlar için hesaplanmış metrajları hazırla
        const enrichedItems = contractItems.map(item => {
            const currentQuantity = itemQuantities.get(item.code) || 0;
            const previousQuantity = previousQuantities.get(item.code) || 0;
            const totalQuantity = previousQuantity + currentQuantity;
            return {
                code: item.code,
                description: item.description,
                unit: item.unit,
                unitPrice: item.unitPrice || 0,
                previousQuantity,
                currentQuantity,
                totalQuantity,
                suggestedQuantity: currentQuantity > 0 ? currentQuantity : (totalQuantity > 0 ? totalQuantity : 0),
                amount: (item.unitPrice || 0) * (currentQuantity > 0 ? currentQuantity : (totalQuantity > 0 ? totalQuantity : 0))
            };
        });
        // Teklifbul Rule v1.0 - Otomatik kesinti hesaplamaları
        const totalGross = enrichedItems.reduce((sum, item) => sum + item.amount, 0);
        const advanceRate = contractData?.advanceRate || 0.10;
        const guaranteeRate = contractData?.guaranteeRate || 0.06;
        const stopajRate = contractData?.stopajRate || 0.05;
        const kdvRate = contractData?.kdvRate || 0.20;
        const advanceAmount = totalGross * advanceRate;
        const guaranteeAmount = totalGross * guaranteeRate;
        const stopajAmount = totalGross * stopajRate;
        const kdvAmount = totalGross * kdvRate;
        const totalDeductions = advanceAmount + guaranteeAmount + stopajAmount;
        const netAmount = totalGross - totalDeductions;
        // AI için veri hazırla
        const aiPrompt = `Bir inşaat hakediş taslağı oluşturman gerekiyor. Aşağıdaki bilgileri kullanarak profesyonel bir hakediş taslağı önerisi hazırla:

Proje: ${paymentData.siteName || 'Şantiye'}
Sözleşme: ${contractData?.name || 'Sözleşme'}
Dönem: ${periodStart.toLocaleDateString('tr-TR')} - ${periodEnd.toLocaleDateString('tr-TR')}

Sözleşme Pozları ve Metrajlar:
${enrichedItems.map(item => `- ${item.code}: ${item.description} (${item.unit})
  Önceki Metraj: ${item.previousQuantity}
  Bu Dönem Metraj: ${item.currentQuantity}
  Toplam Metraj: ${item.totalQuantity}
  Birim Fiyat: ${item.unitPrice?.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) || '0 TL'}
  Önerilen Tutar: ${item.amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}`).join('\n')}

Hesaplanan Kesintiler:
- Avans: ${advanceAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} (${(advanceRate * 100).toFixed(1)}%)
- Teminat: ${guaranteeAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} (${(guaranteeRate * 100).toFixed(1)}%)
- Stopaj: ${stopajAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} (${(stopajRate * 100).toFixed(1)}%)
- KDV: ${kdvAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} (${(kdvRate * 100).toFixed(1)}%)

Brüt Tutar: ${totalGross.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
Toplam Kesintiler: ${totalDeductions.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
Net Tutar: ${netAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}

${req.body.userNotes ? `Kullanıcı Notları: ${req.body.userNotes}` : ''}

Lütfen şu konularda önerilerde bulun:
1. Metrajların doğruluğu ve tutarlılığı
2. Eksik veya şüpheli pozlar
3. Kesinti hesaplamalarının doğruluğu
4. Genel hakediş kalitesi ve iyileştirme önerileri

Yanıtını JSON formatında ver:
{
  "suggestions": ["öneri1", "öneri2", ...],
  "warnings": ["uyarı1", "uyarı2", ...],
  "recommendations": ["tavsiye1", "tavsiye2", ...]
}`;
        // Teklifbul Rule v1.0 - AI servisi entegrasyonu
        const provider = await getUserAIProvider(userId);
        const aiMessages = [
            {
                role: 'user',
                content: aiPrompt
            }
        ];
        const aiResult = await sendChat(aiMessages, {
            provider,
            systemPrompt: 'Sen bir inşaat hakediş uzmanısın. Hakediş taslakları oluşturma, metraj hesaplama ve kesinti hesaplamaları konusunda uzmanlaşmışsın. Yanıtlarını Türkçe ve profesyonel bir dille ver.',
            model: provider === 'openai' ? 'gpt-4o-mini' : undefined,
            temperature: 0.3,
            maxTokens: 2000
        });
        // Token consumption
        const estimatedTokens = Math.ceil(aiPrompt.length / 4) + aiResult.totalTokens;
        const tokenPack = await consumeTokensTransactional(userId, provider, estimatedTokens);
        // AI usage logging - Teklifbul Rule v1.0 - aiUsageService AiUsageLogParams sozlesmesine uydur
        const plan = await getUserPlan(userId);
        await logAiUsage({
            userId,
            plan,
            provider,
            promptTokens: Math.ceil(aiPrompt.length / 4),
            completionTokens: aiResult.totalTokens,
        });
        // AI yanıtını parse et
        let aiResponse;
        try {
            aiResponse = JSON.parse(aiResult.text);
        }
        catch (parseError) {
            // JSON parse hatası durumunda metni direkt kullan
            aiResponse = {
                suggestions: [aiResult.text],
                warnings: [],
                recommendations: []
            };
        }
        logger.info('AI taslak oluşturma tamamlandı', {
            paymentId: id,
            tokensUsed: estimatedTokens,
            provider
        });
        logger.end();
        return res.json({
            success: true,
            message: 'AI taslak başarıyla oluşturuldu',
            data: {
                items: enrichedItems,
                summary: {
                    grossAmount: totalGross,
                    advanceAmount,
                    guaranteeAmount,
                    stopajAmount,
                    kdvAmount,
                    totalDeductions,
                    netAmount
                },
                aiSuggestions: aiResponse.suggestions || [],
                aiWarnings: aiResponse.warnings || [],
                aiRecommendations: aiResponse.recommendations || [],
                tokenUsage: {
                    tokensUsed: estimatedTokens,
                    remainingTokens: tokenPack.remainingTokens
                }
            }
        });
    }
    catch (error) {
        logger.error('AI taslak oluşturma hatası', error);
        logger.end();
        return res.status(500).json({ error: 'AI_DRAFT_ERROR', message: error.message });
    }
});
/**
 * Versiyon geçmişi listesi - GET /api/interim-payments/:id/versions
 * Teklifbul Rule v1.0 - Versiyon geçmişi yönetimi
 */
router.get('/:id/versions', async (req, res) => {
    logger.group('interim-payments:versions');
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
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        const versions = data.versions || [];
        // Kullanıcı bilgilerini versiyonlara ekle
        const enrichedVersions = await Promise.all(versions.map(async (version) => {
            try {
                const userDoc = await db.collection('users').doc(version.changedBy).get();
                const userData = userDoc.exists ? userDoc.data() : null;
                return {
                    ...version,
                    changedByEmail: userData?.email || null,
                    changedByName: userData?.displayName || userData?.name || null,
                    changedAt: version.changedAt?.toDate?.()?.toISOString() || version.changedAt,
                };
            }
            catch (error) {
                return {
                    ...version,
                    changedByEmail: null,
                    changedByName: null,
                    changedAt: version.changedAt?.toDate?.()?.toISOString() || version.changedAt,
                };
            }
        }));
        logger.info('Versiyon geçmişi alındı', { id, versionCount: enrichedVersions.length });
        logger.end();
        return res.json({ versions: enrichedVersions });
    }
    catch (error) {
        logger.error('Versiyon geçmişi alma hatası', error);
        logger.end();
        return res.status(500).json({ error: 'VERSIONS_ERROR', message: error.message });
    }
});
/**
 * Versiyona geri dön (rollback) - POST /api/interim-payments/:id/rollback/:version
 * Teklifbul Rule v1.0 - Versiyon geçmişi yönetimi
 */
router.post('/:id/rollback/:version', async (req, res) => {
    logger.group('interim-payments:rollback');
    try {
        const userId = req.user?.uid;
        const { id, version } = req.params;
        const versionNumber = parseInt(version, 10);
        if (!userId || !id || isNaN(versionNumber)) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Onaylanmış veya gönderilmiş hakedişlerde rollback yapılamaz
        if (data?.status === 'approved' || data?.status === 'sent') {
            return res.status(400).json({
                error: 'ROLLBACK_NOT_ALLOWED',
                message: 'Onaylanmış veya gönderilmiş hakedişlerde geri alma işlemi yapılamaz'
            });
        }
        const versions = data.versions || [];
        const targetVersion = versions.find((v) => v.version === versionNumber);
        if (!targetVersion) {
            return res.status(404).json({ error: 'VERSION_NOT_FOUND', message: 'Belirtilen versiyon bulunamadı' });
        }
        // Teklifbul Rule v1.0 - Rollback öncesi mevcut veriyi versiyon olarak kaydet
        await saveVersion(db, id, data, userId, `Rollback öncesi kayıt (v${versionNumber} geri dönülüyor)`);
        // Versiyon verisini geri yükle
        const rollbackData = {
            ...targetVersion.data,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        };
        // createdAt ve updatedAt gibi timestamp'leri koru
        rollbackData.createdAt = data.createdAt;
        rollbackData.updatedAt = FieldValue.serverTimestamp();
        await db.collection('interim_payments').doc(id).update(rollbackData);
        logger.info('Versiyona geri dönüldü', { id, version: versionNumber });
        logger.end();
        return res.json({
            success: true,
            message: `Versiyon ${versionNumber} geri yüklendi`,
            data: rollbackData
        });
    }
    catch (error) {
        logger.error('Rollback hatası', error);
        logger.end();
        return res.status(500).json({ error: 'ROLLBACK_ERROR', message: error.message });
    }
});
/**
 * Dosya ekle - POST /api/interim-payments/:id/attachments
 * Teklifbul Rule v1.0 - Dosya ekleri yönetimi
 */
router.post('/:id/attachments', validateRequest({ params: getByIdParamsSchema }), upload.single('file'), async (req, res) => {
    logger.group('interim-payments:upload-attachment');
    try {
        const userId = req.user?.uid;
        const { id } = req.params;
        if (!userId || !id) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'NO_FILE', message: 'Dosya yüklenmedi' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakedişi bul ve kontrol et
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Firebase Storage'a yükle
        const bucket = await getAdminStorage();
        if (!bucket) {
            return res.status(500).json({ error: 'STORAGE_UNAVAILABLE', message: 'Storage servisi kullanılamıyor' });
        }
        // Dosya yolu oluştur: interim-payments/{paymentId}/attachments/{timestamp}-{random}-{filename}
        const fileExtension = req.file.originalname.split('.').pop() || '';
        const fileName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'); // Güvenli dosya adı
        const fileId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const storagePath = `interim-payments/${id}/attachments/${fileId}-${fileName}`;
        // Dosyayı yükle
        const fileUrl = await uploadFile(bucket, storagePath, req.file.buffer, req.file.mimetype, {
            uploadedBy: userId,
            paymentId: id,
            originalName: req.file.originalname,
        });
        // Firestore'da attachment kaydı oluştur
        const attachmentData = {
            id: fileId,
            fileName: req.file.originalname,
            fileUrl,
            filePath: storagePath,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            uploadedBy: userId,
            uploadedAt: FieldValue.serverTimestamp(),
        };
        // Mevcut attachments dizisini al ve yeni eklemeyi ekle
        const existingAttachments = paymentData.attachments || [];
        const updatedAttachments = [...existingAttachments, attachmentData];
        await db.collection('interim_payments').doc(id).update({
            attachments: updatedAttachments,
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info('Dosya eklendi', { paymentId: id, fileId, fileName: req.file.originalname });
        logger.end();
        return res.json({
            success: true,
            message: 'Dosya başarıyla eklendi',
            attachment: attachmentData
        });
    }
    catch (error) {
        logger.error('Dosya ekleme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'UPLOAD_ERROR', message: error.message });
    }
});
/**
 * Dosya listesi - GET /api/interim-payments/:id/attachments
 * Teklifbul Rule v1.0 - Dosya ekleri yönetimi
 */
router.get('/:id/attachments', async (req, res) => {
    logger.group('interim-payments:list-attachments');
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
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        const attachments = data.attachments || [];
        logger.info('Dosya listesi alındı', { paymentId: id, count: attachments.length });
        logger.end();
        return res.json({ attachments });
    }
    catch (error) {
        logger.error('Dosya listesi alma hatası', error);
        logger.end();
        return res.status(500).json({ error: 'LIST_ERROR', message: error.message });
    }
});
/**
 * Dosya sil - DELETE /api/interim-payments/:id/attachments/:attachmentId
 * Teklifbul Rule v1.0 - Dosya ekleri yönetimi
 */
// Teklifbul Rule v1.0 - Input Validation Schema for delete attachment
const deleteAttachmentParamsSchema = z.object({
    id: z.string().min(1),
    attachmentId: z.string().min(1),
});
router.delete('/:id/attachments/:attachmentId', validateRequest({ params: deleteAttachmentParamsSchema }), async (req, res) => {
    logger.group('interim-payments:delete-attachment');
    try {
        const userId = req.user?.uid;
        const { id, attachmentId } = req.params;
        if (!userId || !id || !attachmentId) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        const doc = await db.collection('interim_payments').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const data = doc.data();
        // Şirket kontrolü
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (data?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        const attachments = data.attachments || [];
        const attachment = attachments.find((att) => att.id === attachmentId);
        if (!attachment) {
            return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND', message: 'Dosya bulunamadı' });
        }
        // Firebase Storage'dan sil
        const bucket = await getAdminStorage();
        if (bucket && attachment.filePath) {
            try {
                await deleteFile(bucket, attachment.filePath);
            }
            catch (storageError) {
                logger.warn('Storage dosya silme hatası (devam ediliyor)', { error: storageError.message });
                // Storage hatası kritik değil, Firestore'dan silmeye devam et
            }
        }
        // Firestore'dan attachment'ı kaldır
        const updatedAttachments = attachments.filter((att) => att.id !== attachmentId);
        await db.collection('interim_payments').doc(id).update({
            attachments: updatedAttachments,
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info('Dosya silindi', { paymentId: id, attachmentId });
        logger.end();
        return res.json({
            success: true,
            message: 'Dosya başarıyla silindi'
        });
    }
    catch (error) {
        logger.error('Dosya silme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
    }
});
/**
 * Excel Metraj Import - POST /api/interim-payments/:id/import-metraj
 * Teklifbul Rule v1.0 - Excel'den metraj içe aktarma
 */
router.post('/:id/import-metraj', validateRequest({ params: getByIdParamsSchema }), upload.single('excelFile'), async (req, res) => {
    logger.group('interim-payments:import-metraj');
    try {
        const userId = req.user?.uid;
        const { id } = req.params;
        if (!userId || !id) {
            return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Geçersiz istek' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'NO_FILE', message: 'Excel dosyası yüklenmedi' });
        }
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Hakediş kontrolü
        const paymentDoc = await db.collection('interim_payments').doc(id).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Hakediş bulunamadı' });
        }
        const paymentData = paymentDoc.data();
        // Şirket kontrolü - Teklifbul Rule v1.0 - Company izolasyonu
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
        }
        const userData = userDoc.data();
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return res.status(403).json({ error: 'NO_COMPANY', message: 'Şirket bilgisi bulunamadı' });
        }
        if (paymentData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu hakedişe erişim yetkiniz yok' });
        }
        // Contract kontrolü
        const contractId = paymentData?.contractId;
        if (!contractId) {
            return res.status(400).json({ error: 'NO_CONTRACT', message: 'Hakediş sözleşmeye bağlı değil' });
        }
        // Contract kontrolü (company izolasyonu)
        const contractDoc = await db.collection('contracts').doc(contractId).get();
        if (!contractDoc.exists) {
            return res.status(404).json({ error: 'CONTRACT_NOT_FOUND', message: 'Sözleşme bulunamadı' });
        }
        const contractData = contractDoc.data();
        if (contractData?.companyId !== companyId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sözleşmeye erişim yetkiniz yok' });
        }
        // Pozları al (code'a göre map'le)
        const itemsSnapshot = await db.collection('contracts').doc(contractId).collection('items').get();
        const itemsMap = new Map();
        itemsSnapshot.forEach(doc => {
            const item = doc.data();
            const code = String(item.code || '').trim();
            if (code) {
                itemsMap.set(code, {
                    id: doc.id,
                    ...item,
                });
            }
        });
        // Excel'i parse et
        const workbook = new ExcelJS.Workbook();
        // Teklifbul Rule v1.0 - Buffer<ArrayBufferLike> -> ArrayBuffer cast (Multer/ExcelJS tip uyusmazligi)
        const fileBuf = req.file.buffer;
        const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
        await workbook.xlsx.load(arrayBuf);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            return res.status(400).json({ error: 'INVALID_EXCEL', message: 'Excel dosyası geçersiz' });
        }
        const results = {
            success: [],
            errors: [],
        };
        // Satırları işle (başlık satırını atla)
        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            const code = String(row.getCell(1).value || '').trim(); // PozNo
            const quantityValue = row.getCell(5).value; // Bu Hakediş Miktarı
            // Boş satırları atla
            if (!code && !quantityValue)
                continue;
            // PozNo kontrolü
            if (!code) {
                results.errors.push({
                    row: rowIndex,
                    code: '',
                    error: 'PozNo boş',
                });
                continue;
            }
            // Poz sözleşmede var mı?
            const item = itemsMap.get(code);
            if (!item) {
                results.errors.push({
                    row: rowIndex,
                    code,
                    error: 'Poz bulunamadı',
                });
                continue;
            }
            // Miktar kontrolü
            let quantity;
            if (quantityValue === null || quantityValue === undefined || quantityValue === '') {
                quantity = 0; // Boşsa 0 kabul et
            }
            else {
                quantity = Number(quantityValue);
                if (isNaN(quantity)) {
                    results.errors.push({
                        row: rowIndex,
                        code,
                        error: 'Geçersiz miktar (sayı değil)',
                    });
                    continue;
                }
                if (quantity < 0) {
                    results.errors.push({
                        row: rowIndex,
                        code,
                        error: 'Miktar negatif olamaz',
                    });
                    continue;
                }
            }
            // Başarılı
            results.success.push({
                row: rowIndex,
                code,
                quantity,
            });
        }
        // Eğer hiç başarılı satır yoksa
        if (results.success.length === 0) {
            return res.status(400).json({
                error: 'NO_VALID_ROWS',
                message: 'Geçerli satır bulunamadı',
                results,
            });
        }
        // Önizleme modu (preview=true query param)
        const preview = req.query.preview === 'true';
        if (preview) {
            logger.info('Metraj import önizleme', {
                paymentId: id,
                successCount: results.success.length,
                errorCount: results.errors.length
            });
            logger.end();
            return res.json({
                preview: true,
                message: `${results.success.length} satır güncellenecek, ${results.errors.length} satır hatalı`,
                results,
            });
        }
        // Gerçek import - Pozları güncelle
        const updatedItems = [];
        const existingItems = paymentData.items || [];
        // Mevcut pozları map'le
        const existingItemsMap = new Map();
        existingItems.forEach((item) => {
            const key = item.code || item.itemId;
            if (key) {
                existingItemsMap.set(key, item);
            }
        });
        // Başarılı satırları işle
        for (const successItem of results.success) {
            const item = itemsMap.get(successItem.code);
            if (!item)
                continue;
            // Mevcut poz bilgisini al veya yeni oluştur
            const existingItem = existingItemsMap.get(successItem.code) || existingItemsMap.get(item.id);
            const updatedItem = {
                itemId: item.id,
                code: item.code,
                description: item.description,
                unit: item.unit,
                quantity: successItem.quantity,
                previousQuantity: existingItem?.previousQuantity || 0,
                unitPrice: item.unitPrice || 0,
                totalQuantity: (existingItem?.previousQuantity || 0) + successItem.quantity,
                amount: (item.unitPrice || 0) * successItem.quantity,
            };
            updatedItems.push(updatedItem);
        }
        // Hakedişi güncelle
        await db.collection('interim_payments').doc(id).update({
            items: updatedItems,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
        });
        logger.info('Metraj import tamamlandı', {
            paymentId: id,
            updatedItemsCount: updatedItems.length,
            successCount: results.success.length,
            errorCount: results.errors.length
        });
        logger.end();
        return res.json({
            success: true,
            message: `${results.success.length} satır başarıyla güncellendi`,
            results,
            updatedItemsCount: updatedItems.length,
        });
    }
    catch (error) {
        logger.error('Metraj import hatası', error);
        logger.end();
        return res.status(500).json({ error: 'IMPORT_ERROR', message: error.message });
    }
});
export default router;
