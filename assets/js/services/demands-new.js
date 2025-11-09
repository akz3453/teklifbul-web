/**
 * Demands Service Module
 * Handles all demand-related operations
 * Updated: 2025-10-24 10:43 - Cache busting version
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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Get all published public demands
 * @param {number} limitCount - Maximum number of demands to return
 * @returns {Promise<Array>} Array of demand objects
 */
export async function getPublicDemands(limitCount = 50) {
  const q = query(
    collection(db, "demands"),
    where("isPublished", "==", true),
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get demands created by a specific user
 * @param {string} userId - User ID
 * @param {number} limitCount - Maximum number of demands to return
 * @returns {Promise<Array>} Array of demand objects
 */
export async function getUserDemands(userId, limitCount = 50) {
  const q = query(
    collection(db, "demands"),
    where("createdBy", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a single demand by ID
 * @param {string} demandId - Demand ID
 * @returns {Promise<Object|null>} Demand object or null if not found
 */
export async function getDemandDetail(demandId) {
  const docRef = doc(db, "demands", demandId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

/**
 * Create a new demand
 * @param {Object} demandData - Demand data
 * @param {string} userId - User ID
 * @param {string} companyId - Company ID
 * @param {Array} itemsData - Array of items
 * @returns {Promise<string>} New demand ID
 */
export async function createDemand(demandData, userId, companyId, itemsData = []) {
  const newDemandRef = await addDoc(collection(db, "demands"), {
    ...demandData,
    createdBy: userId,
    companyId: companyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({
      status: 'created',
      timestamp: Date.now(),
      userId: userId,
      note: 'Talep oluşturuldu'
    })
  });
  
  const demandId = newDemandRef.id;
  
  // Add items
  for (const item of itemsData) {
    await addDoc(collection(db, "demands", demandId, "items"), {
      ...item,
      createdAt: serverTimestamp()
    });
  }
  
  return demandId;
}

/**
 * Update an existing demand
 * @param {string} demandId - Demand ID
 * @param {Object} updateData - Data to update
 * @param {string} userId - User ID
 * @param {Array} itemsData - Array of items
 * @returns {Promise<void>}
 */
export async function updateDemand(demandId, updateData, userId, itemsData = []) {
  const demandRef = doc(db, "demands", demandId);
  await updateDoc(demandRef, {
    ...updateData,
    updatedAt: serverTimestamp(),
    updatedBy: userId
  });
  
  // Update items: delete old and add new
  const oldItems = await getDocs(collection(db, "demands", demandId, "items"));
  await Promise.all(oldItems.docs.map(d => deleteDoc(doc(db, "demands", demandId, "items", d.id))));
  
  for (const item of itemsData) {
    await addDoc(collection(db, "demands", demandId, "items"), {
      ...item,
      createdAt: serverTimestamp()
    });
  }
}

/**
 * Publish a demand and match suppliers
 * @param {string} demandId - Demand ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function publishDemand(demandId, userId) {
  const demandRef = doc(db, "demands", demandId);
  await updateDoc(demandRef, {
    isPublished: true,
    published: true, // For backward compatibility
    visibility: "public", // Default to public on publish
    status: 'published',
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    statusHistory: arrayUnion({
      status: 'published',
      timestamp: Date.now(),
      userId: userId,
      note: 'Talep onaylandı ve yayınlandı'
    })
  });
  
  // Find and log matching suppliers
  const demandSnap = await getDoc(demandRef);
  const demandData = demandSnap.data();
  
  if (demandData) {
    // Import suppliers service dynamically to avoid circular dependency
    const { findMatchingSuppliers } = await import('./suppliers.js');
    const supplierUids = await findMatchingSuppliers(demandData);
    
    if (supplierUids.length > 0) {
      await updateDoc(demandRef, { 
        viewerIds: Array.from(new Set([userId, ...supplierUids])) 
      });
      
      // Log demand recipients
      for (const supplierUid of supplierUids) {
        try {
          await addDoc(collection(db, "demandRecipients"), {
            demandId: demandId,
            supplierId: supplierUid,
            buyerId: userId,
            matchedAt: serverTimestamp(),
            categories: demandData.categoryTags,
            status: 'matched'
          });
        } catch (logError) {
          logger.warn("Could not log unmatched demand", logError.message);
        }
      }
    }
  }
}

/**
 * Unpublish a demand
 * @param {string} demandId - Demand ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function unpublishDemand(demandId, userId) {
  const demandRef = doc(db, "demands", demandId);
  await updateDoc(demandRef, {
    isPublished: false,
    published: false, // For backward compatibility
    status: 'draft',
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    statusHistory: arrayUnion({
      status: 'draft',
      timestamp: Date.now(),
      userId: userId,
      note: 'Talep geri çekildi ve taslak yapıldı'
    })
  });
}
