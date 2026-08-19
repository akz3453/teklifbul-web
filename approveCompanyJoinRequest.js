/**
 * Approve/Reject Company Join Request
 * 
 * This module handles the admin approval/rejection flow for company join requests.
 * It ensures idempotency and proper data consistency.
 * 
 * Usage (Frontend - Admin Panel):
 *   import { approveRequest, rejectRequest } from './approveCompanyJoinRequest.js';
 *   await approveRequest(requestId, approverId);
 *   await rejectRequest(requestId, approverId, 'Reason for rejection');
 * 
 * Usage (Cloud Function):
 *   Deploy as Cloud Function and call from admin panel
 * 
 * Usage (Admin SDK - Node.js):
 *   const admin = require('firebase-admin');
 *   const { approveRequestAdmin, rejectRequestAdmin } = require('./approveCompanyJoinRequest.js');
 *   await approveRequestAdmin(requestId, approverId);
 */

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from './firebase-config.js';

/**
 * Approves a company join request
 * 
 * This function:
 * 1. Sets request.status = 'accepted'
 * 2. Sets users/{uid}.companyId = companyId
 * 3. Sets users/{uid}.companyJoinStatus = 'accepted'
 * 4. Sets users/{uid}.companyRole = requestedRole
 * 5. Sets approvedAt and approverId
 * 
 * @param {string} requestId - Company join request document ID
 * @param {string} approverId - ID of the admin approving the request
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
export async function approveRequest(requestId, approverId) {
  try {
    console.log('✅ Approving request:', requestId);
    
    // Step 1: Get the request document
    const requestRef = doc(db, 'companyJoinRequests', requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      return {
        success: false,
        message: 'İstek bulunamadı.',
        error: 'REQUEST_NOT_FOUND'
      };
    }
    
    const requestData = requestDoc.data();
    
    // Step 2: Idempotency check - if already accepted, do nothing
    if (requestData.status === 'accepted') {
      console.log('⚠️  Request already accepted, skipping');
      return {
        success: true,
        message: 'İstek zaten onaylanmış.',
        alreadyApproved: true
      };
    }
    
    // Step 3: Validate request is pending
    if (requestData.status !== 'pending') {
      return {
        success: false,
        message: `İstek onaylanamaz. Mevcut durum: ${requestData.status}`,
        error: 'INVALID_STATUS'
      };
    }
    
    const userId = requestData.userId;
    const companyId = requestData.companyId;
    const requestedRole = requestData.requestedCompanyRole || requestData.requestedRole || 'unknown';
    
    if (!userId || !companyId) {
      return {
        success: false,
        message: 'İstekte eksik bilgi var.',
        error: 'INVALID_REQUEST_DATA'
      };
    }
    
    // Step 4: Get user document
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return {
        success: false,
        message: 'Kullanıcı bulunamadı.',
        error: 'USER_NOT_FOUND'
      };
    }
    
    // Step 5: Update request document
    await updateDoc(requestRef, {
      status: 'accepted',
      approvedRole: requestedRole,
      approvedAt: serverTimestamp(),
      approvedBy: approverId,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Request document updated');

    await setDoc(doc(db, 'companies', companyId, 'pendingMembers', userId), {
      userId,
      status: 'accepted',
      approvedRole: requestedRole,
      approvedAt: serverTimestamp(),
      approvedBy: approverId
    }, { merge: true });

    await setDoc(doc(db, 'companies', companyId, 'members', userId), {
      userId,
      status: 'accepted',
      approvedRole: requestedRole,
      approvedAt: serverTimestamp(),
      approvedBy: approverId
    }, { merge: true });
    
    // Step 6: Update user document
    const roleType = requestedRole.includes('supplier') ? 'supplier' : 'buyer';
    const userUpdate = {
      companyId: companyId, // ✅ Now set companyId
      companyJoinStatus: 'accepted', // ✅ Set to accepted
      companyRole: requestedRole.includes(':') ? requestedRole.split(':')[1] : requestedRole,
      companyRoleKey: requestedRole,
      companyRoleType: roleType,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Teklifbul Rule v1.0 - roles array'ini güncelle (gelen talepler için gerekli)
    const userData = userDoc.data();
    const currentUserRoles = userData.roles || [];
    let updatedUserRoles = [...currentUserRoles];
    
    // Rol tipine göre roles array'ini güncelle
    if (roleType === 'supplier') {
      if (!updatedUserRoles.includes('supplier') && !updatedUserRoles.includes('both')) {
        if (updatedUserRoles.includes('buyer')) {
          updatedUserRoles = ['both'];
        } else {
          updatedUserRoles.push('supplier');
        }
      }
    } else if (roleType === 'buyer') {
      if (!updatedUserRoles.includes('buyer') && !updatedUserRoles.includes('both')) {
        if (updatedUserRoles.includes('supplier')) {
          updatedUserRoles = ['both'];
        } else {
          updatedUserRoles.push('buyer');
        }
      }
    }
    
    userUpdate.roles = updatedUserRoles;
    
    // If user has companies array, add companyId if not present
    if (userData.companies && Array.isArray(userData.companies)) {
      if (!userData.companies.includes(companyId)) {
        userUpdate.companies = [...userData.companies, companyId];
      }
    } else {
      userUpdate.companies = [companyId];
    }
    
    // Set activeCompanyId
    userUpdate.activeCompanyId = companyId;
    
    await updateDoc(userRef, userUpdate);
    
    console.log('✅ User document updated');
    
    return {
      success: true,
      message: 'Kullanıcı başarıyla şirkete eklendi.',
      userId: userId,
      companyId: companyId
    };
    
  } catch (error) {
    console.error('❌ Error approving request:', error);
    return {
      success: false,
      message: 'İstek onaylanırken bir hata oluştu.',
      error: error.message
    };
  }
}

/**
 * Rejects a company join request
 * 
 * @param {string} requestId - Company join request document ID
 * @param {string} approverId - ID of the admin rejecting the request
 * @param {string} rejectionReason - Optional reason for rejection
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
export async function rejectRequest(requestId, approverId, rejectionReason = '') {
  try {
    console.log('❌ Rejecting request:', requestId);
    
    // Step 1: Get the request document
    const requestRef = doc(db, 'companyJoinRequests', requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      return {
        success: false,
        message: 'İstek bulunamadı.',
        error: 'REQUEST_NOT_FOUND'
      };
    }
    
    const requestData = requestDoc.data();
    
    // Step 2: Idempotency check
    if (requestData.status === 'rejected') {
      console.log('⚠️  Request already rejected, skipping');
      return {
        success: true,
        message: 'İstek zaten reddedilmiş.',
        alreadyRejected: true
      };
    }
    
    // Step 3: Update request document
    await updateDoc(requestRef, {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectedBy: approverId,
      rejectionReason: rejectionReason || '',
      updatedAt: serverTimestamp()
    });
    
    // Step 4: Update user document (set status to rejected)
    const userId = requestData.userId;
    if (userId) {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        await updateDoc(userRef, {
          companyJoinStatus: 'rejected',
          updatedAt: serverTimestamp()
        });
      }
    }
    
    console.log('✅ Request rejected');
    
    return {
      success: true,
      message: 'İstek reddedildi.',
      requestId: requestId
    };
    
  } catch (error) {
    console.error('❌ Error rejecting request:', error);
    return {
      success: false,
      message: 'İstek reddedilirken bir hata oluştu.',
      error: error.message
    };
  }
}

/**
 * Cloud Function version (for server-side execution)
 * File: functions/src/approveCompanyJoinRequest.ts
 */

