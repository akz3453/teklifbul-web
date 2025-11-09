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
  private cache: NodeCache;
  
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 86400, // 24 saat default TTL
      checkperiod: 3600, // 1 saatte bir expired key'leri temizle
      useClones: false, // Performans için clone kullanma
      deleteOnExpire: true, // Expire olunca otomatik sil
      maxKeys: 10000 // Maksimum 10K key (memory kontrolü için)
    });
    
    // Cache istatistiklerini logla (production'da kapatılabilir)
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const stats = this.cache.getStats();
        // use console.info to comply with lint allow-list
        console.info('📊 Cache Stats:', {
          keys: stats.keys,
          hits: stats.hits,
          misses: stats.misses,
          ksize: stats.ksize,
          vsize: stats.vsize
        });
      }, 60000); // Her 1 dakikada bir
    }
  }
  
  /**
   * Cache'den değer oku
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = this.cache.get<T>(key);
      return value || null;
    } catch (error) {
      logger.error('❌ Cache get error:', error);
      return null;
    }
  }
  
  /**
   * Cache'e değer yaz
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      if (ttl) {
        return this.cache.set(key, value, ttl);
      } else {
        return this.cache.set(key, value);
      }
    } catch (error) {
      logger.error('❌ Cache set error:', error);
      return false;
    }
  }
  
  /**
   * Cache'den değer sil
   */
  async del(key: string): Promise<number> {
    try {
      return this.cache.del(key);
    } catch (error) {
      logger.error('❌ Cache del error:', error);
      return 0;
    }
  }
  
  /**
   * Pattern ile key'leri sil (örn: "cat:suggest:*")
   */
  async delPattern(pattern: string): Promise<number> {
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
    } catch (error) {
      logger.error('❌ Cache delPattern error:', error);
      return 0;
    }
  }
  
  /**
   * Tüm cache'i temizle
   */
  async clear(): Promise<void> {
    try {
      this.cache.flushAll();
    } catch (error) {
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
  has(key: string): boolean {
    return this.cache.has(key);
  }
  
  /**
   * Key'in TTL'ini al (saniye cinsinden)
   */
  getTtl(key: string): number {
    return this.cache.getTtl(key) || 0;
  }
}

// Singleton instance
export const cache = new InMemoryCache();

// Redis-compatible API (kolay migration için)
export const redis = {
  get: async (key: string) => {
    const value = await cache.get<string>(key);
    return value;
  },
  set: async (key: string, value: string) => {
    return await cache.set(key, value);
  },
  setex: async (key: string, seconds: number, value: string) => {
    return await cache.set(key, value, seconds);
  },
  del: async (key: string) => {
    return await cache.del(key);
  }
};

