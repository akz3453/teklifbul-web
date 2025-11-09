/**
 * useCancellableTask Hook
 * Teklifbul Rule v1.0
 * 
 * Uzun async işlemler için progress tracking ve cancel desteği
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { runCancellable, type CancellableTask } from '../utils/async-utils';

interface UseCancellableTaskResult<T> {
  progress: number;
  isRunning: boolean;
  error: Error | null;
  result: T | null;
  start: (task: (signal: AbortSignal, report?: (p: number) => void) => Promise<T>) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useCancellableTask<T>(): UseCancellableTaskResult<T> {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const taskRef = useRef<CancellableTask<T> | null>(null);

  const start = useCallback(async (
    task: (signal: AbortSignal, report?: (p: number) => void) => Promise<T>
  ) => {
    // Önceki task varsa iptal et
    if (taskRef.current) {
      taskRef.current.cancel();
    }

    setIsRunning(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const cancellable = await runCancellable(task, setProgress);
      taskRef.current = cancellable;

      const result = await cancellable.promise;
      setResult(result);
      setProgress(100);
    } catch (err) {
      if (err instanceof Error && err.message === 'İşlem iptal edildi') {
        // İptal edildi, hata gösterme
        setProgress(0);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsRunning(false);
      taskRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (taskRef.current) {
      taskRef.current.cancel();
      setIsRunning(false);
      setProgress(0);
      taskRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setProgress(0);
    setError(null);
    setResult(null);
  }, [cancel]);

  // Component unmount olduğunda task'ı iptal et
  useEffect(() => {
    return () => {
      if (taskRef.current) {
        taskRef.current.cancel();
      }
    };
  }, []);

  return {
    progress,
    isRunning,
    error,
    result,
    start,
    cancel,
    reset
  };
}

