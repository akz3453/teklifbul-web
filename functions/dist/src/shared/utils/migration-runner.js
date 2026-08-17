"use strict";
/**
 * Migration Runner Utility
 * Teklifbul Rule v1.0 - Batch'li migration işlemleri için progress + cancel
 *
 * Büyük koleksiyonları batch'lere bölerek işler, progress gösterir ve iptal desteği sağlar.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCancellableBatches = runCancellableBatches;
exports.shouldCommitBatch = shouldCommitBatch;
exports.saveProcessedIds = saveProcessedIds;
exports.isProcessed = isProcessed;
exports.saveMigrationResult = saveMigrationResult;
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const logger_js_1 = require("../log/logger.js");
/**
 * Batch'li migration işlemi çalıştır (iptal edilebilir)
 *
 * @param totalCount - Toplam kayıt sayısı
 * @param batchSize - Batch boyutu (varsayılan: 500)
 * @param task - Her batch için işlem fonksiyonu (offset, limit, signal) => işlenen kayıt sayısı
 * @param options - Ek seçenekler
 * @returns MigrationRunnerResult
 *
 * @example
 * ```typescript
 * const result = await runCancellableBatches(
 *   10000,
 *   1000,
 *   async (offset, limit, signal) => {
 *     if (signal.aborted) throw new Error('Cancelled');
 *     const docs = await getDocs(query(collection(db, 'items'), limit(limit), offset(offset)));
 *     // ... işlem yap ...
 *     return docs.size;
 *   }
 * );
 * ```
 */
async function runCancellableBatches(totalCount, task, options = {}) {
    const { batchSize = 500, onProgress, } = options;
    const controller = new AbortController();
    const { signal } = controller;
    let processed = 0;
    const startedAt = Date.now();
    // SIGINT (Ctrl+C) yakalama
    const sigintHandler = () => {
        // Teklifbul Rule v1.0 - Migration script'lerinde console.log kullanılabilir (CLI çıktısı)
        // eslint-disable-next-line no-console
        console.log('\n⚠️  Migration iptal ediliyor...');
        controller.abort();
    };
    process.on('SIGINT', sigintHandler);
    try {
        while (processed < totalCount) {
            if (signal.aborted) {
                throw new Error('Migration cancelled');
            }
            const limit = Math.min(batchSize, totalCount - processed);
            const done = await task(processed, limit, signal);
            processed += done;
            const percentage = Math.min(100, Math.round((processed / totalCount) * 100));
            // CLI çıktısı (console.log serbest - migration script'leri için)
            // Teklifbul Rule v1.0 - Migration script'lerinde console.log kullanılabilir (CLI çıktısı)
            // eslint-disable-next-line no-console
            console.log(`[MIG] ${processed}/${totalCount} (%${percentage})`);
            // Progress callback
            if (onProgress) {
                onProgress(processed, totalCount, percentage);
            }
            // Eğer işlenen kayıt sayısı 0 ise (son batch), dur
            if (done === 0) {
                break;
            }
        }
        const duration = Date.now() - startedAt;
        // Teklifbul Rule v1.0 - Migration script'lerinde console.log kullanılabilir (CLI çıktısı)
        // eslint-disable-next-line no-console
        console.log(`\n✅ Migration tamamlandı: ${processed} kayıt işlendi (${duration}ms)`);
        return {
            processed,
            ms: duration,
            cancel: () => controller.abort(),
        };
    }
    catch (error) {
        const duration = Date.now() - startedAt;
        if (error instanceof Error && error.message === 'Migration cancelled') {
            // Teklifbul Rule v1.0 - Migration script'lerinde console.log kullanılabilir (CLI çıktısı)
            // eslint-disable-next-line no-console
            console.log(`\n⚠️  Migration iptal edildi: ${processed} kayıt işlendi (${duration}ms)`);
        }
        else {
            // Teklifbul Rule v1.0 - Migration script'lerinde console.error kullanılabilir (CLI çıktısı)
            // eslint-disable-next-line no-console
            console.error(`\n❌ Migration hatası:`, error);
        }
        throw error;
    }
    finally {
        // SIGINT handler'ı temizle
        process.removeListener('SIGINT', sigintHandler);
    }
}
/**
 * Firestore batch işlemi için yardımcı fonksiyon
 * Firestore batch limit'i (500) kontrol eder
 *
 * @param batch - Firestore WriteBatch
 * @param operations - Batch operasyon sayısı
 * @param maxBatchSize - Maksimum batch boyutu (varsayılan: 500)
 * @returns Yeni batch oluşturulmalı mı?
 */
