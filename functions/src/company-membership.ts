/**
 * Teklifbul Rule v1.0 — GCF tenant membership (accepted join veya members/{uid})
 */
import admin = require('firebase-admin');

const ACCEPTED = new Set(['accepted', 'approved']);

function companyIdInUserFields(u: Record<string, unknown>, cid: string): boolean {
  if (u.companyId === cid || u.activeCompanyId === cid) return true;
  if (Array.isArray(u.companies)) {
    return u.companies.some((c: unknown) =>
      c === cid ||
      (c && typeof c === 'object' && (
        (c as { id?: string }).id === cid ||
        (c as { companyId?: string }).companyId === cid
      ))
    );
  }
  return false;
}

export async function uidBelongsToCompany(uid: string, companyId: unknown): Promise<boolean> {
  if (!uid || typeof companyId !== 'string') return false;
  const cid = companyId.trim();
  if (!cid || cid.indexOf('solo-') === 0) return false;

  try {
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    const u = (userSnap.data() || {}) as Record<string, unknown>;
    const status = u.companyJoinStatus;
    if (typeof status === 'string' && ACCEPTED.has(status) && companyIdInUserFields(u, cid)) {
      return true;
    }

    const mem = await admin.firestore()
      .collection('companies').doc(cid)
      .collection('members').doc(uid)
      .get();
    if (!mem.exists) return false;
    const memStatus = mem.data()?.status;
    return memStatus === 'accepted' || memStatus === 'approved';
  } catch {
    return false;
  }
}
