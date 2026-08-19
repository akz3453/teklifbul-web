/**
 * Migration History API
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * GET /api/migration/history - Migration geçmişi
 */
import { Router } from 'express';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { logger } from '../../src/shared/log/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';
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
        }
        catch {
            // serviceAccountKey.json yok, devam et
        }
        // 4. Application Default Credentials (production'da)
        try {
            initializeApp({
                credential: (await import('firebase-admin/app')).applicationDefault(),
                projectId: 'teklifbul'
            });
            return getAdminFirestore();
        }
        catch {
            logger.warn('Firebase Admin SDK initialize edilemedi');
            return null;
        }
    }
    catch (error) {
        logger.error('Firebase Admin SDK initialize hatası', error);
        return null;
    }
}
/**
 * GET /api/migration-history
 * Migration geçmişini döndürür (cursor-based pagination)
 *
 * Query params:
 * - pageSize: Sayfa başına kayıt sayısı (default: 25, max: 100)
 * - cursor: Cursor token (base64 encoded document snapshot) - next page için
 * - status: Status filtresi (running, completed, failed, cancelled)
 * - migrationName: Migration name filtresi
 * - startDate: Başlangıç tarihi (ISO string)
 * - endDate: Bitiş tarihi (ISO string)
 * - includeTotal: Total count dahil et (default: false, pahalı olabilir)
 */
router.get('/', validateRequest({
    query: z.object({
        pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
        cursor: z.string().max(1000).optional(),
        status: z.enum(['running', 'completed', 'failed', 'cancelled']).optional(),
        migrationName: z.string().max(200).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        includeTotal: z.coerce.boolean().optional().default(false)
    })
}), async (req, res) => {
    try {
        const db = await getAdminDb();
        if (!db) {
            res.status(503).json({
                error: 'Service unavailable',
                message: 'Firebase Admin SDK not available'
            });
            return;
        }
        // Teklifbul Rule v1.0 - Validated query params
        const pageSize = Math.min(Number(req.query.pageSize) || 25, 100); // Max 100
        const cursor = req.query.cursor;
        const status = req.query.status;
        const migrationName = req.query.migrationName;
        const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
        const includeTotal = req.query.includeTotal === 'true';
        // Base query
        let query = db.collection('migrations').doc('audit').collection('runs')
            .orderBy('startedAt', 'desc')
            .limit(pageSize + 1); // +1 to check if there's a next page
        // Status filtresi
        if (status) {
            query = query.where('status', '==', status);
        }
        // Migration name filtresi
        if (migrationName) {
            query = query.where('migrationName', '==', migrationName);
        }
        // Cursor-based pagination
        if (cursor) {
            try {
                // Decode cursor (base64 encoded JSON: {docId, startedAt})
                const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
                const cursorDoc = await db.collection('migrations').doc('audit').collection('runs').doc(cursorData.docId).get();
                if (cursorDoc.exists) {
                    query = query.startAfter(cursorDoc);
                }
            }
            catch (err) {
                logger.warn('Invalid cursor, ignoring', { cursor, error: err });
            }
        }
        const snapshot = await query.get();
        const docs = snapshot.docs;
        const hasNextPage = docs.length > pageSize;
        const results = (hasNextPage ? docs.slice(0, pageSize) : docs).map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        // Date filtresi (client-side - Firestore composite index gerekebilir)
        let filteredResults = results;
        if (startDate || endDate) {
            filteredResults = results.filter((item) => {
                const startedAt = item.startedAt?.toDate ? item.startedAt.toDate() : new Date(item.startedAt);
                if (startDate && startedAt < startDate)
                    return false;
                if (endDate && startedAt > endDate)
                    return false;
                return true;
            });
        }
        // Timestamp'leri ISO string'e çevir
        const migrations = filteredResults.map((item) => ({
            ...item,
            startedAt: item.startedAt?.toDate ? item.startedAt.toDate().toISOString() : item.startedAt,
            finishedAt: item.finishedAt?.toDate ? item.finishedAt.toDate().toISOString() : item.finishedAt
        }));
        // Next cursor (last document ID + startedAt, base64 encoded JSON)
        const nextCursor = hasNextPage && docs.length > 0
            ? Buffer.from(JSON.stringify({
                docId: docs[pageSize - 1].id,
                startedAt: docs[pageSize - 1].data().startedAt?.toDate ? docs[pageSize - 1].data().startedAt.toDate().toISOString() : docs[pageSize - 1].data().startedAt
            })).toString('base64')
            : null;
        // Total count (opsiyonel, pahalı olabilir)
        let total = null;
        if (includeTotal && !cursor) {
            // Sadece ilk sayfa için total count hesapla
            try {
                let countQuery = db.collection('migrations').doc('audit').collection('runs');
                if (status) {
                    countQuery = countQuery.where('status', '==', status);
                }
                if (migrationName) {
                    countQuery = countQuery.where('migrationName', '==', migrationName);
                }
                const countSnapshot = await countQuery.count().get();
                total = countSnapshot.data().count;
            }
            catch (err) {
                logger.warn('Failed to get total count', { error: err });
                // Total count başarısız olursa null döndür
            }
        }
        res.json({
            migrations,
            pagination: {
                pageSize,
                hasNextPage,
                nextCursor,
                total
            }
        });
    }
    catch (error) {
        logger.error('Migration history API error', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message || 'Failed to get migration history'
        });
    }
});
export default router;