function shouldCommitBatch(operations, maxBatchSize = 500) {
    return operations >= maxBatchSize;
}
/**
 * Firebase Admin SDK'yı initialize et (lazy initialization)
 */
async function getAdminDb() {
    // Firebase Admin SDK'yı initialize et (eğer yoksa)
    if ((0, app_1.getApps)().length === 0) {
        try {
            // Önce environment variable'dan kontrol et
            if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                (0, app_1.initializeApp)({
                    credential: (0, app_1.cert)(serviceAccount),
                });
            }
            else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                // applicationDefault() kullan (GOOGLE_APPLICATION_CREDENTIALS env var'dan okur)
                const admin = await Promise.resolve().then(() => __importStar(require('firebase-admin')));
                (0, app_1.initializeApp)({
                    credential: admin.credential.applicationDefault(),
                });
            }
            else {
                // Fallback: serviceAccountKey.json (proje kökünde)
                const { readFileSync } = await Promise.resolve().then(() => __importStar(require('fs')));
                const { join } = await Promise.resolve().then(() => __importStar(require('path')));
                const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
                const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
                (0, app_1.initializeApp)({
                    credential: (0, app_1.cert)(serviceAccount),
                });
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Firebase Admin SDK initialize edilemedi, migration progress kaydedilemeyecek', error);
            return null;
        }
    }
    try {
        return (0, firestore_1.getFirestore)();
    }
    catch (error) {
        logger_js_1.logger.warn('Firestore Admin erişilemedi', error);
        return null;
    }
}
/**
 * İşlenen ID'leri kaydetmek için yardımcı fonksiyon (idempotent migration'lar için)
 *
 * @param processedIds - İşlenen ID listesi
 * @param collectionPath - Kontrol koleksiyonu yolu (örn: '_migration_progress')
 * @param migrationName - Migration adı
 *
 * @example
 * ```typescript
 * await saveProcessedIds(
 *   ['id1', 'id2', 'id3'],
 *   '_migration_progress',
 *   'fix-supplier-index'
 * );
 * ```
 */
async function saveProcessedIds(processedIds, collectionPath, migrationName) {
    const db = await getAdminDb();
    if (!db) {
        logger_js_1.logger.warn('Firestore Admin erişilemedi, processed IDs kaydedilemedi', {
            migrationName,
            count: processedIds.length
        });
        return;
    }
    try {
        const migrationDocRef = db.collection(collectionPath).doc(migrationName);
        const migrationDoc = await migrationDocRef.get();
        // Mevcut processed IDs'i al (varsa)
        const existingData = migrationDoc.exists ? migrationDoc.data() : null;
        const existingIds = existingData?.processedIds || [];
        // Yeni ID'leri ekle (duplicate kontrolü)
        const allIds = Array.from(new Set([...existingIds, ...processedIds]));
        // Firestore'a kaydet
        await migrationDocRef.set({
            processedIds: allIds,
            count: allIds.length,
            lastUpdated: new Date(),
            migrationName
        }, { merge: true });
        logger_js_1.logger.info(`[MIG] ${processedIds.length} işlenen ID kaydedildi: ${migrationName} (toplam: ${allIds.length})`);
    }
    catch (error) {
        logger_js_1.logger.error('Processed IDs kaydetme hatası', {
            migrationName,
            error: error.message || String(error)
        });
        // Hata olsa bile migration devam etsin, sadece log yaz
    }
}
/**
 * İşlenen ID'leri kontrol et (idempotent migration'lar için)
 *
 * @param id - Kontrol edilecek ID
 * @param collectionPath - Kontrol koleksiyonu yolu
 * @param migrationName - Migration adı
 * @returns İşlenmiş mi?
 *
 * @example
 * ```typescript
 * const isAlreadyProcessed = await isProcessed('doc-id-123', '_migration_progress', 'fix-supplier-index');
 * if (isAlreadyProcessed) {
 *   console.log('Bu ID zaten işlenmiş, atlanıyor...');
 *   return;
 * }
 * ```
 */
