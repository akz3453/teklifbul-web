/**
 * Debounce Utility
 * Teklifbul Rule v1.0
 * 
 * Delays the execution of a function until after a specified wait time
 * has elapsed since the last time it was invoked.
 * 
 * @example
 * const debouncedSearch = debounce((query) => {
 *   console.log('Searching for:', query);
 * }, 300);
 * 
 * input.addEventListener('input', (e) => {
 *   debouncedSearch(e.target.value);
 * });
 */

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Debounce with immediate execution option
 * Executes the function immediately on the first call, then debounces subsequent calls
 */
export function debounceImmediate<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let isFirstCall = true;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      isFirstCall = false;
      func(...args);
    };
    
    if (isFirstCall) {
      func(...args);
      isFirstCall = false;
    } else {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(later, wait);
    }
  };
}

