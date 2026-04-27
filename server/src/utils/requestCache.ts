/**
 * Request-scope Cache Helper
 * Teklifbul Rule v1.0 - Request içinde tekrar Firestore read'leri önler
 * 
 * Express Request objesine güvenli cache alanı ekler
 */

import { Request } from 'express';

/**
 * Request cache type definition
 */
interface RequestCache {
  _cache?: Map<string, any>;
}

/**
 * Get or create request cache
 * 
 * @param req - Express request object
 * @returns Map<string, any> - Request-scope cache
 */
export function getReqCache(req: Request): Map<string, any> {
  const reqWithCache = req as Request & RequestCache;
  
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
export function getFromReqCache<T>(req: Request, key: string): T | null {
  const cache = getReqCache(req);
  return (cache.get(key) as T) || null;
}

/**
 * Set value in request cache
 * 
 * @param req - Express request object
 * @param key - Cache key
 * @param value - Value to cache
 */
export function setInReqCache<T>(req: Request, key: string, value: T): void {
  const cache = getReqCache(req);
  cache.set(key, value);
}

/**
 * Clear request cache (useful for testing)
 * 
 * @param req - Express request object
 */
export function clearReqCache(req: Request): void {
  const reqWithCache = req as Request & RequestCache;
  if (reqWithCache._cache) {
    reqWithCache._cache.clear();
  }
}

