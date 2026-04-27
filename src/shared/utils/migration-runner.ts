/**
 * Migration Runner Utility
 * Teklifbul Rule v1.0 - Batch'li migration işlemleri için progress + cancel
 * 
 * Büyük koleksiyonları batch'lere bölerek işler, progress gösterir ve iptal desteği sağlar.
 */

import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { logger } from '../log/logger.js';

export interface MigrationRunnerResult {
  /** İşlenen toplam kayıt sayısı */
  processed: number;
  /** İşlem süresi (milisaniye) */
  ms: number;
  /** İptal fonksiyonu */
  cancel: () => void;
}

export interface MigrationResult {
  /** Migration adı */
  migrationName: string;
  /** Run ID (unique identifier) */
  runId?: string;
  /** Toplam kayıt sayısı */
  total: number;
  /** İşlenen kayıt sayısı */
  processed: number;
  /** Başarılı kayıt sayısı */
  success?: number;
  /** Başarısız kayıt sayısı */
  failed?: number;
  /** Durum */
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  /** Başlangıç zamanı */
  startedAt: Date;
  /** Bitiş zamanı */
  finishedAt?: Date;
  /** Dry-run modu */
  dryRun?: boolean;
}

export interface MigrationRunnerOptions {
  /** Batch boyutu (varsayılan: 500) */
  batchSize?: number;
  /** Progress callback (opsiyonel) */
  onProgress?: (processed: number, total: number, percentage: number) => void;
}

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
export async function runCancellableBatches<_T = void>(
  totalCount: number,
  task: (offset: number, limit: number, signal: AbortSignal) => Promise<number>,
  options: MigrationRunnerOptions = {}
): Promise<MigrationRunnerResult> {
  const {
    batchSize = 500,
    onProgress,
  } = options;

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
  } catch (error) {
    const duration = Date.now() - startedAt;
    if (error instanceof Error && error.message === 'Migration cancelled') {
      // Teklifbul Rule v1.0 - Migration script'lerinde console.log kullanılabilir (CLI çıktısı)
      // eslint-disable-next-line no-console
      console.log(`\n⚠️  Migration iptal edildi: ${processed} kayıt işlendi (${duration}ms)`);
    } else {
      // Teklifbul Rule v1.0 - Migration script'lerinde console.error kullanılabilir (CLI çıktısı)
      // eslint-disable-next-line no-console
      console.error(`\n❌ Migration hatası:`, error);
    }
    throw error;
  } finally {
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
export function shouldCommitBatch(operations: number, maxBatchSize: number = 500): boolean {
  return operations >= maxBatchSize;
}

/**
 * Firebase Admin SDK'yı initialize et (lazy initialization)
 */
async function getAdminDb() {
  // Firebase Admin SDK'yı initialize et (eğer yoksa)
  if (getApps().length === 0) {
    try {
      // Önce environment variable'dan kontrol et
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // applicationDefault() kullan (GOOGLE_APPLICATION_CREDENTIALS env var'dan okur)
        const admin = await import('firebase-admin');
        initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      } else {
        // Fallback: serviceAccountKey.json (proje kökünde)
        const { readFileSync } = await import('fs');
        const { join } = await import('path');
        const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
        const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
        initializeApp({
          credential: cert(serviceAccount),
        });
      }
    } catch (error: any) {
      logger.warn('Firebase Admin SDK initialize edilemedi, migration progress kaydedilemeyecek', error);
      return null;
    }
  }
  
  try {
    return getAdminFirestore();
  } catch (error: any) {
    logger.warn('Firestore Admin erişilemedi', error);
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
export async function saveProcessedIds(
  processedIds: string[],
  collectionPath: string,
  migrationName: string
): Promise<void> {
  const db = await getAdminDb();
  
  if (!db) {
    logger.warn('Firestore Admin erişilemedi, processed IDs kaydedilemedi', {
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
    
    logger.info(`[MIG] ${processedIds.length} işlenen ID kaydedildi: ${migrationName} (toplam: ${allIds.length})`);
  } catch (error: any) {
    logger.error('Processed IDs kaydetme hatası', {
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
export async function isProcessed(
  id: string,
  collectionPath: string,
  migrationName: string
): Promise<boolean> {
  const db = await getAdminDb();
  
  if (!db) {
    // Firestore erişilemiyorsa, false döndür (migration devam etsin)
    logger.warn('Firestore Admin erişilemedi, processed check yapılamıyor', {
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
  } catch (error: any) {
    logger.warn('Processed check hatası, false döndürülüyor (migration devam edecek)', {
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
export async function saveMigrationResult(
  result: MigrationResult,
  collectionPath: string = 'migrations/audit/runs'
): Promise<void> {
  const db = await getAdminDb();
  
  if (!db) {
    logger.warn('Firestore Admin erişilemedi, migration result kaydedilemedi', {
      migrationName: result.migrationName,
      runId: result.runId
    });
    return;
  }

  try {
    // Dry-run modu kontrolü
    const isDryRun = process.env.MIGRATION_DRY_RUN === 'true' || result.dryRun === true;
    if (isDryRun) {
      logger.info('[DRY-RUN] Migration result kaydedilecek', result);
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
    } else {
      // Basit collection formatı
      const docRef = db.collection(collectionPath).doc(runId);
      await docRef.set({
        runId,
        ...result
      });
    }
    
    logger.info(`[MIG] Migration result kaydedildi: ${result.migrationName} (runId: ${runId})`);
  } catch (error: any) {
    logger.error('Migration result kaydetme hatası', {
      migrationName: result.migrationName,
      runId: result.runId,
      error: error.message || String(error)
    });
    // Hata olsa bile migration devam etsin, sadece log yaz
  }
}

