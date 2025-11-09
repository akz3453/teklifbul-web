/**
 * Adres Yardımcı Fonksiyonları
 * Teklifbul Rule v1.0 - ID tabanlı adres sistemi
 */

/**
 * Türkçe karakterleri normalize et (ı/İ, ç, ğ, ö, ü, ş)
 * @param s - Normalize edilecek string
 * @returns Normalize edilmiş string
 */
export function normalizeTR(s: string): string {
  if (!s) return s || '';
  return s
    .replace(/İ/g, 'I')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .trim();
}

/**
 * Sokak JSON dosya yolu oluştur
 * Format: /assets/sokak/{DISTRICT_ID}_mah-{NEIGHBORHOOD_ID}.json
 * @param districtId - İlçe ID (number veya string)
 * @param neighborhoodId - Mahalle ID (number veya string)
 * @returns Asset path
 */
export function buildStreetAssetPath(districtId: number | string, neighborhoodId: number | string): string {
  return `/assets/sokak/${districtId}_mah-${neighborhoodId}.json`;
}

/**
 * Mahalle JSON dosya yolu oluştur
 * Format: /assets/mahalle/{DISTRICT_ID}.json
 * @param districtId - İlçe ID (number veya string)
 * @returns Asset path
 */
export function buildNeighborhoodAssetPath(districtId: number | string): string {
  return `/assets/mahalle/${districtId}.json`;
}

