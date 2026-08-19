/**
 * Enhanced Migration Runner
 * Teklifbul Rule v1.0 - Dayanıklılık, güvenlik ve operasyon kolaylığı
 *
 * Özellikler:
 * - .env doğrulama (dotenv-safe)
 * - Concurrency & backoff (p-limit, exponential backoff)
 * - Dağıtık kilit (Firestore lock)
 * - Idempotensi genişletme (hash kontrolü)
 * - Audit log & Sentry tag
 * - Dry-run modu
 * - Status API
 * - Post-check
 */
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { logger } from '../log/logger.js';
import pLimit from 'p-limit';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
// ============================================
// Environment Validation
// ============================================
/**
 * .env doğrulama (dotenv-safe ile)
 */
export async function validateEnv() {
    try {
        // dotenv-safe import (eğer yoksa sadece uyarı ver)
        const dotenvSafe = await import('dotenv-safe');
        // Teklifbul Rule v1.0 - Type-safe dotenv-safe usage
        if ('default' in dotenvSafe && dotenvSafe.default?.config) {
            dotenvSafe.default.config({
                allowEmptyValues: false,
                example: '.env.example'
            });
        }
        else if ('config' in dotenvSafe && typeof dotenvSafe.config === 'function') {
            dotenvSafe.config({
                allowEmptyValues: false,
                example: '.env.example'
            });
        }
        else {
            throw new Error('dotenv-safe config function not found');
        }
        logger.info('Environment variables validated');
    }
    catch (error) {
        if (error.code === 'ENOENT' || error.message?.includes('.env.example')) {
            logger.warn('.env.example not found, skipping validation');
        }
        else {
            logger.error('Environment validation failed', error);
            process.exit(1);
        }
    }
}
// ============================================
// Firebase Admin SDK
// ============================================
async function getAdminDb() {
    if (getApps().length === 0) {
        try {
            if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                initializeApp({ credential: cert(serviceAccount) });
            }
            else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                const admin = await import('firebase-admin');
                initializeApp({ credential: admin.credential.applicationDefault() });
            }
            else {
                const { readFileSync } = await import('fs');
                const { join } = await import('path');
                const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
                const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
                initializeApp({ credential: cert(serviceAccount) });
            }
        }
        catch (error) {
            logger.warn('Firebase Admin SDK initialize edilemedi', error);
            return null;
        }
    }
    try {
        return getAdminFirestore();
    }
    catch (error) {
        logger.warn('Firestore Admin erişilemedi', error);
        return null;
    }
}
// ============================================
// Distributed Lock
// ============================================
/**
 * Migration lock kontrolü ve oluşturma
 */
export async function acquireMigrationLock(migrationName, force = false) {
    const db = await getAdminDb();
    if (!db) {
        logger.warn('Firestore erişilemedi, lock kontrolü yapılamıyor');
        return true; // Devam et
    }
    try {
        const lockRef = db.collection('migrations').doc('meta').collection('locks').doc(migrationName);
        const lockDoc = await lockRef.get();
        if (lockDoc.exists) {
            const lockData = lockDoc.data();
            const now = Date.now();
            const lockAge = now - lockData.lockedAt.getTime();
            // TTL kontrolü (varsayılan: 1 saat)
            const ttlMs = lockData.ttlMs || 3600000;
            if (lockAge < ttlMs && !force) {
                logger.error(`Migration lock aktif: ${migrationName} (${lockData.lockedBy})`);
                logger.error(`Lock yaşı: ${Math.round(lockAge / 1000)}s, TTL: ${Math.round(ttlMs / 1000)}s`);
                logger.error('Lock\'u kaldırmak için --force parametresi kullanın');
                return false;
            }
            else if (force) {
                logger.warn(`Lock zorla kaldırılıyor: ${migrationName}`);
            }
        }
        // Lock oluştur
        const runId = uuidv4();
        await lockRef.set({
            lockedBy: runId,
            lockedAt: new Date(),
            ttlMs: 3600000 // 1 saat
        });
        logger.info(`Migration lock alındı: ${migrationName} (runId: ${runId})`);
        return true;
    }
    catch (error) {
        logger.error('Lock alma hatası', error);
        return false;
    }
}
/**
 * Migration lock'u kaldır
 */
