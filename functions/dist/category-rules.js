// Teklifbul Rule v1.0 - Kategori uyumluluk kuralları
// Bu modül hem frontend (Vite/vanilla) hem de backend (Express/Firebase Functions) tarafından paylaşılır.
// Malzeme tanımları ile kategori eşleşmelerini belirlemek için anahtar kelime tabanlı basit bir sistem sağlar.
// Türkçe normalizasyon için helper fonksiyon (backend uyumluluğu için inline)
function normalizeTRLower(text) {
    if (!text)
        return '';
    return text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u');
}
/**
 * Malzeme etiketleri sözlüğü.
 * Her etiket bir dizi anahtar kelimeyi dinler ve bu kelimeler talep kalemlerinde geçtiğinde etiket aktive olur.
 */
export const MATERIAL_TAG_DICTIONARY = [
    { tag: 'construction', keywords: ['inşaat', 'şantiye', 'beton', 'kalıp', 'kaba yapı', 'demir', 'çimento', 'cimento', 'çimento 32', 'hazır beton', 'inşaat demiri', 'inşaat kerestesi', 'kereste', '5x10', '5 x 10', 'kalıp tahtası', 'kalıp kerestesi', 'beton direk', 'duvar harcı', 'sıva harcı', 'saha', 'prefabrik', 'iskele', 'kaba inşaat', 'ince inşaat', 'duvar', 'tuğla', 'gaz beton', 'ytong', 'bims', 'kiremit', 'kalekim', 'derz', 'derz dolgusu', 'sıva', 'alçı', 'alçıpan', 'kartonpiyer', 'strafor', 'mantolama', 'ısı yalıtım', 'su yalıtım', 'izolasyon', 'xps', 'eps', 'çakıl', 'mıcır', 'kum', 'dökme beton', 'temel betonu', 'bordür', 'kaldırım taşı', 'park taşı', 'bahçe duvarı', 'istinat duvarı'] },
    { tag: 'metal', keywords: ['metal', 'sac', 'profil', 'çelik', 'konstrüksiyon', 'levha', 'rulo sac', 'rulo çelik', 'rulo metal', 'rulo levha', 'profil demir', 'kutup profil', 'lama', 'npu', 'npı', 'hekzagonal', 'çelik konstrüksiyon', 'lama demir', 'köşebent', 'çelik boru', 'çekme boru'] },
    { tag: 'electrical', keywords: ['elektrik', 'kablo', 'gerilim', 'şalt', 'pano', 'trafo', 'ayrıcı', 'akım', 'priz', 'anahtar', 'sigorta', 'otomatik sigorta', 'kaçak akım rölesi', 'klemens', 'kanal', 'enerji kablosu', 'nyy', 'nym', 'nyaf', '3x1,5', '3x1.5', '3x2,5', '3x2.5', 'tesisat kablosu', 'aydınlatma kablosu', 'hes kablo', 'priz hattı', 'sigorta panosu', 'pano montaj', 'kompanzasyon', 'barakolik', 'kablo kanalı'] },
    { tag: 'electronics', keywords: ['elektronik', 'sensor', 'sensör', 'kart', 'devre', 'plc', 'hmi', 'controller', 'endüstriyel pc', 'endüstriyel bilgisayar', 'haberleşme kartı', 'io kartı', 'modbus', 'profinet', 'ethernet switch', 'endüstriyel switch'] },
    { tag: 'automation', keywords: ['otomasyon', 'scada', 'plc', 'drive', 'servo', 'robot', 'inverter', 'frekans konvertör', 'servo sürücü', 'servo motor', 'step motor', 'redüktörlü motor', 'otomasyon paneli'] },
    { tag: 'machine', keywords: ['makine', 'imalat', 'cnc', 'tezgah', 'torna', 'frez', 'hidrolik', 'pnomatik', 'pres', 'hidrolik pres', 'pnömatik pres', 'kompresör', 'hava kompresörü', 'jant tezgahı', 'pres tezgahı', 'silindir makinesi'] },
    { tag: 'fastener', keywords: ['hırdavat', 'vida', 'civata', 'somun', 'ankraj', 'saplama', 'pul', 'rondela', 'tirfon', 'çivi', 'tel çivi', 'dübel', 'kimyasal dübel', 'çelik dübel', 'perçin', 'çektirmeli dübel', 'hırdavat malzemeleri', 'hırdavat ürünleri', 'tornavida', 'klasik tornavida', 'uçlu tornavida', 'çekiç', 'pens', 'lokma', 'imbus', 'anahtar takımı', 'bit ucu', 'uç seti'] },
    { tag: 'chemical', keywords: ['kimyasal', 'solvent', 'epoksi', 'reçine', 'boya', 'kimya', 'asit', 'akaryakıt', 'benzin', 'motorin', 'dizel', 'fuel oil', 'hidrolik yağ', 'madeni yağ', 'gres', 'endüstriyel yağ', 'dekapaj', 'tiner', 'çözücü', 'temizlik kimyasalı', 'asit bazlı temizleyici', 'bazik temizleyici'] },
    { tag: 'paint', keywords: ['boya', 'kaplama', 'renk', 'astar', 'iç cephe boyası', 'dış cephe boyası', 'epoksi boya', 'zemin boyası', 'yol çizgi boyası', 'vernik', 'lake', 'jelatin boya', 'sprey boya', 'renk kartelası', 'boya astarı'] },
    { tag: 'plastic', keywords: ['plastik', 'granül', 'polietilen', 'pe', 'pp', 'pet', 'enjeksiyon', 'pp boru', 'pprc boru', 'pprc', 'pimaş', 'pimas', 'pvc boru', 'pvc fitting', 'pvc ek parça', 'polikarbon', 'poliamid', 'polikarbon levha', 'pleksi', 'plastik kasa', 'plastik palet', 'plastik bidon'] },
    { tag: 'packaging', keywords: ['ambalaj', 'koli', 'streç', 'palet', 'paketleme', 'koli bandı', 'kraft koli', 'balonlu naylon', 'hava yastığı', 'kargo poşeti', 'opp poşet', 'kutu', 'ambalaj naylonu', 'kova', 'bidon', 'bigbag', 'çuval'] },
    { tag: 'safety', keywords: ['kkd', 'iş güvenliği', 'baret', 'eldiven', 'mask', 'emniyet', 'iş ayakkabısı', 'iş elbisesi', 'tulum', 'reflektörlü yelek', 'gözlük', 'kulaklık', 'toz maskesi', 'gaz maskesi', 'düşme önleyici', 'emniyet kemeri', 'emniyet halatı', 'çalışma iskele emniyeti'] },
    { tag: 'cleaning', keywords: ['temizlik', 'dezenfektan', 'mop', 'deterjan', 'hijyen', 'cam sil', 'çamaşır suyu', 'yer temizleyici', 'yüzey temizleyici', 'kireç çözücü', 'tuvalet temizleyici', 'paspas', 'yer bezi', 'çöp poşeti', 'kağıt havlu', 'tuvalet kağıdı', 'peçete', 'sabun', 'sıvı sabun', 'el dezenfektanı'] },
    { tag: 'food', keywords: ['gıda', 'ikram', 'yiyecek', 'içecek', 'kahve', 'çay', 'şekerleme', 'su', 'damacana su', 'pet su', 'soğuk içecek', 'gazlı içecek', 'kola', 'meyve suyu', 'bisküvi', 'çikolata', 'goffret', 'kraker', 'kuruyemiş', 'çerez', 'çörek', 'poğaça', 'hazır kahve', 'filtre kahve', '3ü1 arada', '2si1 arada', 'şeker', 'stick şeker', 'domates', 'sebze', 'meyve', 'patates', 'soğan', 'biber', 'salatalık', 'patlıcan', 'yeşillik', 'marul', 'limon', 'mandalina', 'portakal', 'havuç', 'lahana', 'karnabahar', 'brokoli', 'ıspanak', 'maydanoz', 'dereotu', 'nane', 'roka', 'fasulye', 'bezelye', 'mısır', 'kabak', 'bamya', 'pırasa', 'kereviz', 'turp', 'pancar', 'elma', 'armut', 'muz', 'çilek', 'kiraz', 'karpuz', 'kavun', 'üzüm', 'şeftali', 'kayısı', 'erik', 'incir', 'nar', 'avokado'] },
    { tag: 'service', keywords: ['hizmet', 'bakım', 'onarım', 'montaj', 'servis', 'usta', 'usta işi', 'işçilik', 'montaj hizmeti', 'demontaj', 'kurulum', 'periyodik bakım', 'bakım anlaşması', 'arıza hizmeti', 'servis hizmeti', 'tesisat', 'su tesisatı', 'temiz su tesisatı', 'atık su tesisatı', 'doğalgaz tesisatı', 'tesisat işçiliği', 'marangoz', 'marangozluk', 'ahşap işçiliği', 'ahşap imalat', 'peyzaj', 'bahçe bakımı', 'bahçe düzenleme', 'budama', 'ilaçlama', 'bahçe sulama', 'otomatik sulama', 'havuz bakımı', 'havuz temizliği', 'çim biçme', 'rulo çim serme', 'fidan dikimi', 'ağaç dikimi', 'bitki dikimi'] },
    { tag: 'logistics', keywords: ['lojistik', 'nakliye', 'taşıma', 'kargo', 'depolama', 'nakliyeci', 'parsiyel', 'komple taşıma', 'kargolama', 'ambar', 'kamyon', 'tır', 'çekici', 'şöförlü araç', 'lojistik hizmeti'] },
    { tag: 'hvac', keywords: ['hvac', 'iklimlendirme', 'klima', 'vrf', 'havalandırma', 'kanal', 'chiller', 'split klima', 'multi klima', 'kanallı klima', 'fancoil', 'chiller ünitesi', 'soğutma grubu', 'ısı pompası', 'ısı geri kazanım', 'havalandırma santrali'] },
    { tag: 'fire', keywords: ['yangın', 'sprinkler', 'yangın söndürme', 'dedektör', 'alarm', 'yangın dolabı', 'yangın hortumu', 'yangın vanası', 'yangın tüpü', 'yangın tüpü dolum', 'yangın algılama', 'yangın ihbar sistemi', 'yangın paneli'] },
    { tag: 'lighting', keywords: ['aydınlatma', 'armatür', 'projektör', 'led', 'sarkıt armatür', 'tavan armatürü', 'yer spotu', 'sokak armatürü', 'lineer armatür', 'ray spot', 'acil aydınlatma', 'acil yönlendirme'] },
    { tag: 'furniture', keywords: ['mobilya', 'ofis mobilya', 'masa', 'dolap', 'sandaly', 'ofis sandalyesi', 'ofis koltuğu', 'yönetici koltuğu', 'toplantı masası', 'çalışma masası', 'etajer', 'dosya dolabı', 'raf sistemi', 'banko', 'tezgah', 'mutfak dolabı', 'banyo dolabı', 'ahşap kapı', 'çelik kapı', 'oda kapısı', 'pencere doğrama', 'ahşap panel', 'mdf lam', 'suntalam', 'parkeler', 'laminant parke'] },
    { tag: 'rental', keywords: ['kiralama', 'forklift', 'vinç', 'platform', 'iş makinesi', 'kiralık forklift', 'kiralık vinç', 'kiralık sepetli platform', 'kiralık iş makinesi', 'kısa süreli kiralama', 'günlük kiralama', 'haftalık kiralama', 'aylık kiralama'] },
    {
        tag: 'landscape',
        keywords: [
            'peyzaj', 'bahçe', 'bahce',
            'rulo çim', 'rulo cim',
            'hazır çim', 'hazir cim',
            'çim', 'cim',
            'fidan', 'bitki', 'ağaç', 'agac', 'çalı', 'cali', 'çiçek', 'cicek',
            'saksı', 'toprak', 'torf', 'gübre', 'bahçe toprağı', 'bahce topraği',
            'budama', 'ilaçlama', 'bahçe bakımı', 'bahce bakimi',
            'sulama sistemi', 'damla sulama', 'sprink', 'sprinkler',
            'bahçe hortumu', 'bahce hortumu', 'otomatik sulama'
        ]
    },
    {
        tag: 'plumbing',
        keywords: [
            'tesisat', 'su tesisatı', 'dogalgaz tesisatı', 'doğalgaz tesisatı',
            'pprc boru', 'pprc', 'pvc boru', 'pimaş', 'pimas',
            'kolektör', 'kollektör',
            'drenaj', 'radaıyatör', 'radyatör', 'kalorifer',
            'vana', 'küresel vana', 'kontrol vanası',
            'dirsek', 'tee', 'reduk-siyon', 'reduksiyon',
            'pis su hattı', 'temiz su hattı'
        ]
    },
    {
        tag: 'woodwork',
        keywords: [
            'marangoz', 'marangozluk',
            'ahşap', 'ahsap',
            'mobilya imalat', 'dolap imalatı', 'mutfak dolabı', 'banyo dolabı',
            'kapı imalatı', 'ahşap kapı', 'iç kapı',
            'ahşap doğrama', 'ahşap pergole', 'pergole',
            'deck kaplama', 'ahşap deck'
        ]
    },
    {
        tag: 'fuel',
        keywords: [
            'akaryakıt', 'akaryakit',
            'benzin', 'motorin', 'dizel', 'fuel oil',
            'mazot', 'yedek yakıt',
            'madeni yağ', 'endüstriyel yağ', 'hidrolik yağ', 'gres',
            'yağlama yağı'
        ]
    }
];
/**
 * Kategori bazlı kurallar.
 * materialTags: Kategorinin doğal olarak eşleşmesi beklenen etiketler
 * blockedTags: Kategori için tamamen uyumsuz etiketler
 * requiredAttributes: UI'da belirtilmesi gereken kritik özellikler (örn. HVAC için kapasite)
 */
