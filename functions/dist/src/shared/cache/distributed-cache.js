"use strict";
/**
 * Distributed Cache (Redis) Wrapper
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * Multi-server ortamı için Redis cache hazırlığı
 * Redis yoksa in-memory cache'e fallback yapar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.distributedCache = void 0;
const connection_js_1 = require("../../db/connection.js");
const in_memory_cache_js_1 = require("../../services/in-memory-cache.js");
const logger_js_1 = require("../log/logger.js");
// Teklifbul Rule v1.0 - Production Hardening
/**
 * Distributed cache interface
 * Redis varsa Redis kullanır, yoksa in-memory cache'e fallback yapar
 */
class DistributedCache {
    constructor() {
        this.useRedis = false;
        this.redisClient = null;
        this.redisClient = (0, connection_js_1.getRedisClient)();
        this.useRedis = this.redisClient !== null;
        if (this.useRedis) {
            logger_js_1.logger.info('✅ Distributed cache: Redis aktif');
        }
        else {
            logger_js_1.logger.info('ℹ️  Distributed cache: In-memory cache kullanılıyor (Redis yok)');
        }
    }
    /**
     * Cache'den değer oku
     */
    async get(key) {
        if (this.useRedis && this.redisClient) {
            try {
                const value = await this.redisClient.get(key);
                return value ? JSON.parse(value) : null;
            }
            catch (error) {
                logger_js_1.logger.error('Redis get error, fallback to in-memory', error);
                return await in_memory_cache_js_1.cache.get(key);
            }
        }
        return await in_memory_cache_js_1.cache.get(key);
    }
    /**
     * Cache'e değer yaz
     */
    async set(key, value, ttl) {
        if (this.useRedis && this.redisClient) {
            try {
                const serialized = JSON.stringify(value);
                if (ttl) {
                    await this.redisClient.setex(key, ttl, serialized);
                }
                else {
                    await this.redisClient.set(key, serialized);
                }
                return true;
            }
            catch (error) {
                logger_js_1.logger.error('Redis set error, fallback to in-memory', error);
                return await in_memory_cache_js_1.cache.set(key, value, ttl);
            }
        }
        return await in_memory_cache_js_1.cache.set(key, value, ttl);
    }
    /**
     * Cache'den değer sil
     */
    async del(key) {
        if (this.useRedis && this.redisClient) {
            try {
                return await this.redisClient.del(key);
            }
            catch (error) {
                logger_js_1.logger.error('Redis del error, fallback to in-memory', error);
                return await in_memory_cache_js_1.cache.del(key);
            }
        }
        return await in_memory_cache_js_1.cache.del(key);
    }
    /**
     * Pattern ile key'leri sil
     */
    async delPattern(pattern) {
        if (this.useRedis && this.redisClient) {
            try {
                const keys = await this.redisClient.keys(pattern.replace(/\*/g, '*'));
                if (keys.length > 0) {
                    return await this.redisClient.del(...keys);
                }
                return 0;
            }
            catch (error) {
                logger_js_1.logger.error('Redis delPattern error, fallback to in-memory', error);
                return await in_memory_cache_js_1.cache.delPattern(pattern);
            }
        }
        return await in_memory_cache_js_1.cache.delPattern(pattern);
    }
    /**
     * Cache istatistikleri
     */
    getStats() {
        if (this.useRedis && this.redisClient) {
            // Redis için istatistik toplama (opsiyonel)
            return {
                type: 'redis',
                keys: 0, // Redis'te key sayısını almak için SCAN gerekir
            };
        }
        return {
            type: 'in-memory',
            ...in_memory_cache_js_1.cache.getStats()
        };
    }
}
// Singleton instance
exports.distributedCache = new DistributedCache();
