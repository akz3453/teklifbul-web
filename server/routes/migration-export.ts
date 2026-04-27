/**
 * Migration Export API
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * GET /api/migrations/export.xlsx - XLSX export (server-side stream)
 */

import { Router, Request, Response } from 'express';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { logger } from '../../src/shared/log/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';
// Teklifbul Rule v1.0 - Bundle Size: Named imports for tree shaking
import { addBreadcrumb, captureException } from '@sentry/node';
import ExcelJS from 'exceljs';
// Teklifbul Rule v1.0 - Input Validation
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();

/**
 * Firebase Admin SDK lazy initialization
 */
async function getAdminDb() {
  try {
    if (getApps().length > 0) {
      return getAdminFirestore();
    }

    // 1. FIREBASE_SERVICE_ACCOUNT env var (JSON string)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || 'teklifbul'
      });
      return getAdminFirestore();
    }

    // 2. GOOGLE_APPLICATION_CREDENTIALS env var (file path)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || 'teklifbul'
      });
      return getAdminFirestore();
    }

    // 3. serviceAccountKey.json (proje kökünde)
    try {
      const serviceAccount = JSON.parse(readFileSync(join(process.cwd(), 'serviceAccountKey.json'), 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || 'teklifbul'
      });
      return getAdminFirestore();
    } catch {
      // serviceAccountKey.json yok, devam et
    }

    // 4. Application Default Credentials (production'da)
    try {
      initializeApp({
        credential: (await import('firebase-admin/app')).applicationDefault(),
        projectId: 'teklifbul'
      });
      return getAdminFirestore();
    } catch {
      logger.warn('Firebase Admin SDK initialize edilemedi');
      return null;
    }
  } catch (error: any) {
    logger.error('Firebase Admin SDK initialize hatası', error);
    return null;
  }
}

/**
 * GET /api/migration-export/export.xlsx
 * Migration history'yi XLSX formatında export eder (server-side stream)
 * 
 * Query params:
 * - status: Status filtresi (running, completed, failed, cancelled)
 * - migrationName: Migration name filtresi
 * - dateFrom: Başlangıç tarihi (ISO string)
 * - dateTo: Bitiş tarihi (ISO string)
 * - pageSize: Chunk size (default: 100, max: 100)
 */
router.get('/export.xlsx',
  validateRequest({
    query: z.object({
      status: z.enum(['running', 'completed', 'failed', 'cancelled']).optional(),
      migrationName: z.string().max(200).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional().default(100)
    })
  }),
  async (req: Request, res: Response): Promise<void> => {
  logger.group('Migration XLSX Export');
  
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.error('Firebase Admin SDK not available');
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Firebase Admin SDK not available'
      });
      return;
    }

    // Teklifbul Rule v1.0 - Validated query params
    const status = req.query.status as string | undefined;
    const migrationName = req.query.migrationName as string | undefined;
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
    const pageSize = Math.min(Number(req.query.pageSize) || 100, 100); // Max 100

    // Cursor-based pagination ile tüm data'yı stream et
    let cursor: string | null = null;

    // Sentry breadcrumb
    addBreadcrumb({
      category: 'export',
      message: 'Migration XLSX export started',
      level: 'info',
      data: {
        feature: 'export-xlsx',
        filters: { status, migrationName, dateFrom, dateTo },
        pageSize,
        cursor: cursor || 'none'
      }
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Migration History');

    // Column headers
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'Migration Name', key: 'migrationName', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Started At', key: 'startedAt', width: 20 },
      { header: 'Finished At', key: 'finishedAt', width: 20 },
      { header: 'Duration (ms)', key: 'durationMs', width: 15 },
      { header: 'Success Count', key: 'successCount', width: 15 },
      { header: 'Failed Count', key: 'failedCount', width: 15 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'Processed', key: 'processed', width: 15 },
      { header: 'Retried', key: 'retried', width: 15 },
      { header: 'Dry Run', key: 'dryRun', width: 10 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    let totalRows = 0;
    let hasMore = true;

    while (hasMore) {
      // Build query
      let query = db.collection('migrations').doc('audit').collection('runs')
        .orderBy('startedAt', 'desc')
        .limit(pageSize + 1); // +1 to check if there's more

      // Filters
      if (status) {
        query = query.where('status', '==', status) as any;
      }
      if (migrationName) {
        query = query.where('migrationName', '==', migrationName) as any;
      }

      // Cursor
      if (cursor) {
        try {
          const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
          const cursorDoc = await db.collection('migrations').doc('audit').collection('runs').doc(cursorData.docId).get();
          if (cursorDoc.exists) {
            query = query.startAfter(cursorDoc) as any;
          }
        } catch (err) {
          logger.warn('Invalid cursor, ignoring', { cursor, error: err });
        }
      }

      const snapshot = await query.get();
      const docs = snapshot.docs;
      hasMore = docs.length > pageSize;
      const results = (hasMore ? docs.slice(0, pageSize) : docs);

      // Write rows to Excel
      for (const doc of results) {
        const data = doc.data();
        const startedAt = data.startedAt?.toDate ? data.startedAt.toDate() : new Date(data.startedAt);
        const finishedAt = data.finishedAt?.toDate ? data.finishedAt.toDate() : (data.finishedAt ? new Date(data.finishedAt) : null);
        
        // Date filter (client-side - Firestore composite index gerekebilir)
        if (dateFrom && startedAt < dateFrom) continue;
        if (dateTo && startedAt > dateTo) continue;

        const durationMs = finishedAt && startedAt
          ? finishedAt.getTime() - startedAt.getTime()
          : null;

        worksheet.addRow({
          id: doc.id,
          migrationName: data.migrationName || '',
          status: data.status || '',
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt ? finishedAt.toISOString() : '',
          durationMs: durationMs || '',
          successCount: data.success || 0,
          failedCount: data.failed || 0,
          total: data.total || 0,
          processed: data.processed || 0,
          retried: data.retried || 0,
          dryRun: data.dryRun ? 'Yes' : 'No'
        });

        totalRows++;
      }

      // Update cursor for next page
      if (hasMore && results.length > 0) {
        cursor = Buffer.from(JSON.stringify({
          docId: results[pageSize - 1].id,
          startedAt: results[pageSize - 1].data().startedAt?.toDate ? results[pageSize - 1].data().startedAt.toDate().toISOString() : results[pageSize - 1].data().startedAt
        })).toString('base64');
      } else {
        hasMore = false;
      }
    }

    // Filename
    const filename = `migration-export-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream Excel to response
    await workbook.xlsx.write(res);
    
    logger.info('XLSX export completed', { totalRows, filename });
    addBreadcrumb({
      category: 'export',
      message: 'Migration XLSX export completed',
      level: 'info',
      data: { totalRows, filename }
    });
  } catch (error: any) {
    logger.error('XLSX export error', error);
    captureException(error, {
      tags: {
        feature: 'export-xlsx',
        error_type: 'export_failed'
      },
      extra: {
        query: req.query,
        error_message: error.message
      }
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message || 'Failed to export migration history'
      });
    }
  } finally {
    logger.end();
  }
});

export default router;

