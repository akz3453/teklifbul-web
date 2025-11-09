/**
 * Chunked Upload Component
 * Teklifbul Rule v1.0 - Büyük veri yükleme için UI component
 * 
 * Büyük dosyaları chunk'lara bölerek yükler, progress gösterir ve iptal desteği sağlar.
 */

import React, { useState, useRef } from 'react';
import { useCancellableTask } from '../hooks/useCancellableTask';
import { ProgressBar } from './ProgressBar';
import { validateUploadFile, processChunkedCSV, processChunkedExcel, type ChunkedUploadOptions, type ChunkedUploadResult } from '../utils/chunked-upload';
import { toast } from '../ui/toast';

interface ChunkedUploadProps {
  /** Dosya tipi: 'csv' | 'excel' | 'both' */
  fileType?: 'csv' | 'excel' | 'both';
  /** Chunk boyutu (satır sayısı) */
  chunkSize?: number;
  /** Maksimum dosya boyutu (bytes) */
  maxFileSize?: number;
  /** Upload işlemi callback */
  onUpload: (
    chunks: any[][],
    chunkIndex: number,
    signal?: AbortSignal
  ) => Promise<any>;
  /** Upload tamamlandığında callback */
  onComplete?: (result: ChunkedUploadResult<any[]>) => void;
  /** Upload hatası callback */
  onError?: (error: Error) => void;
  /** Buton metni */
  buttonText?: string;
  /** Buton stil */
  buttonStyle?: React.CSSProperties;
  /** Progress bar label */
  progressLabel?: string;
}

export function ChunkedUpload({
  fileType = 'both',
  chunkSize = 1000,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  onUpload,
  onComplete,
  onError,
  buttonText = 'Dosya Yükle',
  buttonStyle,
  progressLabel = 'Dosya yükleniyor...',
}: ChunkedUploadProps) {
  const uploadTask = useCancellableTask<ChunkedUploadResult<any[]>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Dosya validasyonu
    try {
      const allowedTypes: string[] = [];
      if (fileType === 'csv' || fileType === 'both') {
        allowedTypes.push('.csv');
      }
      if (fileType === 'excel' || fileType === 'both') {
        allowedTypes.push('.xlsx', '.xls');
      }

      validateUploadFile(file, {
        maxFileSize,
        allowedTypes,
      });
    } catch (error: any) {
      toast.error(error.message || 'Dosya validasyonu başarısız');
      if (onError) {
        onError(error);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Upload işlemini başlat
    try {
      await uploadTask.start(async (signal, reportProgress) => {
        const options: ChunkedUploadOptions = {
          chunkSize,
          maxFileSize,
          signal,
          reportProgress,
        };

        let result: ChunkedUploadResult<any[]>;

        // Dosya tipine göre işle
        if (file.name.endsWith('.csv')) {
          result = await processChunkedCSV(file, onUpload, options);
        } else {
          result = await processChunkedExcel(file, onUpload, options);
        }

        // Sonuçları birleştir
        if (onComplete) {
          onComplete(result);
        }

        toast.success(
          `Yükleme tamamlandı: ${result.totalRows} satır, ${result.successfulChunks} chunk başarılı`
        );

        return result;
      });
    } catch (error: any) {
      if (error.message !== 'İşlem iptal edildi') {
        toast.error(`Yükleme hatası: ${error.message}`);
        if (onError) {
          onError(error);
        }
      }
    } finally {
      // Input'u temizle
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getAcceptTypes = (): string => {
    const types: string[] = [];
    if (fileType === 'csv' || fileType === 'both') {
      types.push('.csv');
    }
    if (fileType === 'excel' || fileType === 'both') {
      types.push('.xlsx', '.xls');
    }
    return types.join(',');
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Progress Bar */}
      {uploadTask.isRunning && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressBar
            value={uploadTask.progress}
            onCancel={uploadTask.cancel}
            label={progressLabel}
            showPercentage={true}
          />
        </div>
      )}

      {/* File Input */}
      <label
        style={{
          padding: '12px 24px',
          backgroundColor: uploadTask.isRunning ? '#9ca3af' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: uploadTask.isRunning ? 'not-allowed' : 'pointer',
          opacity: uploadTask.isRunning ? 0.6 : 1,
          display: 'inline-block',
          fontWeight: 500,
          ...buttonStyle,
        }}
      >
        {uploadTask.isRunning ? 'Yükleniyor...' : buttonText}
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          onChange={handleFileSelect}
          disabled={uploadTask.isRunning}
          style={{ display: 'none' }}
        />
      </label>

      {/* Hata mesajı */}
      {uploadTask.error && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          Hata: {uploadTask.error.message}
        </div>
      )}

      {/* Başarı mesajı */}
      {uploadTask.result && !uploadTask.isRunning && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#d1fae5',
            color: '#065f46',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          ✅ Yükleme tamamlandı: {uploadTask.result.totalRows} satır işlendi
        </div>
      )}
    </div>
  );
}

