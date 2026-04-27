/**
 * Frontend Admin Helper Functions
 * Teklifbul Rule v1.0 - Admin kimlik tespiti: Merkezi helper fonksiyonlar
 */

import { auth } from '/firebase.js';
import { logger } from '../log/logger.js';

/**
 * Kullanıcının admin olup olmadığını kontrol eder
 * @param user Firebase user object veya null
 * @returns Promise<boolean>
 */
export async function isAdmin(user: any): Promise<boolean> {
  if (!user) {
    return false;
  }

  try {
    // Custom claims'den admin kontrolü
    const tokenResult = await user.getIdTokenResult();
    const claims = tokenResult.claims || {};
    
    let isAdmin = claims.admin === true || claims.role === 'admin';
    let isOps = claims.ops === true || claims.role === 'ops';
    
    if (isAdmin || isOps) {
      return true;
    }

    // Eğer custom claims'de admin yoksa Firestore'dan kontrol et
    const { db } = await import('/firebase.js');
    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      isAdmin = userData?.isAdmin === true || userData?.role === 'admin';
      isOps = userData?.isOps === true || userData?.role === 'ops';
      return isAdmin || isOps;
    }

    return false;
  } catch (error) {
    logger.warn('Admin check failed', error);
    return false;
  }
}

/**
 * Mevcut kullanıcının admin olup olmadığını kontrol eder
 * @returns Promise<boolean>
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }
  return await isAdmin(user);
}

/**
 * Premium özellik kontrolü - Admin kullanıcılar için her zaman true
 * @param planId Kullanıcının plan ID'si
 * @param requiredPlan Gerekli plan ('premium' veya 'premium_plus')
 * @returns Promise<boolean>
 */
export async function hasFeatureAccess(planId: string, requiredPlan: 'premium' | 'premium_plus' = 'premium'): Promise<boolean> {
  const userIsAdmin = await isCurrentUserAdmin();
  
  // Admin kullanıcılar her zaman erişim sağlar
  if (userIsAdmin) {
    return true;
  }

  // Normal kullanıcılar için plan kontrolü
  if (requiredPlan === 'premium') {
    return planId === 'premium' || planId === 'premium_monthly' || planId === 'premium_yearly' ||
           planId === 'premium_plus' || planId === 'premium_plus_monthly' || planId === 'premium_plus_yearly';
  } else if (requiredPlan === 'premium_plus') {
    return planId === 'premium_plus' || planId === 'premium_plus_monthly' || planId === 'premium_plus_yearly';
  }

  return false;
}

