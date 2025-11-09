/**
 * Async Utilities
 * Teklifbul Rule v1.0
 * 
 * AbortController wrapper ve progress tracking için yardımcı fonksiyonlar
 */

export interface CancellableTask<T> {
  controller: AbortController;
  promise: Promise<T>;
  cancel: () => void;
}

/**
 * İptal edilebilir async task çalıştır
 * 
 * @param task - AbortSignal ve progress callback alan async fonksiyon
 * @param onProgress - Progress callback (0-100)
 * @returns CancellableTask - controller, promise ve cancel fonksiyonu
 */
export async function runCancellable<T>(
  task: (signal: AbortSignal, report?: (progress: number) => void) => Promise<T>,
  onProgress?: (progress: number) => void
): Promise<CancellableTask<T>> {
  const controller = new AbortController();
  const signal = controller.signal;
  
  // Progress callback wrapper
  const reportProgress = (progress: number) => {
    if (onProgress) {
      onProgress(Math.min(100, Math.max(0, progress)));
    }
  };
  
  const promise = task(signal, reportProgress);
  
  return {
    controller,
    promise,
    cancel: () => {
      controller.abort();
    }
  };
}

/**
 * Batch işlemler için progress hesapla
 * 
 * @param current - Mevcut işlem index'i (0-based)
 * @param total - Toplam işlem sayısı
 * @returns 0-100 arası progress değeri
 */
export function calculateBatchProgress(current: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
}

/**
 * AbortSignal kontrolü
 * 
 * @param signal - AbortSignal
 * @throws Error - Eğer signal abort edilmişse
 */
export function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('İşlem iptal edildi');
  }
}

