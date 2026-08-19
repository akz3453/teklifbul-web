/**
 * Teklifbul Rule v1.0 — Trusted company context
 * x-company-id spoofing'e karşı membership doğrulaması
 */

import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from './firestore.js';

const ACCEPTED_JOIN_STATUSES = new Set(['accepted', 'approved']);

export function hasAcceptedJoinStatus(userData: any): boolean {
  const status = userData?.companyJoinStatus;
  return typeof status === 'string' && ACCEPTED_JOIN_STATUSES.has(status);
}

export function resolveSharedCompanyId(userData: any): string | null {
  if (!userData) return null;
  const cid = userData?.companyId;
  const aid = userData?.activeCompanyId;
  const arr0 = Array.isArray(userData?.companies) && userData.companies.length
    ? (typeof userData.companies[0] === 'string'
      ? userData.companies[0]
      : userData.companies[0]?.id || userData.companies[0]?.companyId || null)
    : null;

  // Teklifbul Rule v1.0 — Önce activeCompanyId (çoklu şirket), sonra companyId, sonra companies[0]
  for (const c of [aid, cid, arr0]) {
    if (typeof c === 'string' && c.trim() && !c.startsWith('solo-')) return c;
  }
  for (const c of [aid, cid, arr0]) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

function companyIdInUserFields(userData: any, cid: string): boolean {
  if (userData.companyId === cid || userData.activeCompanyId === cid) return true;

  if (Array.isArray(userData.companies)) {
    for (const item of userData.companies) {
      if (item === cid) return true;
      if (item && typeof item === 'object' && (item.id === cid || item.companyId === cid)) return true;
    }
  }

  return false;
}

/** Kullanıcı bu companyId'ye üye mi? (user doc — yalnız açık accepted/approved) */
export function userBelongsToCompany(userData: any, companyId: string | null | undefined): boolean {
  if (!userData || !companyId || typeof companyId !== 'string') return false;
  const cid = companyId.trim();
  if (!cid || cid.startsWith('solo-')) return false;
  if (!hasAcceptedJoinStatus(userData)) return false;
  return companyIdInUserFields(userData, cid);
}

export async function hasAcceptedMemberDoc(
  userId: string | undefined,
  companyId: string | null | undefined
): Promise<boolean> {
  if (!userId || !companyId || typeof companyId !== 'string') return false;
  const cid = companyId.trim();
  if (!cid || cid.startsWith('solo-')) return false;
  try {
    const db = await getAdminDb();
    if (!db) return false;
    const snap = await db.collection('companies').doc(cid).collection('members').doc(userId).get();
    if (!snap.exists) return false;
    const status = snap.data()?.status;
    return status === 'accepted' || status === 'approved';
  } catch (err) {
    logger.warn('members/{uid} okunamadı', { userId, companyId: cid, err });
    return false;
  }
}

export async function userBelongsToCompanyAsync(
  userData: any,
  companyId: string | null | undefined,
  userId?: string
): Promise<boolean> {
  if (userBelongsToCompany(userData, companyId)) return true;
  return hasAcceptedMemberDoc(userId, companyId);
}

/**
 * Header varsa membership zorunlu; spoof → null (çağıran 403 döner).
 * Header yoksa kullanıcının kendi şirketini döner (yalnız accepted üyelik).
 */
export function resolveTrustedCompanyId(
  userData: any,
  headerCompanyId?: string | null,
  opts?: { userId?: string; path?: string }
): string | null {
  const header = String(headerCompanyId || '').trim();
  if (header) {
    if (userBelongsToCompany(userData, header)) {
      return header;
    }

    logger.warn('GÜVENLİK: x-company-id spoof engellendi', {
      userId: opts?.userId,
      headerCompanyId: header,
      path: opts?.path,
    });

    return null;
  }

  if (!hasAcceptedJoinStatus(userData)) return null;
  const shared = resolveSharedCompanyId(userData);
  if (shared && shared.startsWith('solo-')) return null;
  return shared;
}

/**
 * Async SoT: user doc (accepted) veya companies/{id}/members/{uid}
 */
export async function resolveTrustedCompanyIdAsync(
  userData: any,
  headerCompanyId?: string | null,
  opts?: { userId?: string; path?: string }
): Promise<string | null> {
  const header = String(headerCompanyId || '').trim();
  if (header) {
    const allowed = await userBelongsToCompanyAsync(userData, header, opts?.userId);
    if (allowed) return header;
    logger.warn('GÜVENLİK: x-company-id spoof engellendi', {
      userId: opts?.userId,
      headerCompanyId: header,
      path: opts?.path,
    });
    return null;
  }

  const fromFields = resolveTrustedCompanyId(userData, null, opts);
  if (fromFields) return fromFields;

  const fallback = resolveSharedCompanyId(userData);
  if (fallback && opts?.userId && await hasAcceptedMemberDoc(opts.userId, fallback)) {
    return fallback;
  }
  return null;
}
