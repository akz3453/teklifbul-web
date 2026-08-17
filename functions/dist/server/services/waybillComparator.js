/**
 * Waybill comparator
 * Teklifbul Rule v1.0 - Async, DRY, structured logging
 */
import levenshtein from 'fast-levenshtein';
import { logger } from '../../src/shared/log/logger.js';
const SIMILARITY_CONFIG = {
    numberWeight: 0.45,
    dateWeight: 0.1,
    lineWeight: 0.45,
    numberThreshold: 0.9,
    lineNameThreshold: 0.75,
    qtyToleranceRatio: 0.05,
    approveThreshold: 0.82,
};
function normalizedSimilarity(a, b) {
    const x = (a || '').trim().toLowerCase();
    const y = (b || '').trim().toLowerCase();
    if (!x || !y)
        return 0;
    if (x === y)
        return 1;
    const dist = levenshtein.get(x, y);
    const maxLen = Math.max(x.length, y.length);
    return maxLen === 0 ? 0 : 1 - dist / maxLen;
}
function matchLines(supplierLines, buyerLines) {
    const matches = [];
    for (const sLine of supplierLines) {
        let best;
        let bestScore = 0;
        for (const bLine of buyerLines) {
            const sim = normalizedSimilarity(sLine.name, bLine.name);
            if (sim > bestScore) {
                bestScore = sim;
                best = bLine;
            }
        }
        const qtyDelta = best ? (best.qty - sLine.qty) : null;
        matches.push({
            supplierLine: sLine,
            buyerLine: best,
            nameSimilarity: bestScore,
            qtyDelta,
        });
    }
    return matches;
}
export async function compareWaybills(supplier, buyer) {
    logger.group('waybill:compare');
    const issues = [];
    const numberSimilarity = normalizedSimilarity(supplier.number || '', buyer.number || '');
    if (numberSimilarity < SIMILARITY_CONFIG.numberThreshold) {
        issues.push('İrsaliye numarası eşleşmesi düşük');
    }
    const dateSimilarity = normalizedSimilarity(supplier.date || '', buyer.date || '');
    if (supplier.date && buyer.date && supplier.date !== buyer.date) {
        issues.push('Tarih farklı görünüyor');
    }
    const lineMatches = matchLines(supplier.lines, buyer.lines);
    const lineScores = [];
    for (const lm of lineMatches) {
        const qtyOk = lm.qtyDelta === null
            ? false
            : Math.abs(lm.qtyDelta) <= (lm.supplierLine.qty * SIMILARITY_CONFIG.qtyToleranceRatio);
        const nameOk = lm.nameSimilarity >= SIMILARITY_CONFIG.lineNameThreshold;
        if (!nameOk) {
            issues.push(`Kalem adı uyuşmuyor: ${lm.supplierLine.name}`);
        }
        if (!qtyOk && lm.qtyDelta !== null) {
            issues.push(`Miktar farkı: ${lm.supplierLine.name} (${lm.qtyDelta.toFixed(2)})`);
        }
        const lineScore = (lm.nameSimilarity * 0.7) + (qtyOk ? 0.3 : 0);
        lineScores.push(lineScore);
    }
    const avgLineScore = lineScores.length > 0
        ? lineScores.reduce((a, b) => a + b, 0) / lineScores.length
        : 0;
    const score = (numberSimilarity * SIMILARITY_CONFIG.numberWeight) +
        (dateSimilarity * SIMILARITY_CONFIG.dateWeight) +
        (avgLineScore * SIMILARITY_CONFIG.lineWeight);
    const autoApprove = score >= SIMILARITY_CONFIG.approveThreshold && issues.length === 0;
    const status = autoApprove ? 'match' : (score >= 0.6 ? 'warning' : 'mismatch');
    logger.info('waybill compare result', {
        score: Number(score.toFixed(3)),
        status,
        issuesCount: issues.length,
    });
    logger.end();
    return {
        score,
        status,
        issues,
        autoApprove,
        lineMatches,
    };
}
