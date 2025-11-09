/**
 * Migration Runner Utility
 * Teklifbul Rule v1.0 - Batch'li migration işlemleri için progress + cancel
 * 
 * Büyük koleksiyonları batch'lere bölerek işler, progress gösterir ve iptal desteği sağlar.
 */

export interface MigrationRunnerResult {
  /** İşlenen toplam kayıt sayısı */
  processed: number;
  /** İşlem süresi (milisaniye) */
  ms: number;
  /** İptal fonksiyonu */
  cancel: () => void;
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
export async function runCancellableBatches<T = void>(
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
    console.log(`\n✅ Migration tamamlandı: ${processed} kayıt işlendi (${duration}ms)`);

    return {
      processed,
      ms: duration,
      cancel: () => controller.abort(),
    };
  } catch (error) {
    const duration = Date.now() - startedAt;
    if (error instanceof Error && error.message === 'Migration cancelled') {
      console.log(`\n⚠️  Migration iptal edildi: ${processed} kayıt işlendi (${duration}ms)`);
    } else {
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
 * İşlenen ID'leri kaydetmek için yardımcı fonksiyon (idempotent migration'lar için)
 * 
 * @param processedIds - İşlenen ID listesi
 * @param collectionPath - Kontrol koleksiyonu yolu (örn: '_migration_progress')
 * @param migrationName - Migration adı
 */
export async function saveProcessedIds(
  processedIds: string[],
  collectionPath: string,
  migrationName: string
): Promise<void> {
  // Bu fonksiyon Firestore'a işlenen ID'leri kaydeder
  // Kullanım örneği için migration script'lerinde implement edilebilir
  console.log(`[MIG] ${processedIds.length} işlenen ID kaydediliyor: ${migrationName}`);
  // TODO: Firestore'a kaydetme implementasyonu
}

/**
 * İşlenen ID'leri kontrol et (idempotent migration'lar için)
 * 
 * @param id - Kontrol edilecek ID
 * @param collectionPath - Kontrol koleksiyonu yolu
 * @param migrationName - Migration adı
 * @returns İşlenmiş mi?
 */
export async function isProcessed(
  id: string,
  collectionPath: string,
  migrationName: string
): Promise<boolean> {
  // Bu fonksiyon Firestore'dan işlenen ID'leri kontrol eder
  // Kullanım örneği için migration script'lerinde implement edilebilir
  // TODO: Firestore'dan kontrol implementasyonu
  return false;
}

