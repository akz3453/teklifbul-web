/**
 * Migration: Tax Offices - Add Lowercase Fields for Indexing
 * Teklifbul Rule v1.0 - Performans optimizasyonu
 * 
 * Bu migration, tax_offices koleksiyonuna lowercase alanlar ekler:
 * - province_name_lower
 * - district_name_lower
 * - office_name_lower
 * 
 * Bu alanlar case-insensitive sorgular için Firestore index'lerinde kullanılacak.
 * 
 * Usage:
 *   tsx scripts/migrate-tax-offices-add-lower-fields.ts [--batch=1000] [--credentials=/path/to/key.json] [--dry-run]
 * 
 * Environment Variables:
 *   GOOGLE_APPLICATION_CREDENTIALS - Service account key dosya yolu
 *   FIREBASE_SERVICE_ACCOUNT - Service account JSON string (alternatif)
 */

import 'dotenv/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { runCancellableBatches } from '../src/shared/utils/migration-runner';
import { logger } from '../src/shared/log/logger';
import { commitBatchWithRetry } from '../src/shared/utils/backoff-retry';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Service account key dosya yolunu maskele (güvenlik için)
 */
function maskPath(path: string): string {
  if (!path) return 'N/A';
  const parts = path.split(/[/\\]/);
  if (parts.length <= 2) return '***/***';
  return `***/${parts.slice(-2).join('/')}`;
}

/**
 * Firebase Admin initialize - esnek kimlik yönetimi
 */
function initializeFirebaseAdmin(credentialsPath?: string): void {
  if (getApps().length > 0) {
    return; // Zaten initialize edilmiş
  }

  try {
    let serviceAccount: any;

    // 1. Öncelik: GOOGLE_APPLICATION_CREDENTIALS environment variable
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      logger.info('GOOGLE_APPLICATION_CREDENTIALS kullaniliyor', { path: maskPath(credPath) });
      if (!existsSync(credPath)) {
        throw new Error(`GOOGLE_APPLICATION_CREDENTIALS dosyasi bulunamadi: ${maskPath(credPath)}`);
      }
      serviceAccount = JSON.parse(readFileSync(credPath, 'utf-8'));
    }
    // 2. --credentials flag ile verilen yol
    else if (credentialsPath) {
      logger.info('--credentials flag kullaniliyor', { path: maskPath(credentialsPath) });
      if (!existsSync(credentialsPath)) {
        throw new Error(`Credentials dosyasi bulunamadi: ${maskPath(credentialsPath)}`);
      }
      serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
    }
    // 3. FIREBASE_SERVICE_ACCOUNT environment variable (JSON string)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      logger.info('FIREBASE_SERVICE_ACCOUNT environment variable kullaniliyor');
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    // 4. Fallback: proje kökündeki serviceAccountKey.json
    else {
      const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
      if (!existsSync(serviceAccountPath)) {
        throw new Error(
          'Service account key bulunamadi. ' +
          'Lutfen GOOGLE_APPLICATION_CREDENTIALS environment variable ayarlayin, ' +
          '--credentials flag kullanin, veya serviceAccountKey.json dosyasini proje kokune ekleyin.'
        );
      }
      logger.info('serviceAccountKey.json kullaniliyor (proje koku)');
      serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
    }

    initializeApp({
      credential: cert(serviceAccount),
    });
    logger.info('Firebase Admin basariyla initialize edildi');
  } catch (error: any) {
    logger.error('Firebase Admin initialize hatasi', error);
    process.exit(1);
  }
}

/**
 * Türkçe karakter normalizasyonu (lowercase)
 */
