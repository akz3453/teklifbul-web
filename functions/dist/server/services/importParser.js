import ExcelJS from 'exceljs';
import levenshtein from 'fast-levenshtein';
import { parse as parseDate, isValid } from 'date-fns';
import { z } from 'zod';
const DICT = {
    itemName: ['ürün adı', 'ürün ismi', 'malzeme', 'stok adı', 'açıklama', 'ürün', 'malzeme tanımı', 'malzeme tanım', 'tanım'],
    sku: ['stok kodu', 'sku', 'kod', 'ürün kodu', 'malzeme kodu', 'item code', 'product code'],
    qty: ['miktar', 'qty', 'adet'],
    unit: ['birim', 'unit'],
    unitPriceExcl: ['birim fiyat', 'net fiyat', 'b.fiyat', 'bf', 'fiyat', 'hedef fiyat', 'hedef fiyat (tl)'],
    vatPct: ['kdv', 'kdv %', 'kdv oranı'],
    currency: ['para birimi', 'pb', 'currency', 'döviz', 'doviz'],
    deliveryDate: ['teslim tarihi', 'sevk tarihi', 'termin', 'istenilen teslim tarihi', 'istenilen teslim'],
    brand: ['marka', 'marka/model', 'marka model'],
    model: ['model'],
    note: ['not', 'açıklama']
};
const REQUIRED_ITEM = ['itemName', 'qty', 'unit'];
const demandSchema = z.object({
    title: z.string().min(1),
    requester: z.string().nullable().optional(),
    demandDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).default('TRY'),
    satfk: z.string().nullable().optional(),
    // Teklifbul Rule v1.0 - Şablon alanları eklendi
    siteName: z.string().nullable().optional(),
    deliveryAddress: z.string().nullable().optional(),
    invoiceAddress: z.string().nullable().optional(),
    deliveryMethod: z.string().nullable().optional(), // Teslim Şekli
    purchaseLocation: z.string().nullable().optional(), // Alım Yeri (İl)
    paymentTerms: z.string().nullable().optional(), // Ödeme Şartları
    biddingMode: z.string().nullable().optional(), // Talep Tipi
    priority: z.string().nullable().optional(), // Öncelik
    approver: z.string().nullable().optional(), // Onaylayan
    categories: z.string().nullable().optional()
});
const N = (s) => String(s ?? '').trim().toLowerCase();
const sim = (a, b) => { a = N(a); b = N(b); if (!a || !b)
    return 0; const d = levenshtein.get(a, b); return 1 - d / Math.max(a.length, b.length); };
