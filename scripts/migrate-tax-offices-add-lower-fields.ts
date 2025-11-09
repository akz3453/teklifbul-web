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
 *   tsx scripts/migrate-tax-offices-add-lower-fields.ts [--batch=1000]
 */

import 'dotenv/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { runCancellableBatches } from '../src/shared/utils/migration-runner';
import { logger } from '../src/shared/log/logger';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Firebase Admin initialize
if (getApps().length === 0) {
  try {
    // Önce environment variable'dan kontrol et
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      // JSON dosyasını direkt oku
      const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
      if (!existsSync(serviceAccountPath)) {
        throw new Error('serviceAccountKey.json bulunamadi');
      }
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
  } catch (error: any) {
    logger.error('Firebase Admin initialize hatasi', error);
    logger.error('Lutfen serviceAccountKey.json dosyasini proje kokune ekleyin veya FIREBASE_SERVICE_ACCOUNT environment variable ayarlayin');
    process.exit(1);
  }
}

const db = getAdminFirestore();

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
async function migrateTaxOfficesLowerFields(batchSize: number = 1000) {
  logger.group('Migration: Tax Offices - Add Lowercase Fields');
  logger.info('Migration başlatılıyor', { batchSize });

  try {
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
          // Tüm batch'leri commit et
          for (const batchToCommit of batches) {
            await batchToCommit.commit();
          }

          updated += batchUpdated;
          logger.info(`Batch işlendi`, { offset, updated: batchUpdated, batchLimit });
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

    logger.info('Migration tamamlandı', {
      processed: result.processed,
      updated,
      skipped,
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
function parseArgs(): { batchSize: number } {
  const args = process.argv.slice(2);
  let batchSize = 1000;

  for (const arg of args) {
    if (arg.startsWith('--batch=')) {
      batchSize = parseInt(arg.split('=')[1], 10);
    }
  }

  return { batchSize };
}

/**
 * Main
 */
async function main() {
  const { batchSize } = parseArgs();

  try {
    await migrateTaxOfficesLowerFields(batchSize);
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

