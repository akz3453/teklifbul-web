/**
 * Scoring utilities for mapping candidates.
 * - String similarity (Levenshtein + Jaro-Winkler)
 * - Type guards (number/date/currency) confidence heuristics
 * - Composite scoring with configurable weights
 */
import { normalizeKey, parseNumberTR, parseDateTR, detectCurrency } from "./normalization.js";
const DEFAULT_CONFIG = {
    stringWeight: 0.5,
    typeWeight: 0.3,
    ruleWeight: 0.2,
};
/** Simple Levenshtein distance */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m)
        return n;
    if (!n)
        return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}
/** Jaro-Winkler similarity */
function jaroWinkler(a, b) {
    if (a === b)
        return 1;
    const lenA = a.length;
    const lenB = b.length;
    if (!lenA || !lenB)
        return 0;
    const matchDistance = Math.floor(Math.max(lenA, lenB) / 2) - 1;
    const aMatches = new Array(lenA).fill(false);
    const bMatches = new Array(lenB).fill(false);
    let matches = 0;
    for (let i = 0; i < lenA; i++) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, lenB);
        for (let j = start; j < end; j++) {
            if (bMatches[j])
                continue;
            if (a[i] !== b[j])
                continue;
            aMatches[i] = true;
            bMatches[j] = true;
            matches++;
            break;
        }
    }
    if (!matches)
        return 0;
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < lenA; i++) {
        if (!aMatches[i])
            continue;
        while (!bMatches[k])
            k++;
        if (a[i] !== b[k])
            transpositions++;
        k++;
    }
    transpositions /= 2;
    const jaro = (matches / lenA + matches / lenB + (matches - transpositions) / matches) / 3;
    const prefix = Math.min(4, [...a].findIndex((ch, idx) => ch !== b[idx]) + 1 || 0);
    return jaro + prefix * 0.1 * (1 - jaro);
}
export function stringSimilarity(a, b) {
    const normA = normalizeKey(a);
    const normB = normalizeKey(b);
    if (!normA || !normB)
        return 0;
    const lev = levenshtein(normA, normB);
    const maxLen = Math.max(normA.length, normB.length);
    const levScore = maxLen ? 1 - lev / maxLen : 1;
    const jw = jaroWinkler(normA, normB);
    return Math.max(0, Math.min(1, (levScore * 0.5 + jw * 0.5)));
}
function typeConfidence(field, candidate) {
    switch (field) {
        case "qty":
        case "unitPriceExcl":
        case "vatPct": {
            const num = candidate.number ?? parseNumberTR(candidate.raw);
            return num != null ? 1 : 0;
        }
        case "demandDate":
        case "dueDate":
        case "phaseStart": // Teklifbul Rule v1.0 - Süre (Başlangıç)
        case "phaseEnd": { // Teklifbul Rule v1.0 - Süre (Bitiş)
            const date = candidate.date ?? parseDateTR(candidate.raw);
            return date ? 1 : 0;
        }
        case "currency": {
            const cc = candidate.currency ?? detectCurrency(candidate.raw);
            return cc ? 1 : 0;
        }
        default:
            return candidate.raw.trim().length ? 0.3 : 0;
    }
}
function ruleConfidence(field, label, candidate) {
    const normLabel = normalizeKey(label);
    if (!normLabel)
        return 0;
    const contains = (tok) => normLabel.includes(tok);
    switch (field) {
        case "qty":
            return contains("miktar") || contains("adet") ? 1 : 0;
        case "unit":
            return contains("birim") ? 1 : 0.6;
        case "unitPriceExcl":
            return contains("birim fiyat") || contains("fiyat") ? 0.8 : 0.2;
        case "vatPct":
            return contains("kdv") ? 1 : 0;
        case "currency":
            return contains("para birimi") || contains("pb") ? 1 : 0;
        case "requester":
            return contains("talep eden") || contains("istek") ? 0.9 : 0;
        case "demandDate":
            return contains("talep tarihi") ? 1 : 0;
        case "dueDate":
            return contains("termin") || contains("istenen tarih") ? 1 : 0;
        case "title":
            return contains("başlık") ? 0.8 : 0.2;
        case "sku": // Teklifbul Rule v1.0 - Stok Kodu
            return contains("stok kodu") || contains("sku") || contains("malzeme kodu") ? 1 : 0;
        case "siteName": // Teklifbul Rule v1.0 - Şantiye
            return contains("şantiye") || contains("santiye") || contains("saha") ? 1 : 0;
        case "purchaseLocation": // Teklifbul Rule v1.0 - Alım Yeri
            return contains("alım yeri") || contains("alim yeri") || contains("il") ? 1 : 0;
        case "categories": // Teklifbul Rule v1.0 - Kategori(ler)
            return contains("kategori") ? 1 : 0;
        case "priority": // Teklifbul Rule v1.0 - Öncelik
            return contains("öncelik") || contains("oncelik") ? 1 : 0;
        case "biddingMode": // Teklifbul Rule v1.0 - Talep Tipi
            return contains("talep tipi") || contains("teklif tipi") || contains("gizli") || contains("açık") || contains("hibrit") ? 0.8 : 0;
        case "phaseStart": // Teklifbul Rule v1.0 - Süre (Başlangıç)
            return contains("başlangıç") || contains("baslangic") || contains("start") ? 0.8 : 0;
        case "phaseEnd": // Teklifbul Rule v1.0 - Süre (Bitiş)
            return contains("bitiş") || contains("bitis") || contains("end") ? 0.8 : 0;
        case "paymentTerms": // Teklifbul Rule v1.0 - Ödeme Şartları
            return contains("ödeme") || contains("odeme") || contains("peşin") || contains("pesin") || contains("kredi") || contains("açık hesap") ? 0.9 : 0;
        case "deliveryMethod": // Teklifbul Rule v1.0 - Teslim Şekli
            return contains("teslim şekli") || contains("teslim sekli") || contains("nakliye") ? 1 : 0;
        case "deliveryAddress": // Teklifbul Rule v1.0 - Teslimat Adresi
            return contains("teslimat adresi") || contains("teslimat adres") || contains("teslim adresi") ? 1 : 0;
        case "invoiceAddress": // Teklifbul Rule v1.0 - Fatura Adresi
            return contains("fatura adresi") || contains("fatura adres") ? 1 : 0;
        case "approver": // Teklifbul Rule v1.0 - Onay Kişileri
            return contains("onay") || contains("onaylayan") || contains("approver") ? 1 : 0;
        default:
            return candidate.raw.trim().length ? 0.2 : 0;
    }
}
export function scoreCandidate(field, label, candidate, config = {}) {
    const weights = { ...DEFAULT_CONFIG, ...config };
    const stringScore = stringSimilarity(label, field);
    const typeScore = typeConfidence(field, candidate);
    const ruleScore = ruleConfidence(field, label, candidate);
    const total = stringScore * weights.stringWeight +
        typeScore * weights.typeWeight +
        ruleScore * weights.ruleWeight;
    return {
        score: Math.max(0, Math.min(1, total)),
        components: {
            string: stringScore,
            type: typeScore,
            rule: ruleScore,
        },
    };
}
