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
  
  // Teklifbul Rule v1.0 - Security: Kritik güvenlik olaylarını logla
  security: {
    authFailure: (req: any, reason: string) => {
      logger.warn('Auth failure', sanitizeLogData({
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        reason
      }));
    },
    
    rateLimitHit: (req: any, limiter: string) => {
      logger.warn('Rate limit hit', sanitizeLogData({
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress,
        limiter
      }));
    },
    
    adminAction: (req: any, action: string, target?: string) => {
      logger.info('Admin action', sanitizeLogData({
        userId: req.user?.uid,
        email: req.user?.email,
        action,
        target,
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress
      }));
    },
    
    serverError: (req: any, error: Error, statusCode: number) => {
      logger.error('Server error', error, sanitizeLogData({
        path: req.path,
        method: req.method,
        statusCode,
        ip: req.ip || req.connection?.remoteAddress,
        userId: req.user?.uid
      }));
    }
  }
};

export default serverLogger;

