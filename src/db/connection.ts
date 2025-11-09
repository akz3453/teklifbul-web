/**
 * PostgreSQL Connection Pool
 * Teklifbul Rule v1.0
 */

import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PGPool, PoolConfig } from 'pg';
import Redis from 'ioredis';

let pgPool: PGPool | null = null;
let redisClient: Redis | null = null;

// PostgreSQL connection config
function createPgPool(): Pool {
  const config: PoolConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'teklifbul',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    max: 20, // Connection pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  return new Pool(config);
}

// Redis connection
function createRedisClient(): Redis {
  // REDIS_URL varsa onu kullan, yoksa host/port/password kombinasyonu
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''}${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    : 'redis://127.0.0.1:6379';
  
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    lazyConnect: true, // Otomatik bağlanma, manuel ping() ile test edelim
  });
}

export function getPgPool(): Pool {
  if (!pgPool) {
    pgPool = createPgPool();
    
    // Error handling
    pgPool!.on('error', (err: any) => {
        console.error('Unexpected PostgreSQL pool error:', err);
      });
  }
  return pgPool;
}

export function getRedisClient(): Redis | null {
  // Cache disabled kontrolü
  if (process.env.CACHE_DISABLED === '1') {
    return null;
  }
  
  if (!redisClient) {
    redisClient = createRedisClient();
    
    redisClient.on('error', (err) => {
      // Geliştirme modunda sadece uyarı ver, uygulamayı durdurma
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️  Redis client error (cache disabled):', err.message);
      } else {
        console.error('Redis client error:', err);
      }
    });
    
    redisClient.on('connect', () => {
      console.info('✅ Redis connected');
    });
  }
  return redisClient;
}

// Graceful shutdown
export async function closeConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPgPool();
    await pool.query('SELECT 1');
    return true;
  } catch (e) {
    console.error('PostgreSQL connection test failed:', e);
    return false;
  }
}

