/**
 * Client Error Reporting Endpoint
 * Teklifbul Rule v1.0 - Client Error Reporting v1
 * 
 * POST /api/client-errors - Frontend'ten gelen runtime hataları kaydet
 * GET /api/client-errors - Admin panelden hataları listele
 */

import express from 'express';
import { z } from 'zod';
import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';
import { clientErrorPostSchema, clientErrorGetSchema } from '../schemas/clientErrorSchemas.js';
import { clientErrorIngestLimiter } from '../middleware/rateLimit.js';
import { verifyToken } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { getCompanyIdFromRequest } from '../services/permissionService.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

const router = express.Router();

/**
 * Sanitize sensitive data from stack trace and meta
 * Teklifbul Rule v1.0 - Security: Sensitive data masking
 */
function sanitizeErrorData(data: {
  message?: string;
  stack?: string;
  meta?: Record<string, any>;
}): {
  message: string;
  stack?: string;
  meta?: Record<string, any>;
} {
  let sanitizedMessage = data.message || '';
  let sanitizedStack = data.stack || '';
  const sanitizedMeta = data.meta ? { ...data.meta } : undefined;

  // Mask sensitive patterns in message
  sanitizedMessage = sanitizedMessage
    .replace(/Authorization:\s*Bearer\s+[\w\-._~+/]+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/token=["']?[\w\-._~+/]+["']?/gi, 'token=[REDACTED]')
    .replace(/apiKey=["']?[\w\-._~+/]+["']?/gi, 'apiKey=[REDACTED]')
    .replace(/secret=["']?[\w\-._~+/]+["']?/gi, 'secret=[REDACTED]');

  // Mask sensitive patterns in stack
  sanitizedStack = sanitizedStack
    .replace(/Authorization:\s*Bearer\s+[\w\-._~+/]+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/token=["']?[\w\-._~+/]+["']?/gi, 'token=[REDACTED]')
    .replace(/apiKey=["']?[\w\-._~+/]+["']?/gi, 'apiKey=[REDACTED]')
    .replace(/secret=["']?[\w\-._~+/]+["']?/gi, 'secret=[REDACTED]');

  // Remove sensitive keys from meta
  if (sanitizedMeta) {
    const sensitiveKeys = ['password', 'token', 'authorization', 'secret', 'apiKey', 'apikey'];
    for (const key of Object.keys(sanitizedMeta)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        delete sanitizedMeta[key];
      }
    }
  }

  return {
    message: sanitizedMessage,
    stack: sanitizedStack || undefined,
    meta: sanitizedMeta
  };
}

/**
 * Generate fingerprint for error deduplication
 */
function generateFingerprint(data: {
  message: string;
  stack?: string;
  route?: string;
  pageUrl?: string;
}): string {
  const fingerprintInput = `${data.message}|${data.stack || ''}|${data.route || ''}|${data.pageUrl || ''}`;
  return createHash('sha256').update(fingerprintInput).digest('hex').substring(0, 32);
}

/**
 * POST /api/client-errors
 * Frontend'ten gelen runtime hataları kaydet
 * 
 * Auth: Optional (Authorization header varsa verifyToken, yoksa anonymous)
 * Rate Limit: 30 requests / 10 minutes (IP + sessionId + userId)
 */
router.post(
  '/',
  clientErrorIngestLimiter,
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      logger.group('Client Error Report');

      // Optional auth: verifyToken if Authorization header exists
      // Note: verifyToken middleware is not applied to this route, so we handle auth manually
      if (req.headers.authorization) {
        try {
          const authHeader = req.headers.authorization;
          if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            // Import Firebase Admin dynamically
            const admin = await import('firebase-admin');
            const decodedToken = await admin.auth().verifyIdToken(token);
            // Set user on request object (minimal user object)
            (req as any).user = {
              uid: decodedToken.uid,
              email: decodedToken.email || null,
              customClaims: decodedToken
            };
            logger.info('Client error report: Token verified', { userId: decodedToken.uid });
          }
        } catch (authError: any) {
          // Auth error, continue as anonymous
          logger.warn('Client error report: Auth error, continuing as anonymous', {
            error: authError?.message
          });
        }
      }

      // Validate body
      const validationResult = clientErrorPostSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.error('Client error report validation failed', validationResult.error);
        return respondError(
          res,
          Errors.validationError(validationResult.error.errors.map(e => e.message).join(', '))
        );
      }

      const body = validationResult.data;

      // Sanitize sensitive data
      const sanitized = sanitizeErrorData({
        message: body.message,
        stack: body.stack,
        meta: body.meta
      });

      // Generate fingerprint if not provided
      const fingerprint = body.fingerprint || generateFingerprint({
        message: sanitized.message,
        stack: sanitized.stack,
        route: body.route,
        pageUrl: body.pageUrl
      });

      // Get companyId
      let companyId: string | null = body.companyId || null;
      if (!companyId && req.user) {
        companyId = await getCompanyIdFromRequest(req);
      }

      // Get userId
      const userId = req.user?.uid || null;

      // Get Firestore
      const db = await getAdminDb();
      if (!db) {
        logger.error('Firestore unavailable, cannot save client error');
        return respondError(
          res,
          Errors.internal('Hata kaydedilemedi: Firestore kullanılamıyor')
        );
      }

      // Prepare document data
      const now = new Date();
      const docData: any = {
        companyId: companyId || null,
        userId: userId || null,
        sessionId: body.sessionId,
        severity: body.severity,
        message: sanitized.message.substring(0, 500),
        stack: sanitized.stack ? sanitized.stack.substring(0, 4000) : null,
        pageUrl: body.pageUrl ? body.pageUrl.substring(0, 800) : null,
        route: body.route ? body.route.substring(0, 200) : null,
        userAgent: body.userAgent ? body.userAgent.substring(0, 400) : null,
        release: body.release ? body.release.substring(0, 50) : null,
        meta: sanitized.meta || null,
        fingerprint,
        occurredAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      };

      // Remove null/undefined values
      Object.keys(docData).forEach(key => {
        if (docData[key] === null || docData[key] === undefined) {
          delete docData[key];
        }
      });

      // Write to Firestore
      const docRef = await db.collection('client_error_reports').add(docData);

      logger.info('Client error report saved', {
        id: docRef.id,
        fingerprint,
        severity: body.severity,
        userId: userId || 'anonymous',
        companyId: companyId || 'none'
      });

      logger.end();

      return res.json({
        ok: true,
        id: docRef.id
      });
    } catch (error: any) {
      logger.error('Client error report endpoint error', error);
      logger.end();
      return respondError(
        res,
        Errors.internal('Hata kaydedilemedi')
      );
    }
  }
);

/**
 * GET /api/client-errors
 * Admin panelden hataları listele
 * 
 * Auth: Required (verifyToken)
 * Permission: admin.errors.view
 * Rate Limit: None (admin endpoint)
 */
router.get(
  '/',
  verifyToken,
  requirePermission('admin.errors.view'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      logger.group('Client Error List');

      // Validate query
      const validationResult = clientErrorGetSchema.safeParse(req.query);
      if (!validationResult.success) {
        logger.error('Client error list validation failed', validationResult.error);
        return respondError(
          res,
          Errors.validationError(validationResult.error.errors.map(e => e.message).join(', '))
        );
      }

      const { companyId, limit, severity } = validationResult.data;

      // Get Firestore
      const db = await getAdminDb();
      if (!db) {
        logger.error('Firestore unavailable, cannot list client errors');
        return respondError(
          res,
          Errors.internal('Hatalar listelenemedi: Firestore kullanılamıyor')
        );
      }

      // Build query
      let query = db.collection('client_error_reports')
        .where('companyId', '==', companyId)
        .orderBy('occurredAt', 'desc')
        .limit(limit);

      // Filter by severity if not 'all'
      if (severity !== 'all') {
        query = query.where('severity', '==', severity) as any;
      }

      // Execute query
      const snapshot = await query.get();

      // Map documents
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          companyId: data.companyId || null,
          userId: data.userId || null,
          sessionId: data.sessionId,
          severity: data.severity,
          message: data.message,
          stack: data.stack || null,
          pageUrl: data.pageUrl || null,
          route: data.route || null,
          userAgent: data.userAgent || null,
          release: data.release || null,
          meta: data.meta || null,
          fingerprint: data.fingerprint,
          occurredAt: data.occurredAt?.toDate?.()?.toISOString() || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null
        };
      });

      logger.info('Client error list retrieved', {
        companyId,
        severity,
        limit,
        count: items.length
      });

      logger.end();

      return res.json({
        ok: true,
        items
      });
    } catch (error: any) {
      logger.error('Client error list endpoint error', error);
      logger.end();
      return respondError(
        res,
        Errors.internal(`Hatalar listelenemedi: ${error.message}`)
      );
    }
  }
);

export default router;

