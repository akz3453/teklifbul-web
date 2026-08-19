/**
 * In-Memory Cache Service
 * Teklifbul Rule v1.0 - Structured Logging
 *
 * Redis alternatifi - $0 maliyet, maksimum performans
 * Sunucu RAM'inde çalışır, network latency yok
 */
import NodeCache from 'node-cache';
import { logger } from '../shared/log/logger.js';
class InMemoryCache {
    constructor() {
        this.cache = new NodeCache({
            stdTTL: 86400, // 24 saat default TTL
            checkperiod: 3600, // 1 saatte bir expired key'leri temizle
            useClones: false, // Performans için clone kullanma
            deleteOnExpire: true, // Expire olunca otomatik sil
            maxKeys: 10000 // Maksimum 10K key (memory kontrolü için)
        });
        // Cache istatistiklerini logla (production'da da aktif - monitoring için)
        const logInterval = process.env.CACHE_MONITORING_INTERVAL
            ? Number(process.env.CACHE_MONITORING_INTERVAL)
            : (process.env.NODE_ENV === 'production' ? 300000 : 60000); // Prod: 5 dk, Dev: 1 dk
        setInterval(() => {
            const stats = this.cache.getStats();
            const hitRate = stats.hits + stats.misses > 0
                ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
                : 0;
            logger.info('📊 Cache Stats:', {
                keys: stats.keys,
                hits: stats.hits,
                misses: stats.misses,
                hitRate: `${hitRate}%`,
                ksize: stats.ksize,
                vsize: stats.vsize
            });
            // Uyarı: Cache hit rate düşükse
            if (hitRate < 50 && stats.hits + stats.misses > 100) {
                logger.warn('⚠️  Cache hit rate düşük!', { hitRate: `${hitRate}%` });
            }
        }, logInterval);
    }
    /**
     * Cache'den değer oku
     */
    async get(key) {
        try {
            const value = this.cache.get(key);
            return value || null;
        }
        catch (error) {
            logger.error('❌ Cache get error:', error);
            return null;
        }
    }
    /**
     * Cache'e değer yaz
     */
    async set(key, value, ttl) {
        try {
            if (ttl) {
                return this.cache.set(key, value, ttl);
            }
            else {
                return this.cache.set(key, value);
            }
        }
        catch (error) {
            logger.error('❌ Cache set error:', error);
            return false;
        }
    }
    /**
     * Cache'den değer sil
     */
    async del(key) {
        try {
            return this.cache.del(key);
        }
        catch (error) {
            logger.error('❌ Cache del error:', error);
            return 0;
        }
    }
    /**
     * Pattern ile key'leri sil (örn: "cat:suggest:*")
     */
    async delPattern(pattern) {
        try {
            const keys = this.cache.keys();
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            let deleted = 0;
            keys.forEach(key => {
                if (regex.test(key)) {
                    this.cache.del(key);
                    deleted++;
                }
            });
            return deleted;
        }
        catch (error) {
            logger.error('❌ Cache delPattern error:', error);
            return 0;
        }
    }
    /**
     * Tüm cache'i temizle
     */
    async clear() {
        try {
            this.cache.flushAll();
        }
        catch (error) {
            logger.error('❌ Cache clear error:', error);
        }
    }
    /**
     * Cache istatistikleri
     */
    getStats() {
        return this.cache.getStats();
    }
    /**
     * Key'in var olup olmadığını kontrol et
     */
    has(key) {
        return this.cache.has(key);
    }
    /**
     * Key'in TTL'ini al (saniye cinsinden)
     */
    getTtl(key) {
        return this.cache.getTtl(key) || 0;
    }
}
// Singleton instance
export const cache = new InMemoryCache();
// Redis-compatible API (kolay migration için)
export const redis = {
    get: async (key) => {
        const value = await cache.get(key);
        return value;
    },
    set: async (key, value) => {
        return await cache.set(key, value);
    },
    setex: async (key, seconds, value) => {
        return await cache.set(key, value, seconds);
    },
    del: async (key) => {
        return await cache.del(key);
    }
};
