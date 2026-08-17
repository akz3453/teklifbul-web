/**
 * Request-scope Cache Helper
 * Teklifbul Rule v1.0 - Request içinde tekrar Firestore read'leri önler
 *
 * Express Request objesine güvenli cache alanı ekler
 */
/**
 * Get or create request cache
 *
 * @param req - Express request object
 * @returns Map<string, any> - Request-scope cache
 */
export function getReqCache(req) {
    const reqWithCache = req;
    if (!reqWithCache._cache) {
        reqWithCache._cache = new Map();
    }
    return reqWithCache._cache;
}
/**
 * Get value from request cache
 *
 * @param req - Express request object
 * @param key - Cache key
 * @returns Cached value or null
 */
export function getFromReqCache(req, key) {
    const cache = getReqCache(req);
    return cache.get(key) || null;
}
/**
 * Set value in request cache
 *
 * @param req - Express request object
 * @param key - Cache key
 * @param value - Value to cache
 */
export function setInReqCache(req, key, value) {
    const cache = getReqCache(req);
    cache.set(key, value);
}
/**
 * Clear request cache (useful for testing)
 *
 * @param req - Express request object
 */
export function clearReqCache(req) {
    const reqWithCache = req;
    if (reqWithCache._cache) {
        reqWithCache._cache.clear();
    }
}
