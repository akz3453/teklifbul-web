/**
 * AI minimum token threshold config
 * Teklifbul Rule v1.2
 */
const DEFAULT_MIN_TOKENS = 200;
export function getAiMinTokens() {
    const raw = process.env.AI_MIN_TOKENS;
    const parsed = raw ? Number.parseInt(String(raw), 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0)
        return parsed;
    return DEFAULT_MIN_TOKENS;
}
