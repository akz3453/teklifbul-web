/**
 * Request Queue (Bull)
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * Yoğun trafik yönetimi için request queue
 * Redis gerektirir, opsiyonel
 */

import Queue from 'bull';
import { getRedisClient } from '../../db/connection.js';
import { logger } from '../log/logger.js';

let requestQueue: Queue.Queue | null = null;

/**
 * Request queue'yu başlat
 * Redis yoksa null döner (opsiyonel)
 */
export function initRequestQueue(): Queue.Queue | null {
  const redisClient = getRedisClient();
  
  if (!redisClient) {
    logger.warn('⚠️  Request queue devre dışı (Redis yok)');
    return null;
  }

  try {
    requestQueue = new Queue('api-requests', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // 1 saat
          count: 1000, // Max 1000 job
        },
        removeOnFail: {
          age: 86400, // 24 saat
        },
      },
    });

    // Queue event listeners
    requestQueue.on('completed', (job) => {
      logger.info('Request queue job completed', { jobId: job.id });
    });

    requestQueue.on('failed', (job, err) => {
      logger.error('Request queue job failed', { jobId: job?.id, error: err });
    });

    requestQueue.on('stalled', (job) => {
      logger.warn('Request queue job stalled', { jobId: job.id });
    });

    logger.info('✅ Request queue initialized');
    return requestQueue;
  } catch (error) {
    logger.error('Request queue initialization failed', error);
    return null;
  }
}

/**
 * Request queue instance'ını al
 */
export function getRequestQueue(): Queue.Queue | null {
  if (!requestQueue) {
    return initRequestQueue();
  }
  return requestQueue;
}

/**
 * Request'i queue'ya ekle
 */
export async function addToQueue<T>(
  data: T,
  options?: Queue.JobOptions
): Promise<Queue.Job<T> | null> {
  const queue = getRequestQueue();
  if (!queue) {
    logger.warn('Request queue not available, processing directly');
    return null;
  }

  try {
    const job = await queue.add(data, options);
    logger.info('Request added to queue', { jobId: job.id });
    return job;
  } catch (error) {
    logger.error('Failed to add request to queue', error);
    return null;
  }
}

/**
 * Queue'yu kapat
 */
export async function closeRequestQueue(): Promise<void> {
  if (requestQueue) {
    await requestQueue.close();
    requestQueue = null;
    logger.info('Request queue closed');
  }
}

