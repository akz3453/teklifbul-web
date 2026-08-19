/**
 * Match Service - Supplier matching by category IDs
 * Teklifbul Rule v1.0 — yalnız Admin API (client users list PII kapalı)
 */

import { logger } from '../shared/log/logger.js';

async function matchSuppliersViaApi({ categoryIds, legacySlugs = [], legacyNames = [] }) {
  const { authFetch } = await import('../../assets/js/utils/api-helpers.js');
  const res = await authFetch('/api/suppliers/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryIds, legacySlugs, legacyNames }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `match_api_${res.status}`);
  }
  const data = await res.json();
  if (!data?.ok || !Array.isArray(data.suppliers)) {
    throw new Error('match_api_invalid_response');
  }
  return data.suppliers;
}

/**
 * Match suppliers by category IDs
 *
 * @param {Firestore} _db - unused (API path)
 * @param {object} options - Matching options
 * @param {string[]} options.categoryIds - Required: Array of category IDs
 * @param {string[]} [options.legacySlugs] - Optional legacy slugs
 * @param {string[]} [options.legacyNames] - Optional legacy names
 * @returns {Promise<Array>} Array of matched supplier documents
 */
export async function matchSuppliers(_db, { categoryIds, legacySlugs = [], legacyNames = [] }) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    logger.warn('matchSuppliers: categoryIds is empty, returning empty result');
    return [];
  }

  try {
    const suppliers = await matchSuppliersViaApi({ categoryIds, legacySlugs, legacyNames });
    if (suppliers.length > 0) {
      logger.info(`Toplam ${suppliers.length} benzersiz tedarikçi eşleştirildi (API)`);
    } else {
      logger.info('API eşlemesi boş sonuç döndü');
    }
    return suppliers;
  } catch (apiErr) {
    logger.warn('Supplier match API failed — client users list fallback kapalı (PII)', {
      message: apiErr?.message || String(apiErr),
    });
    return [];
  }
}

/**
 * Match suppliers by category IDs and return only IDs
 *
 * @param {Firestore} db - Firestore database instance
 * @param {string[]} categoryIds - Array of category IDs
 * @returns {Promise<string[]>} Array of supplier user IDs
 */
export async function matchSupplierIds(db, categoryIds) {
  const suppliers = await matchSuppliers(db, { categoryIds });
  return suppliers.map((s) => s.uid || s.id).filter(Boolean);
}