function normalizeTurkishLower(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

/**
 * Tax offices migration: lowercase alanları ekle
 */
async function migrateTaxOfficesLowerFields(
  batchSize: number = 1000,
  dryRun: boolean = false
) {
  logger.group('Migration: Tax Offices - Add Lowercase Fields');
  logger.info('Migration baslatiliyor', { 
    batchSize, 
    dryRun,
    expectedBehavior: dryRun ? 'SADECE SAYIM (yazma yok)' : 'NORMAL (yazma var)',
  });

  try {
    // Firestore instance'ı al (initialize edilmiş olmalı)
    const db = getAdminFirestore();
    
    // Toplam kayıt sayısını al
    const officesRef = db.collection('tax_offices');
    const countSnapshot = await officesRef.count().get();
    const totalCount = countSnapshot.data().count;

    logger.info('Toplam kayıt sayısı', { totalCount });

    if (totalCount === 0) {
      logger.info('İşlenecek kayıt yok');
      return;
    }

    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let processed = 0;
    let updated = 0;
    let skipped = 0;

    // Cursor-based pagination ile migration (Firestore'da offset verimsiz)
    // Progress tracking için runCancellableBatches kullanıyoruz ama cursor-based pagination yapıyoruz
    const result = await runCancellableBatches(
      totalCount,
      async (_offset, batchLimit, signal) => {
        if (signal.aborted) {
          throw new Error('Migration cancelled');
        }

        // Cursor-based pagination (Firestore'da offset yerine - daha verimli)
        let query = officesRef.limit(batchLimit);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          return 0;
        }

        // Firestore batch limit kontrolü - 500'den fazla ise böl
        const batches: FirebaseFirestore.WriteBatch[] = [];
        let currentBatch = db.batch();
        let currentBatchCount = 0;
        let batchUpdated = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          
          // Lowercase alanlarını hesapla
          const provinceNameLower = normalizeTurkishLower(data.province_name || '');
          const districtNameLower = data.district_name 
            ? normalizeTurkishLower(data.district_name) 
            : '';
          const officeNameLower = normalizeTurkishLower(data.office_name || '');

          // Güncelleme gerekip gerekmediğini kontrol et
          const needsUpdate = 
            data.province_name_lower !== provinceNameLower ||
            (data.district_name && data.district_name_lower !== districtNameLower) ||
            data.office_name_lower !== officeNameLower;

          if (needsUpdate) {
            const updateData: Record<string, string> = {
              province_name_lower: provinceNameLower,
              office_name_lower: officeNameLower,
            };

            if (data.district_name) {
              updateData.district_name_lower = districtNameLower;
            }

            const officeRef = officesRef.doc(doc.id);
            currentBatch.update(officeRef, updateData);
            currentBatchCount++;
            batchUpdated++;

            // Firestore batch limit: 500
            if (currentBatchCount >= 500) {
              batches.push(currentBatch);
              currentBatch = db.batch();
              currentBatchCount = 0;
            }
          }
        });

        // Kalan batch'i ekle
        if (currentBatchCount > 0) {
          batches.push(currentBatch);
        }

        // Batch commit (Firestore limit: 500)
        if (batchUpdated > 0) {
          if (dryRun) {
            // Dry-run modunda sadece log, yazma yok
            logger.info('DRY-RUN: Batch atlandi (yazma yapilmadi)', { 
              wouldUpdate: batchUpdated,
              batchCount: batches.length,
            });
            updated += batchUpdated; // Sayım için
          } else {
            // Normal mod: retry mekanizması ile commit
            for (const batchToCommit of batches) {
              await commitBatchWithRetry(batchToCommit, {
                maxRetries: 5,
                initialDelayMs: 250,
              });
            }
            updated += batchUpdated;
            logger.info('Batch islendi', { updated: batchUpdated, batchCount: batches.length });
          }
        } else {
          skipped += snapshot.size;
        }

        // Son dokümanı kaydet (cursor için)
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        processed += snapshot.size;

        return snapshot.size;
      },
      {
        batchSize,
        onProgress: (processedCount, total, percentage) => {
          logger.info('Progress', { processed: processedCount, total, percentage, updated, skipped });
        },
      }
    );

    const summary = {
      processed: result.processed,
      updated: dryRun ? `[DRY-RUN] ${updated} (yazilmadi)` : updated,
      skipped,
      duration: `${result.ms}ms`,
      dryRun,
    };

    logger.info('Migration tamamlandi', summary);
    
    if (dryRun) {
      logger.info('DRY-RUN Ozeti', {
        totalRecords: totalCount,
        expectedWrites: updated,
        wouldSkip: skipped,
        dryRun: true,
      });
    }
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
function parseArgs(): { 
  batchSize: number; 
  credentialsPath?: string; 
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let batchSize = 1000;
  let credentialsPath: string | undefined;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--batch=')) {
      batchSize = parseInt(arg.split('=')[1], 10);
      if (isNaN(batchSize) || batchSize <= 0) {
        logger.error('Gecersiz batch size', { arg });
        process.exit(1);
      }
    } else if (arg.startsWith('--credentials=')) {
      credentialsPath = arg.split('=')[1];
    } else if (arg === '--dry-run' || arg === '--dryrun') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx scripts/migrate-tax-offices-add-lower-fields.ts [OPTIONS]

Options:
  --batch=<size>              Batch size (default: 1000)
  --credentials=<path>         Service account key dosya yolu
  --dry-run                    Sadece sayim yap, yazma yapma
  --help, -h                   Bu yardim mesajini goster

Environment Variables:
  GOOGLE_APPLICATION_CREDENTIALS  Service account key dosya yolu (oncelikli)
  FIREBASE_SERVICE_ACCOUNT         Service account JSON string (alternatif)

Examples:
  tsx scripts/migrate-tax-offices-add-lower-fields.ts --batch=500
  tsx scripts/migrate-tax-offices-add-lower-fields.ts --credentials=/secure/path/key.json
  tsx scripts/migrate-tax-offices-add-lower-fields.ts --dry-run
  GOOGLE_APPLICATION_CREDENTIALS=/path/key.json tsx scripts/migrate-tax-offices-add-lower-fields.ts
      `);
      process.exit(0);
    }
  }

  return { batchSize, credentialsPath, dryRun };
}

/**
 * Main
 */
async function main() {
  const { batchSize, credentialsPath, dryRun } = parseArgs();

  // Config log (güvenlik için path maskeli)
  logger.group('Migration Configuration');
  logger.info('Config', {
    batchSize,
    dryRun,
    credentialsSource: credentialsPath 
      ? `--credentials=${maskPath(credentialsPath)}`
      : process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? `GOOGLE_APPLICATION_CREDENTIALS=${maskPath(process.env.GOOGLE_APPLICATION_CREDENTIALS)}`
      : process.env.FIREBASE_SERVICE_ACCOUNT
      ? 'FIREBASE_SERVICE_ACCOUNT (env)'
      : 'serviceAccountKey.json (fallback)',
  });
  logger.end();

  try {
    // Firebase Admin initialize (credentials ile)
    initializeFirebaseAdmin(credentialsPath);

    // Migration çalıştır
    await migrateTaxOfficesLowerFields(batchSize, dryRun);
    
    logger.info('Migration basariyla tamamlandi');
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

