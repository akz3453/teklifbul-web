/**
 * Backend Logging Altyapısı
 * Teklifbul Rule v1.0 - Production Hardening: Merkezi logging sistemi
 * 
 * Winston tabanlı structured logging
 * - Production'da JSON formatında log
 * - Development'ta okunabilir format
 * - Hassas bilgi sızıntısını önleme
 */

import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

// Teklifbul Rule v1.0 - Security: Hassas bilgileri filtrele
const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie'];

/**
 * Hassas bilgileri log'dan temizle
 */
function sanitizeLogData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Hassas alanları filtrele
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[FILTERED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// Winston logger yapılandırması
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    // Production'da JSON, development'ta okunabilir format
    isProduction
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
  ),
  defaultMeta: {
    service: 'teklifbul-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console output (her zaman)
    new winston.transports.Console({
      stderrLevels: ['error']
    })
  ]
});

// Production'da dosyaya da log yaz (opsiyonel)
if (isProduction && process.env.LOG_FILE_PATH) {
  logger.add(
    new winston.transports.File({
      filename: process.env.LOG_FILE_PATH,
      level: 'info',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5
    })
  );
  
  // Error logları ayrı dosyaya
  logger.add(
    new winston.transports.File({
      filename: process.env.LOG_FILE_PATH?.replace('.log', '-error.log') || 'error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  );
}

/**
 * Güvenli log fonksiyonları
 * Hassas bilgileri otomatik filtreler
 */
export const serverLogger = {
  info: (message: string, meta?: any) => {
    logger.info(message, sanitizeLogData(meta));
  },
  
  warn: (message: string, meta?: any) => {
    logger.warn(message, sanitizeLogData(meta));
  },
  
  error: (message: string, error?: any, meta?: any) => {
    const errorMeta = error instanceof Error
      ? {
          error: error.message,
          stack: isProduction ? undefined : error.stack,
          ...sanitizeLogData(meta)
        }
      : sanitizeLogData({ error, ...meta });
    
    logger.error(message, errorMeta);
  },
  
  debug: (message: string, meta?: any) => {
    if (!isProduction) {
      logger.debug(message, sanitizeLogData(meta));
    }
  },
  
  // Teklifbul Rule v1.0 - Security: Kritik güvenlik olaylarını logla + Firestore'a yaz
  security: {
    authFailure: (req: any, reason: string) => {
      const meta = sanitizeLogData({
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get?.('user-agent'),
        reason,
        userId: req.user?.uid || null,
        email: req.user?.email || null,
      });
      logger.warn('Auth failure', meta);
      void persistSecurityLog('authFailure', meta, 'Auth failure');
    },
    
    rateLimitHit: (req: any, limiter: string) => {
      const meta = sanitizeLogData({
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress,
        limiter,
        userId: req.user?.uid || null,
        email: req.user?.email || null,
      });
      logger.warn('Rate limit hit', meta);
      void persistSecurityLog('rateLimitHit', meta, `Rate limit hit: ${limiter}`);
    },
    
    adminAction: (req: any, action: string, target?: string) => {
      const meta = sanitizeLogData({
        userId: req.user?.uid,
        email: req.user?.email,
        action,
        target,
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress
      });
      logger.info('Admin action', meta);
      void persistSecurityLog('adminAction', meta, `Admin action: ${action}`);
    },
    
    serverError: (req: any, error: Error, statusCode: number) => {
      const meta = sanitizeLogData({
        path: req.path,
        method: req.method,
        statusCode,
        ip: req.ip || req.connection?.remoteAddress,
        userId: req.user?.uid,
        email: req.user?.email || null,
        error: error?.message,
      });
      logger.error('Server error', error, meta);
      void persistSecurityLog('serverError', meta, error?.message || 'Server error');
    }
  }
};

/**
 * Teklifbul Rule v1.0 — Admin panel için güvenlik loglarını Firestore'a yaz
 * Cloud Functions'ta dosya sistemi kalıcı değil; panel Firestore'dan okur.
 */
async function persistSecurityLog(
  eventType: string,
  meta: Record<string, unknown>,
  message: string
): Promise<void> {
  try {
    const { getAdminDb } = await import('./firestore.js');
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = await getAdminDb();
    if (!db) return;

    await db.collection('security_logs').add({
      eventType,
      message: String(message || eventType).slice(0, 1000),
      path: meta.path || null,
      method: meta.method || null,
      ip: meta.ip || null,
      userId: meta.userId || null,
      email: meta.email || null,
      userAgent: meta.userAgent || null,
      reason: meta.reason || null,
      limiter: meta.limiter || null,
      action: meta.action || null,
      target: meta.target || null,
      statusCode: meta.statusCode || null,
      level: eventType === 'serverError' || eventType === 'authFailure' ? 'warn' : 'info',
      createdAt: FieldValue.serverTimestamp(),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch {
    // Log yazımı asla request'i bozmamalı
  }
}

export default serverLogger;

