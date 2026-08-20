/**
 * Rate Limiting Middleware for Critical Routes
 * Teklifbul Rule v1.0 - E-Belge ve Settings Endpoint Protection
 * 
 * IP + userId bazlı key generation (client companyId spoof edilmez)
 * Standart error format: { ok: false, error: 'RATE_LIMITED', message: '...', retryAfterSec: N }
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../../../src/shared/log/logger.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';

/**
 * Key generator: userId + IP
 * Format: `${keyPrefix}:${userId||'anon'}:${ip}`
 * Şirket id ve sessionId client body/query'den alınmaz (bucket spoof önlemi).
 */
function createKeyGenerator(keyPrefix: string) {
  return (req: Request): string => {
    const userId = (req as any).user?.uid || (req as any).user?.id || 'anon';
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || '');
    return `${keyPrefix}:${userId}:${ip}`;
  };
}

/**
 * Standard rate limit handler
 * Teklifbul Rule v1.0 - Standart error format
 */
function createRateLimitHandler(keyPrefix: string) {
  return (req: Request, res: Response) => {
    const userId = (req as any).user?.uid || (req as any).user?.id || 'anon';
    const companyId = (req as any).user?.companyId || 'no_company';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Log rate limit hit
    logger.warn('Rate limit hit', {
      path: req.path,
      method: req.method,
      userId,
      companyId,
      ip,
      keyPrefix
    });
    
    // Calculate retry after seconds from RateLimit-Reset header
    // express-rate-limit sets RateLimit-Reset header with Unix timestamp
    const resetHeader = res.getHeader('RateLimit-Reset');
    let retryAfterSec = 600; // Default 10 minutes
    if (resetHeader) {
      const resetRaw = Array.isArray(resetHeader) ? resetHeader[0] : resetHeader;
      const resetTime = typeof resetRaw === 'string' ? parseInt(resetRaw, 10) : Number(resetRaw);
      const now = Math.floor(Date.now() / 1000);
      retryAfterSec = Math.max(0, (Number.isFinite(resetTime) ? resetTime : 0) - now);
    }
    
    respondError(
      res,
      Errors.rateLimited(retryAfterSec)
    );
  };
}

/**
 * Create rate limiter with custom configuration
 * 
 * @param windowMs - Time window in milliseconds
 * @param max - Maximum requests per window
 * @param keyPrefix - Prefix for rate limit key
 * @returns Express rate limit middleware
 */
export function createRateLimiter({
  windowMs,
  max,
  keyPrefix
}: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: createKeyGenerator(keyPrefix),
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitHandler(keyPrefix),
    skip: (req) => {
      // Health check endpoint'lerini atla
      return req.path === '/health' || req.path === '/api/health';
    }
  });
}

/**
 * E-Belge Send Rate Limiter (en sıkı)
 * 5 requests / 10 minutes
 */
export const edocSendLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_SEND_MAX) || 5,
  keyPrefix: 'edoc:send'
});

/**
 * E-Belge Status Rate Limiter
 * 30 requests / 10 minutes
 */
export const edocStatusLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_STATUS_MAX) || 30,
  keyPrefix: 'edoc:status'
});

/**
 * E-Belge PDF Rate Limiter
 * 30 requests / 10 minutes
 */
export const edocPdfLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_PDF_MAX) || 30,
  keyPrefix: 'edoc:pdf'
});

/**
 * E-Belge Cancel Rate Limiter
 * 5 requests / 10 minutes
 */
export const edocCancelLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_CANCEL_MAX) || 5,
  keyPrefix: 'edoc:cancel'
});

/**
 * E-Doc Settings Update Rate Limiter (orta sıkı)
 * 20 requests / 10 minutes
 */
export const edocSettingsUpdateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_SETTINGS_UPDATE_MAX) || 20,
  keyPrefix: 'edoc:settings:update'
});

/**
 * E-Doc Credentials Update Rate Limiter (orta sıkı)
 * 10 requests / 10 minutes
 */
export const edocCredentialsUpdateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_CREDENTIALS_UPDATE_MAX) || 10,
  keyPrefix: 'edoc:credentials:update'
});

/**
 * E-Doc Settings Get Rate Limiter
 * 60 requests / 10 minutes
 */
export const edocSettingsGetLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_EDOC_SETTINGS_GET_MAX) || 60,
  keyPrefix: 'edoc:settings:get'
});

/**
 * Sale Document Creation Rate Limiter (orta)
 * 20 requests / 10 minutes
 */
export const saleDocumentCreationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_SALE_DOCUMENT_CREATION_MAX) || 20,
  keyPrefix: 'sale:document:creation'
});

/**
 * Client Error Ingest Rate Limiter (çok sıkı)
 * Teklifbul Rule v1.0 - Client Error Reporting v1
 * 30 requests / 10 minutes per IP + userId
 */
export const clientErrorIngestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 dakika
  max: Number(process.env.RATE_LIMIT_CLIENT_ERROR_INGEST_MAX) || 30,
  keyPrefix: 'client:error:ingest',
});

