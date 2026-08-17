/**
 * TTL Cache Utility
 * Teklifbul Rule v1.0 - Process-level TTL cache for Firestore reads
 *
 * Basit Map tabanlı TTL cache
 * Default TTL: 60 saniye
 */
class TTLCache {
    constructor(defaultTTLMs = 60 * 1000) {
        this.cache = new Map();
        this.defaultTTL = defaultTTLMs;
    }
    /**
     * Get value from cache
     * Returns null if expired or not found
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    /**
     * Set value in cache with TTL
     */
    set(key, value, ttlMs) {
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
    delete(key) {
        this.cache.delete(key);
    }
    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Get cache size
     */
    size() {
        return this.cache.size;
    }
    /**
     * Clean expired entries (manual cleanup)
     */
    cleanExpired() {
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
export const ttlCache = new TTLCache(Number(process.env.CACHE_TTL_MS) || 60 * 1000 // Default 60 saniye
);
/**
 * Cache key helpers
 */
export const CacheKeys = {
    company: (companyId) => `company:${companyId}`,
    membership: (companyId, userId) => `membership:${companyId}:${userId}`,
    rolePermsTemplate: () => 'rolePermsTemplate',
    edocCreds: (credentialsRef) => `edocCreds:${credentialsRef}`,
    user: (userId) => `user:${userId}`
};
