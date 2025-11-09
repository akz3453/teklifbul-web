/**
 * Example Migration Script with Progress + Cancel
 * Teklifbul Rule v1.0 - Batch'li migration örneği
 * 
 * Usage:
 *   tsx scripts/migrate-example.ts --name fix-supplier-index --batch 1000
 * 
 * Ctrl+C ile güvenli iptal edilebilir
 */

import 'dotenv/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { runCancellableBatches } from '../src/shared/utils/migration-runner';
import { logger } from '../src/shared/log/logger';

// Firebase Admin initialize
if (getApps().length === 0) {
  const serviceAccount = require('../serviceAccountKey.json');
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getAdminFirestore();

interface MigrationOptions {
  name: string;
  batchSize?: number;
}

/**
 * Örnek migration: Supplier index düzeltme
 */
async function fixSupplierIndex(options: MigrationOptions) {
  logger.group('Migration: Fix Supplier Index');
  logger.info('Migration başlatılıyor', { name: options.name, batchSize: options.batchSize });

  try {
    // Toplam kayıt sayısını al
    const suppliersRef = db.collection('suppliers');
    const countSnapshot = await suppliersRef.count().get();
    const totalCount = countSnapshot.data().count;

    logger.info('Toplam kayıt sayısı', { totalCount });

    if (totalCount === 0) {
      logger.info('İşlenecek kayıt yok');
      return;
    }

    // Batch'li migration çalıştır
    const result = await runCancellableBatches(
      totalCount,
      async (offset, batchLimit, signal) => {
        if (signal.aborted) {
          throw new Error('Migration cancelled');
        }

        // Kayıtları getir (offset ve limit ile)
        // Not: Firestore'da offset yerine cursor-based pagination kullanmak daha verimli
        // Bu örnek basit offset kullanıyor, gerçek kullanımda startAfter kullanılmalı
        const snapshot = await suppliersRef
          .limit(batchLimit)
          .offset(offset)
          .get();

        if (snapshot.empty) {
          return 0;
        }

        const batch = db.batch();
        let processed = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          
          // Örnek: Index alanını düzelt
          const needsUpdate = !data.index || typeof data.index !== 'number';
          
          if (needsUpdate) {
            const supplierRef = suppliersRef.doc(doc.id);
            batch.update(supplierRef, {
              index: data.index || 0,
              updatedAt: new Date(),
            });
            processed++;
          }
        });

        // Batch commit (Firestore limit: 500)
        if (processed > 0) {
          await batch.commit();
          logger.info(`Batch işlendi`, { offset, processed, batchLimit });
        }

        return snapshot.size;
      },
      {
        batchSize: options.batchSize || 500,
        onProgress: (processed, total, percentage) => {
          logger.info('Progress', { processed, total, percentage });
        },
      }
    );

    logger.info('Migration tamamlandı', {
      processed: result.processed,
      duration: `${result.ms}ms`,
    });
    logger.end();
  } catch (error) {
    logger.error('Migration hatası', error);
    logger.end();
    throw error;
  }
}

/**
 * CLI argümanlarını parse et
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    name: '',
    batchSize: 500,
  };

  for (const arg of args) {
    if (arg.startsWith('--name=')) {
      options.name = arg.split('=')[1];
    } else if (arg.startsWith('--batch=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    }
  }

  if (!options.name) {
    console.error('Usage: tsx scripts/migrate-example.ts --name=<migration-name> [--batch=<size>]');
    process.exit(1);
  }

  return options;
}

/**
 * Main
 */
async function main() {
  const options = parseArgs();

  try {
    switch (options.name) {
      case 'fix-supplier-index':
        await fixSupplierIndex(options);
        break;
      default:
        console.error(`Bilinmeyen migration: ${options.name}`);
        console.error('Mevcut migration\'lar: fix-supplier-index');
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Migration execution failed', error);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Main execution error', err);
  process.exit(1);
});

