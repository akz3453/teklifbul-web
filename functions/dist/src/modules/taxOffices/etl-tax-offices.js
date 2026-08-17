"use strict";
/**
 * Vergi Daireleri ETL Script
 * Teklifbul Rule v1.0 - Structured Logging
 *
 * GİB PDF'den vergi dairelerini parse edip Postgres'e yükler
 * Usage: tsx src/modules/taxOffices/etl-tax-offices.ts --input=./data/gib_tax_offices.pdf
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = require("fs");
const path_1 = require("path");
const module_1 = require("module");
const connection_1 = require("../../db/connection");
const logger_js_1 = require("../../shared/log/logger.js");
// pdfjs-dist kullanarak PDF parse (pdf-parse çalışmadığı için)
const require = (0, module_1.createRequire)(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
// PDF'den tablo parse etme (pdfjs-dist kullanarak)
async function parsePdfToOffices(pdfPath) {
    const buffer = (0, fs_1.readFileSync)(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    // Tüm sayfaları oku - Y koordinatına göre satır bazında grupla (daha hassas)
    const offices = [];
    let currentProvince = ''; // İl bilgisini sayfalar arası taşı
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        // Y koordinatına göre item'ları grupla (satırlar) - daha hassas yuvarlama
        const rows = new Map();
        for (const item of textContent.items) {
            // Y koordinatını daha hassas yuvarla (0.5 tolerance)
            const y = Math.round(item.transform[5] * 2) / 2;
            const yKey = y.toFixed(1);
            if (!rows.has(yKey)) {
                rows.set(yKey, []);
            }
            if (item.str && item.str.trim().length > 0) {
                rows.get(yKey).push(item.str);
            }
        }
        // Y koordinatına göre sırala (yukarıdan aşağıya)
        const sortedRows = Array.from(rows.entries()).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
        // Debug: İlk 20 satırı göster (sadece ilk sayfa)
        if (pageNum === 1) {
            logger_js_1.logger.info(`\n📋 İlk sayfa - İlk 20 satır (debug):`);
            sortedRows.slice(0, 20).forEach(([yKey, items], idx) => {
                const lineText = items.join(' ').trim();
                if (lineText.length > 20) {
                    logger_js_1.logger.info(`${idx + 1}. [Y:${yKey}] ${lineText.substring(0, 120)}`);
                }
            });
            logger_js_1.logger.info('---\n');
        }
        // Her satırı parse et
        for (const [_yKey, items] of sortedRows) {
            const lineText = items.join(' ').trim();
            // Çok kısa satırları atla
            if (lineText.length < 20)
                continue;
            // Başlık satırlarını atla
            if (lineText.includes('DEFTERDARLIK') || lineText.includes('SIRA İL') || (lineText.includes('GENEL') && lineText.includes('SIRA'))) {
                continue;
            }
            // Çoklu boşlukları tek boşluğa indir
            const normalized = lineText.replace(/\s+/g, ' ').trim();
            // Format 1: "[sıra] [plaka] [İL] [İLÇE] [kod] [Daire]"
            // Örnek: "1 01 ADANA Merkez 01250 Adana İhtisas Vergi Dairesi Müdürlüğü"
            let match = normalized.match(/^(\d{1,4})\s+(\d{2})\s+([A-ZÇĞİÖŞÜ\s]{2,30})\s+([A-ZÇĞİÖŞÜ\w\s\(\)\*\*\s]{0,60})\s+(\d{5})\s+(.+)$/);
            let province = '';
            let district = 'Merkez';
            let officeCode = '';
            let officeName = '';
            if (match) {
                const [, _sıraNo, _plaka, il, ilçe, kod, daireAdı] = match;
                province = normalizeProvinceName(il.trim());
                district = normalizeDistrictName(ilçe.replace(/\*\*/g, '').replace(/\(6360.*?\)/gi, '').trim() || 'Merkez');
                officeName = normalizeOfficeName(daireAdı.trim());
                officeCode = kod.trim();
            }
            else {
                // Format 2: "[İLÇE] [kod] [Daire]" (sıra ve il eksik, önceki il kullanılır)
                // Örnek: "Merkez 01251 5 Ocak Vergi Dairesi Müdürlüğü"
                match = normalized.match(/^([A-ZÇĞİÖŞÜ\w\s\(\)\*\*\s]{1,60})\s+(\d{5})\s+(.+)$/);
                if (match && currentProvince) {
                    const [, ilçe, kod, daireAdı] = match;
                    province = currentProvince;
                    district = normalizeDistrictName(ilçe.replace(/\*\*/g, '').replace(/\(6360.*?\)/gi, '').trim() || 'Merkez');
                    officeName = normalizeOfficeName(daireAdı.trim());
                    officeCode = kod.trim();
                }
                else {
                    continue; // Parse edilemedi
                }
            }
            // Office type tespiti
            const officeType = officeName.toUpperCase().includes('MALMÜDÜRLÜĞÜ') || officeName.toUpperCase().includes('MALMUDURLUGU')
                ? 'MALMUDURLUGU'
                : 'VD';
            if (officeCode && /^\d{5}$/.test(officeCode) && province && officeName && officeName.length > 5) {
                offices.push({
                    province_name: province,
                    district_name: district,
                    office_name: officeName,
                    office_code: officeCode,
                    office_type: officeType
                });
                // İl bilgisini güncelle (bir sonraki satırlar için)
                currentProvince = province;
            }
        }
    }
    return offices;
}
function normalizeProvinceName(name) {
    return name.trim().toUpperCase()
        .replace(/İ/g, 'İ')
        .replace(/ı/g, 'I');
}
function normalizeDistrictName(name) {
    return name.trim()
        .replace(/\s+/g, ' ');
}
function normalizeOfficeName(name) {
    return name.trim()
        .replace(/\s+/g, ' ')
        .replace(/MALMÜDÜRLÜĞÜ/gi, 'Malmüdürlüğü')
        .replace(/VERGİ DAİRESİ/gi, 'Vergi Dairesi');
}
async function upsertOffices(offices) {
    const pool = (0, connection_1.getPgPool)();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const office of offices) {
            await client.query(`INSERT INTO tax_offices (province_name, district_name, office_name, office_code, office_type, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (office_code) 
         DO UPDATE SET 
           province_name = $1,
           district_name = $2,
           office_name = $3,
           office_type = $5,
           updated_at = now()`, [office.province_name, office.district_name, office.office_name, office.office_code, office.office_type]);
        }
        await client.query('COMMIT');
        logger_js_1.logger.info(`✅ ${offices.length} vergi dairesi upsert edildi`);
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    }
}
async function main() {
    const args = process.argv.slice(2);
    const inputArg = args.find(arg => arg.startsWith('--input='));
    if (!inputArg) {
        logger_js_1.logger.error('Usage: tsx etl-tax-offices.ts --input=./data/gib_tax_offices.pdf');
        process.exit(1);
    }
    const inputPath = inputArg.split('=')[1];
    const fullPath = (0, path_1.join)(process.cwd(), inputPath);
    logger_js_1.logger.info(`📄 PDF okunuyor: ${fullPath}`);
    try {
        const offices = await parsePdfToOffices(fullPath);
        logger_js_1.logger.info(`📊 ${offices.length} vergi dairesi parse edildi`);
        if (offices.length === 0) {
            logger_js_1.logger.warn('⚠️  Hiç vergi dairesi bulunamadı. PDF formatını kontrol edin.');
            process.exit(1);
        }
        await upsertOffices(offices);
        logger_js_1.logger.info('✅ ETL tamamlandı');
    }
    catch (e) {
        logger_js_1.logger.error('❌ ETL hatası:', e);
        process.exit(1);
    }
}
main().catch((err) => {
    logger_js_1.logger.error('Main execution error:', err);
    process.exit(1);
});
