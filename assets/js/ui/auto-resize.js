/**
 * Auto-resize Textarea Utility
 * Automatically adjusts textarea height based on content
 */

/**
 * Initialize auto-resize functionality for textareas
 * @param {string|Element} selector - CSS selector or element
 */
export function initAutoResize(selector = '.auto-resize') {
  const elements = typeof selector === 'string' 
    ? document.querySelectorAll(selector)
    : [selector];
  
  elements.forEach(textarea => {
    if (textarea.tagName === 'TEXTAREA') {
      setupAutoResize(textarea);
    }
  });
}

/**
 * Setup auto-resize for a single textarea
 * @param {HTMLTextAreaElement} textarea - Textarea element
 */
function setupAutoResize(textarea) {
  // Set initial height
  adjustHeight(textarea);
  
  // Add event listeners
  textarea.addEventListener('input', () => adjustHeight(textarea));
  textarea.addEventListener('paste', () => {
    // Delay to allow paste content to be processed
    setTimeout(() => adjustHeight(textarea), 0);
  });
  
  // Handle window resize
  window.addEventListener('resize', () => adjustHeight(textarea));
}

/**
 * Adjust textarea height based on content
 * @param {HTMLTextAreaElement} textarea - Textarea element
 */
function adjustHeight(textarea) {
  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = 'auto';
  
  // Calculate new height based on content
  const scrollHeight = textarea.scrollHeight;
  const minHeight = parseInt(textarea.getAttribute('data-min-height')) || 32;
  const maxHeight = parseInt(textarea.getAttribute('data-max-height')) || 200;
  
  // Apply height constraints
  const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
  
  textarea.style.height = `${newHeight}px`;
  
  // Show scrollbar if content exceeds max height
  textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
}

/**
 * Auto-resize all textareas on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  initAutoResize();
});

/**
 * Re-initialize auto-resize for dynamically added textareas
 * @param {Element} container - Container to search within
 */
export function reinitAutoResize(container = document) {
  const textareas = container.querySelectorAll('textarea.auto-resize');
  textareas.forEach(textarea => {
    if (!textarea.dataset.autoResizeInitialized) {
      setupAutoResize(textarea);
      textarea.dataset.autoResizeInitialized = 'true';
    }
  });
}