import functions from 'firebase-functions';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Approve Company Join Request (Cloud Function)
 */
exports.approveCompanyJoinRequest = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { requestId } = data;
  const approverId = context.auth.uid;
  
  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Request ID is required');
  }
  
  try {
    const requestRef = db.collection('companyJoinRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    
    if (!requestDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Request not found');
    }
    
    const requestData = requestDoc.data();
    
    // Idempotency check
    if (requestData.status === 'accepted') {
      return { success: true, message: 'Already approved', alreadyApproved: true };
    }
    
    if (requestData.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Request is not pending');
    }
    
    const userId = requestData.userId;
    const companyId = requestData.companyId;
    const requestedRole = requestData.requestedCompanyRole || requestData.requestedRole;
    
    // Update request
    await requestRef.update({
      status: 'accepted',
      approvedRole: requestedRole,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: approverId
    });
    
    // Update user
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const roleType = requestedRole.includes('supplier') ? 'supplier' : 'buyer';
    
    // Teklifbul Rule v1.0 - roles array'ini güncelle (gelen talepler için gerekli)
    const currentUserRoles = userData.roles || [];
    let updatedUserRoles = [...currentUserRoles];
    
    // Rol tipine göre roles array'ini güncelle
    if (roleType === 'supplier') {
      if (!updatedUserRoles.includes('supplier') && !updatedUserRoles.includes('both')) {
        if (updatedUserRoles.includes('buyer')) {
          updatedUserRoles = ['both'];
        } else {
          updatedUserRoles.push('supplier');
        }
      }
    } else if (roleType === 'buyer') {
      if (!updatedUserRoles.includes('buyer') && !updatedUserRoles.includes('both')) {
        if (updatedUserRoles.includes('supplier')) {
          updatedUserRoles = ['both'];
        } else {
          updatedUserRoles.push('buyer');
        }
      }
    }
    
    await userRef.update({
      companyId: companyId,
      companyJoinStatus: 'accepted',
      companyRoleKey: requestedRole,
      companyRole: requestedRole.includes(':') ? requestedRole.split(':')[1] : requestedRole,
      companyRoleType: roleType,
      roles: updatedUserRoles, // ✅ roles array'ini güncelle
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('companies').doc(companyId).collection('pendingMembers').doc(userId).set({
      userId,
      status: 'accepted',
      approvedRole: requestedRole,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: approverId
    }, { merge: true });

    await db.collection('companies').doc(companyId).collection('members').doc(userId).set({
      userId,
      status: 'accepted',
      approvedRole: requestedRole,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: approverId
    }, { merge: true });
    
    return { success: true, message: 'User approved successfully' };
    
  } catch (error) {
    console.error('Error approving request:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Reject Company Join Request (Cloud Function)
 */
exports.rejectCompanyJoinRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { requestId, rejectionReason } = data;
  const approverId = context.auth.uid;
  
  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Request ID is required');
  }
  
  try {
    const requestRef = db.collection('companyJoinRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    
    if (!requestDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Request not found');
    }
    
    const requestData = requestDoc.data();
    
    if (requestData.status === 'rejected') {
      return { success: true, message: 'Already rejected', alreadyRejected: true };
    }
    
    // Update request
    await requestRef.update({
      status: 'rejected',
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: approverId,
      rejectionReason: rejectionReason || ''
    });
    
    // Update user
    if (requestData.userId) {
      const userRef = db.collection('users').doc(requestData.userId);
      await userRef.update({
        companyJoinStatus: 'rejected',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    return { success: true, message: 'Request rejected successfully' };
    
  } catch (error) {
    console.error('Error rejecting request:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