async function isProcessed(id, collectionPath, migrationName) {
    const db = await getAdminDb();
    if (!db) {
        // Firestore erişilemiyorsa, false döndür (migration devam etsin)
        logger_js_1.logger.warn('Firestore Admin erişilemedi, processed check yapılamıyor', {
            migrationName,
            id
        });
        return false;
    }
    try {
        const migrationDocRef = db.collection(collectionPath).doc(migrationName);
        const migrationDoc = await migrationDocRef.get();
        if (!migrationDoc.exists) {
            return false;
        }
        const data = migrationDoc.data();
        const processedIds = data?.processedIds || [];
        return processedIds.includes(id);
    }
    catch (error) {
        logger_js_1.logger.warn('Processed check hatası, false döndürülüyor (migration devam edecek)', {
            migrationName,
            id,
            error: error.message || String(error)
        });
        // Hata olsa bile false döndür (migration devam etsin)
        return false;
    }
}
/**
 * Migration sonuçlarını Firestore'a kaydet
 *
 * @param result - Migration sonuç bilgileri
 * @param collectionPath - Kayıt koleksiyonu yolu (varsayılan: 'migrations/audit/runs')
 *
 * @example
 * ```typescript
 * await saveMigrationResult({
 *   migrationName: 'fix-supplier-index',
 *   runId: 'run-123',
 *   total: 1000,
 *   processed: 1000,
 *   success: 950,
 *   failed: 50,
 *   status: 'completed',
 *   startedAt: new Date(),
 *   finishedAt: new Date()
 * });
 * ```
 */
async function saveMigrationResult(result, collectionPath = 'migrations/audit/runs') {
    const db = await getAdminDb();
    if (!db) {
        logger_js_1.logger.warn('Firestore Admin erişilemedi, migration result kaydedilemedi', {
            migrationName: result.migrationName,
            runId: result.runId
        });
        return;
    }
    try {
        // Dry-run modu kontrolü
        const isDryRun = process.env.MIGRATION_DRY_RUN === 'true' || result.dryRun === true;
        if (isDryRun) {
            logger_js_1.logger.info('[DRY-RUN] Migration result kaydedilecek', result);
            return;
        }
        // Run ID yoksa oluştur
        const runId = result.runId || `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Firestore'a kaydet
        // Not: collectionPath formatı 'migrations/audit/runs' ise, 
        // bu 'migrations' collection'ında 'audit' document'inde 'runs' subcollection'ı anlamına gelir
        const pathParts = collectionPath.split('/');
        if (pathParts.length === 3) {
            // Format: 'migrations/audit/runs'
            const collectionName = pathParts[0];
            const docId = pathParts[1];
            const subcollectionName = pathParts[2];
            const docRef = db.collection(collectionName).doc(docId).collection(subcollectionName).doc(runId);
            await docRef.set({
                runId,
                migrationName: result.migrationName,
                total: result.total,
                processed: result.processed,
                success: result.success ?? result.processed,
                failed: result.failed ?? 0,
                status: result.status,
                startedAt: result.startedAt,
                finishedAt: result.finishedAt || null,
                dryRun: result.dryRun || false
            });
        }
        else {
            // Basit collection formatı
            const docRef = db.collection(collectionPath).doc(runId);
            await docRef.set({
                runId,
                ...result
            });
        }
        logger_js_1.logger.info(`[MIG] Migration result kaydedildi: ${result.migrationName} (runId: ${runId})`);
    }
    catch (error) {
        logger_js_1.logger.error('Migration result kaydetme hatası', {
            migrationName: result.migrationName,
            runId: result.runId,
            error: error.message || String(error)
        });
        // Hata olsa bile migration devam etsin, sadece log yaz
    }
}
