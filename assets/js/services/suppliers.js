/**
 * Suppliers Service Module
 * Handles supplier-related operations and matching
 * Updated: 2025-10-24 10:42
 */

import { db } from '../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Get all active suppliers
 * @param {number} limitCount - Maximum number of suppliers to return
 * @returns {Promise<Array>} Array of supplier objects
 */
export async function getAllSuppliers(limitCount = 100) {
  const q = query(
    collection(db, "users"),
    where("isSupplier", "==", true),
    where("isActive", "==", true),
    orderBy("displayName", "asc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Find suppliers matching demand categories
 * @param {Object} demandData - Demand data with categoryTags
 * @returns {Promise<Array<string>>} Array of matching supplier UIDs
 */
export async function findMatchingSuppliers(demandData) {
  const matchingSupplierUids = new Set();
  const demandCategories = demandData.categoryTags || [];
  
  if (demandCategories.length === 0) {
    logger.info("No categories specified for demand, no suppliers matched.");
    return [];
  }
  
  // Query for suppliers whose supplierCategories array contains any of the demand's categories
  const q = query(
    collection(db, 'users'),
    where('isSupplier', '==', true),
    where('isActive', '==', true),
    where('supplierCategories', 'array-contains-any', demandCategories)
  );
  
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    matchingSupplierUids.add(doc.id);
  });
  
  logger.info(`Found ${matchingSupplierUids.size} matching suppliers for demand categories`, { categories: demandCategories.join(', ') });
  return Array.from(matchingSupplierUids);
}

/**
 * Get supplier name by UID
 * @param {string} supplierId - Supplier UID
 * @returns {Promise<string>} Supplier name or 'Bilinmeyen Tedarikçi'
 */
export async function getSupplierName(supplierId) {
  if (!supplierId) return 'Bilinmeyen Tedarikçi';
  
  try {
    const supplierDoc = await getDoc(doc(db, 'users', supplierId));
    if (supplierDoc.exists()) {
      const data = supplierDoc.data();
      return data.displayName || data.email || 'Bilinmeyen Tedarikçi';
    }
  } catch (error) {
    logger.warn('Error fetching supplier name', error);
  }
  
  return 'Bilinmeyen Tedarikçi';
}

/**
 * Get supplier details by UID
 * @param {string} supplierId - Supplier UID
 * @returns {Promise<Object|null>} Supplier object or null if not found
 */
export async function getSupplierDetails(supplierId) {
  if (!supplierId) return null;
  
  try {
    const supplierDoc = await getDoc(doc(db, 'users', supplierId));
    if (supplierDoc.exists()) {
      return { id: supplierDoc.id, ...supplierDoc.data() };
    }
  } catch (error) {
    logger.warn('Error fetching supplier details', error);
  }
  
  return null;
}