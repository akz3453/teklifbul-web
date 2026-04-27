// Teklifbul Rule v1.0 - Company Plan State
// Amaç: Premium plan kontrolünü company bazlı, tek kaynaktan yönetmek

import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { logger } from '../../../src/shared/log/logger.js';

/** Basit in-memory cache (sayfa süresi boyunca) */
const planCache = new Map(); // companyId -> { planId, planSource }

/**
 * Şirket planını Firestore'dan okur.
 * Kaynak: companies/{companyId}.planId (+ planSource)
 *
 * @param {string} companyId
 * @returns {Promise<{ planId: string; planSource: string }>}
 */
export async function getCompanyPlan(companyId) {
  try {
    if (!companyId) {
      logger.warn('getCompanyPlan: companyId yok');
      return { planId: 'free', planSource: 'default' };
    }

    if (planCache.has(companyId)) {
      return planCache.get(companyId);
    }

    const snap = await getDoc(doc(db, 'companies', companyId));

    let planId = 'free';
    let planSource = 'default';

    if (snap.exists()) {
      const data = snap.data() || {};
      if (typeof data.planId === 'string' && data.planId.trim() !== '') {
        planId = data.planId.trim();
      }
      if (typeof data.planSource === 'string' && data.planSource.trim() !== '') {
        planSource = data.planSource.trim();
      }
    } else {
      logger.warn('getCompanyPlan: company dokümanı bulunamadı', { companyId });
    }

    const result = { planId, planSource };
    planCache.set(companyId, result);
    return result;
  } catch (error) {
    logger.error('getCompanyPlan hata', error);
    return { planId: 'free', planSource: 'error' };
  }
}

/**
 * Şirket planı premium (free dışı) mı?
 * @param {string} planId
 */
export function isPremium(planId) {
  if (!planId) return false;
  const v = String(planId);
  return v !== 'free' || v === 'premium_admin';
}

/**
 * Şirket planı Premium Plus mı?
 * @param {string} planId
 */
export function isPremiumPlus(planId) {
  if (!planId) return false;
  const v = String(planId);
  return (
    v === 'premium_plus' ||
    v === 'premium_plus_monthly' ||
    v === 'premium_plus_yearly' ||
    v === 'premium_admin' ||
    v.includes('premium_plus')
  );
}

/**
 * UI'da planı yıldız ile göstermek için yardımcı
 * free  → ⭐
 * premium → ⭐⭐
 * premium_plus → ⭐⭐⭐
 * @param {string} planId
 */
export function getPlanStars(planId) {
  if (isPremiumPlus(planId)) return '⭐⭐⭐';
  if (isPremium(planId)) return '⭐⭐';
  return '⭐';
}

/** Opsiyonel: cache temizleme (gerekirse kullanılabilir) */
export function invalidateCompanyPlanCache(companyId) {
  if (!companyId) return;
  planCache.delete(companyId);
}
