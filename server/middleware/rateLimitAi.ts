/**
 * AI Rate Limiting Middleware
 * Teklifbul Rule v1.3 + v1.3.1 (Memory Purge) - Abuse Protection
 * 
 * Company-based rate limiting for /api/chat and /api/ai/* endpoints
 * In-memory sliding window implementation
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { logger } from '../../src/shared/log/logger.js';

// Env vars
const WINDOW_SEC = Number(process.env.AI_RL_WINDOW_SEC) || 60;
const FREE_MAX = Number(process.env.AI_RL_FREE_MAX) || 20;
const PREMIUM_MAX = Number(process.env.AI_RL_PREMIUM_MAX) || 60;
const PREMIUM_PLUS_MAX = Number(process.env.AI_RL_PREMIUM_PLUS_MAX) || 120;

// In-memory store: key -> { timestamps: number[], lastSeenAt: number }
const store = new Map<string, { timestamps: number[]; lastSeenAt: number }>();

// Teklifbul Rule v1.3.1 - Memory growth prevention: purge idle keys
function purgeIdleKeys() {
  const now = Date.now();
  const windowMs = WINDOW_SEC * 1000;
  const idleThresholdMs = 10 * 60 * 1000; // 10 minutes idle
  let purged = 0;
  
  for (const [key, data] of store.entries()) {
    // Remove old timestamps (outside window)
    data.timestamps = data.timestamps.filter(ts => now - ts < windowMs);
    
    // Purge if no timestamps and idle for 10+ minutes
    if (data.timestamps.length === 0 && (now - data.lastSeenAt) > idleThresholdMs) {
      store.delete(key);
      purged++;
    }
  }
  
  if (purged > 0) {
    logger.info('[AI-RL] purged idle keys', { purged, remaining: store.size });
  }
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  purgeIdleKeys();
}, 5 * 60 * 1000);

// Teklifbul Rule v1.3.1 - Opportunistic purge if store grows too large
function opportunisticPurge() {
  if (store.size > 2000) {
    logger.warn('[AI-RL] store size exceeded threshold, running opportunistic purge', { size: store.size });
    purgeIdleKeys();
  }
}

function getLimitForPlan(planId: string | null | undefined): number {
  if (!planId) return FREE_MAX;
  if (planId.includes('premium_plus')) return PREMIUM_PLUS_MAX;
  if (planId.includes('premium')) return PREMIUM_MAX;
  return FREE_MAX;
}

function getKey(req: AuthenticatedRequest): string | null {
  // Try companyId from header or user data
  const headerCompanyId = req.headers['x-company-id'] as string | undefined;
  if (headerCompanyId) return `company:${headerCompanyId}:ai`;
  
  // Fallback to userId for legacy flow
  if (req.user?.uid) return `user:${req.user.uid}:ai`;
  
  return null;
}

async function getPlanId(req: AuthenticatedRequest): Promise<string | null> {
  try {
    // Try to get plan from company context
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    if (headerCompanyId) {
      const { getAdminDb } = await import('../utils/firestore.js');
      const db = await getAdminDb();
      if (db) {
        const companyDoc = await db.collection('companies').doc(headerCompanyId).get();
        if (companyDoc.exists) {
          const data = companyDoc.data();
          return data?.planId || null;
        }
      }
    }
    
    // Fallback to user plan
    // Teklifbul Rule v1.0 - getUserPlan zaten AiPlan ('free'|'premium'|'premium_plus') string'i donduruyor
    if (req.user?.uid) {
      const { getUserPlan } = await import('../services/userService.js');
      const plan = await getUserPlan(req.user.uid);
      return plan || null;
    }
  } catch (e) {
    logger.warn('rateLimitAi: plan resolution failed', e);
  }
  return null;
}

export async function rateLimitAi(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthenticatedRequest;
  const key = getKey(authReq);
  
  if (!key) {
    // No key = no rate limit (shouldn't happen with verifyToken, but safe fallback)
    return next();
  }

  const planId = await getPlanId(authReq);
  const limit = getLimitForPlan(planId);
  const now = Date.now();
  const windowMs = WINDOW_SEC * 1000;

  // Teklifbul Rule v1.3.1 - Opportunistic purge if store is large
  opportunisticPurge();

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [], lastSeenAt: now };
    store.set(key, entry);
  }

  // Update lastSeenAt
  entry.lastSeenAt = now;

  // Remove old timestamps (outside window)
  entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs);

  // Check limit
  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    
    logger.warn('AI rate limit exceeded', { key, planId, limit, count: entry.timestamps.length, retryAfterSec });
    
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Çok hızlı istek gönderildi',
      retryAfterSec,
    });
    res.setHeader('Retry-After', String(retryAfterSec));
    return;
  }

  // Add current request
  entry.timestamps.push(now);
  next();
}

