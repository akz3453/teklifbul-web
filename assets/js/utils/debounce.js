/**
 * Debounce Utility
 * Teklifbul Rule v1.0
 * 
 * Delays the execution of a function until after a specified wait time
 * has elapsed since the last time it was invoked.
 * 
 * @example
 * import { debounce } from './utils/debounce.js';
 * 
 * const debouncedSearch = debounce((query) => {
 *   console.log('Searching for:', query);
 * }, 300);
 * 
 * input.addEventListener('input', (e) => {
 *   debouncedSearch(e.target.value);
 * });
 */

/**
 * @template {(...args: any[]) => any} T
 * @param {T} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {(...args: Parameters<T>) => void}
 */
export function debounce(func, wait) {
  let timeout = null;
  
  return function executedFunction(...args) {
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
 * 
 * @template {(...args: any[]) => any} T
 * @param {T} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {(...args: Parameters<T>) => void}
 */
export function debounceImmediate(func, wait) {
  let timeout = null;
  let isFirstCall = true;
  
  return function executedFunction(...args) {
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

