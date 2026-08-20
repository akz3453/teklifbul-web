/**
 * Optional Redis store for express-rate-limit v8.
 * REDIS_URL unset → caller keeps default MemoryStore (no localhost implicit connect).
 * Redis errors fall back to process-local counts (not fail-open bypass).
 */
import type { Store, ClientRateLimitInfo } from 'express-rate-limit';
import Redis from 'ioredis';
import { logger } from '../../src/shared/log/logger.js';

export function getProductionRedisUrl(): string | null {
  const url = String(process.env.REDIS_URL || '').trim();
  return url || null;
}

let sharedRedis: Redis | null | undefined;

function getSharedRedis(): Redis | null {
  if (sharedRedis !== undefined) return sharedRedis;
  const url = getProductionRedisUrl();
  if (!url) {
    sharedRedis = null;
    return null;
  }
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 1500,
    retryStrategy() {
      return null;
    },
  });
  redis.connect().catch((error) => {
    logger.warn('Redis rate-limit store connect failed; process-local fallback', error);
  });
  sharedRedis = redis;
  return redis;
}

function localIncrement(memory: Map<string, { hits: number; resetAt: number }>, key: string, windowMs: number): ClientRateLimitInfo {
  const now = Date.now();
  let rec = memory.get(key);
  if (!rec || rec.resetAt <= now) {
    rec = { hits: 0, resetAt: now + windowMs };
  }
  rec.hits += 1;
  memory.set(key, rec);
  return { totalHits: rec.hits, resetTime: new Date(rec.resetAt) };
}

export function createRedisRateLimitStore(prefix = 'rl', windowMs = 15 * 60 * 1000): Store | null {
  const redis = getSharedRedis();
  if (!redis) return null;

  const memoryFallback = new Map<string, { hits: number; resetAt: number }>();

  const store: Store = {
    async increment(key: string): Promise<ClientRateLimitInfo> {
      const namespaced = `${prefix}:${key}`;
      try {
        const totalHits = await redis.incr(namespaced);
        if (totalHits === 1) {
          await redis.pexpire(namespaced, windowMs);
        }
        const ttl = await redis.pttl(namespaced);
        return {
          totalHits,
          resetTime: new Date(Date.now() + Math.max(ttl, 0)),
        };
      } catch (error) {
        logger.warn('Redis increment failed; using process-local limiter', error);
        return localIncrement(memoryFallback, namespaced, windowMs);
      }
    },
    async decrement(key: string): Promise<void> {
      try {
        await redis.decr(`${prefix}:${key}`);
      } catch {
        // ignore
      }
    },
    async resetKey(key: string): Promise<void> {
      try {
        await redis.del(`${prefix}:${key}`);
      } catch {
        // ignore
      }
    },
  };
  return store;
}
