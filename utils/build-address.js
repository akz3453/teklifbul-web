/**
 * Build address string from address parts object
 * Filters out placeholder text and empty values
 * 
 * @param {Object} addressParts - Address object with optional fields:
 *   - mahalle: string
 *   - cadde: string
 *   - sokak: string
 *   - kapiNo: string
 *   - daire: string
 *   - ilce: string
 *   - il: string
 *   - postaKodu: string
 * @returns {string} Formatted address string with " - " separators
 * 
 * @example
 * buildAddress({
 *   mahalle: 'Yıldızlar',
 *   cadde: 'Atatürk',
 *   sokak: 'Cumhuriyet',
 *   kapiNo: '22',
 *   daire: '1',
 *   ilce: 'Bornova',
 *   il: 'İzmir',
 *   postaKodu: '35000'
 * })
 * // Returns: "Yıldızlar Mahalle - Atatürk Cadde - Cumhuriyet Sokak - Kapı No: 22 - Daire: 1 - İlçe: Bornova - İl: İzmir - Posta Kodu: 35000 - Türkiye"
 */
export function buildAddress(addressParts) {
  if (!addressParts || typeof addressParts !== 'object') {
    return 'Türkiye';
  }
  
  // Common placeholder patterns to filter out
  const placeholders = [
    'seçiniz',
    'seç',
    'select',
    'choose',
    'mahalle seçiniz',
    'cadde seçiniz',
    'sokak seçiniz',
    'sokak/cadde seçiniz'
  ];
  
  // Helper to check if a value is a placeholder
  const isPlaceholder = (value) => {
    if (!value || typeof value !== 'string') return true;
    const lower = value.toLowerCase().trim();
    if (!lower) return true;
    return placeholders.some(ph => lower.includes(ph));
  };
  
  const parts = [];
  
  // Add non-empty, non-placeholder parts
  if (addressParts.mahalle && !isPlaceholder(addressParts.mahalle)) {
    parts.push(`${addressParts.mahalle} Mahalle`);
  }
  
  if (addressParts.cadde && !isPlaceholder(addressParts.cadde)) {
    parts.push(`${addressParts.cadde} Cadde`);
  }
  
  if (addressParts.sokak && !isPlaceholder(addressParts.sokak)) {
    parts.push(`${addressParts.sokak} Sokak`);
  }
  
  if (addressParts.kapiNo && !isPlaceholder(addressParts.kapiNo)) {
    parts.push(`Kapı No: ${addressParts.kapiNo}`);
  }
  
  if (addressParts.daire && !isPlaceholder(addressParts.daire)) {
    parts.push(`Daire: ${addressParts.daire}`);
  }
  
  if (addressParts.ilce && !isPlaceholder(addressParts.ilce)) {
    parts.push(`İlçe: ${addressParts.ilce}`);
  }
  
  if (addressParts.il && !isPlaceholder(addressParts.il)) {
    parts.push(`İl: ${addressParts.il}`);
  }
  
  if (addressParts.postaKodu && !isPlaceholder(addressParts.postaKodu)) {
    parts.push(`Posta Kodu: ${addressParts.postaKodu}`);
  }
  
  // Always add Türkiye at the end
  parts.push('Türkiye');
  
  return parts.join(' - ');
}

