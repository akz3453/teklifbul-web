"use strict";
/**
 * Request Queue (Bull)
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * Yoğun trafik yönetimi için request queue
 * Redis gerektirir, opsiyonel
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRequestQueue = initRequestQueue;
exports.getRequestQueue = getRequestQueue;
exports.addToQueue = addToQueue;
exports.closeRequestQueue = closeRequestQueue;
const bull_1 = __importDefault(require("bull"));
const connection_js_1 = require("../../db/connection.js");
const logger_js_1 = require("../log/logger.js");
let requestQueue = null;
/**
 * Request queue'yu başlat
 * Redis yoksa null döner (opsiyonel)
 */
function initRequestQueue() {
    const redisClient = (0, connection_js_1.getRedisClient)();
    if (!redisClient) {
        logger_js_1.logger.warn('⚠️  Request queue devre dışı (Redis yok)');
        return null;
    }
    try {
        requestQueue = new bull_1.default('api-requests', {
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
            logger_js_1.logger.info('Request queue job completed', { jobId: job.id });
        });
        requestQueue.on('failed', (job, err) => {
            logger_js_1.logger.error('Request queue job failed', { jobId: job?.id, error: err });
        });
        requestQueue.on('stalled', (job) => {
            logger_js_1.logger.warn('Request queue job stalled', { jobId: job.id });
        });
        logger_js_1.logger.info('✅ Request queue initialized');
        return requestQueue;
    }
    catch (error) {
        logger_js_1.logger.error('Request queue initialization failed', error);
        return null;
    }
}
/**
 * Request queue instance'ını al
 */
function getRequestQueue() {
    if (!requestQueue) {
        return initRequestQueue();
    }
    return requestQueue;
}
/**
 * Request'i queue'ya ekle
 */
async function addToQueue(data, options) {
    const queue = getRequestQueue();
    if (!queue) {
        logger_js_1.logger.warn('Request queue not available, processing directly');
        return null;
    }
    try {
        const job = await queue.add(data, options);
        logger_js_1.logger.info('Request added to queue', { jobId: job.id });
        return job;
    }
    catch (error) {
        logger_js_1.logger.error('Failed to add request to queue', error);
        return null;
    }
}
/**
 * Queue'yu kapat
 */
async function closeRequestQueue() {
    if (requestQueue) {
        await requestQueue.close();
        requestQueue = null;
        logger_js_1.logger.info('Request queue closed');
    }
}
