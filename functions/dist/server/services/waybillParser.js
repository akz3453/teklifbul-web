/**
 * Waybill parser (text → structured fields)
 * Teklifbul Rule v1.0 - DRY, async, structured logging
 */
import { logger } from '../../src/shared/log/logger.js';
const DEFAULT_UNIT = 'ADET';
const MIN_LINE_LENGTH = 5;
const MIN_QTY_VALUE = 0.0001;
const RX_NUMBER = /(irsaliye|sevkiyat|belge)\s*(no|numara|numarası|numarasi)\s*[:#]?\s*([A-Z0-9\-\/]+)/i;
const RX_DATE = /([0-3]?\d[./-][01]?\d[./-](?:20)?\d{2})/;
const RX_PARTY_SUPPLIER = /(gönderen|teslim eden|yükleyen)\s*[:\-]?\s*(.+)$/i;
const RX_PARTY_BUYER = /(alıcı|teslim alan|alici)\s*[:\-]?\s*(.+)$/i;
const RX_ITEM_ROW = /^(.+?)\s+([0-9]+(?:[.,][0-9]+)?)\s*(AD[AE]T|KG|LT|MT|M|PAKET|KOLI|KUTU|TON|SET)?$/i;
function normalizeTurkishText(value) {
    return value
        .toLowerCase()
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/i̇/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u');
}
function normalizeValue(val) {
    if (!val)
        return undefined;
    const trimmed = val.toString().trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function parseNumber(text) {
    const match = text.match(RX_NUMBER);
    if (match?.[3]) {
        return match[3].trim();
    }
    return undefined;
}
function parseDate(text) {
    const match = text.match(RX_DATE);
    if (match?.[1]) {
        return match[1].trim();
    }
    return undefined;
}
function parseParty(lines, rx) {
    for (const line of lines) {
        const m = line.match(rx);
        if (m?.[2]) {
            return m[2].trim();
        }
    }
    return undefined;
}
function tryParseItemFromLine(line) {
    if (!line || line.length < MIN_LINE_LENGTH)
        return null;
    // Table-like "name qty unit" pattern
    const m = line.match(RX_ITEM_ROW);
    if (m) {
        const qty = parseFloat(m[2].replace(',', '.'));
        if (Number.isFinite(qty) && qty >= MIN_QTY_VALUE) {
            return {
                name: m[1].trim(),
                qty,
                unit: m[3]?.trim() || DEFAULT_UNIT,
                raw: line,
            };
        }
    }
    // Fallback: search for qty inside line
    const qtyMatch = line.match(/([0-9]+(?:[.,][0-9]+)?)/);
    if (qtyMatch) {
        const qty = parseFloat(qtyMatch[1].replace(',', '.'));
        if (Number.isFinite(qty) && qty >= MIN_QTY_VALUE) {
            const namePart = line.replace(qtyMatch[0], '').trim();
            return {
                name: namePart.length > 0 ? namePart : line.trim(),
                qty,
                unit: DEFAULT_UNIT,
                raw: line,
            };
        }
    }
    return null;
}
export async function parseWaybill(textResult) {
    logger.group('waybill:parse');
    const lines = (textResult.text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    const normalizedText = normalizeTurkishText(textResult.text || '');
    const number = parseNumber(normalizedText);
    const date = parseDate(normalizedText);
    const supplierName = parseParty(lines, RX_PARTY_SUPPLIER);
    const buyerName = parseParty(lines, RX_PARTY_BUYER);
    const items = [];
    const itemWarnings = [];
    for (const line of lines) {
        const item = tryParseItemFromLine(line);
        if (item) {
            items.push(item);
        }
    }
    if (items.length === 0) {
        itemWarnings.push('Kalem bulunamadı, manuel inceleme gerekebilir');
    }
    const warnings = [...(textResult.warnings || []), ...itemWarnings];
    const confidencePieces = [
        number ? 0.3 : 0,
        date ? 0.2 : 0,
        items.length > 0 ? 0.4 : 0,
    ];
    const confidence = confidencePieces.reduce((acc, v) => acc + v, 0);
    logger.info('waybill parsed', {
        number: number || 'unknown',
        lineCount: items.length,
        sourceType: textResult.sourceType,
    });
    logger.end();
    return {
        number,
        date,
        supplierName: normalizeValue(supplierName),
        buyerName: normalizeValue(buyerName),
        lines: items,
        sourceType: textResult.sourceType,
        rawText: textResult.text,
        warnings,
        confidence,
    };
}
