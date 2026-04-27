/**
 * Distributed Cache (Redis) Wrapper
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * Multi-server ortamı için Redis cache hazırlığı
 * Redis yoksa in-memory cache'e fallback yapar
 */

import { getRedisClient } from '../../db/connection.js';
import { cache as inMemoryCache } from '../../services/in-memory-cache.js';
import { logger } from '../log/logger.js';

// Teklifbul Rule v1.0 - Production Hardening

/**
 * Distributed cache interface
 * Redis varsa Redis kullanır, yoksa in-memory cache'e fallback yapar
 */
class DistributedCache {
  private useRedis: boolean = false;
  private redisClient: any = null;

  constructor() {
    this.redisClient = getRedisClient();
    this.useRedis = this.redisClient !== null;
    
    if (this.useRedis) {
      logger.info('✅ Distributed cache: Redis aktif');
    } else {
      logger.info('ℹ️  Distributed cache: In-memory cache kullanılıyor (Redis yok)');
    }
  }

  /**
   * Cache'den değer oku
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis && this.redisClient) {
      try {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        logger.error('Redis get error, fallback to in-memory', error);
        return await inMemoryCache.get<T>(key);
      }
    }
    return await inMemoryCache.get<T>(key);
  }

  /**
   * Cache'e değer yaz
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (this.useRedis && this.redisClient) {
      try {
        const serialized = JSON.stringify(value);
        if (ttl) {
          await this.redisClient.setex(key, ttl, serialized);
        } else {
          await this.redisClient.set(key, serialized);
        }
        return true;
      } catch (error) {
        logger.error('Redis set error, fallback to in-memory', error);
        return await inMemoryCache.set(key, value, ttl);
      }
    }
    return await inMemoryCache.set(key, value, ttl);
  }

  /**
   * Cache'den değer sil
   */
  async del(key: string): Promise<number> {
    if (this.useRedis && this.redisClient) {
      try {
        return await this.redisClient.del(key);
      } catch (error) {
        logger.error('Redis del error, fallback to in-memory', error);
        return await inMemoryCache.del(key);
      }
    }
    return await inMemoryCache.del(key);
  }

  /**
   * Pattern ile key'leri sil
   */
  async delPattern(pattern: string): Promise<number> {
    if (this.useRedis && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(pattern.replace(/\*/g, '*'));
        if (keys.length > 0) {
          return await this.redisClient.del(...keys);
        }
        return 0;
      } catch (error) {
        logger.error('Redis delPattern error, fallback to in-memory', error);
        return await inMemoryCache.delPattern(pattern);
      }
    }
    return await inMemoryCache.delPattern(pattern);
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
      ...inMemoryCache.getStats()
    };
  }
}

// Singleton instance
export const distributedCache = new DistributedCache();

