/**
 * Frontend Admin Helper Functions
 * Teklifbul Rule v1.0 - Admin kimlik tespiti: Merkezi helper fonksiyonlar
 */

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
    return claims.superAdmin === true
      || claims.admin === true
      || claims.isAdmin === true
      || claims.role === 'admin';
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
  const { auth } = await import('/firebase.js');
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

