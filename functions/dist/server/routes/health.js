/**
 * Health Check Endpoint
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * Monitoring sistemleri için canlılık kontrolü
 */
import { getPgPool, getRedisClient } from '../../src/db/connection.js';
import { cache as inMemoryCache } from '../../src/services/in-memory-cache.js';
import { logger } from '../../src/shared/log/logger.js';
/**
 * Health check endpoint
 * Sistem durumunu kontrol eder ve JSON döndürür
 */
export async function healthCheck(req, res) {
    const startTime = Date.now();
    try {
        // Temel sistem bilgileri
        const health = {
            status: 'ok',
            timestamp: Date.now(),
            uptime: process.uptime(),
            memory: {
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024), // MB
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
                external: Math.round(process.memoryUsage().external / 1024 / 1024), // MB
            },
            nodeVersion: process.version,
            env: process.env.NODE_ENV || 'development',
        };
        // Database bağlantı kontrolü
        try {
            const pool = getPgPool();
            await pool.query('SELECT 1');
            health.database = {
                status: 'ok',
                pool: {
                    total: pool.totalCount,
                    idle: pool.idleCount,
                    waiting: pool.waitingCount,
                }
            };
        }
        catch (dbError) {
            health.database = {
                status: 'error',
                error: dbError instanceof Error ? dbError.message : String(dbError)
            };
            health.status = 'degraded';
        }
        // Redis/Cache kontrolü
        try {
            const redisClient = getRedisClient();
            if (redisClient) {
                await redisClient.ping();
                health.cache = {
                    type: 'redis',
                    status: 'ok'
                };
            }
            else {
                // In-memory cache kullanılıyor
                const stats = inMemoryCache.getStats();
                health.cache = {
                    type: 'in-memory',
                    status: 'ok',
                    stats: {
                        keys: stats.keys,
                        hits: stats.hits,
                        misses: stats.misses,
                        hitRate: stats.hits + stats.misses > 0
                            ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
                            : 0
                    }
                };
            }
        }
        catch (cacheError) {
            health.cache = {
                status: 'error',
                error: cacheError instanceof Error ? cacheError.message : String(cacheError)
            };
            health.status = 'degraded';
        }
        const duration = Date.now() - startTime;
        health.responseTime = `${duration}ms`;
        // Status code belirleme
        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);
        // Log (sadece hata durumunda)
        if (health.status !== 'ok') {
            logger.warn('Health check failed', health);
        }
    }
    catch (error) {
        logger.error('Health check error', error);
        res.status(503).json({
            status: 'error',
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : String(error)
        });
    }
}
