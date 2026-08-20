/**
 * Teklifbul Rule v1.0 — Same-tab users/{uid} cache for dashboard boot.
 * Does not change Auth. TTL matches company-id cache.
 */
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { COMPANY_ID_CACHE_TTL_MS } from '../../../src/shared/constants/timing.js';

const cache = new Map();

export async function getCachedUserSnap(db, uid) {
  if (!db || !uid) {
    return { exists: () => false, data: () => ({}) };
  }
  const now = Date.now();
  const hit = cache.get(uid);
  if (hit && now - hit.at < COMPANY_ID_CACHE_TTL_MS) {
    return hit.snap;
  }
  const snap = await getDoc(doc(db, 'users', uid));
  cache.set(uid, { at: now, snap });
  return snap;
}
