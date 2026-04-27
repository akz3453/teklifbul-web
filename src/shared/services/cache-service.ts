/**
 * Firestore Query Cache Service
 * Teklifbul Rule v1.0 - Performance Optimization
 * 
 * Firestore query'lerini cache'ler ve gereksiz database okumalarını azaltır.
 */

import { logger } from '../log/logger';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

// Cache TTL values (milliseconds)
export const CACHE_TTL = {
    CATEGORIES: 60 * 60 * 1000,      // 1 saat
    COMPANIES: 30 * 60 * 1000,       // 30 dakika
    USER_PROFILE: 5 * 60 * 1000,     // 5 dakika
    TAX_OFFICES: 24 * 60 * 60 * 1000, // 24 saat
    SETTINGS: 10 * 60 * 1000         // 10 dakika
} as const;

class FirestoreCache {
    private cache: Map<string, CacheEntry<any>>;
    private enabled: boolean;

    constructor() {
        this.cache = new Map();
        // Cache'i environment variable ile kontrol et
        this.enabled = process.env.CACHE_DISABLED !== '1';

        if (this.enabled) {
            logger.info('Firestore cache enabled');
            // Her 5 dakikada bir expired cache'leri temizle
            setInterval(() => this.cleanup(), 5 * 60 * 1000);
        }
    }

    /**
     * Cache'den veri al
     */
    get<T>(key: string): T | null {
        if (!this.enabled) return null;

        const entry = this.cache.get(key);
        if (!entry) return null;

        // TTL kontrolü
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        logger.info(`Cache hit: ${key}`);
        return entry.data as T;
    }

    /**
     * Cache'e veri ekle
     */
    set<T>(key: string, data: T, ttl: number): void {
        if (!this.enabled) return;

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });

        logger.info(`Cache set: ${key} (TTL: ${ttl}ms)`);
    }

    /**
     * Cache'den veri sil
     */
    delete(key: string): void {
        this.cache.delete(key);
        logger.info(`Cache deleted: ${key}`);
    }

    /**
     * Tüm cache'i temizle
     */
    clear(): void {
        this.cache.clear();
        logger.info('Cache cleared');
    }

    /**
     * Expired cache'leri temizle
     */
    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info(`Cache cleanup: ${cleaned} entries removed`);
        }
    }

    /**
     * Cache istatistikleri
     */
    getStats() {
        return {
            size: this.cache.size,
            enabled: this.enabled
        };
    }
}

// Singleton instance
export const firestoreCache = new FirestoreCache();

/**
 * Kullanım Örneği:
 * 
 * ```typescript
 * import { firestoreCache, CACHE_TTL } from './cache-service';
 * 
 * async function getCategories() {
 *   const cacheKey = 'categories:all';
 *   
 *   // Önce cache'e bak
 *   const cached = firestoreCache.get(cacheKey);
 *   if (cached) return cached;
 *   
 *   // Cache'de yoksa Firestore'dan al
 *   const snapshot = await db.collection('categories').get();
 *   const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
 *   
 *   // Cache'e kaydet
 *   firestoreCache.set(cacheKey, categories, CACHE_TTL.CATEGORIES);
 *   
 *   return categories;
 * }
 * 
 * // Cache'i invalidate et
 * function onCategoryUpdate() {
 *   firestoreCache.delete('categories:all');
 * }
 * ```
 */
