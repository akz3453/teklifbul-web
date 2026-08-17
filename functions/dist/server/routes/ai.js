/**
 * Yapay zekâ satın alma asistanı endpoint'i
 * Teklifbul Rule v1.0 - AI Purchase Assistant Route
 *
 * OpenAI tabanlı Teklifbul asistanını çağırır
 */
import { Router } from 'express';
import { fetchBidData, fetchStockData, aiPurchase } from '../services/aiPurchaseAssistant.js';
import { validateCategorySelection } from '../services/aiCategoryGuard.js';
import { optionalVerifyToken, verifyToken } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { getCachedUserDoc } from '../src/utils/userDocCache.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
const router = Router();
// Validation schemas
const satinAlmaSchema = z.object({
    prompt: z.string().min(1).max(5000, 'Prompt çok uzun (maksimum 5000 karakter)'),
    filters: z.object({
        category: z.string().optional(),
        supplier: z.string().optional(),
        dateRange: z.object({
            start: z.string().optional(),
            end: z.string().optional()
        }).optional()
    }).optional()
});
// Teklifbul Rule v1.0 - Esnek şema (400 hatası önlemek için)
const categoryGuardSchema = z.object({
    title: z.any().optional(),
    spec: z.any().optional(),
    categories: z.any().optional(),
    items: z.any().optional()
});
/**
 * POST /api/ai/satin-alma
 * Kullanıcı sorusunu al, teklif/stok verilerini topla, OpenAI tabanlı Teklifbul asistanına gönder
 */
router.post('/satin-alma', verifyToken, requirePremium, validateRequest({ body: satinAlmaSchema }), async (req, res) => {
    try {
        logger.group('AI Purchase Assistant Request');
        logger.info('Request received', {
            method: req.method,
            url: req.url,
            body: { prompt: req.body?.prompt?.substring(0, 100) }
        });
        // OPENAI_API_KEY kontrolü
        logger.info('OPENAI_API_KEY check', {
            hasKey: !!process.env.OPENAI_API_KEY,
            keyLength: process.env.OPENAI_API_KEY?.length || 0
        });
        const { prompt, filters } = req.body;
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ ok: false, error: 'auth_required', message: 'Giriş gerekli' });
        }
        const userDoc = await getCachedUserDoc(userId, req);
        const userData = userDoc.exists ? userDoc.data : null;
        const headerCompanyId = req.headers['x-company-id'];
        const trustedCompanyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
            userId,
            path: req.path,
        });
        if (!trustedCompanyId) {
            return res.status(403).json({
                ok: false,
                error: 'company_required',
                message: 'Geçerli şirket bilgisi bulunamadı',
            });
        }
        // Client filters.companyId yok sayılır — trusted company zorunlu
        const scopedFilters = { ...(filters || {}), companyId: trustedCompanyId };
        // Teklif ve stok verilerini topla
        logger.info('Fetching bid and stock data', { companyId: trustedCompanyId });
        const [bids, stocks] = await Promise.all([
            fetchBidData(scopedFilters),
            fetchStockData(scopedFilters)
        ]);
        logger.info(`Data fetched: ${bids.length} bids, ${stocks.length} stocks`);
        // OpenAI tabanlı Teklifbul asistanı ile analiz yap
        logger.info('Starting OpenAI AI analysis');
        const answer = await aiPurchase(prompt, bids, stocks);
        logger.info('OpenAI AI analysis completed');
        logger.end();
        // Başarılı yanıt - chat endpoint'i sadece { message } döner
        return res.json({
            message: answer
        });
    }
    catch (error) {
        logger.error('Error in AI purchase assistant endpoint', error);
        logger.end();
        // Teklifbul Rule v1.0 - Hata yönetimi
        return res.status(500).json({
            ok: false,
            error: 'internal_error',
            message: error.message || 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.'
        });
    }
});
/**
 * POST /api/ai/category-guard
 * Talep başlığı/açıklaması/kalemleri ile seçilen kategorilerin uyumunu kontrol eder
 */
router.post('/category-guard', optionalVerifyToken, validateRequest({ body: categoryGuardSchema }), async (req, res) => {
    try {
        logger.group('AI Category Guard Request');
        const { title, spec, categories, items } = req.body;
        // Teklifbul Rule v1.0 - Yetersiz veri durumunda hata yerine başarılı dön
        if (!title || typeof title !== 'string' || !title.trim()) {
            logger.info('Category guard skipped: title missing');
            logger.end();
            return res.json({
                allowed: true,
                skipped: true,
                reason: 'title_missing',
                message: 'Başlık eksik, kategori kontrolü atlandı.'
            });
        }
        if (!Array.isArray(categories) || categories.length === 0) {
            logger.info('Category guard skipped: no categories');
            logger.end();
            return res.json({
                allowed: true,
                skipped: true,
                reason: 'categories_empty',
                message: 'Kategori seçilmemiş, kategori kontrolü atlandı.'
            });
        }
        const trimmedCategories = categories
            .map((cat) => (cat || '').toString().trim())
            .filter(Boolean);
        const itemPayload = Array.isArray(items)
            ? items
                .map((item) => ({
                name: (item?.name || '').toString().trim(),
                brandModel: item?.brandModel ? item.brandModel.toString().trim() : undefined,
                unit: item?.unit ? item.unit.toString().trim() : undefined,
                qty: typeof item?.qty === 'number' ? item.qty : undefined
            }))
                .filter(item => item.name)
                .slice(0, 10)
            : [];
        const result = await validateCategorySelection({
            userId: req.user?.uid,
            title: title.trim(),
            spec: typeof spec === 'string' ? spec : undefined,
            categories: trimmedCategories,
            items: itemPayload
        });
        logger.end();
        return res.json(result);
    }
    catch (error) {
        logger.error('AI Category Guard endpoint error', error);
        logger.end();
        return res.status(500).json({
            error: 'internal_error',
            message: error.message || 'Kategori doğrulama sırasında hata oluştu.'
        });
    }
});
export default router;
