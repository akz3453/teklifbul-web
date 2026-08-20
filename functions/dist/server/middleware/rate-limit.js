/**
 * Rate Limiting Middleware
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * DDoS koruması ve API rate limiting
 */
import rateLimit from 'express-rate-limit';
import { serverLogger } from '../utils/logger.js';
import { createRedisRateLimitStore } from './redis-rate-limit-store.js';
const apiStore = createRedisRateLimitStore('rl:api', 15 * 60 * 1000);
const authStore = createRedisRateLimitStore('rl:auth', 15 * 60 * 1000);
const publicStore = createRedisRateLimitStore('rl:pub', 15 * 60 * 1000);
/**
 * Genel API rate limiter
 * 15 dakikada 100 istek
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: Number(process.env.RATE_LIMIT_MAX) || 500, // Her IP için 500 istek (Global Rate Limiter)
    standardHeaders: true, // `RateLimit-*` headers
    legacyHeaders: false, // `X-RateLimit-*` headers (deprecated)
    ...(apiStore ? { store: apiStore } : {}),
    message: {
        error: 'Çok fazla istek gönderildi, lütfen daha sonra tekrar deneyin',
        retryAfter: '15 dakika'
    },
    handler: (req, res) => {
        // Teklifbul Rule v1.0 - Security: Rate limit tetiklenmelerini logla
        serverLogger.security.rateLimitHit(req, 'api');
        res.status(429).json({
            error: 'Çok fazla istek gönderildi, lütfen daha sonra tekrar deneyin',
            retryAfter: '15 dakika'
        });
    },
    skip: (req) => {
        // Health check endpoint'lerini atla
        return req.path === '/health' || req.path === '/api/health';
    }
});
/**
 * Auth endpoint'leri için sıkı rate limiter
 * 15 dakikada 5 deneme (brute force koruması)
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 5, // Her IP için 5 deneme
    standardHeaders: true,
    legacyHeaders: false,
    ...(authStore ? { store: authStore } : {}),
    message: {
        error: 'Çok fazla giriş denemesi, lütfen 15 dakika sonra tekrar deneyin',
        retryAfter: '15 dakika'
    },
    handler: (req, res) => {
        // Teklifbul Rule v1.0 - Security: Auth rate limit tetiklenmelerini logla
        serverLogger.security.rateLimitHit(req, 'auth');
        res.status(429).json({
            error: 'Çok fazla giriş denemesi, lütfen 15 dakika sonra tekrar deneyin',
            retryAfter: '15 dakika'
        });
    }
});
/**
 * Upload endpoint'leri için özel rate limiter
 * 1 saatte 10 upload
 */
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 10, // Her IP için 10 upload
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Çok fazla dosya yükleme, lütfen daha sonra tekrar deneyin',
        retryAfter: '1 saat'
    },
    handler: (req, res) => {
        // Teklifbul Rule v1.0 - Security: Upload rate limit tetiklenmelerini logla
        serverLogger.security.rateLimitHit(req, 'upload');
        res.status(429).json({
            error: 'Çok fazla dosya yükleme, lütfen daha sonra tekrar deneyin',
            retryAfter: '1 saat'
        });
    }
});
/**
 * Export endpoint'leri için rate limiter
 * 1 dakikada 3 export (XLSX, PDF, etc.)
 * Teklifbul Rule v1.0 - Production Hardening
 */
export const exportLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: Number(process.env.EXPORT_RATE_LIMIT_MAX) || 3, // Her IP için 3 export
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Çok fazla export isteği, lütfen 1 dakika sonra tekrar deneyin',
        retryAfter: '1 dakika'
    },
    handler: (req, res) => {
        // Teklifbul Rule v1.0 - Security: Export rate limit tetiklenmelerini logla
        serverLogger.security.rateLimitHit(req, 'export');
        res.status(429).json({
            error: 'Çok fazla export isteği, lütfen 1 dakika sonra tekrar deneyin',
            retryAfter: '1 dakika'
        });
    }
});
/**
 * Public token-based endpoint'ler için sıkı rate limiter
 * 15 dakikada 30 istek (token brute-force ve email/davet sömürüsünü engeller)
 * Teklifbul Rule v1.0 - Production Hardening
 */
export const publicTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.PUBLIC_TOKEN_RATE_LIMIT_MAX) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    ...(publicStore ? { store: publicStore } : {}),
    message: {
        error: 'Çok fazla istek, lütfen 15 dakika sonra tekrar deneyin',
        retryAfter: '15 dakika'
    },
    handler: (req, res) => {
        serverLogger.security.rateLimitHit(req, 'public_token');
        res.status(429).json({
            error: 'Çok fazla istek, lütfen 15 dakika sonra tekrar deneyin',
            retryAfter: '15 dakika'
        });
    }
});
/**
 * Webhook endpoint'leri için rate limiter
 * 1 dakikada 60 istek (yüksek hacimli ödeme/banka webhook'ları için)
 * Teklifbul Rule v1.0 - Production Hardening
 */
export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Webhook rate limit aşıldı',
        retryAfter: '1 dakika'
    },
    handler: (req, res) => {
        serverLogger.security.rateLimitHit(req, 'webhook');
        res.status(429).json({
            error: 'Webhook rate limit aşıldı',
            retryAfter: '1 dakika'
        });
    }
});
