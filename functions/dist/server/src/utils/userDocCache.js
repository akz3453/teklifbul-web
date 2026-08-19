/**
 * User Document Cache Helper
 * Teklifbul Rule v1.0 - Tek bir HTTP request boyunca users/{uid} dokumani
 * sadece bir kez Firestore'dan cekilir; ardisik middleware/route handler
 * cagrilarinda req-scope cache uzerinden donulur. Ek olarak kisa bir TTL
 * cache ile ardisik istekler arasinda da hafif kazanim saglanir.
 *
 * NOTE: Bu helper SADECE okuma sirasinda kullanilmalidir. Yazma sonrasinda
 * invalidateUserDoc() cagrilmalidir.
 */
import { getAdminDb } from '../../utils/firestore.js';
import { getFromReqCache, setInReqCache } from './requestCache.js';
import { ttlCache, CacheKeys } from './ttlCache.js';
import { logger } from '../../../src/shared/log/logger.js';
const REQ_CACHE_PREFIX = 'userDoc:';
const TTL_USER_DOC_MS = 30 * 1000; // 30 saniye
/**
 * users/{uid} dokumanini cache uzerinden alir.
 *
 * @param userId - Firebase Auth uid
 * @param req    - Express request (req-scope cache icin)
 * @returns      - Cache hit/miss sonrasi user doc verisi (exists + data)
 */
export async function getCachedUserDoc(userId, req) {
    if (!userId)
        return { exists: false, data: null };
    const reqKey = `${REQ_CACHE_PREFIX}${userId}`;
    const ttlKey = CacheKeys.user(userId);
    // 1) Request-scope cache (ayni request icinde tum middleware/handler'lar)
    if (req) {
        const reqCached = getFromReqCache(req, reqKey);
        if (reqCached) {
            if (process.env.DEBUG_CACHE === 'true') {
                logger.debug('userDoc cache hit (request)', { userId });
            }
            return reqCached;
        }
    }
    // 2) Process-level TTL cache (kisa sureli, requestler arasi)
    const ttlCached = ttlCache.get(ttlKey);
    if (ttlCached) {
        if (req) {
            setInReqCache(req, reqKey, ttlCached);
        }
        if (process.env.DEBUG_CACHE === 'true') {
            logger.debug('userDoc cache hit (ttl)', { userId });
        }
        return ttlCached;
    }
    // 3) Firestore'dan cek
    try {
        const db = await getAdminDb();
        if (!db) {
            logger.warn('getCachedUserDoc: Firestore unavailable', { userId });
            const empty = { exists: false, data: null };
            return empty;
        }
        const snap = await db.collection('users').doc(userId).get();
        const result = {
            exists: snap.exists,
            data: snap.exists ? snap.data() || null : null,
        };
        // Yalnizca exists ise cache'le; non-existent kullanicilari cache'lemeyiz
        if (result.exists) {
            ttlCache.set(ttlKey, result, TTL_USER_DOC_MS);
            if (req) {
                setInReqCache(req, reqKey, result);
            }
        }
        return result;
    }
    catch (error) {
        logger.error('getCachedUserDoc: Error', { userId, error: error?.message });
        return { exists: false, data: null };
    }
}
/**
 * Bir kullaniciya ait cache'i bos atar.
 * Yazma operasyonlarindan sonra cagrilmali.
 */
export function invalidateUserDoc(userId) {
    if (!userId)
        return;
    ttlCache.delete(CacheKeys.user(userId));
}
