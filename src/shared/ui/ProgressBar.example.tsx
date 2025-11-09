/**
 * ProgressBar Kullanım Örneği
 * Teklifbul Rule v1.0
 */

import React from 'react';
import { ProgressBar } from './ProgressBar';
import { useCancellableTask } from '../hooks/useCancellableTask';
import { checkAborted, calculateBatchProgress } from '../utils/async-utils';

/**
 * Örnek: Uzun süren bir işlem (örneğin Excel export)
 */
export function ExampleProgressUsage() {
  const { progress, isRunning, error, result, start, cancel, reset } = useCancellableTask<Blob>();

  const handleExport = async () => {
    await start(async (signal, report) => {
      // Örnek: 100 item'ı işle
      const totalItems = 100;
      const results: any[] = [];

      for (let i = 0; i < totalItems; i++) {
        // İptal kontrolü
        checkAborted(signal);

        // İşlem simülasyonu
        await new Promise(resolve => setTimeout(resolve, 50));

        // Progress güncelle
        const currentProgress = calculateBatchProgress(i + 1, totalItems);
        if (report) {
          report(currentProgress);
        }

        results.push({ id: i, processed: true });
      }

      // Sonuç oluştur (örnek: Blob)
      return new Blob([JSON.stringify(results)], { type: 'application/json' });
    });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>Excel Export Örneği</h2>

      {isRunning && (
        <ProgressBar
          value={progress}
          onCancel={cancel}
          label="Excel dosyası oluşturuluyor..."
          showPercentage={true}
        />
      )}

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '4px',
          marginTop: '12px'
        }}>
          Hata: {error.message}
        </div>
      )}

      {result && !isRunning && (
        <div style={{
          padding: '12px',
          backgroundColor: '#d1fae5',
          color: '#065f46',
          borderRadius: '4px',
          marginTop: '12px'
        }}>
          ✅ İşlem tamamlandı! ({Math.round((result.size / 1024) * 100) / 100} KB)
        </div>
      )}

      <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
        <button
          onClick={handleExport}
          disabled={isRunning}
          style={{
            padding: '10px 20px',
            backgroundColor: isRunning ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            fontWeight: 500
          }}
        >
          {isRunning ? 'İşleniyor...' : 'Excel Export Başlat'}
        </button>

        {result && !isRunning && (
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Sıfırla
          </button>
        )}
      </div>
    </div>
  );
}

