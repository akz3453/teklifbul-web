import { Router } from 'express';
import multer from 'multer';
import { commitDemand } from '../services/commit.js';
import { matchSuppliers } from '../services/supplierMatch.js';
import { mapDocument } from '../services/mappingService.js';
// Teklifbul Rule v1.0 - ImportABProfile v1 (deterministik A→B okuyucu)
import { parseTwoColumnProfile, parseTwoSheetProfile } from '../services/importABProfile.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const r = Router();
// Teklifbul Rule v1.0 - Category suggestions disabled on server (Firebase client SDK not available)
// Category suggestions should be handled client-side after import preview
// This prevents 500 errors when Firebase client SDK is imported on server
const CATEGORY_SUGGESTIONS_ENABLED = false; // Set to true if server-side Firebase Admin SDK is configured
// Magic sniff helper
function sniffFormat(buf, name) {
    const head = buf.subarray(0, 8).toString('hex');
    const lower = name.toLowerCase();
    // Office docs (ZIP magic: PK\x03\x04)
    if (head.startsWith('504b03') || lower.endsWith('.xlsx') || lower.endsWith('.docx')) {
        if (lower.endsWith('.xlsx'))
            return 'xlsx';
        if (lower.endsWith('.docx'))
            return 'docx';
        return 'unknown-zip';
    }
    // PDF magic: %PDF
    if (head.startsWith('25504446') || lower.endsWith('.pdf'))
        return 'pdf';
    return 'unknown';
}
r.post('/preview', upload.single('file'), async (req, res) => {
    try {
        // Teklifbul Rule v1.0 - Hata yakalama iyileştirmesi
        logger.group('Import Preview Request');
        logger.info('Request received', {
            method: req.method,
            url: req.url,
            hasFile: !!req.file,
            query: req.query
        });
        // 1. Dosya kontrolü
        if (!req.file) {
            logger.warn('No file in request');
            return res.status(400).json({
                ok: false,
                error: 'file_missing',
                details: 'FormData ile "file" alanı bekleniyor.'
            });
        }
        if (!req.file.buffer || req.file.buffer.length === 0) {
            logger.warn('Empty file buffer');
            return res.status(400).json({
                ok: false,
                error: 'empty_file',
                details: 'Dosya boş görünüyor.'
            });
        }
        // 2. Format tespit et
        const name = req.file.originalname || '';
        const format = sniffFormat(req.file.buffer, name);
        logger.info('File received', { name, format, size: `${(req.file.buffer.length / 1024).toFixed(2)} KB` });
        if (format === 'unknown') {
            logger.warn('Unknown format', { name, format });
            return res.status(415).json({
                ok: false,
                error: 'unsupported_format',
                details: `Desteklenen formatlar: .xlsx, .docx, .pdf. Algılanan: ${format}`
            });
        }
        // Teklifbul Rule v1.0 - ImportABProfile v1: Test amaçlı A→B formatı kontrolü
        // Eğer query parametresi varsa, yeni parser'ı kullan
        const useABProfile = req.query?.abProfile === 'true' || req.query?.abProfile === '1';
        const useTwoSheet = req.query?.twoSheet === 'true' || req.query?.twoSheet === '1';
        // parseTwoSheetProfile öncelikli (iki sayfalı şablon için)
        if (useTwoSheet && format === 'xlsx') {
            try {
                logger.info('Using parseTwoSheetProfile (two-sheet template parser)');
                const twoSheetResult = await parseTwoSheetProfile(req.file.buffer);
                // Mevcut API formatına dönüştür
                const demandValues = {};
                Object.entries(twoSheetResult.demand || {}).forEach(([key, value]) => {
                    if (value && typeof value === 'object' && 'value' in value) {
                        demandValues[key] = value.value;
                    }
                    else if (value) {
                        demandValues[key] = value;
                    }
                });
                const demandMeta = {};
                const demandMappings = [];
                const fieldCandidates = [];
                // Demand mappings ve field candidates oluştur
                Object.keys(twoSheetResult.demand || {}).forEach(key => {
                    const value = twoSheetResult.demand[key];
                    if (value) {
                        demandMeta[key] = {
                            confidence: 1.0,
                            needsReview: false,
                            sourceLabel: key
                        };
                        // Mapping oluştur (Excel'deki başlık bilgisi için)
                        const mappingLabels = {
                            'title': 'Başlık *',
                            'siteName': 'Şantiye *',
                            'demandDate': 'Talep Oluşturma Tarihi',
                            'dueDate': 'Termin',
                            'deliveryAddress': 'Teslimat Adresi',
                            'deliveryType': 'Teslim Şekli *',
                            'currency': 'Para Birimi *',
                            'paymentTerms': 'Ödeme Şartları',
                            'requesterCompany': 'Talep Eden Şirket Adı',
                            'approver': 'Onaylayan',
                            'priority': 'Öncelik *',
                            'purchaseLocation': 'Alım Yeri (İl)',
                            'biddingMode': 'Talep Tipi',
                            'categories': 'Kategoriler'
                        };
                        demandMappings.push({
                            field: key,
                            columnIndex: -1,
                            columnLabel: mappingLabels[key] || key,
                            score: 1.0,
                            confidence: 1.0,
                            type: 'demand'
                        });
                        fieldCandidates.push({
                            label: mappingLabels[key] || key,
                            value: String(value)
                        });
                    }
                });
                const itemMeta = (twoSheetResult.items || []).map(() => ({
                    confidence: 1.0,
                    needsReview: false
                }));
                logger.info('parseTwoSheetProfile completed', {
                    fieldsFound: Object.keys(demandValues).length,
                    itemsCount: (twoSheetResult.items || []).length,
                    demandMappingsCount: demandMappings.length
                });
                logger.end();
                return res.json({
                    ok: true,
                    demand: demandValues,
                    items: twoSheetResult.items || [],
                    demandMeta,
                    itemMeta,
                    warnings: [],
                    columnMappings: [],
                    demandMappings: demandMappings, // Teklifbul Rule v1.0 - Demand mappings eklendi
                    fieldCandidates: fieldCandidates, // Teklifbul Rule v1.0 - Field candidates eklendi
                    isTemplate: twoSheetResult.isTemplate || true,
                    templateConfidence: twoSheetResult.templateConfidence || 1.0
                });
            }
            catch (twoSheetError) {
                const errorMsg = twoSheetError?.message || String(twoSheetError);
                logger.error('parseTwoSheetProfile failed', {
                    error: errorMsg,
                    stack: twoSheetError?.stack,
                    name: twoSheetError?.name
                });
                // Fallback to other parsers - devam et, hata döndürme
                // Ancak eğer ExcelJS yükleme hatası varsa, standart parser da çalışmayacak
                if (errorMsg.includes('Cannot find module') || errorMsg.includes('exceljs') || errorMsg.includes('ExcelJS')) {
                    logger.error('ExcelJS module not found - cannot continue with any parser');
                    logger.end();
                    return res.status(500).json({
                        ok: false,
                        error: 'server_error',
                        details: 'ExcelJS kütüphanesi yüklenemedi. Lütfen `npm install exceljs` komutunu çalıştırın ve sunucuyu yeniden başlatın.',
                        technicalDetails: errorMsg
                    });
                }
            }
        }
        if (useABProfile && format === 'xlsx') {
            try {
                logger.info('Using ImportABProfile v1 (A→B two-column parser)');
                const abResult = await parseTwoColumnProfile(req.file.buffer);
                // Mevcut API formatına dönüştür
                // Teklifbul Rule v1.0 - Demand değerlerini string olarak döndür (object değil)
                const demandValues = {};
                Object.entries(abResult.demand).forEach(([key, value]) => {
                    // Eğer value object ise (value, score gibi), sadece value'yu al
                    if (value == null)
                        return;
                    // Type guard: value object mi ve 'value' property'si var mı?
                    if (typeof value === 'object' && value !== null && 'value' in value) {
                        demandValues[key] = value.value;
                    }
                    else {
                        demandValues[key] = value; // Zaten string
                    }
                });
                const demandMeta = {};
                Object.keys(abResult.demand).forEach(key => {
                    const value = abResult.demand[key];
                    if (value) {
                        demandMeta[key] = {
                            confidence: 1.0,
                            needsReview: false,
                            sourceLabel: abResult.columnMappings.find(m => m.to === key)?.from || key
                        };
                    }
                });
                // Items için meta oluştur
                const itemMeta = abResult.items.map(() => ({
                    confidence: 1.0,
                    needsReview: false
                }));
                logger.info('ImportABProfile v1 completed', {
                    fieldsFound: Object.keys(demandValues).length,
                    mappings: abResult.columnMappings.length,
                    itemsCount: abResult.items.length
                });
                logger.end();
                return res.json({
                    ok: true,
                    demand: demandValues, // String değerler (object değil)
                    items: abResult.items, // Kalemler dizisi
                    demandMeta,
                    itemMeta,
                    warnings: [],
                    columnMappings: [],
                    demandMappings: abResult.columnMappings.map(m => ({
                        field: m.to,
                        columnIndex: -1,
                        columnLabel: m.from,
                        score: m.score,
                        confidence: m.score
                    })),
                    fieldCandidates: abResult.columnMappings.map(m => ({
                        label: m.from,
                        value: demandValues[m.to] || ''
                    })),
                    isTemplate: abResult.isTemplate,
                    templateConfidence: abResult.templateConfidence
                });
            }
            catch (abError) {
                logger.warn('ImportABProfile v1 failed, falling back to standard parser', abError);
                // Fallback to standard parser
            }
        }
        let mapping;
        try {
            logger.info('Parsing document', { filename: name, mimeType: req.file.mimetype });
            mapping = await mapDocument(req.file.buffer, {
                filename: name,
                mimeType: req.file.mimetype,
                supplierId: (req.body?.supplierId || req.query?.supplierId),
            });
            logger.info('Document parsed successfully', { itemsCount: mapping.items.length, warningsCount: mapping.warnings.length });
        }
        catch (parseError) {
            logger.error('Parse error', parseError);
            logger.end();
            return res.status(400).json({
                ok: false,
                error: 'parse_error',
                details: parseError.message || String(parseError),
                stack: process.env.NODE_ENV === 'development' ? parseError.stack : undefined,
            });
        }
        const demandValues = {};
        const demandMeta = {};
        Object.entries(mapping.demand).forEach(([field, result]) => {
            const fieldResult = result;
            demandValues[field] = fieldResult.value;
            demandMeta[field] = {
                confidence: fieldResult.confidence,
                needsReview: fieldResult.needsReview,
                sourceLabel: fieldResult.sourceLabel,
            };
        });
        const items = mapping.items.map((item) => item.value);
        const itemMeta = mapping.items.map((item) => ({
            confidence: item.confidence,
            needsReview: item.needsReview,
        }));
        if (!items.length) {
            mapping.warnings.push('Dosyadan kalem çıkarılamadı. Dosya formatını kontrol edin.');
        }
        // Teklifbul Rule v1.0 - Category suggestions disabled on server (Firebase client SDK not available)
        // Category suggestions can be added client-side after preview if needed
        logger.info('Category suggestions skipped (server-side, use client-side API if needed)');
        const itemsWithSuggestions = items.map((item) => ({
            ...item,
            categorySuggestions: [], // Empty - can be populated client-side via /api/categories/suggest
            suggestedCategory: null
        }));
        logger.info('Import preview completed', {
            itemsCount: itemsWithSuggestions.length
        });
        logger.end(); // End File Import group
        return res.json({
            ok: true,
            demand: demandValues,
            items: itemsWithSuggestions,
            demandMeta,
            itemMeta,
            warnings: mapping.warnings,
            columnMappings: mapping.columnMappings || [], // Teklifbul Rule v1.0 - Kalemler için eşleştirme detayları
            demandMappings: mapping.demandMappings || [], // Teklifbul Rule v1.0 - Talep bilgileri için eşleştirme detayları
            fieldCandidates: mapping.fieldCandidates || [], // Teklifbul Rule v1.0 - Label-value çiftleri (mapping için)
            isTemplate: mapping.isTemplate || false, // Teklifbul Rule v1.0 - Şablon tanıma
            templateConfidence: mapping.templateConfidence || 0, // Teklifbul Rule v1.0 - Şablon güven skoru
        });
    }
    catch (e) {
        // Teklifbul Rule v1.0 - Detaylı hata yakalama
        const errorMessage = e?.message || String(e);
        const errorStack = e?.stack || '';
        logger.error('Import preview error', {
            error: errorMessage,
            stack: errorStack,
            name: e?.name,
            code: e?.code
        });
        logger.end();
        // Hata mesajını daha kullanıcı dostu hale getir
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('Cannot find module') || errorMessage.includes('exceljs')) {
            userFriendlyMessage = 'ExcelJS kütüphanesi yüklenemedi. Lütfen sunucuyu yeniden başlatın.';
        }
        else if (errorMessage.includes('parse_error')) {
            userFriendlyMessage = 'Dosya okunamadı. Lütfen dosya formatını kontrol edin.';
        }
        return res.status(500).json({
            ok: false,
            error: 'server_error',
            details: userFriendlyMessage,
            technicalDetails: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
            stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
        });
    }
});
r.post('/commit', async (req, res) => {
    try {
        const { demand, items, options } = (req.body || {});
        if (!demand || !Array.isArray(items))
            return res.status(400).json({ error: 'Eksik gövde' });
        const saved = await commitDemand({ demand, items });
        const matches = await matchSuppliers(items);
        return res.json({ ok: true, demandId: saved.demandId, satfk: saved.satfk, matchedSuppliers: matches, options });
    }
    catch (e) {
        return res.status(400).json({ error: e.message || 'Commit hatası' });
    }
});
/**
 * POST /api/import/confirm-mapping
 * Teklifbul Rule v1.0 - Eşleştirme onayı ve kayıt
 */
r.post('/confirm-mapping', async (req, res) => {
    try {
        const { supplierId, filename, mappings, originalMappings } = req.body || {};
        if (!Array.isArray(mappings)) {
            return res.status(400).json({
                ok: false,
                error: 'mappings_required',
                details: 'Mappings array gerekli'
            });
        }
        // Supplier memory'ye kaydet
        const { getSupplierMemoryStore } = await import('../services/supplierMemory.js');
        const store = getSupplierMemoryStore();
        mappings.forEach((mapping) => {
            if (mapping.field && mapping.columnLabel) {
                const confidence = mapping.confidence || mapping.score || 0.8;
                store.remember(supplierId || null, mapping.columnLabel, mapping.field, confidence, filename // Dosya adı pattern
                );
            }
        });
        return res.json({
            ok: true,
            message: 'Eşleştirme kaydedildi',
            saved: mappings.length
        });
    }
    catch (e) {
        logger.error('Confirm mapping error', e);
        return res.status(500).json({
            ok: false,
            error: 'server_error',
            details: e.message || String(e)
        });
    }
});
export default r;
