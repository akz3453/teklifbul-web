/**
 * Suppliers Service Module
 * Handles supplier-related operations and matching
 * Teklifbul Rule v1.0 — users list PII yok; eşleme Admin API; ad için publicProfiles
 */

import { db } from '../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import {
  collection,
  query,
  limit,
  getDocs,
  getDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Get public supplier projections (not full users docs)
 * @param {number} limitCount - Maximum number of suppliers to return
 * @returns {Promise<Array>} Array of supplier objects
 */
export async function getAllSuppliers(limitCount = 100) {
  const q = query(
    collection(db, 'publicProfiles'),
    limit(limitCount)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Find suppliers matching demand categories
 * @param {Object} demandData - Demand data with categoryTags
 * @returns {Promise<Array<string>>} Array of matching supplier UIDs
 */
export async function findMatchingSuppliers(demandData) {
  const categoryIds = demandData.categoryIds || [];
  const categoryTags = demandData.categoryTags || [];
  const allSearchCategories = Array.from(new Set([...categoryIds, ...categoryTags]));

  if (allSearchCategories.length === 0) {
    logger.info('No categories specified for demand, no suppliers matched.');
    return [];
  }

  try {
    const { authFetch } = await import('../utils/api-helpers.js');
    const res = await authFetch('/api/suppliers/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryIds,
        legacySlugs: categoryTags,
        legacyNames: categoryTags,
      }),
    });
    if (!res.ok) {
      logger.warn('findMatchingSuppliers API failed', { status: res.status });
      return [];
    }
    const data = await res.json();
    const suppliers = Array.isArray(data?.suppliers) ? data.suppliers : [];
    const uids = suppliers.map((s) => s.uid || s.id).filter(Boolean);
    logger.info(`Found ${uids.length} matching suppliers for categories`, {
      ids: categoryIds.join(','),
      tags: categoryTags.join(','),
    });
    return uids;
  } catch (error) {
    logger.warn('findMatchingSuppliers error', error);
    return [];
  }
}

function displayNameFromProfile(data) {
  return data?.displayName || data?.name || data?.companyName || data?.email || 'Bilinmeyen Tedarikçi';
}

/**
 * Get supplier name by UID
 * @param {string} supplierId - Supplier UID
 * @returns {Promise<string>} Supplier name or 'Bilinmeyen Tedarikçi'
 */
export async function getSupplierName(supplierId) {
  if (!supplierId) return 'Bilinmeyen Tedarikçi';

  try {
    const pub = await getDoc(doc(db, 'publicProfiles', supplierId));
    if (pub.exists()) return displayNameFromProfile(pub.data());
  } catch (error) {
    logger.warn('publicProfiles name okunamadı', error);
  }

  try {
    const supplierDoc = await getDoc(doc(db, 'users', supplierId));
    if (supplierDoc.exists()) return displayNameFromProfile(supplierDoc.data());
  } catch (error) {
    logger.warn('Error fetching supplier name', error);
  }

  return 'Bilinmeyen Tedarikçi';
}

/**
 * Get supplier details by UID (public projection)
 * @param {string} supplierId - Supplier UID
 * @returns {Promise<Object|null>} Supplier object or null if not found
 */
export async function getSupplierDetails(supplierId) {
  if (!supplierId) return null;

  try {
    const pub = await getDoc(doc(db, 'publicProfiles', supplierId));
    if (pub.exists()) {
      const data = pub.data() || {};
      return {
        id: pub.id,
        displayName: data.displayName || data.name || data.companyName || null,
        companyName: data.companyName || null,
      };
    }
  } catch (error) {
    logger.warn('publicProfiles details okunamadı', error);
  }

  try {
    const supplierDoc = await getDoc(doc(db, 'users', supplierId));
    if (supplierDoc.exists()) {
      const data = supplierDoc.data() || {};
      return {
        id: supplierDoc.id,
        displayName: data.displayName || data.name || data.companyName || null,
        companyName: data.companyName || null,
      };
    }
  } catch (error) {
    logger.warn('Error fetching supplier details', error);
  }

  return null;
}
