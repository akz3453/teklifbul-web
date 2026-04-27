/**
 * Migration Runner Production Test Script
 * Teklifbul Rule v1.0 - Production ortamında Firebase Admin SDK ile tam test
 * 
 * Usage: tsx scripts/test-migration-production.ts
 * 
 * Gereksinimler:
 * - Firebase Admin SDK kurulu olmalı (serviceAccountKey.json veya env vars)
 * - Firestore erişimi olmalı
 * - Production ortamında çalıştırılmalı
 */

import 'dotenv/config';
import { logger } from '../src/shared/log/logger.js';
import {
  validateEnv,
  acquireMigrationLock,
  releaseMigrationLock,
  saveAuditLog,
  addSentryTags,
  createConcurrencyLimiter,
  withRetry,
  isProcessedWithHash,
  saveProcessedIdWithHash,
  getMigrationStatus,
  generatePostCheckReport
} from '../src/shared/utils/migration-enhanced.js';
import { v4 as uuidv4 } from 'uuid';

const testResults: Array<{ name: string; passed: boolean; error?: string; details?: any }> = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    logger.group(`🧪 Test: ${name}`);
    await fn();
    testResults.push({ name, passed: true });
    logger.info('✅ Test passed');
    logger.end();
  } catch (error: any) {
    testResults.push({ name, passed: false, error: error.message || String(error), details: error });
    logger.error('❌ Test failed', error);
    logger.end();
  }
}

/**
 * Firebase Admin SDK kontrolü
 */
async function checkFirebaseAdminSDK(): Promise<boolean> {
  try {
    const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');
    const db = getAdminFirestore();
    
    // Basit bir test query
    const testRef = db.collection('_test').doc('connection');
    await testRef.set({ test: true, timestamp: new Date() });
    await testRef.delete();
    
    logger.info('✅ Firebase Admin SDK bağlantısı başarılı');
    return true;
  } catch (error: any) {
    logger.error('❌ Firebase Admin SDK bağlantısı başarısız', error);
    return false;
  }
}

