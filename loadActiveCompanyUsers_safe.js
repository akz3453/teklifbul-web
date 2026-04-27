/**
 * Safe Active Company Users Loader
 * 
 * This module ensures only truly approved users appear in the active users list.
 * It excludes users with pending join requests and only shows users with
 * companyJoinStatus === 'accepted'.
 * 
 * Firestore Index Requirements:
 *   - Collection: users
 *   - Composite Index: companyId (ASC) + companyJoinStatus (ASC)
 *   
 *   To create index:
 *   1. Go to Firebase Console > Firestore > Indexes
 *   2. Click "Create Index"
 *   3. Collection: users
 *   4. Fields: companyId (Ascending), companyJoinStatus (Ascending)
 *   5. Click "Create"
 * 
 * Fallback Strategy:
 *   If index doesn't exist or query fails, this function will:
 *   1. Query companyJoinRequests for pending requests
 *   2. Exclude those userIds from the active users list
 * 
 * Usage:
 *   import { loadActiveCompanyUsers } from './loadActiveCompanyUsers_safe.js';
 *   const activeUsers = await loadActiveCompanyUsers(companyId);
 */

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from './firebase-config.js';

/**
 * Loads active company users (only approved users)
 * 
 * @param {string} companyId - Company ID
 * @returns {Promise<Array>} Array of active user objects
 */
export async function loadActiveCompanyUsers(companyId) {
  try {
    console.log('📖 Loading active users for company:', companyId);
    
    // Method 1: Preferred - Query with companyJoinStatus filter
    // This requires a Firestore composite index
    try {
      const activeUsersQuery = query(
        collection(db, 'users'),
        where('companyId', '==', companyId),
        where('companyJoinStatus', '==', 'accepted')
      );
      
      const snapshot = await getDocs(activeUsersQuery);
      
      if (!snapshot.empty) {
        const activeUsers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`✅ Found ${activeUsers.length} active users (using index query)`);
        return activeUsers;
      }
      
      // If query succeeds but returns empty, return empty array
      console.log('✅ No active users found (using index query)');
      return [];
      
    } catch (indexError) {
      // Index doesn't exist or query failed - use fallback method
      console.warn('⚠️  Index query failed, using fallback method:', indexError.message);
      return await loadActiveCompanyUsersFallback(companyId);
    }
    
  } catch (error) {
    console.error('❌ Error loading active users:', error);
    throw error;
  }
}

/**
 * Fallback method: Query all users with companyId, then filter out pending ones
 * This method is used when the composite index doesn't exist
 * 
 * @param {string} companyId - Company ID
 * @returns {Promise<Array>} Array of active user objects
 */
async function loadActiveCompanyUsersFallback(companyId) {
  try {
    console.log('🔄 Using fallback method to load active users...');
    
    // Step 1: Get company code (needed for querying companyJoinRequests)
    const companyDoc = await getDoc(doc(db, 'companies', companyId));
    if (!companyDoc.exists()) {
      console.error('❌ Company not found:', companyId);
      return [];
    }
    
    const companyData = companyDoc.data();
    const companyCode = companyData.code;
    
    if (!companyCode) {
      console.warn('⚠️  Company code not found, cannot use fallback method');
      return [];
    }
    
    // Step 2: Get all pending join requests for this company
    const pendingRequestsQuery = query(
      collection(db, 'companyJoinRequests'),
      where('companyCode', '==', companyCode),
      where('status', '==', 'pending')
    );
    
    const pendingSnapshot = await getDocs(pendingRequestsQuery);
    const pendingUserIds = new Set();
    
    pendingSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.userId) {
        pendingUserIds.add(data.userId);
      }
    });
    
    console.log(`📋 Found ${pendingUserIds.size} pending requests to exclude`);
    
    // Step 3: Query all users with this companyId
    const allUsersQuery = query(
      collection(db, 'users'),
      where('companyId', '==', companyId)
    );
    
    const allUsersSnapshot = await getDocs(allUsersQuery);
    
    // Step 4: Filter out pending users and only include accepted ones
    const activeUsers = [];
    
    for (const userDoc of allUsersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      // Exclude if user is in pending requests
      if (pendingUserIds.has(userId)) {
        console.log(`⏭️  Skipping pending user: ${userId}`);
        continue;
      }
      
      // Only include if companyJoinStatus is 'accepted' or 'approved' (backward compatibility)
      const status = userData.companyJoinStatus;
      if (status === 'accepted' || status === 'approved') {
        activeUsers.push({
          id: userId,
          ...userData
        });
      } else {
        // Explicitly exclude pending, rejected, or undefined status
        console.log(`⏭️  Skipping user with status '${status}': ${userId}`);
      }
    }
    
    console.log(`✅ Found ${activeUsers.length} active users (using fallback method)`);
    return activeUsers;
    
  } catch (error) {
    console.error('❌ Error in fallback method:', error);
    throw error;
  }
}

/**
 * Check if a user is active (approved) in a company
 * 
 * @param {string} userId - User ID
 * @param {string} companyId - Company ID
 * @returns {Promise<boolean>} True if user is active
 */
export async function isUserActiveInCompany(userId, companyId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      return false;
    }
    
    const userData = userDoc.data();
    
    // Check if user has this companyId
    if (userData.companyId !== companyId) {
      return false;
    }
    
    // Check if user is accepted
    const status = userData.companyJoinStatus;
    if (status === 'accepted' || status === 'approved') {
      return true;
    }
    
    // Double-check: ensure user is not in pending requests
    const companyDoc = await getDoc(doc(db, 'companies', companyId));
    if (!companyDoc.exists()) {
      return false;
    }
    
    const companyCode = companyDoc.data().code;
    if (!companyCode) {
      return false;
    }
    
    const pendingQuery = query(
      collection(db, 'companyJoinRequests'),
      where('companyCode', '==', companyCode),
      where('userId', '==', userId),
      where('status', '==', 'pending')
    );
    
    const pendingSnapshot = await getDocs(pendingQuery);
    
    // If there's a pending request, user is not active
    if (!pendingSnapshot.empty) {
      return false;
    }
    
    return false; // Default to false if status is not accepted
  } catch (error) {
    console.error('Error checking user active status:', error);
    return false;
  }
}

/**
 * Example usage in HTML/JS:
 * 
 * <div id="activeUsersList"></div>
 * 
 * <script type="module">
 *   import { loadActiveCompanyUsers } from './loadActiveCompanyUsers_safe.js';
 *   
 *   async function displayActiveUsers() {
 *     const companyId = 'your-company-id';
 *     const activeUsers = await loadActiveCompanyUsers(companyId);
 *     
 *     const listEl = document.getElementById('activeUsersList');
 *     listEl.innerHTML = activeUsers.map(user => `
 *       <div class="user-card">
 *         <h3>${user.displayName || user.email}</h3>
 *         <p>${user.companyRole || 'No role'}</p>
 *       </div>
 *     `).join('');
 *   }
 *   
 *   displayActiveUsers();
 * </script>
 */