function pick(headers, key) {
    let best = { idx: -1, score: 0 };
    headers.forEach((h, i) => {
        const terms = DICT[key] || [];
        const s = Math.max(sim(h, key), ...terms.map(t => sim(h, t)));
        if (s > best.score)
            best = { idx: i, score: s };
    });
    // Teklifbul Rule v1.0 - Minimum skor artırıldı (0.55 -> 0.65) daha doğru eşleştirme için
    return best.score >= 0.65 ? best.idx : -1;
}
// ---- Helpers: cell reading, numbers, dates, currency ---------------------
function readCell(v) {
    // ExcelJS cell.value çeşitli tiplerde olabilir
    if (v == null)
        return undefined;
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date)
        return v;
    // Formula
    if (typeof v === 'object' && 'formula' in v && 'result' in v) {
        return v.result ?? v.formula;
    }
    // RichText
    if (typeof v === 'object' && 'richText' in v) {
        const parts = v.richText || [];
        return parts.map((p) => p.text).join('');
    }
    // Hyperlink
    if (typeof v === 'object' && 'text' in v) {
        return v.text;
    }
    return String(v);
}
function toISO(v) {
    const raw = readCell(v);
    if (!raw)
        return undefined;
    if (raw instanceof Date)
        return raw.toISOString().slice(0, 10);
    const s = String(raw).trim();
    const fmts = ['yyyy-MM-dd', 'dd.MM.yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy'];
    for (const f of fmts) {
        const d = parseDate(s, f, new Date());
        if (isValid(d))
            return d.toISOString().slice(0, 10);
    }
    return s || undefined;
}
function parseNumberTR(input) {
    const raw = readCell(input);
    if (raw == null || raw === '')
        return undefined;
    if (typeof raw === 'number')
        return isFinite(raw) ? raw : undefined;
    const s0 = String(raw).trim();
    if (!s0)
        return undefined;
    const hasDot = s0.includes('.');
    const hasComma = s0.includes(',');
    let s = s0;
    if (hasDot && hasComma) {
        // son görülen ayırıcıyı ondalık kabul et
        if (s0.lastIndexOf(',') > s0.lastIndexOf('.')) {
            s = s0.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
        }
        else {
            s = s0.replace(/,/g, ''); // 1,234.56 -> 1234.56
        }
    }
    else if (hasComma && !hasDot) {
        s = s0.replace(',', '.'); // 1234,56 -> 1234.56
    }
    else {
        // 1.234 -> 1234 (binlik olabilir)
        const m = s0.match(/^(\d{1,3}(\.\d{3})+)(\.\d+)?$/);
        if (m && !m[3])
            s = s0.replace(/\./g, '');
    }
    const n = Number(s);
    return isFinite(n) ? n : undefined;
}
const CURRENCY_MAP = {
    TL: 'TRY', TRY: 'TRY', '₺': 'TRY',
    USD: 'USD', $: 'USD', DOLAR: 'USD',
    EUR: 'EUR', EURO: 'EUR', '€': 'EUR',
    GBP: 'GBP', '£': 'GBP'
};
function normalizeCurrency(v) {
    const raw = readCell(v);
    const s = String(raw ?? '').trim().toUpperCase();
    const cleaned = s.replace(/[^A-Z£$€₺]/g, ''); // boşluk/simge temizliği
    return CURRENCY_MAP[cleaned];
}
function isRowMeaningful(i) {
    // en azından itemName var ve qty veya unit’ten biri doluysa anlamlı say
    return !!(i.itemName && (i.qty != null || (i.unit && String(i.unit).trim().length > 0)));
}
// -------------------------------------------------------------------------
export async function previewXlsx(buf) {
    // Teklifbul Rule v1.0 - Hata yönetimi iyileştirildi
    let wb;
    try {
        wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
    }
    catch (loadError) {
        console.error('[Import] Excel load error:', loadError);
        throw new Error(`Excel dosyası yüklenemedi: ${loadError.message || String(loadError)}. Dosya bozuk olabilir veya geçersiz format olabilir.`);
    }
    const names = wb.worksheets.map(s => s.name.toLowerCase());
    const ws0 = wb.worksheets[0];
    if (!ws0)
        throw new Error('Excel sayfası boş görünüyor');
    // Teklifbul Rule v1.0 - Şablon yapısı: "Talep Bilgileri" ve "Kalemler" sayfaları
    // Önce "Kalemler" sayfasını bul (tam eşleşme veya benzer)
    const itemsSheetByName = wb.worksheets.find(s => {
        const name = (s.name || '').toLowerCase();
        return name === 'kalemler' || name.includes('kalem') || name.includes('item') || name.includes('malzeme');
    });
    // Eğer "Kalemler" sayfası bulunamazsa, ikinci sayfayı dene (şablon yapısında genellikle ikinci sayfa)
    const second = wb.worksheets[1];
    const wsItems = itemsSheetByName || second || ws0; // tek sayfa ise ws0 kullan
    // Debug: Hangi sayfanın kullanıldığını logla
    // Teklifbul Rule v1.0 - Structured Logging
    console.info('[Import] Items sheet detection:', {
        allSheets: wb.worksheets.map(s => ({ name: s.name, rowCount: s.rowCount })),
        selectedSheet: wsItems?.name || 'not found',
        rowCount: wsItems?.rowCount || 0
    });
    // Teklifbul Rule v1.0 - Şablon yapısına göre hücre eşleştirmeleri
    // Şablon yapısı: A sütunu başlıklar, B sütunu değerler
    // A4: "Başlık *:" → B4 → title
    // A5: "Şantiye:" → B5 → siteName
    // A6: "Talep Oluşturma Tarihi:" → B6 → demandDate
    // A7: "Termin:" → B7 → dueDate
    // A8: "Talep Eden Şirket Adı:" → B8 (sistem otomatik kullanır, yok sayılır)
    // A9: "Teslimat Adresi:" → B9 → deliveryAddress
    // A10: "Fatura Adresi:" → B10 → invoiceAddress
    // A21: "Kategoriler:" → B21 → categories
    // Para Birimi genellikle A11: "Para Birimi *:" → B11
    // Başlık (A4: "Başlık *:" → B4) - Teklifbul Rule v1.0: B4'ten okunmalı, B9 değil!
    let title = String(readCell(ws0.getCell('B4')?.value) || '').trim();
    if (!title) {
        // Fallback: Eski yapı için geriye dönük uyumluluk
        title = String(readCell(ws0.getCell('B2')?.value) || readCell(ws0.getCell('C2')?.value) || '').trim();
        if (!title) {
            title = String(readCell(ws0.getCell('A1')?.value) || readCell(ws0.getCell('B1')?.value) || '').trim() || 'Talep Başlığı';
        }
    }
    // SATFK: Boş bırakılır, sistem otomatik atar (A3: "Satın Alma Talep Formu Kodu (SATFK):" → B3 boş)
    // Şantiye (A5 → B5)
    const siteName = String(readCell(ws0.getCell('B5')?.value) || '').trim();
    // Talep Oluşturma Tarihi (A6 → B6)
    const demandDate = toISO(ws0.getCell('B6')?.value);
    // Termin (A7 → B7)
    const dueDate = toISO(ws0.getCell('B7')?.value);
    // Teslim Şekli (A8: "Teslim Şekli *:" → B8) - Nakliye Dahil/Hariç/Özel Teslimat
    const deliveryMethod = String(readCell(ws0.getCell('B8')?.value) || '').trim();
    console.info('[Import] Teslim Şekli okundu', { cell: 'B8', value: deliveryMethod, raw: ws0.getCell('B8')?.value });
    // Teslimat Adresi (A9: "Teslimat Adresi:" → B9) - Teklifbul Rule v1.0: B9'dan okunmalı
    const deliveryAddress = String(readCell(ws0.getCell('B9')?.value) || '').trim();
    // Fatura Adresi (A10 → B10)
    const invoiceAddress = String(readCell(ws0.getCell('B10')?.value) || '').trim();
    // Para Birimi (A11: "Para Birimi *:" → B11)
    const rawCurrency = readCell(ws0.getCell('B11')?.value) || readCell(ws0.getCell('B6')?.value);
    const currency = normalizeCurrency(rawCurrency);
    // Alım Yeri (İl) (A12: "Alım Yeri (İl):" → B12) - Teklifbul Rule v1.0: Eksikti, eklendi
    const purchaseLocation = String(readCell(ws0.getCell('B12')?.value) || '').trim();
    // Ödeme Şartları (A14: "Ödeme Şartları:" → B14)
    const paymentTerms = String(readCell(ws0.getCell('B14')?.value) || '').trim();
    // Talep Tipi (A15: "Talep Tipi:" → B15) - Gizli/Açık/Hibrit
    const biddingMode = String(readCell(ws0.getCell('B15')?.value) || '').trim();
    console.info('[Import] Talep Tipi okundu', { cell: 'B15', value: biddingMode, raw: ws0.getCell('B15')?.value });
    // Öncelik (A17: "Öncelik *:" → B17) - Fiyat/Hız/Kalite
    const priority = String(readCell(ws0.getCell('B17')?.value) || '').trim();
    // Onaylayan (A18: "Onaylayan:" → B18) - Eğer boşsa kullanıcı adı kullanılır
    const approver = String(readCell(ws0.getCell('B18')?.value) || '').trim();
    // Kategoriler (A21 → B21) - "hepsi" yazıyorsa TÜM_KATEGORILER olarak işaretle
    let categories = String(readCell(ws0.getCell('B21')?.value) || '').trim();
    const categoriesOriginal = categories;
    console.info('[Import] Kategoriler okundu (ham)', { cell: 'B21', value: categories, raw: ws0.getCell('B21')?.value });
    // Teklifbul Rule v1.0 - "hepsi" kontrolü
    if (/^hepsi$/i.test(categories)) {
        categories = 'TÜM_KATEGORILER';
        console.info('[Import] Kategoriler "hepsi" olarak işaretlendi', { original: categoriesOriginal, converted: 'TÜM_KATEGORILER' });
    }
    const demandRaw = {
        satfk: null, // Teklifbul Rule v1.0 - SATFK boş bırakılır, sistem otomatik atar
        title,
        siteName: siteName || null, // Teklifbul Rule v1.0 - Şantiye eklendi
        requester: null, // Sistem otomatik kullanıcının firmasını kullanır
        demandDate,
        dueDate,
        currency,
        deliveryAddress: deliveryAddress || null, // Teklifbul Rule v1.0 - Teslimat Adresi (B9)
        invoiceAddress: invoiceAddress || null, // Teklifbul Rule v1.0 - Fatura Adresi
        deliveryMethod: deliveryMethod || null, // Teklifbul Rule v1.0 - Teslim Şekli
        purchaseLocation: purchaseLocation || null, // Teklifbul Rule v1.0 - Alım Yeri (İl) (B12)
        paymentTerms: paymentTerms || null, // Teklifbul Rule v1.0 - Ödeme Şartları
        biddingMode: biddingMode || null, // Teklifbul Rule v1.0 - Talep Tipi
        priority: priority || null, // Teklifbul Rule v1.0 - Öncelik
        approver: approver || null, // Teklifbul Rule v1.0 - Onaylayan
        categories: categories || null // Teklifbul Rule v1.0 - Kategoriler (hepsi → TÜM_KATEGORILER)
    };
    const demand = demandSchema.parse({ ...demandRaw });
    // Teklifbul Rule v1.0 - Field candidates: Şablon yapısına göre A sütunu başlık, B sütunu değer
    // Özel hücre eşleştirmeleri yukarıda yapıldı, burada genel label/value çiftleri toplanıyor
    const fieldCandidates = [];
    // Teklifbul Rule v1.0 - Önce özel eşleştirmeleri ekle (şablon yapısına göre)
    // Duplicate kontrolü: Aynı label'ı tekrar ekleme
    const addedLabels = new Set();
    const addCandidate = (label, value) => {
        if (value && !addedLabels.has(label)) {
            fieldCandidates.push({ label, value });
            addedLabels.add(label);
        }
    };
    addCandidate('Başlık *:', title);
    addCandidate('Şantiye:', siteName);
    addCandidate('Talep Oluşturma Tarihi:', demandDate || '');
    addCandidate('Termin:', dueDate || '');
    addCandidate('Teslim Şekli *:', deliveryMethod);
    addCandidate('Teslimat Adresi:', deliveryAddress);
    addCandidate('Fatura Adresi:', invoiceAddress);
    addCandidate('Alım Yeri (İl):', purchaseLocation);
    addCandidate('Ödeme Şartları:', paymentTerms);
    addCandidate('Talep Tipi:', biddingMode);
    addCandidate('Öncelik *:', priority);
    addCandidate('Onaylayan:', approver);
    addCandidate('Kategoriler:', categories);
    // Genel label/value çiftlerini topla (geriye dönük uyumluluk için)
    for (let r = 1; r <= Math.min(40, ws0.rowCount); r++) {
        const row = ws0.getRow(r);
        const label = String(readCell(row.getCell(1).value) || "").trim();
        const value = String(readCell(row.getCell(2).value) || "").trim();
        // Özel eşleştirmeleri tekrar ekleme
        if (label && value && !fieldCandidates.some(fc => fc.label === label)) {
            fieldCandidates.push({ label, value });
        }
    }
    if (!wsItems) {
        console.error('[Import] Items sheet not found', {
            allSheets: wb.worksheets.map(s => s.name),
            sheetCount: wb.worksheets.length
        });
        throw new Error('Kalem sayfası bulunamadı. Excel dosyasında "Kalemler" adında bir sayfa olmalı veya ikinci sayfa kalemler sayfası olmalı.');
    }
    if (wsItems.rowCount === 0) {
        console.error('[Import] Items sheet is empty', { sheetName: wsItems.name });
        throw new Error('Kalem sayfası boş görünüyor. Lütfen Excel dosyasında kalem bilgilerini kontrol edin.');
    }
    // Teklifbul Rule v1.0 - Header satırını bul (şablon yapısına göre)
    // Şablonda header satırı 2. satırda (A2), ama eski formatlar için 1. satırdan da başla
    let headerRow = 2, maxScore = -1; // Şablon için varsayılan: 2. satır
    // Şablon başlık terimleri (tam eşleşme için)
    const templateHeaders = [
        'sıra no', 'stok kodu', 'malzeme tanımı', 'marka/model', 'miktar', 'birim',
        'depodaki miktar', 'hedef fiyat', 'istenilen teslim tarihi'
    ];
    // Header tespiti için daha fazla sinyal kullan
    for (let r = 1; r <= Math.min(30, wsItems.rowCount); r++) {
        const row = wsItems.getRow(r);
        const vals = row.values.map(v => {
            const raw = String(readCell(v) || '');
            // Yıldız işaretini ve fazla boşlukları temizle
            return raw.replace(/\s*\*\s*/g, ' ').trim();
        }).filter(v => v); // Boş değerleri filtrele
        if (vals.length === 0)
            continue; // Boş satırları atla
        // 1. Şablon başlıklarına tam eşleşme bonusu (en yüksek öncelik)
        const templateMatchCount = templateHeaders.reduce((acc, templateHeader) => {
            const matched = vals.some(v => {
                const vLower = v.toLowerCase();
                return vLower === templateHeader ||
                    vLower.includes(templateHeader) ||
                    templateHeader.includes(vLower) ||
                    sim(vLower, templateHeader) > 0.8;
            });
            return acc + (matched ? 1 : 0);
        }, 0);
        const templateBonus = templateMatchCount >= 3 ? (templateMatchCount * 5) : 0; // 3+ eşleşme varsa yüksek bonus
        // 2. Sözlük terimleriyle eşleşme skoru (yıldız işareti temizlendikten sonra)
        const dictScore = Object.values(DICT)
            .flat()
            .reduce((acc, k) => {
            const matched = vals.some(h => {
                const hLower = h.toLowerCase();
                const kLower = k.toLowerCase();
                return sim(hLower, kLower) > 0.7 || hLower.includes(kLower) || kLower.includes(hLower);
            });
            return acc + (matched ? 1 : 0);
        }, 0);
        // 3. Sayısal değer içermeme skoru (header'da sayı olmamalı)
        const hasNumbers = vals.some(v => /^\d+([.,]\d+)?$/.test(v.trim()));
        const numberPenalty = hasNumbers ? -5 : 0; // Daha yüksek ceza
        // 4. Boş hücre oranı (header'da çok boş olmamalı)
        const emptyRatio = vals.filter(v => !v || !v.trim()).length / Math.max(vals.length, 1);
        const emptyPenalty = emptyRatio > 0.5 ? -3 : 0; // Daha yüksek ceza
        // 5. Zorunlu alanların varlığı (itemName, qty, unit) - şablon başlıklarına göre
        const requiredFields = ['itemName', 'qty', 'unit'];
        const requiredScore = requiredFields.reduce((acc, field) => {
            const terms = DICT[field] || [];
            const matched = vals.some(h => {
                const hLower = h.toLowerCase();
                return terms.some(t => {
                    const tLower = t.toLowerCase();
                    return sim(hLower, tLower) > 0.7 || hLower.includes(tLower) || tLower.includes(hLower);
                });
            });
            return acc + (matched ? 1 : 0);
        }, 0);
        // 6. Şablon başlıklarına özel bonus (Malzeme Tanımı, Miktar, Birim, Stok Kodu)
        const templateHeaderBonus = vals.some(v => {
            const vLower = v.toLowerCase();
            return vLower.includes('malzeme tanım') ||
                vLower.includes('miktar') ||
                vLower.includes('birim') ||
                vLower.includes('stok kodu') ||
                vLower.includes('sıra no');
        }) ? 5 : 0; // Şablon başlıkları varsa yüksek bonus
        // 7. Satır pozisyonu bonusu (2. satır şablon için ideal)
        const positionBonus = (r === 2) ? 3 : 0;
        const totalScore = templateBonus + dictScore + numberPenalty + emptyPenalty + (requiredScore * 3) + templateHeaderBonus + positionBonus;
        // Debug: Her satırın skorunu logla
        if (r <= 5) {
            console.info(`[Import] Row ${r} header score:`, {
                row: r,
                totalScore,
                templateBonus,
                dictScore,
                numberPenalty,
                emptyPenalty,
                requiredScore,
                templateHeaderBonus,
                positionBonus,
                sampleHeaders: vals.slice(0, 5)
            });
        }
        if (totalScore > maxScore) {
            maxScore = totalScore;
            headerRow = r;
        }
    }
    // Eğer maxScore çok düşükse, varsayılan olarak 2. satırı kullan (şablon için)
    if (maxScore < 5 && wsItems.rowCount >= 2) {
        console.warn('[Import] Low header score, using default row 2', { maxScore, headerRow });
        headerRow = 2;
        maxScore = 10; // Varsayılan skor
    }
    // Header'ları temizle (yıldız işaretlerini kaldır)
    const headers = wsItems.getRow(headerRow).values.map(v => {
        const raw = String(readCell(v) || '');
        return raw.replace(/\s*\*\s*/g, ' ').trim();
    });
    const colIdx = {
        itemName: pick(headers, 'itemName'),
        sku: pick(headers, 'sku'), // Teklifbul Rule v1.0 - Stok Kodu eklendi
        brand: pick(headers, 'brand'),
        model: pick(headers, 'model'),
        qty: pick(headers, 'qty'),
        unit: pick(headers, 'unit'),
        unitPriceExcl: pick(headers, 'unitPriceExcl'),
        vatPct: pick(headers, 'vatPct'),
        currency: pick(headers, 'currency'),
        deliveryDate: pick(headers, 'deliveryDate'),
        note: pick(headers, 'note')
    };
    // Teklifbul Rule v1.0 - Structured Logging
    console.info('[Import] Header detection result:', {
        headerRow,
        maxScore,
        headers: headers.filter(h => h),
        columnIndices: colIdx,
        foundColumns: Object.entries(colIdx).filter(([_, idx]) => idx !== -1).map(([name]) => name)
    });
    const items = [];
    const matrix = [];
    const invalidRows = [];
    // Teklifbul Rule v1.0 - Marka/Model sütunu hem brand hem model olarak parse edilebilir
    const brandModelCol = colIdx.brand !== -1 ? colIdx.brand : (colIdx.model !== -1 ? colIdx.model : -1);
    for (let r = headerRow + 1; r <= wsItems.rowCount; r++) {
        const row = wsItems.getRow(r);
        // collect raw row values (first 25 columns) for mapping UI
        const rawVals = [];
        for (let c = 1; c <= Math.min(25, row.cellCount || 25); c++) {
            rawVals.push(String(readCell(row.getCell(c).value) ?? ''));
        }
        if (rawVals.some(v => v && v.trim()))
            matrix.push(rawVals);
        const get = (k) => colIdx[k] === -1 ? undefined : readCell(row.getCell(colIdx[k] + 1).value);
        // Marka/Model sütunu varsa parse et (örn: "Marka/Model" → brand ve model'e ayrılabilir)
        let brand = get('brand');
        let model = get('model');
        // Eğer brand veya model bulunamadıysa ama brandModelCol varsa, onu kullan
        if ((!brand && !model) && brandModelCol !== -1) {
            const brandModelValue = String(readCell(row.getCell(brandModelCol + 1).value) || '').trim();
            if (brandModelValue) {
                // "Marka/Model" formatında mı kontrol et
                const parts = brandModelValue.split(/[\/\s]+/).map(p => p.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    brand = parts[0];
                    model = parts.slice(1).join(' ');
                }
                else {
                    // Tek değer varsa brand olarak kullan
                    brand = brandModelValue;
                }
            }
        }
        const rowCurrency = normalizeCurrency(get('currency')) ?? demand.currency;
        const i = {
            itemName: get('itemName'),
            sku: get('sku') ?? null, // Teklifbul Rule v1.0 - Stok Kodu eklendi
            brand: brand ?? null,
            model: model ?? null,
            qty: parseNumberTR(get('qty')),
            unit: (get('unit') ? String(get('unit')).trim() : null),
            unitPriceExcl: parseNumberTR(get('unitPriceExcl')),
            vatPct: parseNumberTR(get('vatPct')) ?? 18,
            currency: rowCurrency,
            deliveryDate: toISO(get('deliveryDate')) ?? null,
            note: get('note') ?? null
        };
        // tamamen boş/gürültü satırları atla
        const hasAny = Object.values(i).some(v => v != null && String(v).trim() !== '');
        if (!hasAny)
            continue;
        if (isRowMeaningful(i)) {
            items.push(i);
        }
        else {
            invalidRows.push(r);
        }
    }
    // Teklifbul Rule v1.0 - Structured Logging
    console.info('[Import] Items parsed:', {
        totalRows: wsItems.rowCount - headerRow,
        validItems: items.length,
        invalidRows: invalidRows.length,
        sampleItem: items[0] || null
    });
    // kolon bulunurluğu
    const found = Object.values(colIdx).filter(v => v !== -1).length;
    const total = Object.keys(colIdx).length;
    // confidence: kolon eşleşme * ve geçerli item sayısı
    const columnScore = found / total;
    const itemScore = Math.min(items.length / 5, 1); // 5+ satır varsa tam puan
    const confidence = Math.round(100 * (0.6 * columnScore + 0.4 * itemScore));
    const warnings = [];
    if (confidence < 60)
        warnings.push('Düşük eşleşme: Mapping ekranı önerilir');
    if (invalidRows.length)
        warnings.push(`Bazı satırlar eksik alanlardan dolayı atlandı: ${invalidRows.slice(0, 10).join(', ')}${invalidRows.length > 10 ? '…' : ''}`);
    if (!items.length)
        warnings.push('Kalem tespit edilemedi. Başlık satırlarını belirginleştirin veya Excel şablonunu kullanın.');
    if (!normalizeCurrency(currency))
        warnings.push('Para birimi algılanamadı/normalize edilemedi; TRY varsayıldı.');
    return {
        profileHint: names.join(','),
        headerRow, headers, colIdx, confidence,
        demand, items,
        matrix,
        fieldCandidates,
        requiredItemFields: REQUIRED_ITEM,
        warnings
    };
}
