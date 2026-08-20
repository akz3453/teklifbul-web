/**
 * Teklifbul Rule v1.0 — Marketplace company display via publicCompanyProfiles
 * Do not read peer companies/{id} documents (full doc leak).
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { logger } from '../../../src/shared/log/logger.js';

const FORBIDDEN_PUBLIC_KEYS = [
  'taxNumber', 'taxOffice', 'mersisNo', 'address', 'invoiceAddress',
  'invoiceAddressParts', 'companyPhone', 'mobilePhone', 'whatsappPhone',
  'contactPhones', 'contactEmails', 'phone', 'email', 'planId', 'plan',
  'isPremium', 'subscription', 'subscriptionPlanId', 'subscriptionStatus',
  'balanceTokens', 'billing', 'ownerId', 'ownerUid', 'edoc', 'premiumExpiresAt',
];

export function toMarketplaceCompanyView(companyId, data, source) {
  const safe = data && typeof data === 'object' ? data : {};
  return {
    id: companyId,
    source,
    name: safe.companyName || safe.name || safe.title || 'Bilinmeyen Firma',
    companyName: safe.companyName || safe.name || safe.title || 'Bilinmeyen Firma',
    logoUrl: safe.logoUrl || null,
    about: safe.about || null,
    website: safe.website || null,
    city: safe.city || null,
    isSupplier: safe.isSupplier === true,
    isBuyer: safe.isBuyer === true,
    isMarketplaceVisible: safe.isMarketplaceVisible === true,
    supplierCategoryIds: Array.isArray(safe.supplierCategoryIds) ? safe.supplierCategoryIds : [],
  };
}

export function buildClientPublicCompanyProfile(companyId, companyData) {
  const name = String(companyData?.name || companyData?.companyName || companyData?.title || '').trim();
  const companyName = String(companyData?.companyName || companyData?.name || '').trim() || name;
  if (!name && !companyName) return null;
  return {
    companyId,
    name: name || companyName,
    companyName: companyName || name,
    logoUrl: typeof companyData?.logoUrl === 'string' ? companyData.logoUrl : null,
    about: typeof companyData?.about === 'string' ? companyData.about : null,
    website: typeof companyData?.website === 'string' ? companyData.website : null,
    city: typeof companyData?.city === 'string' ? companyData.city : null,
    isSupplier: companyData?.isSupplier === true || companyData?.roles?.supplier === true,
    isBuyer: companyData?.isBuyer === true || companyData?.roles?.buyer === true,
    isMarketplaceVisible: companyData?.isMarketplaceVisible === true,
    supplierCategoryIds: Array.isArray(companyData?.supplierCategoryIds)
      ? companyData.supplierCategoryIds.filter((id) => typeof id === 'string')
      : [],
    updatedAt: serverTimestamp(),
  };
}

export async function syncPublicCompanyProfile(db, companyId, companyData) {
  const payload = buildClientPublicCompanyProfile(companyId, companyData);
  if (!payload || !companyId) return;
  try {
    await setDoc(doc(db, 'publicCompanyProfiles', companyId), payload, { merge: true });
  } catch (error) {
    logger.warn('publicCompanyProfiles senkron atlandı', { companyId, error: error?.message || error });
  }
}

/**
 * Own company: full companies/{id} (membership). Peers: public projection only.
 */
export async function getCompanyDisplay(db, companyId) {
  if (!companyId) {
    return toMarketplaceCompanyView('', {}, 'none');
  }
  try {
    const snap = await getDoc(doc(db, 'companies', companyId));
    if (snap.exists()) {
      const data = snap.data() || {};
      return { ...toMarketplaceCompanyView(companyId, data, 'member'), _raw: data };
    }
  } catch (error) {
    logger.debug('companies get denied or failed; using public projection', {
      companyId,
      error: error?.message || String(error),
    });
  }
  try {
    const pub = await getDoc(doc(db, 'publicCompanyProfiles', companyId));
    if (pub.exists()) {
      return toMarketplaceCompanyView(companyId, pub.data() || {}, 'public');
    }
  } catch (error) {
    logger.warn('publicCompanyProfiles okunamadı', { companyId, error: error?.message || error });
  }
  return toMarketplaceCompanyView(companyId, {}, 'none');
}

export function assertNoPrivateCompanyFields(payload) {
  const keys = Object.keys(payload || {});
  return !keys.some((key) => FORBIDDEN_PUBLIC_KEYS.includes(key));
}
