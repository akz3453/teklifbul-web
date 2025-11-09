/**
 * Company State Management
 * Handles company selection and persistence with priority-based resolution
 */

import { db, auth } from '../firebase.js';
import { doc, getDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const LS_KEY = 'activeCompanyId';
const PROFILE_KEYS = ['companyName', 'company_name', 'company_title']; // robust keys
let activeCompanyId = null;
let userCompanies = [];

/**
 * Get active company ID with priority-based resolution
 * Priority: (1) localStorage, (2) user.defaultCompanyId, (3) first membership
 * @returns {Promise<string|null>} Active company ID
 */
export async function getActiveCompanyId() {
  try {
    // Priority 1: localStorage
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      activeCompanyId = saved;
      return saved;
    }

    const user = auth.currentUser;
    if (!user) return null;

    // Priority 2: users/{uid}.defaultCompanyId
    const profSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
    if (profSnap?.exists()) {
      const data = profSnap.data() || {};
      if (data.defaultCompanyId) {
        localStorage.setItem(LS_KEY, data.defaultCompanyId);
        activeCompanyId = data.defaultCompanyId;
        return data.defaultCompanyId;
      }
    }

    // Priority 3: membership fallback
    try {
      const companiesQ = query(collection(db, 'companies'), where('members', 'array-contains', user.uid));
      const companies = await getDocs(companiesQ);
      const first = companies.docs?.[0];
      if (first) {
        localStorage.setItem(LS_KEY, first.id);
        activeCompanyId = first.id;
        return first.id;
      }
    } catch (e) {
      logger.warn('Membership query failed', e);
    }

    return null;
    
  } catch (error) {
    logger.error('Error getting active company ID', error);
    return null;
  }
}

/**
 * Set active company ID and persist to localStorage
 * @param {string} companyId - Company ID to set as active
 */
export function setActiveCompanyId(companyId) {
  activeCompanyId = companyId;
  localStorage.setItem(LS_KEY, companyId);
  
  // Dispatch change event
  window.dispatchEvent(new CustomEvent('company:changed', {
    detail: { companyId }
  }));
  
  logger.info('Active company changed', { companyId });
}

/**
 * Load user companies from Firestore
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of company objects
 */
export async function loadUserCompanies(uid) {
  try {
    // Get user profile to find company memberships
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) {
      userCompanies = [];
      return userCompanies;
    }

    const userData = userDoc.data();
    const companyIds = userData.companies || [];
    
    logger.info('User data from Firestore', {
      uid,
      companies: companyIds,
      defaultCompanyId: userData.defaultCompanyId,
      companyName: userData.companyName
    });

    if (companyIds.length === 0) {
      // If no companies array, try to use defaultCompanyId
      if (userData.defaultCompanyId) {
        logger.info('No companies array, using defaultCompanyId', { defaultCompanyId: userData.defaultCompanyId });
        companyIds.push(userData.defaultCompanyId);
      } else {
        userCompanies = [];
        return userCompanies;
      }
    }

    // Fetch company details
    const companies = [];
    for (const companyId of companyIds) {
      try {
        const companyDoc = await getDoc(doc(db, 'companies', companyId));
        if (companyDoc.exists()) {
          companies.push({
            id: companyId,
            ...companyDoc.data()
          });
        } else {
          // If company document doesn't exist, try to use user's companyName
          if (userData.companyName) {
            logger.info('Company document not found, using user companyName', { companyName: userData.companyName });
            companies.push({
              id: companyId,
              name: userData.companyName
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to load company ${companyId}`, error);
        // Fallback to user's companyName
        if (userData.companyName) {
          companies.push({
            id: companyId,
            name: userData.companyName
          });
        }
      }
    }

    userCompanies = companies;
    logger.info('Loaded user companies', { companies: userCompanies });
    return userCompanies;
    
  } catch (error) {
    logger.error('Error loading user companies', error);
    userCompanies = [];
    return userCompanies;
  }
}

/**
 * Get active company data
 * @returns {Promise<Object|null>} Active company object or null
 */
export async function getActiveCompany() {
  try {
    // Try by id first
    const id = await getActiveCompanyId();
    if (id) {
      const snap = await getDoc(doc(db, 'companies', id)).catch(() => null);
      if (snap?.exists()) return { id, ...snap.data() };
    }

    // Otherwise fallback to profile "Şirket Adı" fields
    const user = auth.currentUser;
    if (!user) return null;
    
    // Try profiles collection first (hesap ayarları)
    const collections = ['profiles', 'users', 'publicProfiles'];
    for (const collection of collections) {
      try {
        const profSnap = await getDoc(doc(db, collection, user.uid)).catch(() => null);
        if (profSnap?.exists()) {
          const data = profSnap.data() || {};
          for (const k of PROFILE_KEYS) {
            if (data[k]) return { id: null, name: data[k] };
          }
        }
      } catch (e) {
        continue;
      }
    }
    return null;
    
  } catch (error) {
    logger.error('Error getting active company', error);
    return null;
  }
}

export async function getCompanyName() {
  const c = await getActiveCompany();
  if (c?.name) return c.name;
  
  // As a last resort, try the profile fields directly
  const user = auth.currentUser;
  if (!user) return 'Şirket Yok';
  
  const collections = ['profiles', 'users', 'publicProfiles'];
  for (const collection of collections) {
    try {
      const profSnap = await getDoc(doc(db, collection, user.uid)).catch(() => null);
      if (profSnap?.exists()) {
        const data = profSnap.data() || {};
        for (const k of PROFILE_KEYS) {
          if (data[k]) return data[k];
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return 'Şirket Yok';
}

/**
 * Resolve active company (auto-select if none)
 * @param {string} uid - User ID
 * @returns {Promise<string|null>} Active company ID
 */
export async function resolveActiveCompany(uid) {
  await loadUserCompanies(uid);
  
  // Try to get from localStorage first
  const savedCompanyId = localStorage.getItem(LS_KEY);
  
  if (savedCompanyId && userCompanies.find(c => c.id === savedCompanyId)) {
    activeCompanyId = savedCompanyId;
    return activeCompanyId;
  }

  // If no saved company or invalid, use first available
  if (userCompanies.length > 0) {
    activeCompanyId = userCompanies[0].id;
    localStorage.setItem(LS_KEY, activeCompanyId);
    return activeCompanyId;
  } else {
    activeCompanyId = null;
    localStorage.removeItem(LS_KEY);
    return null;
  }
}

/**
 * Get all user companies
 * @returns {Array} Array of company objects
 */
export function getUserCompanies() {
  return userCompanies;
}

/**
 * Check if user has multiple companies
 * @returns {boolean} True if user has multiple companies
 */
export function hasMultipleCompanies() {
  return userCompanies.length > 1;
}
