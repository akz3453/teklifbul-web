/**
 * Adres Servisi - ID Tabanlı Sistem
 * Teklifbul Rule v1.0
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';

/**
 * Türkçe karakterleri normalize et
 */
export function normalizeTR(s) {
  if (!s) return s || '';
  return String(s)
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
 */
export function buildStreetAssetPath(districtId, neighborhoodId) {
  return `/assets/sokak/${districtId}_mah-${neighborhoodId}.json`;
}

/**
 * İl/İlçe/Mahalle isimlerinden ID'leri çözümle
 */
export async function resolveIdsByNames(provinceName, districtName, neighborhoodName) {
  try {
    const params = new URLSearchParams({
      provinceName: String(provinceName || ''),
      districtName: String(districtName || ''),
      neighborhoodName: String(neighborhoodName || '')
    });
    
    const res = await fetch(`/api/addr/resolve-ids?${params.toString()}`);
    const json = await res.json();
    
    if (json.ok && json.data) {
      return json.data; // { provinceId, districtId, neighborhoodId, defaultPostalCode? }
    }
    
    // Teklifbul Rule v1.0 - Structured Logging
    logger.warn('[addr] ID resolution failed', { error: json.error || 'Unknown error' });
    return null;
  } catch (e) {
    logger.error('[addr] ID resolution error', e);
    return null;
  }
}

/**
 * ID tabanlı sokak listesi yükle
 * @param {Object} params
 * @param {string} params.provinceName - İl adı
 * @param {string} params.districtName - İlçe adı
 * @param {string} params.neighborhoodName - Mahalle adı
 * @param {number} [params.neighborhoodIdFromState] - Mahalle ID (varsa kullanılır)
 * @param {number} [params.districtIdFromState] - İlçe ID (varsa kullanılır)
 * @returns {Promise<Array>} Sokak listesi [{ id, name, postalCode? }]
 */
export async function loadStreets({ 
  provinceName, 
  districtName, 
  neighborhoodName, 
  neighborhoodIdFromState,
  districtIdFromState 
}) {
  let neighborhoodId = neighborhoodIdFromState;
  let districtId = districtIdFromState;
  
  // 0) ID'ler yoksa çözümle
  if (!neighborhoodId || !districtId) {
    const ids = await resolveIdsByNames(provinceName, districtName, neighborhoodName);
    
    if (!ids) {
      logger.info('[addr] streets empty → free-text (ID resolution failed)', { 
        provinceName, 
        districtName, 
        neighborhoodName 
      });
      return [];
    }
    
    neighborhoodId = ids.neighborhoodId || neighborhoodId;
    districtId = ids.districtId || districtId;
  }
  
  if (!neighborhoodId) {
    logger.info('[addr] streets empty → free-text (no neighborhoodId)', { 
      provinceName, 
      districtName, 
      neighborhoodName 
    });
    return [];
  }
  
  // 1) Local JSON dene (sessizce, 404 normal)
  try {
    const assetPath = buildStreetAssetPath(districtId || 0, neighborhoodId);
    const localRes = await fetch(assetPath);
    
    if (localRes.ok) {
      const localData = await localRes.json();
      const streets = Array.isArray(localData?.streets) ? localData.streets : [];
      
      if (streets.length > 0) {
        logger.info('[addr] streets loaded from local JSON', { neighborhoodId, count: streets.length });
        return streets.map(s => ({
          id: s.id || s.name,
          name: s.name || s,
          postalCode: s.postalCode || s.postal_code || null
        }));
      }
    }
    // 404 sessizce geç (normal durum)
  } catch (_localError) {
    // Local fetch hatası sessizce geç
  }
  
  // 2) Backend proxy (retry'li, CORS güvenli)
  try {
    const apiRes = await fetch(`/api/addr/streets?neighborhoodId=${neighborhoodId}`);
    const apiJson = await apiRes.json();
    
    if (apiJson.ok && Array.isArray(apiJson.data) && apiJson.data.length > 0) {
      logger.info('[addr] streets loaded from API', { neighborhoodId, count: apiJson.data.length });
      
      // Cache'e kaydet (opsiyonel)
      if (districtId) {
        try {
          await fetch(`${location.origin}/save-street-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              districtId,
              districtName,
              neighborhoodId,
              neighborhoodName,
              streets: apiJson.data
            })
          });
        } catch (_saveError) {
          // Cache kaydetme hatası sessizce geç
        }
      }
      
      return apiJson.data;
    }
    
    logger.info('[addr] streets empty → free-text (API returned empty)', { neighborhoodId });
  } catch (apiError) {
    logger.warn('[addr] streets API fail', { 
      neighborhoodId, 
      error: apiError.message || String(apiError) 
    });
  }
  
  // 3) Free-text fallback (boş array döndür, UI free-text input'u açacak)
  return [];
}

/**
 * Posta kodu otomasyonu
 * Sokak seçilince postalCode'u set et
 */
export function onStreetSelected(street, neighborhood, setPostalCodeFn) {
  if (!setPostalCodeFn) return;
  
  const postalCode = street?.postalCode || neighborhood?.defaultPostalCode || '';
  
  if (postalCode) {
    setPostalCodeFn(postalCode);
  }
}

