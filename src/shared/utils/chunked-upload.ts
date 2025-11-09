/**
 * Chunked Upload Utility
 * Teklifbul Rule v1.0 - Büyük veri yükleme için chunked upload + progress + cancel
 * 
 * Büyük dosyaları parçalara bölerek yükler ve progress tracking sağlar.
 */

import { checkAborted, calculateBatchProgress } from './async-utils.js';
import { logger } from '../log/logger.js';

export interface ChunkedUploadOptions {
  /** Chunk boyutu (satır sayısı) - varsayılan: 1000 */
  chunkSize?: number;
  /** Maksimum dosya boyutu (bytes) - varsayılan: 50MB */
  maxFileSize?: number;
  /** İzin verilen dosya tipleri - varsayılan: ['.csv', '.xlsx', '.xls'] */
  allowedTypes?: string[];
  /** AbortSignal (iptal için) */
  signal?: AbortSignal;
  /** Progress callback (0-100) */
  reportProgress?: (progress: number) => void;
}

export interface ChunkedUploadResult<T> {
  /** Toplam işlenen satır sayısı */
  totalRows: number;
  /** Başarılı chunk sayısı */
  successfulChunks: number;
  /** Başarısız chunk sayısı */
  failedChunks: number;
  /** Sonuç verisi */
  result: T;
}

/**
 * Dosya validasyonu
 * 
 * @param file - Dosya
 * @param options - Upload seçenekleri
 * @throws Error - Validasyon hatası
 */
export function validateUploadFile(
  file: File,
  options: ChunkedUploadOptions = {}
): void {
  const {
    maxFileSize = 50 * 1024 * 1024, // 50MB
    allowedTypes = ['.csv', '.xlsx', '.xls'],
  } = options;

  // Dosya tipi kontrolü
  const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedTypes.includes(fileExtension)) {
    throw new Error(
      `Geçersiz dosya tipi. İzin verilen tipler: ${allowedTypes.join(', ')}`
    );
  }

  // Dosya boyutu kontrolü
  if (file.size > maxFileSize) {
    const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
    throw new Error(
      `Dosya boyutu çok büyük. Maksimum boyut: ${maxSizeMB}MB`
    );
  }
}

/**
 * CSV dosyasını chunk'lara böl ve işle
 * 
 * @param file - CSV dosyası
 * @param processor - Her chunk için işlem fonksiyonu
 * @param options - Upload seçenekleri
 * @returns ChunkedUploadResult
 */
export async function processChunkedCSV<T>(
  file: File,
  processor: (chunk: string[][], chunkIndex: number, signal?: AbortSignal) => Promise<T>,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult<T[]>> {
  const {
    chunkSize = 1000,
    signal,
    reportProgress,
  } = options;

  const startTime = Date.now();
  logger.group('Chunked CSV Upload');
  logger.info('Dosya yükleniyor', { fileName: file.name, fileSize: file.size });

  const report = (p: number) => {
    if (reportProgress) reportProgress(p);
    if (signal) checkAborted(signal);
  };

  report(0);

  // Dosyayı oku
  const text = await file.text();
  report(5);

  // Satırlara böl
  const lines = text.split('\n').filter(line => line.trim() !== '');
  const totalRows = lines.length;
  
  if (totalRows === 0) {
    throw new Error('Dosya boş veya geçersiz format');
  }

  logger.info('Satırlar parse edildi', { totalRows });

  // Header'ı al (ilk satır)
  const header = lines[0].split(',').map(cell => cell.trim());
  const dataLines = lines.slice(1);

  report(10);

  // Chunk'lara böl
  const chunks: string[][] = [];
  for (let i = 0; i < dataLines.length; i += chunkSize) {
    const chunk = dataLines.slice(i, i + chunkSize).map(line => {
      return line.split(',').map(cell => cell.trim());
    });
    chunks.push(chunk);
  }

  const totalChunks = chunks.length;
  logger.info('Chunk\'lara bölündü', { totalChunks, chunkSize });

  report(15);

  // Her chunk'ı işle
  const results: T[] = [];
  let successfulChunks = 0;
  let failedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (signal) checkAborted(signal);

    try {
      const chunkResult = await processor(chunks[i], i, signal);
      results.push(chunkResult);
      successfulChunks++;

      // Progress: 15% - 90% (chunk işleme)
      const chunkProgress = 15 + calculateBatchProgress(i + 1, totalChunks) * 0.75;
      report(chunkProgress);
    } catch (error) {
      failedChunks++;
      logger.error(`Chunk ${i} işlenemedi`, error);
      
      // Hata durumunda devam et (kullanıcı iptal etmediyse)
      if (signal?.aborted) {
        throw new Error('İşlem iptal edildi');
      }
    }
  }

  report(95);

  const duration = Date.now() - startTime;
  logger.info('Chunked upload tamamlandı', {
    totalRows,
    successfulChunks,
    failedChunks,
    duration: `${duration}ms`,
  });
  logger.end();

  report(100);

  return {
    totalRows,
    successfulChunks,
    failedChunks,
    result: results,
  };
}

