/**
 * Match Service - Firestore-based supplier matching using category IDs
 * CRITICAL: Eşleşme sadece ID üzerinden yapılır.
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../shared/log/logger.js';

import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

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
        const q = query(
          collection(db, 'users'),
          where(fieldName, 'array-contains-any', batch)
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
        
        // Enhanced logging for debugging
        if (totalUsers > 0) {
          logger.info(`Query ${batchIndex + 1}/${batches.length} [${fieldName}]: Found ${foundCount} suppliers (filtered from ${totalUsers} active users, ${nonSupplierCount} non-suppliers)`);
        } else {
          logger.warn(`Query ${batchIndex + 1}/${batches.length} [${fieldName}]: No active users found with matching ${fieldName} values`, { batch });
          // Try querying without isActive filter to see if there are any users with these categories
          try {
            const debugQ = query(
              collection(db, 'users'),
              where(fieldName, 'array-contains-any', batch)
            );
            const debugSnap = await getDocs(debugQ);
            if (debugSnap.docs.length > 0) {
              const sampleData = debugSnap.docs[0].data();
              logger.info(`Debug: Found ${debugSnap.docs.length} users with matching ${fieldName}`);
              logger.info('Debug: Sample user data', {
                uid: debugSnap.docs[0].id,
                isActive: sampleData.isActive,
                roles: sampleData.roles,
                role: sampleData.role,
                [fieldName]: sampleData[fieldName]?.slice(0, 3) // First 3 categories
              });
              logger.info(`Debug: Active users: ${debugSnap.docs.filter(d => d.data().isActive !== false).length}`);
              logger.info(`Debug: Supplier users: ${debugSnap.docs.filter(d => {
                const data = d.data();
                return (Array.isArray(data.roles) && data.roles.includes('supplier')) ||
                       (data.roles && typeof data.roles === 'object' && data.roles.supplier === true) ||
                       (data.role === 'supplier');
              }).length}`);
            } else {
              logger.info(`Debug: No users found with ${fieldName} values at all. Suppliers may need to update their categories to ID format.`);
            }
          } catch (debugErr) {
            // Ignore debug query errors
          }
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
  logger.info(`Total unique suppliers matched: ${results.length}`);
  
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

