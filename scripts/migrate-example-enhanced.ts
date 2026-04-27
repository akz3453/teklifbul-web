/**
 * Enhanced Migration Example Script
 * Teklifbul Rule v1.0 - Tüm enhanced özellikleri gösterir
 * 
 * Usage:
 *   tsx scripts/migrate-example-enhanced.ts --name fix-supplier-index [--force] [--dry-run]
 */

import 'dotenv/config';
import { validateEnv } from '../src/shared/utils/migration-enhanced.js';
import {
  acquireMigrationLock,
  releaseMigrationLock,
  saveAuditLog,
  addSentryTags,
  createConcurrencyLimiter,
  withRetry,
  isProcessedWithHash,
  saveProcessedIdWithHash,
  generatePostCheckReport
} from '../src/shared/utils/migration-enhanced.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../src/shared/log/logger.js';

// Parse arguments
const args = process.argv.slice(2);
const migrationName = args.find(arg => arg.startsWith('--name='))?.split('=')[1] || 'example-migration';
const force = args.includes('--force');
const dryRun = args.includes('--dry-run') || process.env.MIGRATION_DRY_RUN === 'true';

if (dryRun) {
  process.env.MIGRATION_DRY_RUN = 'true';
  logger.info('🔍 DRY-RUN MODE: No changes will be written to Firestore');
}

async function main() {
  logger.group('Enhanced Migration Example');
  
  try {
    // 1. Environment doğrula
    logger.info('Validating environment...');
    await validateEnv();

    // 2. Lock al
    logger.info(`Acquiring migration lock: ${migrationName}`);
    const hasLock = await acquireMigrationLock(migrationName, force);
    if (!hasLock) {
      logger.error('Migration lock alınamadı, çıkılıyor...');
      process.exit(1);
    }

    const runId = uuidv4();
    process.env.MIGRATION_RUN_ID = runId;
    logger.info(`Migration run ID: ${runId}`);

    // 3. Audit log başlat
    const audit = {
      runId,
      startedAt: new Date(),
      total: 100, // Örnek: 100 item
      processed: 0,
      success: 0,
      failed: 0,
      retried: 0,
      dryRun,
      migrationName,
      status: 'running' as const
    };
    await saveAuditLog(audit);
    await addSentryTags({ runId, migrationName, batchNo: '1' });

    // 4. Concurrency limiter
    const concurrency = Number(process.env.MIGRATION_CONCURRENCY) || 10;
    const limit = createConcurrencyLimiter(concurrency);
    logger.info(`Concurrency limit: ${concurrency}`);

    // 5. Örnek migration işlemi
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      data: { value: i, timestamp: new Date() }
    }));

    const sourceSample: any[] = [];
    const targetSample: any[] = [];

    for (const item of items) {
      await limit(async () => {
        try {
          // İşlenmiş mi kontrol et (hash ile)
          const status = await isProcessedWithHash(
            item.id,
            item.data,
            '_migration_progress',
            migrationName
          );

          if (status === 'processed') {
            logger.info(`[SKIP] Item already processed: ${item.id}`);
            return;
          } else if (status === 'changed') {
            logger.warn(`[CHANGED] Item data changed: ${item.id}`);
          }

          // Retry ile işle
          await withRetry(async () => {
            // Simüle edilmiş migration işlemi
            if (Math.random() < 0.1) {
              throw new Error('Random error for testing retry');
            }

            // Migration işlemi burada yapılır
            const processedData = { ...item.data, migrated: true };
            
            // Örnekleme (%1)
            if (Math.random() < 0.01) {
              sourceSample.push(item.data);
              targetSample.push(processedData);
            }

            // Kaydet
            await saveProcessedIdWithHash(
              item.id,
              processedData,
              '_migration_progress',
              migrationName
            );

            audit.success++;
          }, 5, 500);

          audit.processed++;
        } catch (error: any) {
          audit.failed++;
          logger.error(`Migration failed for item: ${item.id}`, error);
        }
      });
    }

    // 6. Post-check
    if (sourceSample.length > 0 && targetSample.length > 0) {
      logger.info('Generating post-check report...');
      await generatePostCheckReport(runId, sourceSample, targetSample, 0.01);
    }

    // 7. Audit log tamamla
    audit.status = 'completed';
    audit.finishedAt = new Date();
    await saveAuditLog(audit);

    logger.info('✅ Migration completed successfully');
    logger.info(`Processed: ${audit.processed}, Success: ${audit.success}, Failed: ${audit.failed}`);

  } catch (error: any) {
    logger.error('Migration failed', error);
    
    // Audit log hata durumu
    if (typeof audit !== 'undefined') {
      audit.status = 'failed';
      audit.finishedAt = new Date();
      await saveAuditLog(audit);
    }
    
    process.exit(1);
  } finally {
    // 8. Lock kaldır
    await releaseMigrationLock(migrationName);
    logger.end();
  }
}

main().catch(error => {
  logger.error('Main execution error', error);
  process.exit(1);
});

