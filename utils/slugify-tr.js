/**
 * Turkish-friendly slug generator
 * CRITICAL: This function is ONLY for UI/search/URL purposes.
 * DO NOT use for category matching - use category IDs instead!
 * 
 * Converts Turkish characters and creates URL-safe slugs with hyphens
 * 
 * Examples:
 * - "Gıda" → "gida"
 * - "Hırdavat" → "hirdavat"
 * - "İş Güvenliği" → "is-guvenligi"
 * - "İnşaat Malzemeleri" → "insaat-malzemeleri"
 * - "Sac/Metal" → "sac-metal"
 * 
 * @param {string} input - Input string to convert to slug
 * @returns {string} Slugified string in lowercase with hyphens
 * 
 * @warning DO NOT use for matching! Use category IDs (CAT.XXX format) for matching.
 */
export function slugifyTr(input) {
  if (!input || typeof input !== 'string') return '';
  
  // Turkish character mapping
  const map = {
    'Ç': 'C', 'ç': 'c',
    'Ğ': 'G', 'ğ': 'g',
    'İ': 'I', 'ı': 'i',  // Critical: İ -> I, ı -> i
    'Ö': 'O', 'ö': 'o',
    'Ş': 'S', 'ş': 's',
    'Ü': 'U', 'ü': 'u'
  };
  
  // Step 1: Replace Turkish characters character by character
  let result = input
    .split('')
    .map(ch => map[ch] ?? ch)
    .join('');
  
  // Step 2: Convert to lowercase
  result = result.toLowerCase().trim();
  
  // Step 3: Replace all non-alphanumeric characters (including /, space, etc.) with hyphen
  // Note: '/' can stay in display, but for slug we convert to '-'
  result = result
    .replace(/[^a-z0-9\s/-]/g, '')  // Keep / for now (can be converted to -)
    .replace(/\//g, '-')             // Convert / to -
    .replace(/\s+/g, '-')            // Replace spaces with hyphens
    .replace(/-+/g, '-')             // Multiple hyphens to single hyphen
    .replace(/^-+|-+$/g, '');        // Trim leading/trailing hyphens
  
  return result;
}

