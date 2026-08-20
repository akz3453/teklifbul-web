// Teklifbul Rule v1.0 — Query tokens for stock searchTokens array-contains
export function buildQuerySearchTokens(text) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens = new Set();
  for (const word of words) {
    for (let i = 2; i <= Math.min(10, word.length); i++) {
      if (tokens.size >= 10) break;
      tokens.add(word.slice(0, i));
    }
    if (tokens.size >= 10) break;
  }
  return Array.from(tokens).slice(0, 10);
}
