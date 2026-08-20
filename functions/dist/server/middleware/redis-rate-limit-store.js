import Redis from 'ioredis';
import { logger } from '../../src/shared/log/logger.js';
export function getProductionRedisUrl() {
    const url = String(process.env.REDIS_URL || '').trim();
    return url || null;
}
let sharedRedis;
function getSharedRedis() {
    if (sharedRedis !== undefined)
        return sharedRedis;
    const url = getProductionRedisUrl();
    if (!url) {
        sharedRedis = null;
        return null;
    }
    const redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
    });
    redis.connect().catch((error) => {
        logger.warn('Redis rate-limit store connect failed; memory fallback', error);
    });
    sharedRedis = redis;
    return redis;
}
export function createRedisRateLimitStore(prefix = 'rl', windowMs = 15 * 60 * 1000) {
    const redis = getSharedRedis();
    if (!redis)
        return null;
    const store = {
        async increment(key) {
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
            }
            catch (error) {
                logger.warn('Redis increment failed; allowing request', error);
                return { totalHits: 1, resetTime: new Date(Date.now() + windowMs) };
            }
        },
        async decrement(key) {
            try {
                await redis.decr(`${prefix}:${key}`);
            }
            catch {
                // ignore
            }
        },
        async resetKey(key) {
            try {
                await redis.del(`${prefix}:${key}`);
            }
            catch {
                // ignore
            }
        },
    };
    return store;
}
