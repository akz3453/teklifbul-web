"use strict";
/**
 * useCancellableTask Hook
 * Teklifbul Rule v1.0
 *
 * Uzun async işlemler için progress tracking ve cancel desteği
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCancellableTask = useCancellableTask;
const react_1 = require("react");
const async_utils_1 = require("../utils/async-utils");
function useCancellableTask() {
    const [progress, setProgress] = (0, react_1.useState)(0);
    const [isRunning, setIsRunning] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [result, setResult] = (0, react_1.useState)(null);
    const taskRef = (0, react_1.useRef)(null);
    const start = (0, react_1.useCallback)(async (task) => {
        // Önceki task varsa iptal et
        if (taskRef.current) {
            taskRef.current.cancel();
        }
        setIsRunning(true);
        setProgress(0);
        setError(null);
        setResult(null);
        try {
            const cancellable = await (0, async_utils_1.runCancellable)(task, setProgress);
            taskRef.current = cancellable;
            const result = await cancellable.promise;
            setResult(result);
            setProgress(100);
        }
        catch (err) {
            if (err instanceof Error && err.message === 'İşlem iptal edildi') {
                // İptal edildi, hata gösterme
                setProgress(0);
            }
            else {
                setError(err instanceof Error ? err : new Error(String(err)));
            }
        }
        finally {
            setIsRunning(false);
            taskRef.current = null;
        }
    }, []);
    const cancel = (0, react_1.useCallback)(() => {
        if (taskRef.current) {
            taskRef.current.cancel();
            setIsRunning(false);
            setProgress(0);
            taskRef.current = null;
        }
    }, []);
    const reset = (0, react_1.useCallback)(() => {
        cancel();
        setProgress(0);
        setError(null);
        setResult(null);
    }, [cancel]);
    // Component unmount olduğunda task'ı iptal et
    (0, react_1.useEffect)(() => {
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