export const CATEGORY_RULES = {
    'CAT.INSAAT': { materialTags: ['construction', 'metal', 'landscape'], blockedTags: ['food', 'cleaning'], requiredAttributes: [] },
    'CAT.SACMETAL': { materialTags: ['metal'], blockedTags: ['food', 'cleaning'], requiredAttributes: [] },
    'CAT.MAKINEIMALAT': { materialTags: ['machine', 'metal'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.HIRDAVAT': { materialTags: ['fastener', 'construction'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.AMBALAJ': { materialTags: ['packaging'], blockedTags: ['construction'], requiredAttributes: [] },
    'CAT.KIMYASAL': { materialTags: ['chemical'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.BOYA': { materialTags: ['paint', 'chemical'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.PLASTIK': { materialTags: ['plastic'], blockedTags: [], requiredAttributes: [] },
    'CAT.ELEKTRIK': { materialTags: ['electrical'], blockedTags: ['food'], requiredAttributes: ['gerilim'] },
    'CAT.ELEKTRONIK': { materialTags: ['electronics'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.AYDINLATMA': { materialTags: ['lighting', 'electrical'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.AGMG': { materialTags: ['electrical'], blockedTags: ['food'], requiredAttributes: ['gerilim'] },
    'CAT.OTOMASYON': { materialTags: ['automation', 'electronics'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.KAYNAK': { materialTags: ['metal', 'machine'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.RULMAN': { materialTags: ['machine'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.OTOMOTIVYS': { materialTags: ['machine', 'metal'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.ISG': { materialTags: ['safety'], blockedTags: [], requiredAttributes: [] },
    'CAT.TEMIZLIK': { materialTags: ['cleaning'], blockedTags: ['construction'], requiredAttributes: [] },
    'CAT.GIDA': { materialTags: ['food'], blockedTags: ['chemical'], requiredAttributes: [] },
    'CAT.HIZMET': { materialTags: ['service'], blockedTags: [], requiredAttributes: [] },
    'CAT.LOJISTIK': { materialTags: ['logistics'], blockedTags: [], requiredAttributes: [] },
    'CAT.MOBILYA': { materialTags: ['furniture'], blockedTags: [], requiredAttributes: [] },
    'CAT.HVAC': { materialTags: ['hvac'], blockedTags: ['food'], requiredAttributes: ['kapasite'] },
    'CAT.YANGIN': { materialTags: ['fire', 'safety'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.KIRALAMA': { materialTags: ['rental', 'logistics'], blockedTags: [], requiredAttributes: [] },
    'CAT.PEYZAJ': { materialTags: ['landscape', 'service', 'construction'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.TESISAT': { materialTags: ['plumbing', 'construction'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.MARANGOZ': { materialTags: ['woodwork', 'construction', 'service'], blockedTags: ['food'], requiredAttributes: [] },
    'CAT.AKARYAKIT': { materialTags: ['fuel', 'chemical'], blockedTags: ['food'], requiredAttributes: [] }
};
const DEFAULT_RULE = { materialTags: [], blockedTags: [], requiredAttributes: [] };
export function getCategoryRule(categoryId) {
    return CATEGORY_RULES[categoryId] || DEFAULT_RULE;
}
/**
 * Talep kalemlerindeki metinlerden malzeme profili çıkartır.
 * @param {Array} items Talep kalemleri
 * @param {object} context Ek bağlam (title, spec gibi)
 * @returns {{ tags: string[], attributes: string[], textLength: number, rawText: string }}
 */
export function buildMaterialProfileFromItems(items = [], context = {}) {
    const textParts = [];
    const attributes = new Set();
    const safeItems = Array.isArray(items) ? items : [];
    safeItems.forEach(item => {
        if (!item)
            return;
        const name = (item.name || item.itemName || '').toString();
        const brand = (item.brandModel || '').toString();
        const desc = (item.description || '').toString();
        if (name)
            textParts.push(name);
        if (brand)
            textParts.push(brand);
        if (desc)
            textParts.push(desc);
        if (Array.isArray(item.ozellikler)) {
            item.ozellikler.forEach(pair => {
                const key = (pair?.key || '').toString();
                const value = (pair?.value || '').toString();
                if (key || value) {
                    textParts.push(`${key} ${value}`);
                    if (key)
                        attributes.add(key.toLowerCase());
                }
            });
        }
        if (Array.isArray(item.kaliteSertifika)) {
            item.kaliteSertifika.forEach(cert => textParts.push(cert));
        }
    });
    if (context.title)
        textParts.push(context.title);
    if (context.spec)
        textParts.push(context.spec);
    // Teklifbul Rule v1.0 - Türkçe karakter normalizasyonu ile eşleştirme
    const combined = normalizeTRLower(textParts.join(' '));
    const tags = new Set();
    const matchedKeywords = new Set(); // Eşleşen keyword'leri takip et (kısa keyword'lerin uzun keyword'lerle çakışmasını önlemek için)
    // Teklifbul Rule v1.0 - Önce uzun keyword'leri kontrol et (daha spesifik eşleşmeler için)
    // Örnek: "rulo çim" önce "rulo çim" ile eşleşmeli, sonra "rulo" ile değil
    const allRules = MATERIAL_TAG_DICTIONARY.map(rule => ({
        ...rule,
        normalizedKeywords: rule.keywords.map(kw => ({
            original: kw,
            normalized: normalizeTRLower(kw)
        })).sort((a, b) => b.normalized.length - a.normalized.length) // Uzun keyword'ler önce
    }));
    // Teklifbul Rule v1.0 - Önce tüm uzun keyword'leri kontrol et (tüm rule'lar için)
    // Sonra kısa keyword'leri kontrol et (uzun keyword'lerle çakışmayanlar için)
    const longKeywords = []; // Uzun keyword'ler (2+ kelime veya 8+ karakter)
    const shortKeywords = []; // Kısa keyword'ler
    allRules.forEach(rule => {
        rule.normalizedKeywords.forEach(kwObj => {
            const keyword = kwObj.normalized;
            const wordCount = keyword.split(/\s+/).length;
            if (wordCount >= 2 || keyword.length >= 8) {
                longKeywords.push({ rule, keyword, kwObj });
            }
            else {
                shortKeywords.push({ rule, keyword, kwObj });
            }
        });
    });
    // Önce uzun keyword'leri kontrol et
    longKeywords.forEach(({ rule, keyword, kwObj }) => {
        if (matchedKeywords.has(keyword))
            return;
        // Tam eşleşme kontrolü
        const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (wordBoundaryRegex.test(combined) || combined.includes(keyword)) {
            tags.add(rule.tag);
            matchedKeywords.add(keyword);
            // Uzun keyword'ün içindeki kelimeleri de işaretle (çakışmayı önlemek için)
            const words = keyword.split(/\s+/);
            words.forEach(word => {
                if (word.length >= 3) {
                    matchedKeywords.add(word);
                }
            });
        }
    });
    // Sonra kısa keyword'leri kontrol et (uzun keyword'lerle çakışmayanlar için)
    shortKeywords.forEach(({ rule, keyword, kwObj }) => {
        if (matchedKeywords.has(keyword))
            return;
        // Tam eşleşme kontrolü (word boundary ile)
        const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (wordBoundaryRegex.test(combined) || combined.includes(keyword)) {
            tags.add(rule.tag);
            matchedKeywords.add(keyword);
        }
    });
    return {
        rawText: combined,
        textLength: combined.length,
        tags: Array.from(tags),
        attributes: Array.from(attributes)
    };
}
/**
 * Belirli bir kategorinin verilen malzeme profili ile uyumluluğunu değerlendirir
 */
export function evaluateCategoryCompatibility(categoryId, profile = {}) {
    const rule = getCategoryRule(categoryId);
    const profileTags = new Set(profile.tags || []);
    const profileAttributes = new Set((profile.attributes || []).map(attr => attr.toLowerCase()));
    const hasSignals = (profile.tags?.length || 0) > 0;
    const matchedTags = (rule.materialTags || []).filter(tag => profileTags.has(tag));
    const blockedTags = (rule.blockedTags || []).filter(tag => profileTags.has(tag));
    const missingAttributes = (rule.requiredAttributes || []).filter(attr => !profileAttributes.has(attr.toLowerCase()));
    let status = 'compatible';
    let reason = '';
    if (blockedTags.length) {
        status = 'blocked';
        reason = `Çakışan etiketler: ${blockedTags.join(', ')}`;
    }
    else if ((rule.materialTags || []).length && hasSignals && matchedTags.length === 0) {
        status = 'mismatch';
        reason = 'Malzeme tanımı bu kategoriyle eşleşmiyor.';
    }
    else if (missingAttributes.length) {
        status = 'warning';
        reason = `Eksik özellikler: ${missingAttributes.join(', ')}`;
    }
    else if (!hasSignals) {
        status = 'unknown';
        reason = 'Malzeme tanımı henüz girilmedi.';
    }
    else {
        status = 'compatible';
    }
    const score = (rule.materialTags || []).length
        ? matchedTags.length / rule.materialTags.length
        : (hasSignals ? 0.5 : 0);
    return {
        categoryId,
        status,
        score,
        matchedTags,
        blockedTags,
        missingAttributes,
        reason,
        rule
    };
}
/**
 * Bir grup kategorinin uyumluluk skorlarını özetler
 */
export function summarizeGroupCompatibility(categoryIds = [], profile = {}) {
    const summary = {
        total: categoryIds.length,
        compatible: 0,
        warning: 0,
        mismatch: 0,
        blocked: 0,
        unknown: 0,
        details: []
    };
    categoryIds.forEach(id => {
        const result = evaluateCategoryCompatibility(id, profile);
        summary.details.push(result);
        summary[result.status] = (summary[result.status] || 0) + 1;
    });
    return summary;
}
/**
 * Malzeme profiline göre en uygun kategorileri önerir
 * blocked kategoriler artık tamamen filtrelenmez, sadece uyarı olarak gösterilir
 */
export function suggestCategoriesForProfile(profile = {}, limit = 3) {
    const scored = Object.keys(CATEGORY_RULES).map(id => {
        const result = evaluateCategoryCompatibility(id, profile);
        return { id, score: result.score, status: result.status };
    });
    return scored
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(entry => entry.id);
}
