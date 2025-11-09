/**
 * Chunked Upload Example
 * Teklifbul Rule v1.0 - Büyük veri yükleme örnek kullanımı
 * 
 * Bu dosya, ChunkedUpload component'inin nasıl kullanılacağını gösterir.
 */

import React from 'react';
import { ChunkedUpload } from './ChunkedUpload';
import { logger } from '../log/logger';

/**
 * Örnek: Stok yükleme
 */
export function StockUploadExample() {
  const handleUpload = async (
    chunks: any[][],
    chunkIndex: number,
    signal?: AbortSignal
  ): Promise<any> => {
    // Her chunk için işlem yap
    logger.group(`Stok Chunk ${chunkIndex} İşleniyor`);
    logger.info('Chunk işleniyor', { chunkIndex, rowCount: chunks.length });

    // Örnek: API'ye gönder
    const response = await fetch('/api/stock/bulk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunk: chunks,
        chunkIndex,
      }),
      signal, // AbortSignal'i fetch'e geç
    });

    if (!response.ok) {
      throw new Error(`Chunk ${chunkIndex} yüklenemedi`);
    }

    const result = await response.json();
    logger.info('Chunk başarıyla yüklendi', { chunkIndex, result });
    logger.end();

    return result;
  };

  const handleComplete = (result: any) => {
    logger.group('Stok Yükleme Tamamlandı');
    logger.info('Yükleme özeti', {
      totalRows: result.totalRows,
      successfulChunks: result.successfulChunks,
      failedChunks: result.failedChunks,
    });
    logger.end();
  };

  const handleError = (error: Error) => {
    logger.error('Stok yükleme hatası', error);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2>Stok Toplu Yükleme</h2>
      <p style={{ marginBottom: '20px', color: '#6b7280' }}>
        Excel veya CSV dosyası yükleyerek stok verilerini toplu olarak ekleyebilirsiniz.
        Maksimum dosya boyutu: 50MB
      </p>

      <ChunkedUpload
        fileType="both"
        chunkSize={1000}
        maxFileSize={50 * 1024 * 1024} // 50MB
        onUpload={handleUpload}
        onComplete={handleComplete}
        onError={handleError}
        buttonText="Stok Dosyası Yükle"
        progressLabel="Stok verileri yükleniyor..."
        buttonStyle={{
          backgroundColor: '#10b981',
        }}
      />
    </div>
  );
}

/**
 * Örnek: Tedarikçi yükleme
 */
export function SupplierUploadExample() {
  const handleUpload = async (
    chunks: any[][],
    chunkIndex: number,
    signal?: AbortSignal
  ): Promise<any> => {
    // Her chunk için işlem yap
    logger.group(`Tedarikçi Chunk ${chunkIndex} İşleniyor`);
    logger.info('Chunk işleniyor', { chunkIndex, rowCount: chunks.length });

    // Örnek: Firestore'a batch write
    // Bu örnekte API endpoint kullanıyoruz
    const response = await fetch('/api/suppliers/bulk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunk: chunks,
        chunkIndex,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Chunk ${chunkIndex} yüklenemedi`);
    }

    const result = await response.json();
    logger.info('Chunk başarıyla yüklendi', { chunkIndex, result });
    logger.end();

    return result;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2>Tedarikçi Toplu Yükleme</h2>
      <p style={{ marginBottom: '20px', color: '#6b7280' }}>
        CSV dosyası yükleyerek tedarikçi verilerini toplu olarak ekleyebilirsiniz.
      </p>

      <ChunkedUpload
        fileType="csv"
        chunkSize={500}
        maxFileSize={10 * 1024 * 1024} // 10MB
        onUpload={handleUpload}
        buttonText="Tedarikçi CSV Yükle"
        progressLabel="Tedarikçi verileri yükleniyor..."
      />
    </div>
  );
}

