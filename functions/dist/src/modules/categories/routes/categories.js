/**
 * Categories API Routes
 * Teklifbul Rule v1.0 - Structured Logging
 *
 * Firestore kullanıyor - $0 maliyet
 */
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getCategories, getCategoryById, saveFeedback } from '../../../services/firestore-categories.js';
import { logger } from '../../../shared/log/logger.js';
// Teklifbul Rule v1.0 - Production Hardening
import { verifyToken, requireAdmin } from '../../../../server/middleware/auth.js';
// Teklifbul Rule v1.0 - LLM cagrisi yapan endpoint'ler ek rate-limit ile korunur
// Kullanici basina dakikada 10 istek (Groq token tasarrufu + DoS / fatura sömürüsü)
const aiSuggestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Teklifbul Rule v1.0 - IPv6 bypass'i engellemek icin ipKeyGenerator kullan
    keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip || req.socket?.remoteAddress || ''),
    message: { error: 'rate_limited', message: 'Cok fazla istek. Lutfen biraz bekleyip tekrar deneyin.' }
});
const router = Router();
// GET /api/categories - Liste
router.get('/', async (req, res) => {
    try {
        const { q, withDesc = 'true', page = '1', size = '100' } = req.query;
        const result = await getCategories({
            search: q,
            withDesc: withDesc === 'true',
            page: Number(page) || 1,
            size: Math.min(Number(size) || 100, 200)
        });
        res.json(result);
    }
    catch (e) {
        logger.error('Categories list error:', e);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});
// GET /api/categories/:id - Detay
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const category = await getCategoryById(id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    }
    catch (e) {
        logger.error('Category detail error:', e);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});
