/**
 * Category Groups Service
 * Handles CRUD operations for user category groups
 * 
 * CRITICAL: Updated to use ID-based category system
 * Categories are stored as category names (not slugs) in groups for readability
 * They are converted to IDs when used (via normalizeToIds in demand-new.html)
 */

import { db } from '../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, orderBy, serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// CRITICAL: Category groups store category names (not IDs, not slugs)
// Normalization to IDs happens in demand-new.html when groups are used
// This keeps the service simple and avoids import path issues

/**
 * List all category groups for a user
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of category groups
 */
export async function listGroupsForUser(uid) {
  try {
    const q = query(
      collection(db, 'users', uid, 'categoryGroups'),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    logger.error('Error listing category groups', error);
    throw error;
  }
}

/**
 * Create a new category group
 * @param {string} uid - User ID
 * @param {Object} groupData - Group data
 * @param {string} groupData.name - Group name
 * @param {Array<string>} groupData.categories - Array of category names
 * @returns {Promise<string>} Created group ID
 */
export async function createGroup(uid, { name, categories }) {
  try {
    // Validate input
    if (!name || !name.trim()) {
      throw new Error('Group name is required');
    }
    
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new Error('At least one category is required');
    }

    // Check for duplicate group names
    const existingGroups = await listGroupsForUser(uid);
    const trimmedName = name.trim();
    const duplicate = existingGroups.find(group => 
      group.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (duplicate) {
      throw new Error('A group with this name already exists');
    }

    // CRITICAL: Store categories as names (not slugs) for readability
    // They will be normalized to IDs when used in demand-new.html
    // Ensure categories are valid names (not empty, trim whitespace)
    const validCategories = categories
      .map(cat => typeof cat === 'string' ? cat.trim() : String(cat).trim())
      .filter(name => name.length > 0); // Remove empty

    if (validCategories.length === 0) {
      throw new Error('No valid categories provided');
    }

    // Create group document
    const groupData = {
      name: trimmedName,
      categories: validCategories, // Store as names (will be converted to IDs when used)
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(
      collection(db, 'users', uid, 'categoryGroups'),
      groupData
    );

    logger.info(`Category group created`, { groupId: docRef.id });
    return docRef.id;
  } catch (error) {
    logger.error('Error creating category group', error);
    throw error;
  }
}

/**
 * Update an existing category group
 * @param {string} uid - User ID
 * @param {string} groupId - Group ID
 * @param {Object} updates - Updates to apply
 * @param {string} [updates.name] - New group name
 * @param {Array<string>} [updates.categories] - New categories array
 * @returns {Promise<void>}
 */
export async function updateGroup(uid, groupId, updates) {
  try {
    const updatesToApply = {
      updatedAt: serverTimestamp()
    };

    // Handle name update
    if (updates.name !== undefined) {
      if (!updates.name || !updates.name.trim()) {
        throw new Error('Group name cannot be empty');
      }
      
      const trimmedName = updates.name.trim();
      
      // Check for duplicate names (excluding current group)
      const existingGroups = await listGroupsForUser(uid);
      const duplicate = existingGroups.find(group => 
        group.id !== groupId && 
        group.name.toLowerCase() === trimmedName.toLowerCase()
      );
      
      if (duplicate) {
        throw new Error('A group with this name already exists');
      }
      
      updatesToApply.name = trimmedName;
    }

    // Handle categories update
    if (updates.categories !== undefined) {
      if (!Array.isArray(updates.categories) || updates.categories.length === 0) {
        throw new Error('At least one category is required');
      }
      
      // CRITICAL: Store categories as names (not slugs) for readability
      // They will be normalized to IDs when used in demand-new.html
      const validCategories = updates.categories
        .map(cat => typeof cat === 'string' ? cat.trim() : String(cat).trim())
        .filter(name => name.length > 0); // Remove empty

      if (validCategories.length === 0) {
        throw new Error('No valid categories provided');
      }
      
      updatesToApply.categories = validCategories; // Store as names (will be converted to IDs when used)
    }

    await updateDoc(
      doc(db, 'users', uid, 'categoryGroups', groupId),
      updatesToApply
    );

    logger.info(`Category group updated`, { groupId });
  } catch (error) {
    logger.error('Error updating category group', error);
    throw error;
  }
}

/**
 * Delete a category group
 * @param {string} uid - User ID
 * @param {string} groupId - Group ID
 * @returns {Promise<void>}
 */
export async function deleteGroup(uid, groupId) {
  try {
    await deleteDoc(doc(db, 'users', uid, 'categoryGroups', groupId));
    logger.info(`Category group deleted`, { groupId });
  } catch (error) {
    logger.error('Error deleting category group', error);
    throw error;
  }
}

/**
 * Get a specific category group
 * @param {string} uid - User ID
 * @param {string} groupId - Group ID
 * @returns {Promise<Object|null>} Group data or null if not found
 */
export async function getGroup(uid, groupId) {
  try {
    const docRef = doc(db, 'users', uid, 'categoryGroups', groupId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting category group', error);
    throw error;
  }
}
