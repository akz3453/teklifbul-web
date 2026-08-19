"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.debounce = debounce;
exports.debounceImmediate = debounceImmediate;
function debounce(func, wait) {
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
 */
function debounceImmediate(func, wait) {
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
        }
        else {
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(later, wait);
        }
    };
}
