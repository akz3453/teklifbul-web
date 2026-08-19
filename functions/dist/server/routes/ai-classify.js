import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logger } from '../../src/shared/log/logger.js';
import { sendChat } from '../ai/index.js';
import { z } from 'zod';
import { validateRequest } from '../utils/input-validation.js';
const router = Router();
// Teklifbul Rule v1.0 - Category classification schema
const classifySchema = z.object({
    items: z.array(z.string().min(1)).min(1).max(50, 'Maksimum 50 kalem gönderilebilir')
});
// Teklifbul Rule v1.0 - List of categories for prompt (Source: src/categories/category-service.js)
const CATEGORY_LIST = [
    { "id": "CAT.SACMETAL", "name": "Sac/Metal", "synonyms": ["sac", "metal", "çelik işleme"] },
    { "id": "CAT.ELEKTRIK", "name": "Elektrik", "synonyms": ["elektrik malzemeleri"] },
    { "id": "CAT.ELEKTRONIK", "name": "Elektronik", "synonyms": ["plc", "sensor"] },
    { "id": "CAT.MAKINEIMALAT", "name": "Makine-İmalat", "synonyms": ["imalat", "cnc"] },
    { "id": "CAT.HIRDAVAT", "name": "Hırdavat", "synonyms": ["vida", "somun"] },
    { "id": "CAT.AMBALAJ", "name": "Ambalaj", "synonyms": ["koli", "streç"] },
    { "id": "CAT.KIMYASAL", "name": "Kimyasal", "synonyms": ["solvent"] },
    { "id": "CAT.INSAAT", "name": "İnşaat Malzemeleri", "synonyms": ["yapı"] },
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
Sen bir endüstriyel satın alma uzmanısın. Görevin, verilen ürün isimlerini en uygun Teklifbul kategori ID'si ile eşleştirmektir.
Yanıtını SADECE JSON formatında şu yapıda ver: { "ürün_adı": "KATEGORİ_ID" }
Kesinlikle başka açıklama, markdown kodu (json bloğu hariç) veya metin ekleme.

KATEGORİLER:
${CATEGORY_PROMPT_LIST}

Önemli Kurallar:
1. Eğer ürün hiçbir kategoriye uymuyorsa "CAT.HIRDAVAT" veya en yakın "Genel" kategoriyi seç.
2. Sadece sağlanan Kategori ID'lerini kullan.
3. Yanıt sadece geçerli bir JSON objesi olsun.
`;
router.post('/classify-category', verifyToken, validateRequest({ body: classifySchema }), async (req, res) => {
    try {
        const { items } = req.body;
        logger.info('AI Category Classification Request', { itemCount: items.length });
        // Teklifbul Rule v3.0 - Use Groq for ultra fast classification
        const messages = [
            { role: 'user', content: `Aşağıdaki ürünleri sınıflandır:\n${items.join('\n')}` }
        ];
        const result = await sendChat(messages, {
            provider: 'groq',
            systemPrompt: CLASSIFY_SYSTEM_PROMPT,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1, // Düşük sıcaklık = daha kararlı tahmin
            maxTokens: 1000,
        });
        let classification = {};
        try {
            // JSON bloğunu temizle (bazı modeller ```json ... ``` içinde dönebiliyor)
            let cleanContent = result.text.trim();
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```(json)?/, '').replace(/```$/, '').trim();
            }
            classification = JSON.parse(cleanContent);
        }
        catch (e) {
            logger.error('AI response parsing failed', { content: result.text, error: e });
            return res.status(500).json({ error: 'classification_parse_error', message: 'Yapay zeka yanıtı anlaşılamadı.' });
        }
        return res.json({
            ok: true,
            classification,
            usage: result.totalTokens
        });
    }
    catch (error) {
        logger.error('Category classification failed', error);
        return res.status(500).json({ error: 'classification_failed', message: error.message });
    }
});
export default router;
