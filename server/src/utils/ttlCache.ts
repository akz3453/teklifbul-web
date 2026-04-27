/**
 * TTL Cache Utility
 * Teklifbul Rule v1.0 - Process-level TTL cache for Firestore reads
 * 
 * Basit Map tabanlı TTL cache
 * Default TTL: 60 saniye
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TTLCache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number;

  constructor(defaultTTLMs: number = 60 * 1000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Get value from cache
   * Returns null if expired or not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set value in cache with TTL
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTTL;
    const expiresAt = Date.now() + ttl;
    
    this.cache.set(key, {
      value,
      expiresAt
    });
  }

  /**
   * Delete key from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean expired entries (manual cleanup)
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

// Global TTL cache instance
export const ttlCache = new TTLCache(
  Number(process.env.CACHE_TTL_MS) || 60 * 1000 // Default 60 saniye
);

/**
 * Cache key helpers
 */
export const CacheKeys = {
  company: (companyId: string) => `company:${companyId}`,
  membership: (companyId: string, userId: string) => `membership:${companyId}:${userId}`,
  rolePermsTemplate: () => 'rolePermsTemplate',
  edocCreds: (credentialsRef: string) => `edocCreds:${credentialsRef}`,
  user: (userId: string) => `user:${userId}`
};

