/**
 * Match Service - Supplier matching by category IDs
 * CRITICAL: Eşleşme öncelikle Admin API üzerinden yapılır (security rules bypass).
 * Client Firestore sorgusu yalnızca API başarısız olursa fallback'tir.
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../shared/log/logger.js';

import { collection, query, where, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Chunk array into batches of max size
 */
function chunkArray(arr, chunkSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Get unique values from array
 */
function uniq(arr) {
  return Array.from(new Set(arr));
}

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
 * Match suppliers by category IDs (client Firestore fallback)
 */
async function matchSuppliersClient(db, { categoryIds, legacySlugs = [], legacyNames = [] }) {
  const resultMap = new Map();

  async function runQuery(fieldName, values, fieldLabel) {
    if (!values || values.length === 0) {
      return;
    }

    const uniqueValues = uniq(values).filter(Boolean);
    if (uniqueValues.length === 0) {
      return;
    }

    const batches = chunkArray(uniqueValues, 10);

    logger.info(`Processing ${uniqueValues.length} ${fieldLabel} values in ${batches.length} batch(es)`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      try {
        const q = query(
          collection(db, 'users'),
          where(fieldName, 'array-contains-any', batch),
          limit(100)
        );

        const snap = await getDocs(q);
        const totalUsers = snap.docs.length;

        let foundCount = 0;

        snap.forEach(docSnap => {
          const data = docSnap.data();

          const isActive = data.isActive !== false;

          const isSupplier =
            (Array.isArray(data.roles) && data.roles.includes('supplier')) ||
            (data.roles && typeof data.roles === 'object' && data.roles.supplier === true) ||
            (data.role === 'supplier');

          if (isSupplier && isActive) {
            foundCount++;
            resultMap.set(docSnap.id, {
              ...data,
              uid: docSnap.id,
              id: docSnap.id
            });
          }
        });

        if (totalUsers > 0 && foundCount > 0) {
          logger.info(`[${fieldName}] ${foundCount} tedarikçi bulundu`);
        } else if (totalUsers === 0) {
          logger.warn(`[${fieldName}] Eşleşen kullanıcı bulunamadı`);
        }

      } catch (err) {
        logger.error(`Supplier query failed [${fieldName}] batch ${batchIndex + 1}`, {
          code: err?.code || 'unknown',
          message: err?.message || String(err),
          error: err
        });

        if (err?.code === 'failed-precondition') {
          logger.error('This query requires a Firestore composite index');
          logger.error(`Index needed: users collection, fields: roles (array-contains), isActive (==), ${fieldName} (array-contains-any)`);
        }

        throw err;
      }
    }
  }

  await runQuery('supplierCategoryIds', categoryIds, 'category IDs');

  if (legacySlugs && legacySlugs.length > 0) {
    await runQuery('supplierCategoryKeys', legacySlugs, 'legacy slugs');
  }

  if (legacyNames && legacyNames.length > 0) {
    await runQuery('supplierCategories', legacyNames, 'legacy names');
  }

  return Array.from(resultMap.values());
}

/**
 * Match suppliers by category IDs
 *
 * @param {Firestore} db - Firestore database instance
 * @param {object} options - Matching options
 * @param {string[]} options.categoryIds - Required: Array of category IDs
 * @param {string[]} [options.legacySlugs] - Optional legacy slugs
 * @param {string[]} [options.legacyNames] - Optional legacy names
 * @returns {Promise<Array>} Array of matched supplier documents
 */
export async function matchSuppliers(db, { categoryIds, legacySlugs = [], legacyNames = [] }) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    logger.warn('matchSuppliers: categoryIds is empty, returning empty result');
    return [];
  }

  // Teklifbul Rule v1.0 — Prefer Admin API (avoids client users list permission-denied)
  try {
    const suppliers = await matchSuppliersViaApi({ categoryIds, legacySlugs, legacyNames });
    if (suppliers.length > 0) {
      logger.info(`Toplam ${suppliers.length} benzersiz tedarikçi eşleştirildi (API)`);
    } else {
      logger.info('API eşlemesi boş sonuç döndü');
    }
    return suppliers;
  } catch (apiErr) {
    logger.warn('Supplier match API failed, falling back to client query', {
      message: apiErr?.message || String(apiErr),
    });
  }

  if (!db) {
    throw new Error('Firestore database instance is required');
  }

  const results = await matchSuppliersClient(db, { categoryIds, legacySlugs, legacyNames });
  if (results.length > 0) {
    logger.info(`Toplam ${results.length} benzersiz tedarikçi eşleştirildi`);
  }
  return results;
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
  return suppliers.map(s => s.uid || s.id).filter(Boolean);
}
