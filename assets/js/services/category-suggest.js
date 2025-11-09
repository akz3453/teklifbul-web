/**
 * Category Suggestion Service
 * Teklifbul Rule v1.0
 * API: /api/categories/suggest
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';

const API_BASE = window.API_URL || 'http://localhost:5174';

/**
 * Debounce helper
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Suggest categories based on text
 * @param {string} text - Input text
 * @returns {Promise<{query: string, suggestions: Array, auto_select: string|null}>}
 */
export async function suggestCategories(text) {
  if (!text || text.trim().length < 3) {
    return { query: text, suggestions: [], auto_select: null };
  }

  try {
    const response = await fetch(`${API_BASE}/api/categories/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.warn('Category suggestion failed', error);
    return { query: text, suggestions: [], auto_select: null };
  }
}

/**
 * Get category details (description, examples)
 * @param {string|number} categoryId - Category ID or name
 * @returns {Promise<{id: number, name: string, short_desc?: string, examples?: string[]}>}
 */
export async function getCategoryDetails(categoryId) {
  try {
    const response = await fetch(`${API_BASE}/api/categories/${categoryId}?withDesc=true`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    logger.warn('Get category details failed', error);
    return null;
  }
}

/**
 * Get all categories with descriptions
 * @param {string} searchTerm - Optional search term
 * @returns {Promise<Array>}
 */
export async function getCategoriesWithDesc(searchTerm = '') {
  try {
    const params = new URLSearchParams({ withDesc: 'true', size: '100' });
    if (searchTerm) {
      params.append('q', searchTerm);
    }
    const response = await fetch(`${API_BASE}/api/categories?${params}`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch (error) {
    logger.warn('Get categories failed', error);
    return [];
  }
}

/**
 * Save user feedback for category suggestion
 * @param {Object} feedback - {request_id?, suggested_category_id?, chosen_category_id?, query}
 */
export async function saveCategoryFeedback(feedback) {
  try {
    await fetch(`${API_BASE}/api/categories/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback)
    });
  } catch (error) {
    logger.warn('Save feedback failed', error);
  }
}

/**
 * Create debounced suggestion function
 */
export const debouncedSuggest = debounce(async (text, callback) => {
  const result = await suggestCategories(text);
  if (callback) callback(result);
}, 300);