/**
 * Excel dosyasını chunk'lara böl ve işle
 * 
 * @param file - Excel dosyası
 * @param processor - Her chunk için işlem fonksiyonu
 * @param options - Upload seçenekleri
 * @returns ChunkedUploadResult
 */
export async function processChunkedExcel<T>(
  file: File,
  processor: (chunk: any[][], chunkIndex: number, signal?: AbortSignal) => Promise<T>,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult<T[]>> {
  const {
    chunkSize = 1000,
    signal,
    reportProgress,
  } = options;

  const startTime = Date.now();
  logger.group('Chunked Excel Upload');
  logger.info('Dosya yükleniyor', { fileName: file.name, fileSize: file.size });

  const report = (p: number) => {
    if (reportProgress) reportProgress(p);
    if (signal) checkAborted(signal);
  };

  report(0);

  // ExcelJS'i dinamik import et (tarayıcıda)
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);
  
  report(10);

  // İlk worksheet'i al
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel dosyasında worksheet bulunamadı');
  }

  const totalRows = worksheet.rowCount;
  logger.info('Excel satırları okundu', { totalRows });

  report(15);

  // Chunk'lara böl
  const chunks: any[][] = [];
  const startRow = 2; // Header'ı atla (1. satır)
  
  for (let i = startRow; i <= totalRows; i += chunkSize) {
    const chunk: any[][] = [];
    const endRow = Math.min(i + chunkSize - 1, totalRows);
    
    for (let rowNum = i; rowNum <= endRow; rowNum++) {
      if (signal) checkAborted(signal);
      
      const row = worksheet.getRow(rowNum);
      const rowData: any[] = [];
      
      row.eachCell({ includeEmpty: true }, (cell) => {
        rowData.push(cell.value);
      });
      
      if (rowData.some(cell => cell !== null && cell !== undefined && cell !== '')) {
        chunk.push(rowData);
      }
    }
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  const totalChunks = chunks.length;
  logger.info('Chunk\'lara bölündü', { totalChunks, chunkSize });

  report(20);

  // Her chunk'ı işle
  const results: T[] = [];
  let successfulChunks = 0;
  let failedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (signal) checkAborted(signal);

    try {
      const chunkResult = await processor(chunks[i], i, signal);
      results.push(chunkResult);
      successfulChunks++;

      // Progress: 20% - 90% (chunk işleme)
      const chunkProgress = 20 + calculateBatchProgress(i + 1, totalChunks) * 0.70;
      report(chunkProgress);
    } catch (error) {
      failedChunks++;
      logger.error(`Chunk ${i} işlenemedi`, error);
      
      // Hata durumunda devam et (kullanıcı iptal etmediyse)
      if (signal?.aborted) {
        throw new Error('İşlem iptal edildi');
      }
    }
  }

  report(95);

  const duration = Date.now() - startTime;
  logger.info('Chunked upload tamamlandı', {
    totalRows,
    successfulChunks,
    failedChunks,
    duration: `${duration}ms`,
  });
  logger.end();

  report(100);

  return {
    totalRows,
    successfulChunks,
    failedChunks,
    result: results,
  };
}

