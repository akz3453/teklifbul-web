/**
 * Stock Search Tokens - Pure Helper Functions
 * Teklifbul Rule v1.0 - Firestore autocomplete: Pure functions for token generation
 * 
 * These functions are pure (no side effects) and can be safely imported in tests.
 * They do not import Cloud Functions SDK to avoid trigger registration side effects.
 */

/**
 * Normalize Turkish characters for search
 * @param text - Text to normalize
 * @returns Normalized text (lowercase, Turkish chars converted, special chars removed)
 */
export function normalizeTRForSearch(text: string): string {
  return text
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
}

/**
 * Normalize SKU for search (keeps hyphens and underscores)
 * @param input - SKU to normalize
 * @returns Normalized SKU (lowercase, Turkish chars converted, keeps - and _)
 */
export function normalizeSkuForSearch(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, '')                // boşlukları kaldır
    .replace(/[^a-z0-9\-_]/g, '');    // sadece a-z 0-9 - _ kalsın
}

/**
 * Build search tokens from stock fields
 * @param name - Stock name
 * @param sku - Stock SKU
 * @param barcode - Stock barcode (optional)
 * @returns Array of search tokens (prefixes 2-12 chars, max 250)
 */
export function buildSearchTokens(name: string = '', sku: string = '', barcode: string = ''): string[] {
  const tokens = new Set<string>();
  
  // Process name: normalize with Turkish support, generate prefixes 2-10 chars
  if (name) {
    const normalizedName = normalizeTRForSearch(name);
    const nameWords = normalizedName.split(/\s+/).filter(Boolean);
    for (const word of nameWords) {
      for (let i = 2; i <= Math.min(10, word.length); i++) {
        if (tokens.size >= 250) break;
        tokens.add(word.slice(0, i));
      }
      if (tokens.size >= 250) break;
    }
  }
  
  // Process SKU: normalize keeping hyphens/underscores, generate prefixes 2-12 chars
  if (sku) {
    const normalizedSku = normalizeSkuForSearch(sku);
    if (normalizedSku) {
      for (let i = 2; i <= Math.min(12, normalizedSku.length); i++) {
        if (tokens.size >= 250) break;
        tokens.add(normalizedSku.slice(0, i));
      }
    }
  }
  
  // Process barcode: keep as-is (numbers only), generate prefixes 2-12 chars
  if (barcode) {
    const normalizedBarcode = barcode.toString().replace(/[^0-9]/g, '');
    if (normalizedBarcode) {
      for (let i = 2; i <= Math.min(12, normalizedBarcode.length); i++) {
        if (tokens.size >= 250) break;
        tokens.add(normalizedBarcode.slice(0, i));
      }
    }
  }
  
  return Array.from(tokens).slice(0, 250);
}

/**
 * Check if tokens have changed (prevent infinite loop)
 * @param newTokens - New token array
 * @param oldTokens - Old token array (can be null/undefined)
 * @returns True if tokens have changed
 */
/**
 * Query-side tokens for array-contains / array-contains-any (max 10).
 */
export function buildQuerySearchTokens(text: string): string[] {
  const normalized = normalizeTRForSearch(text || '');
  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const word of words) {
    for (let i = 2; i <= Math.min(10, word.length); i++) {
      if (tokens.size >= 10) break;
      tokens.add(word.slice(0, i));
    }
    if (tokens.size >= 10) break;
  }
  return Array.from(tokens).slice(0, 10);
}

export function tokensChanged(newTokens: string[], oldTokens: string[] | null | undefined): boolean {
  const existingTokens = Array.isArray(oldTokens) ? oldTokens : [];
  return JSON.stringify(newTokens.sort()) !== JSON.stringify(existingTokens.sort());
}