export async function releaseMigrationLock(migrationName) {
    const db = await getAdminDb();
    if (!db)
        return;
    try {
        const lockRef = db.collection('migrations').doc('meta').collection('locks').doc(migrationName);
        await lockRef.delete();
        logger.info(`Migration lock kaldırıldı: ${migrationName}`);
    }
    catch (error) {
        logger.warn('Lock kaldırma hatası', error);
    }
}
// ============================================
// Hash & Idempotency
// ============================================
/**
 * MurmurHash v3 benzeri hash (basit implementasyon)
 */
function hashData(data) {
    const str = JSON.stringify(data);
    return createHash('sha256').update(str).digest('hex').substring(0, 16);
}
/**
 * İşlenen ID'yi hash ile kaydet
 */
export async function saveProcessedIdWithHash(id, data, collectionPath, migrationName) {
    const db = await getAdminDb();
    if (!db)
        return;
    const isDryRun = process.env.MIGRATION_DRY_RUN === 'true';
    if (isDryRun) {
        logger.info(`[DRY-RUN] Processed ID kaydedilecek: ${id} (hash: ${hashData(data)})`);
        return;
    }
    try {
        const hash = hashData(data);
        const processedRef = db.collection(collectionPath).doc(migrationName);
        const processedDoc = await processedRef.get();
        const existingData = processedDoc.exists ? processedDoc.data() : null;
        const processedIds = existingData?.processedIds || [];
        // ID var mı kontrol et
        const existingIndex = processedIds.findIndex(p => p.id === id);
        if (existingIndex >= 0) {
            const existing = processedIds[existingIndex];
            if (existing.hash !== hash) {
                // Hash değişmiş - data değişmiş
                logger.warn(`[MIG] ID hash değişti: ${id} (eski: ${existing.hash}, yeni: ${hash})`);
                // Sentry'ye warning gönder
                const SentryModule = await getSentry();
                if (SentryModule) {
                    SentryModule.captureMessage('Migration: Data changed for processed ID', {
                        level: 'warning',
                        tags: {
                            migrationName,
                            id,
                            runId: process.env.MIGRATION_RUN_ID || 'unknown'
                        },
                        extra: {
                            oldHash: existing.hash,
                            newHash: hash
                        }
                    });
                }
                // 'changed' olarak işaretle
                processedIds[existingIndex] = {
                    id,
                    hash,
                    processedAt: new Date()
                };
            }
        }
        else {
            // Yeni ID
            processedIds.push({
                id,
                hash,
                processedAt: new Date()
            });
        }
        await processedRef.set({
            processedIds,
            count: processedIds.length,
            lastUpdated: new Date(),
            migrationName
        }, { merge: true });
    }
    catch (error) {
        logger.error('Processed ID kaydetme hatası', error);
    }
}
/**
 * ID ve hash kontrolü
 */
export async function isProcessedWithHash(id, data, collectionPath, migrationName) {
    const db = await getAdminDb();
    if (!db)
        return 'new';
    try {
        const hash = hashData(data);
        const processedRef = db.collection(collectionPath).doc(migrationName);
        const processedDoc = await processedRef.get();
        if (!processedDoc.exists) {
            return 'new';
        }
        const processedIds = processedDoc.data()?.processedIds || [];
        const existing = processedIds.find(p => p.id === id);
        if (!existing) {
            return 'new';
        }
        if (existing.hash !== hash) {
            return 'changed';
        }
        return 'processed';
    }
    catch (error) {
        logger.warn('Processed check hatası', error);
        return 'new';
    }
}
// ============================================
// Retry & Backoff
// ============================================
/**
 * Exponential backoff + jitter retry helper
 */
