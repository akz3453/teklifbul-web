/**
 * Teklifbul Rule v1.0 — publicProfiles PII'siz projeksiyon (client yedek)
 */

import { db } from '../../../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

function isSupplierUser(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.isSupplier === true) return true;
  const roles = data.roles;
  if (Array.isArray(roles) && roles.includes('supplier')) return true;
  if (roles && typeof roles === 'object' && roles.supplier === true) return true;
  return false;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.length > 0);
}

/**
 * @param {string} uid
 * @param {Record<string, unknown>} userData
 */
export async function syncPublicProfile(uid, userData) {
  if (!uid) return;
  const ref = doc(db, 'publicProfiles', uid);
  try {
    logger.group('publicProfiles senkron');
    const isActiveSupplier = isSupplierUser(userData) && userData?.isActive !== false;
    if (!isActiveSupplier) {
      await deleteDoc(ref);
      logger.info('publicProfiles silindi (tedarikçi değil)', { uid });
      logger.end();
      return;
    }

    const displayName = String(
      userData.displayName || userData.name || userData.companyName || ''
    ).trim();
    const companyName = String(userData.companyName || userData.displayName || '').trim();
    const rawCompanyId = userData.companyId || userData.activeCompanyId;
    const companyId =
      typeof rawCompanyId === 'string' && rawCompanyId && !String(rawCompanyId).startsWith('solo-')
        ? rawCompanyId
        : null;

    await setDoc(ref, {
      displayName: displayName || companyName || 'Tedarikçi',
      companyName: companyName || displayName || 'Tedarikçi',
      isSupplier: true,
      isActive: true,
      companyId,
      supplierCategoryIds: asStringList(userData.supplierCategoryIds),
      photoURL: typeof userData.photoURL === 'string' ? userData.photoURL : null,
      updatedAt: serverTimestamp(),
    });
    logger.info('publicProfiles yazıldı', { uid });
    logger.end();
  } catch (err) {
    logger.warn('publicProfiles senkron başarısız', err);
    logger.end();
  }
}