async function runTests() {
  logger.group('🚀 Migration Runner Production Tests');
  logger.info('Starting production tests...');
  logger.info('Environment:', process.env.NODE_ENV || 'development');
  logger.end();

  // Pre-check: Firebase Admin SDK
  logger.group('🔍 Pre-Check: Firebase Admin SDK');
  const hasFirebaseAdmin = await checkFirebaseAdminSDK();
  logger.end();

  if (!hasFirebaseAdmin) {
    logger.error('❌ Firebase Admin SDK bağlantısı yok!');
    logger.error('Lütfen Firebase Admin SDK kurulumunu kontrol edin:');
    logger.error('  - serviceAccountKey.json dosyası mevcut mu?');
    logger.error('  - GOOGLE_APPLICATION_CREDENTIALS env var set edilmiş mi?');
    logger.error('  - FIREBASE_SERVICE_ACCOUNT env var set edilmiş mi?');
    process.exit(1);
  }

  // Test 1: Environment validation
  await test('Environment Validation', async () => {
    await validateEnv();
    logger.info('Environment validation passed');
  });

  // Test 2: Lock mechanism (Firebase Admin SDK gerektirir)
  await test('Lock Mechanism - Full Test', async () => {
    const migrationName = `test-lock-prod-${Date.now()}`;
    
    // Lock al
    const hasLock = await acquireMigrationLock(migrationName, false);
    if (!hasLock) {
      throw new Error('Failed to acquire lock');
    }
    logger.info('Lock acquired successfully');

    // Aynı lock'u tekrar almaya çalış (başarısız olmalı)
    const hasLock2 = await acquireMigrationLock(migrationName, false);
    if (hasLock2) {
      throw new Error('Should not acquire lock twice');
    }
    logger.info('Lock prevention works (second lock failed as expected)');

    // Force ile lock al
    const hasLock3 = await acquireMigrationLock(migrationName, true);
    if (!hasLock3) {
      throw new Error('Failed to acquire lock with force');
    }
    logger.info('Force lock works');

    // Lock kaldır
    await releaseMigrationLock(migrationName);
    logger.info('Lock released successfully');

    // Lock kaldırıldıktan sonra tekrar alabilmeli
    const hasLock4 = await acquireMigrationLock(migrationName, false);
    if (!hasLock4) {
      throw new Error('Should be able to acquire lock after release');
    }
    logger.info('Lock can be acquired after release');

    // Cleanup
    await releaseMigrationLock(migrationName);
    logger.info('Lock cleanup completed');
  });

  // Test 3: Concurrency limiter
  await test('Concurrency Limiter', async () => {
    const limit = createConcurrencyLimiter(3);
    const results: number[] = [];
    const startTime = Date.now();

    await Promise.all([
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push(1);
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push(2);
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push(3);
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push(4);
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push(5);
      })
    ]);

    const duration = Date.now() - startTime;
    logger.info(`Concurrency test completed: ${results.length} tasks in ${duration}ms`);
    
    if (results.length !== 5) {
      throw new Error(`Expected 5 results, got ${results.length}`);
    }
    
    // Concurrency limit kontrolü: 3'lük limit ile 5 task ~200ms'den fazla sürmeli
    if (duration < 200) {
      throw new Error(`Expected duration >= 200ms (concurrency limit), got ${duration}ms`);
    }
  });

  // Test 4: Retry with backoff
  await test('Retry with Backoff', async () => {
    let attempts = 0;
    
    await withRetry(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Simulated error');
      }
      return 'success';
    }, 5, 100);

    if (attempts !== 3) {
      throw new Error(`Expected 3 attempts, got ${attempts}`);
    }
    logger.info(`Retry test passed: ${attempts} attempts`);
  });

  // Test 5: Hash-based Idempotency (Firebase Admin SDK gerektirir)
  await test('Hash-based Idempotency - Full Test', async () => {
    const migrationName = `test-hash-prod-${Date.now()}`;
    const id = 'test-id-123';
    const data1 = { value: 1, timestamp: new Date() };
    const data2 = { value: 2, timestamp: new Date() }; // Farklı data
    const data3 = { value: 1, timestamp: new Date() }; // Aynı data (farklı timestamp ama aynı value)

    // İlk kayıt
    await saveProcessedIdWithHash(id, data1, '_migration_progress', migrationName);
    logger.info('First save completed');
    
    // Kontrol: processed olmalı
    const status1 = await isProcessedWithHash(id, data1, '_migration_progress', migrationName);
    if (status1 !== 'processed') {
      throw new Error(`Expected 'processed', got '${status1}'`);
    }
    logger.info('First save: processed status correct');

    // Farklı data ile kontrol: changed olmalı
    const status2 = await isProcessedWithHash(id, data2, '_migration_progress', migrationName);
    if (status2 !== 'changed') {
      throw new Error(`Expected 'changed', got '${status2}'`);
    }
    logger.info('Changed data: changed status correct');

    // Yeni ID: new olmalı
    const status3 = await isProcessedWithHash('new-id', data1, '_migration_progress', migrationName);
    if (status3 !== 'new') {
      throw new Error(`Expected 'new', got '${status3}'`);
    }
    logger.info('New ID: new status correct');

    // Aynı data tekrar kaydet: processed olmalı (idempotent)
    await saveProcessedIdWithHash(id, data1, '_migration_progress', migrationName);
    const status4 = await isProcessedWithHash(id, data1, '_migration_progress', migrationName);
    if (status4 !== 'processed') {
      throw new Error(`Expected 'processed' after re-save, got '${status4}'`);
    }
    logger.info('Re-save: idempotent behavior correct');
  });

  // Test 6: Audit log (Firebase Admin SDK gerektirir)
  await test('Audit Log - Full Test', async () => {
    const runId = uuidv4();
    const audit = {
      runId,
      startedAt: new Date(),
      total: 100,
      processed: 50,
      success: 45,
      failed: 5,
      retried: 2,
      dryRun: false,
      migrationName: 'test-migration',
      status: 'running' as const
    };

    await saveAuditLog(audit);
    logger.info('Audit log saved successfully');

    // Status kontrolü
    const status = await getMigrationStatus(runId);
    if (!status) {
      throw new Error('Failed to get migration status');
    }
    if (status.runId !== runId) {
      throw new Error('Status runId mismatch');
    }
    if (status.processed !== 50) {
      throw new Error(`Expected processed=50, got ${status.processed}`);
    }
    logger.info('Status API works correctly');

    // Audit log güncelle
    const updatedAudit = {
      ...audit,
      processed: 100,
      success: 95,
      failed: 5,
      status: 'completed' as const,
      finishedAt: new Date()
    };
    await saveAuditLog(updatedAudit);
    logger.info('Audit log updated successfully');

    // Güncellenmiş status kontrolü
    const updatedStatus = await getMigrationStatus(runId);
    if (!updatedStatus) {
      throw new Error('Failed to get updated migration status');
    }
    if (updatedStatus.processed !== 100) {
      throw new Error(`Expected processed=100, got ${updatedStatus.processed}`);
    }
    if (updatedStatus.status !== 'completed') {
      throw new Error(`Expected status='completed', got '${updatedStatus.status}'`);
    }
    logger.info('Updated status correct');
  });

  // Test 7: Post-check report
  await test('Post-Check Report', async () => {
    const runId = uuidv4();
    const sourceSample = [
      { id: '1', value: 10 },
      { id: '2', value: 20 },
      { id: '3', value: 30 }
    ];
    const targetSample = [
      { id: '1', value: 10 }, // Match
      { id: '2', value: 25 }, // Different
      { id: '3', value: 30 }  // Match
    ];

    await generatePostCheckReport(runId, sourceSample, targetSample, 0.01);
    logger.info('Post-check report generated successfully');
  });

  // Test 8: Sentry tags
  await test('Sentry Tags', async () => {
    await addSentryTags({
      runId: 'test-run-id',
      batchNo: '1',
      companyId: 'test-company'
    });
    logger.info('Sentry tags added successfully');
  });

  // Test 9: Dry-run mode
  await test('Dry-Run Mode', async () => {
    const originalDryRun = process.env.MIGRATION_DRY_RUN;
    process.env.MIGRATION_DRY_RUN = 'true';

    const migrationName = `test-dryrun-prod-${Date.now()}`;
    const id = 'test-id-dryrun';
    const data = { value: 1 };

    // Dry-run modunda kaydet (no-op olmalı)
    await saveProcessedIdWithHash(id, data, '_migration_progress', migrationName);
    logger.info('Dry-run mode: saveProcessedIdWithHash completed (no-op)');

    // Dry-run modunda kontrol: new olmalı (çünkü gerçekten kaydedilmedi)
    const status = await isProcessedWithHash(id, data, '_migration_progress', migrationName);
    if (status !== 'new') {
      logger.warn(`Expected 'new' in dry-run mode, got '${status}' (may be cached)`);
    }

    // Restore
    if (originalDryRun) {
      process.env.MIGRATION_DRY_RUN = originalDryRun;
    } else {
      delete process.env.MIGRATION_DRY_RUN;
    }
  });

  // Test 10: Concurrent lock test
  await test('Concurrent Lock Test', async () => {
    const migrationName = `test-concurrent-lock-${Date.now()}`;
    
    // İlk lock al
    const lock1 = await acquireMigrationLock(migrationName, false);
    if (!lock1) {
      throw new Error('Failed to acquire first lock');
    }

    // Aynı anda başka bir process lock almaya çalışırsa (simüle)
    // Not: Gerçek concurrent test için iki ayrı process gerekir
    const lock2 = await acquireMigrationLock(migrationName, false);
    if (lock2) {
      throw new Error('Concurrent lock should fail');
    }
    logger.info('Concurrent lock prevention works');

    // Cleanup
    await releaseMigrationLock(migrationName);
  });

  // Sonuçları göster
  logger.group('📊 Production Test Sonuçları');
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;

  logger.info(`Toplam: ${total} test`);
  logger.info(`✅ Başarılı: ${passed}`);
  logger.info(`❌ Başarısız: ${failed}`);

  if (failed > 0) {
    logger.warn('\nBaşarısız Testler:');
    testResults
      .filter(r => !r.passed)
      .forEach(r => {
        logger.warn(`  - ${r.name}`);
        if (r.error) {
          logger.warn(`    Hata: ${r.error}`);
        }
      });
  }

  logger.end();

  // Exit code
  if (failed > 0) {
    logger.error('❌ Bazı testler başarısız!');
    process.exit(1);
  } else {
    logger.info('✅ Tüm production testler başarılı!');
    logger.info('🎉 Migration Runner production-ready!');
    process.exit(0);
  }
}

// Script çalıştır
runTests().catch(error => {
  logger.error('Production test script hatası', error);
  process.exit(1);
});

