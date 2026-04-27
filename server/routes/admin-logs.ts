/**
 * Admin Logs Route
 * Teklifbul Rule v1.0 - Güvenlik & Sistem Logları
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase-admin/firestore';

const router = Router();

router.use(verifyToken, requireAdmin);

/**
 * GET /api/admin/logs
 * Güvenlik ve sistem loglarını döndürür
 */
router.get('/logs',
  validateRequest({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
      eventType: z.enum(['all', 'authFailure', 'rateLimitHit', 'adminAction', 'serverError']).optional().default('all'),
      period: z.enum(['24h', '7d', '30d']).optional().default('24h')
    })
  }),
  async (req: AuthenticatedRequest, res) => {
    logger.group('Admin logs fetch');
    try {
      const { limit, eventType, period } = req.query as {
        limit?: number;
        eventType?: string;
        period?: string;
      };

      // PERFORMANS: Hem dosya sisteminden hem Firestore'dan log oku
      const { getAdminDb } = await import('../utils/firestore.js');
      const db = await getAdminDb();
      
      let logs: any[] = [];

      // 1. Firestore'dan logları oku (error_logs collection)
      if (db) {
        try {
          const now = new Date();
          const periodMs = period === '24h' ? 24 * 60 * 60 * 1000 : period === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
          const startTime = new Date(now.getTime() - periodMs);
          const startTimestamp = Timestamp.fromDate(startTime);
          
          // error_logs collection'dan oku
          // PERFORMANS: Sadece son 30 gün içindeki logları getir
          const errorLogsQuery = db.collection('error_logs')
            .where('timestamp', '>=', startTimestamp)
            .orderBy('timestamp', 'desc')
            .limit(Math.min(limit || 200, 500)); // Max 500
          
          const errorLogsSnapshot = await errorLogsQuery.get();
          
          errorLogsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const timestamp = data.timestamp?.toDate?.()?.toISOString() || 
                             (data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : null) ||
                             (data.lastOccurred?.toDate?.()?.toISOString()) ||
                             new Date().toISOString();
            
            // Event type mapping
            let eventType = 'unknown';
            if (data.type === 'backend') {
              eventType = 'serverError';
            } else if (data.type === 'frontend') {
              eventType = 'clientError';
            } else if (data.severity === 'critical' || data.severity === 'high') {
              eventType = 'serverError';
            }
            
            logs.push({
              id: doc.id,
              timestamp,
              eventType,
              userId: data.userId || data.userEmail || null,
              email: data.userEmail || null,
              method: data.method || null,
              path: data.path || data.url || null,
              ip: data.ip || null,
              message: data.message || data.error || 'No message',
              level: data.severity || 'info',
              type: data.type || 'unknown',
              severity: data.severity || 'low'
            });
          });
          
          logger.info('Firestore logs fetched', { count: errorLogsSnapshot.size });
        } catch (firestoreError: any) {
          // Index hatası olabilir, sessizce devam et
          if (firestoreError.message?.includes('index')) {
            logger.warn('Firestore index required for logs', { error: firestoreError.message });
          } else {
            logger.warn('Firestore log read failed', { error: firestoreError.message });
          }
        }
      }

      // 2. Dosya sisteminden logları oku (fallback)
      const logFilePath = process.env.LOG_FILE_PATH || path.join(process.cwd(), 'logs', 'security.log');
      const errorLogFilePath = process.env.LOG_FILE_PATH?.replace('.log', '-error.log') || path.join(process.cwd(), 'logs', 'security-error.log');

      const readLogFile = (filePath: string): string[] => {
        try {
          if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim());
          }
        } catch (error) {
          logger.warn('Log file read failed', { filePath, error });
        }
        return [];
      };

      const securityLogs = readLogFile(logFilePath);
      const errorLogs = readLogFile(errorLogFilePath);

      // JSON logları parse et
      const parseLogs = (logLines: string[]): any[] => {
        return logLines
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(log => log !== null);
      };

      const parsedSecurityLogs = parseLogs(securityLogs);
      const parsedErrorLogs = parseLogs(errorLogs);

      // Dosya sisteminden gelen logları da ekle
      logs = [...logs, ...parsedSecurityLogs, ...parsedErrorLogs];

      // Event type filtresi
      if (eventType && eventType !== 'all') {
        logs = logs.filter(log => {
          const logEventType = log.eventType || log.level || 'unknown';
          return logEventType.toLowerCase().includes(eventType.toLowerCase());
        });
      }

      // Period filtresi
      const now = new Date();
      const periodMs = period === '24h' ? 24 * 60 * 60 * 1000 : period === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      logs = logs.filter(log => {
        const logTime = log.timestamp ? new Date(log.timestamp) : null;
        if (!logTime) return false;
        return (now.getTime() - logTime.getTime()) <= periodMs;
      });

      // Sırala (en yeni önce)
      logs.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      // Limit uygula
      logs = logs.slice(0, limit || 200);

      // Hassas bilgileri temizle
      logs = logs.map(log => {
        const cleanLog: any = { ...log };
        delete cleanLog.password;
        delete cleanLog.token;
        delete cleanLog.secret;
        delete cleanLog.apiKey;
        delete cleanLog.authorization;
        delete cleanLog.cookie;
        return cleanLog;
      });

      logger.info('Admin logs fetched', { count: logs.length, eventType, period });
      logger.end();
      return res.json({ logs });
    } catch (error: any) {
      logger.error('Admin logs fetch error', error);
      logger.end();
      return res.status(500).json({ error: 'LOGS_ERROR', message: error.message });
    }
  }
);

export default router;