// POST /api/categories/:id/desc - Açıklama güncelle (admin)
// Teklifbul Rule v1.0 - Admin middleware eklendi
router.post('/:id/desc', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { short_desc, examples } = req.body;
        // Firestore update
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../../../lib/firebase.js');
        await updateDoc(doc(db, 'categories', id), {
            short_desc: short_desc || null,
            examples: examples || null,
            updatedAt: new Date()
        });
        // Cache'i temizle
        const { cache } = await import('../../../services/in-memory-cache.js');
        await cache.del(`category:${id}`);
        await cache.delPattern('categories:list:*');
        res.json({ success: true });
    }
    catch (e) {
        logger.error('Category desc update error:', e);
        res.status(500).json({ error: e.message });
    }
});
// POST /api/categories/suggest - Kategori öner (AI Destekli)
// Teklifbul Rule v1.0 - Auth + per-user rate-limit (LLM token sömürüsünü engeller)
router.post('/suggest', verifyToken, aiSuggestLimiter, async (req, res) => {
    try {
        const { text } = req.body;
        logger.info('Category suggest request received', { textLen: typeof text === 'string' ? text.length : 0 });
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'text parameter is required' });
        }
        // Teklifbul Rule v1.0 - LLM giriş uzunluk siniri (token tasarrufu + prompt injection riski azaltma)
        if (text.length > 500) {
            return res.status(400).json({ error: 'text_too_long', message: 'Metin en fazla 500 karakter olabilir' });
        }
        // Teklifbul Rule v1.0 - Use Groq AI for classification
        // Import dynamically to avoid circular deps if any
        let sendChat;
        try {
            const aiModule = await import('../../../../server/ai/index.js');
            sendChat = aiModule.sendChat;
        }
        catch (importError) {
            logger.error('AI module import failed', { error: importError.message, path: '../../../../server/ai/index.js' });
            throw importError;
        }
        if (!sendChat) {
            throw new Error('sendChat not found in AI module');
        }
        // Kategori listesi (Prompt için optimize edilmiş)
        // Teklifbul Rule v1.0 - List of categories for prompt
        const CATEGORY_LIST = [
            { "id": "CAT.SACMETAL", "name": "Sac/Metal", "synonyms": ["sac", "metal", "çelik işleme"] },
            { "id": "CAT.ELEKTRIK", "name": "Elektrik", "synonyms": ["elektrik malzemeleri"] },
            { "id": "CAT.ELEKTRONIK", "name": "Elektronik", "synonyms": ["plc", "sensor"] },
            { "id": "CAT.MAKINEIMALAT", "name": "Makine-İmalat", "synonyms": ["imalat", "cnc"] },
            { "id": "CAT.HIRDAVAT", "name": "Hırdavat", "synonyms": ["vida", "somun"] },
            { "id": "CAT.AMBALAJ", "name": "Ambalaj", "synonyms": ["koli", "streç"] },
            { "id": "CAT.KIMYASAL", "name": "Kimyasal", "synonyms": ["solvent"] },
            { "id": "CAT.INSAAT", "name": "İnşaat Malzemeleri", "synonyms": ["yapı", "çimento", "tuğla"] },
            { "id": "CAT.MOBILYA", "name": "Mobilya", "synonyms": ["ofis mobilyası"] },
            { "id": "CAT.BOYA", "name": "Boya", "synonyms": ["endüstriyel boya"] },
            { "id": "CAT.PLASTIK", "name": "Plastik", "synonyms": ["plastik hammadde"] },
            { "id": "CAT.OTOMOTIVYS", "name": "Otomotiv Yan Sanayi", "synonyms": ["otomotiv parça"] },
            { "id": "CAT.ISG", "name": "İş Güvenliği", "synonyms": ["kkd", "baret"] },
            { "id": "CAT.TEMIZLIK", "name": "Temizlik", "synonyms": ["temizlik ekipmanı"] },
            { "id": "CAT.GIDA", "name": "Gıda", "synonyms": ["ikram"] },
            { "id": "CAT.HIZMET", "name": "Hizmet", "synonyms": ["bakım", "işçilik"] },
            { "id": "CAT.LOJISTIK", "name": "Lojistik", "synonyms": ["nakliye"] },
            { "id": "CAT.AYDINLATMA", "name": "Aydınlatma", "synonyms": ["armatür", "projektör"] },
            { "id": "CAT.AGMG", "name": "Alçak/Orta Gerilim", "synonyms": ["pano", "şalt", "trafo"] },
            { "id": "CAT.OTOMASYON", "name": "Otomasyon (PLC/SCADA)", "synonyms": ["plc", "hmi", "sürücü"] },
            { "id": "CAT.KAYNAK", "name": "Kaynak & Sarf", "synonyms": ["mig", "tig", "kaynak teli"] },
            { "id": "CAT.RULMAN", "name": "Rulman & Güç Aktarım", "synonyms": ["kayış", "kaplin", "redüktör"] },
            { "id": "CAT.HVAC", "name": "HVAC", "synonyms": ["vrf", "kanal", "fan"] },
            { "id": "CAT.YANGIN", "name": "Yangın Güvenliği", "synonyms": ["sprinkler", "algılama"] },
            { "id": "CAT.KIRALAMA", "name": "Ekipman Kiralama", "synonyms": ["forklift", "vinç"] },
            { "id": "CAT.PEYZAJ", "name": "Peyzaj & Bahçe", "synonyms": ["rulo çim", "hazır çim", "fidan", "bahçe bakımı"] },
            { "id": "CAT.TESISAT", "name": "Tesisat", "synonyms": ["su tesisatı", "pprc boru", "vana", "drenaj"] },
            { "id": "CAT.MARANGOZ", "name": "Marangoz & Ahşap İşleri", "synonyms": ["ahşap", "mobilya imalat", "kapı imalatı"] },
            { "id": "CAT.AKARYAKIT", "name": "Akaryakıt & Yağlar", "synonyms": ["benzin", "motorin", "madeni yağ", "hidrolik yağ"] }
        ];
        const CATEGORY_PROMPT_LIST = CATEGORY_LIST.map(c => `- ${c.id}: ${c.name} (${c.synonyms.join(', ')})`).join('\n');
        const CLASSIFY_SYSTEM_PROMPT = `
    Sen bir endüstriyel satın alma uzmanısın. Görevin, verilen ürün ismini en uygun Teklifbul kategori ID'si ile eşleştirmektir.
    Yanıtını SADECE JSON formatında şu yapıda ver: { "categoryId": "KATEGORİ_ID", "confidence": 0-1 arası sayı }
    Kesinlikle başka açıklama ekleme.

    KATEGORİLER:
    ${CATEGORY_PROMPT_LIST}

    Kural: Eğer ürün hiçbir kategoriye uymuyorsa "CAT.HIRDAVAT" seç.
    `;
        logger.info('Calling AI provider', { provider: 'groq', promptLength: CLASSIFY_SYSTEM_PROMPT.length });
        const result = await sendChat([
            { role: 'user', content: `Ürün: ${text}` }
        ], {
            provider: 'groq', // Fast inference
            systemPrompt: CLASSIFY_SYSTEM_PROMPT,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            maxTokens: 500,
        });
        logger.info('AI Response received', { text: result.text });
        let categoryId = 'CAT.HIRDAVAT';
        try {
            let cleanContent = result.text.trim();
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```(json)?/, '').replace(/```$/, '').trim();
            }
            const json = JSON.parse(cleanContent);
            if (json.categoryId)
                categoryId = json.categoryId;
        }
        catch (e) {
            logger.warn('AI category parse failed, fallback to default', { text: result.text });
        }
        // Find category details
        const category = CATEGORY_LIST.find(c => c.id === categoryId);
        // Response format compatible with frontend
        res.json({
            query: text,
            suggestions: category ? [{ id: category.id, name: category.name }] : [],
            auto_select: category ? category.id : null
        });
    }
    catch (e) {
        // Log fatal error securely
        const errObj = {
            message: e?.message || String(e),
            stack: e?.stack
        };
        logger.error('Category suggest error (FATAL):', errObj);
        // Explicitly 500 if FATAL exception not handled
        // But trying to return 200 empty to prevent frontend crash
        try {
            res.json({ query: req.body.text || '', suggestions: [], auto_select: null });
        }
        catch (resError) {
            logger.error('Failed to send fallback response', resError);
            res.status(500).json({ error: 'Critical error' });
        }
    }
});
// POST /api/categories/feedback - Geri bildirim kaydet
// Teklifbul Rule v1.0 - Authentication gerekli (Firestore rules ile uyumlu)
router.post('/feedback', verifyToken, async (req, res) => {
    try {
        const { query, suggested_category_id, chosen_category_id } = req.body;
        // Teklifbul Rule v1.0 - user_id token'dan alınmalı (güvenlik)
        const user_id = req.user?.uid;
        if (!user_id) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'query parameter is required' });
        }
        await saveFeedback(query, suggested_category_id, chosen_category_id, user_id);
        logger.info('Category feedback saved', { user_id, query });
        res.json({ success: true });
    }
    catch (e) {
        logger.error('Category feedback error:', e);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});
export default router;
