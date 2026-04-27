/**
 * Match Service - Firestore-based supplier matching using category IDs
 * CRITICAL: Eşleşme sadece ID üzerinden yapılır.
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

/**
 * Match suppliers by category IDs
 * 
 * @param {Firestore} db - Firestore database instance
 * @param {object} options - Matching options
 * @param {string[]} options.categoryIds - Required: Array of category IDs (e.g., ['CAT.ELEKTRIK', 'CAT.AYDINLATMA'])
 * @param {string[]} [options.legacySlugs] - Optional: Array of legacy slugs for backward compatibility
 * @param {string[]} [options.legacyNames] - Optional: Array of legacy names for backward compatibility
 * @returns {Promise<Array>} Array of matched supplier documents
 * 
 * @example
 * const suppliers = await matchSuppliers(db, {
 *   categoryIds: ['CAT.ELEKTRIK', 'CAT.AYDINLATMA'],
 *   legacySlugs: ['elektrik'], // optional backward compatibility
 *   legacyNames: ['Elektrik']  // optional backward compatibility
 * });
 */
export async function matchSuppliers(db, { categoryIds, legacySlugs = [], legacyNames = [] }) {
  if (!db) {
    throw new Error('Firestore database instance is required');
  }
  
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    logger.warn('matchSuppliers: categoryIds is empty, returning empty result');
    return [];
  }
  
  // Result set (Map to avoid duplicates)
  const resultMap = new Map();
  
  /**
   * Run query for a specific field
   */
  async function runQuery(fieldName, values, fieldLabel) {
    if (!values || values.length === 0) {
      return;
    }
    
    const uniqueValues = uniq(values).filter(Boolean);
    if (uniqueValues.length === 0) {
      return;
    }
    
    // Firestore limitation: array-contains-any supports max 10 values
    const batches = chunkArray(uniqueValues, 10);
    
    logger.info(`Processing ${uniqueValues.length} ${fieldLabel} values in ${batches.length} batch(es)`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        // CRITICAL: Firestore allows only ONE array-contains/array-contains-any per query
        // So we must query without roles filter, then filter in JavaScript
        // Note: We query without isActive first, then filter - some users may not have isActive set yet
        // Teklifbul Rule v1.0 - Limit ekle (performans için)
        const q = query(
          collection(db, 'users'),
          where(fieldName, 'array-contains-any', batch),
          limit(100)
        );
        
        const snap = await getDocs(q);
        const totalUsers = snap.docs.length;
        
        // Filter results in JavaScript to check for supplier role
        let foundCount = 0;
        let nonSupplierCount = 0;
        
        snap.forEach(doc => {
          const data = doc.data();
          
          // Check if user is active (default to true if field is missing)
          const isActive = data.isActive !== false; // Only exclude if explicitly false
          
          // Check if user is a supplier (multiple role formats supported)
          const isSupplier = 
            (Array.isArray(data.roles) && data.roles.includes('supplier')) ||
            (data.roles && typeof data.roles === 'object' && data.roles.supplier === true) ||
            (data.role === 'supplier');
          
          // Only add if supplier AND active
          if (isSupplier && isActive) {
            foundCount++;
            // CRITICAL: Store both doc.id and doc.data() so we can return IDs
            resultMap.set(doc.id, {
              ...data,
              uid: doc.id,
              id: doc.id
            });
          } else {
            nonSupplierCount++;
          }
        });
        
        // Teklifbul Rule v1.0 - Log mesajlarını sadeleştir (gereksiz detayları kaldır)
        if (totalUsers > 0 && foundCount > 0) {
          // Sadece başarılı sorguları logla, detayları azalt
          logger.info(`[${fieldName}] ${foundCount} tedarikçi bulundu`);
        } else if (totalUsers === 0) {
          // Sadece uyarı ver, debug sorgularını kaldır (performans için)
          logger.warn(`[${fieldName}] Eşleşen kullanıcı bulunamadı`);
        }
        
      } catch (err) {
        logger.error(`Supplier query failed [${fieldName}] batch ${batchIndex + 1}`, {
          code: err?.code || 'unknown',
          message: err?.message || String(err),
          error: err
        });
        
        // If it's an index error, provide helpful message
        if (err?.code === 'failed-precondition') {
          logger.error('This query requires a Firestore composite index');
          logger.error(`Index needed: users collection, fields: roles (array-contains), isActive (==), ${fieldName} (array-contains-any)`);
          if (err?.message && err.message.includes('https://')) {
            logger.error('Index creation link (check console for full URL)', { url: err.message });
          }
        }
        
        // Re-throw to stop processing (or continue with next batch if you prefer)
        throw err;
      }
    }
  }
  
  // Run queries for ID-based matching (primary)
  await runQuery('supplierCategoryIds', categoryIds, 'category IDs');
  
  // Run queries for backward compatibility (optional)
  if (legacySlugs && legacySlugs.length > 0) {
    await runQuery('supplierCategoryKeys', legacySlugs, 'legacy slugs');
  }
  
  if (legacyNames && legacyNames.length > 0) {
    await runQuery('supplierCategories', legacyNames, 'legacy names');
  }
  
  const results = Array.from(resultMap.values());
  // Teklifbul Rule v1.0 - Toplam sonuç logunu sadeleştir
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

