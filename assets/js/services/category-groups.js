/**
 * Category Groups Service
 * Handles CRUD operations for user category groups
 */

import { db } from '../firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, orderBy, serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Convert category name to slug format
 * @param {string} name - Category name to convert
 * @returns {string} Slugified category name
 */
function toSlug(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

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
    console.error('Error listing category groups:', error);
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

    // Normalize categories to slugs
    const sluggedCategories = categories
      .map(cat => toSlug(cat))
      .filter(slug => slug); // Remove empty slugs

    if (sluggedCategories.length === 0) {
      throw new Error('No valid categories provided');
    }

    // Create group document
    const groupData = {
      name: trimmedName,
      categories: sluggedCategories,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(
      collection(db, 'users', uid, 'categoryGroups'),
      groupData
    );

    console.log(`✅ Category group created: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error creating category group:', error);
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
      
      // Normalize categories to slugs
      const sluggedCategories = updates.categories
        .map(cat => toSlug(cat))
        .filter(slug => slug); // Remove empty slugs

      if (sluggedCategories.length === 0) {
        throw new Error('No valid categories provided');
      }
      
      updatesToApply.categories = sluggedCategories;
    }

    await updateDoc(
      doc(db, 'users', uid, 'categoryGroups', groupId),
      updatesToApply
    );

    console.log(`✅ Category group updated: ${groupId}`);
  } catch (error) {
    console.error('Error updating category group:', error);
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
    console.log(`✅ Category group deleted: ${groupId}`);
  } catch (error) {
    console.error('Error deleting category group:', error);
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
    console.error('Error getting category group:', error);
    throw error;
  }
}