export async function withRetry(fn, maxRetries = 5, baseDelay = 500) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
                break;
            }
            // Exponential backoff + jitter
            const delay = Math.min(baseDelay * Math.pow(2, attempt), 5000);
            const jitter = Math.random() * 100;
            const totalDelay = delay + jitter;
            logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(totalDelay)}ms`, {
                error: error.message
            });
            await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
    }
    throw lastError;
}
// ============================================
// Concurrency Control
// ============================================
/**
 * Concurrency limit ile task çalıştır
 */
export function createConcurrencyLimiter(limit = 10) {
    const concurrency = Number(process.env.MIGRATION_CONCURRENCY) || limit;
    return pLimit(concurrency);
}
// ============================================
// Audit Log
// ============================================
/**
 * Migration audit log kaydet
 */
export async function saveAuditLog(audit) {
    const db = await getAdminDb();
    if (!db)
        return;
    const isDryRun = process.env.MIGRATION_DRY_RUN === 'true';
    if (isDryRun) {
        logger.info('[DRY-RUN] Audit log kaydedilecek', audit);
        return;
    }
    try {
        const auditRef = db.collection('migrations').doc('audit').collection('runs').doc(audit.runId);
        await auditRef.set(audit);
        logger.info(`Audit log kaydedildi: ${audit.runId}`);
    }
    catch (error) {
        logger.error('Audit log kaydetme hatası', error);
    }
}
/**
 * Sentry tag ekle
 */
async function getSentry() {
    try {
        if (process.env.SENTRY_DSN) {
            const sentryModule = await import('@sentry/node');
            return sentryModule;
        }
    }
    catch {
        // Sentry yoksa null döndür
    }
    return null;
}
export async function addSentryTags(tags) {
    const Sentry = await getSentry();
    if (Sentry) {
        Sentry.setTags(tags);
    }
}
// ============================================
// Status API
// ============================================
/**
 * Migration status al
 */
export async function getMigrationStatus(runId) {
    const db = await getAdminDb();
    if (!db)
        return null;
    try {
        const auditRef = db.collection('migrations').doc('audit').collection('runs').doc(runId);
        const auditDoc = await auditRef.get();
        if (!auditDoc.exists) {
            return null;
        }
        const audit = auditDoc.data();
        const progressPct = audit.total > 0 ? Math.round((audit.processed / audit.total) * 100) : 0;
        // ETA hesapla (basit linear tahmin)
        const now = Date.now();
        const elapsed = now - audit.startedAt.getTime();
        const rate = audit.processed / elapsed; // items/ms
        const remaining = audit.total - audit.processed;
        const etaMs = rate > 0 ? Math.round(remaining / rate) : 0;
        return {
            runId: audit.runId,
            progressPct,
            processed: audit.processed,
            total: audit.total,
            etaMs,
            status: audit.status
        };
    }
    catch (error) {
        logger.error('Status alma hatası', error);
        return null;
    }
}
// ============================================
// Post-Check
// ============================================
/**
 * Post-check: Kaynak/hedef diff raporu
 */
export async function generatePostCheckReport(runId, sourceSample, targetSample, sampleRate = 0.01) {
    const report = {
        runId,
        timestamp: new Date().toISOString(),
        sampleRate,
        sourceCount: sourceSample.length,
        targetCount: targetSample.length,
        differences: [],
        matches: 0
    };
    // Diff kontrolü
    for (let i = 0; i < Math.min(sourceSample.length, targetSample.length); i++) {
        const source = sourceSample[i];
        const target = targetSample[i];
        if (JSON.stringify(source) === JSON.stringify(target)) {
            report.matches++;
        }
        else {
            report.differences.push({
                index: i,
                source,
                target,
                diff: findDifferences(source, target)
            });
        }
    }
    // Logs klasörüne yaz
    try {
        const logsDir = join(process.cwd(), 'logs');
        mkdirSync(logsDir, { recursive: true });
        const reportPath = join(logsDir, `migration-${runId}.json`);
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
        logger.info(`Post-check raporu kaydedildi: ${reportPath}`);
    }
    catch (error) {
        logger.error('Post-check raporu kaydetme hatası', error);
    }
}
function findDifferences(source, target) {
    const diff = {};
    for (const key in source) {
        if (source[key] !== target[key]) {
            diff[key] = {
                source: source[key],
                target: target[key]
            };
        }
    }
    for (const key in target) {
        if (!(key in source)) {
            diff[key] = {
                source: undefined,
                target: target[key]
            };
        }
    }
    return diff;
}
// ============================================
// Firestore Batch Write with Hotspot Prevention
// ============================================
/**
 * Firestore batch write with random shard key (hotspot önleme)
 */
export function createShardedBatch(db, shardCount = 10) {
    const batches = [];
    const shards = new Map();
    // Shard'ları initialize et
    for (let i = 0; i < shardCount; i++) {
        shards.set(i, []);
        batches.push(db.batch());
    }
    return {
        add: (shardIndex, ref, data) => {
            const index = shardIndex % shardCount;
            shards.get(index).push({ ref, data });
            batches[index].set(ref, data);
        },
        commit: async () => {
            // Random sırayla commit et (hotspot önleme)
            const shuffled = Array.from({ length: shardCount }, (_, i) => i)
                .sort(() => Math.random() - 0.5);
            for (const index of shuffled) {
                const batch = batches[index];
                const operations = shards.get(index).length;
                if (operations > 0 && operations <= 500) {
                    await batch.commit();
                }
            }
        }
    };
}
