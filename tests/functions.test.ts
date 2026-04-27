/**
 * Cloud Function Unit Tests
 * Teklifbul Rule v1.0 - Firestore autocomplete: Token generation tests
 */

import { describe, test, expect } from 'vitest';
// Import pure helper functions (no Cloud Functions SDK side effects)
import { buildSearchTokens, normalizeTRForSearch, normalizeSkuForSearch, tokensChanged } from '../functions/src/lib/stockSearchTokens';

describe('Stock Search Tokens - Unit Tests', () => {
  describe('normalizeTRForSearch', () => {
    test('should normalize Turkish characters', () => {
      expect(normalizeTRForSearch('Şarjlı')).toContain('sarj');
      expect(normalizeTRForSearch('ÇİMENTO')).toContain('cimento');
      expect(normalizeTRForSearch('Öğrenci')).toContain('ogrenci');
      expect(normalizeTRForSearch('Ürün')).toContain('urun');
    });
    
    test('should convert to lowercase', () => {
      expect(normalizeTRForSearch('GALVANIZ')).toBe('galvaniz');
    });
    
    test('should remove special characters', () => {
      expect(normalizeTRForSearch('Test-123!@#')).toBe('test 123');
    });
    
    test('should handle empty string', () => {
      expect(normalizeTRForSearch('')).toBe('');
      expect(normalizeTRForSearch('   ')).toBe('');
    });
  });
  
  describe('normalizeSkuForSearch', () => {
    test('should keep hyphens and underscores', () => {
      expect(normalizeSkuForSearch('VD-04')).toBe('vd-04');
      expect(normalizeSkuForSearch('SKU_TEST-123')).toBe('sku_test-123');
    });
    
    test('should convert to lowercase', () => {
      expect(normalizeSkuForSearch('VD-04')).toBe('vd-04');
    });
    
    test('should normalize Turkish characters', () => {
      expect(normalizeSkuForSearch('ŞARJ-01')).toBe('sarj-01');
    });
    
    test('should remove spaces', () => {
      expect(normalizeSkuForSearch('VD 04')).toBe('vd04');
    });
    
    test('should remove special characters except - and _', () => {
      expect(normalizeSkuForSearch('VD-04!@#')).toBe('vd-04');
      expect(normalizeSkuForSearch('SKU_TEST_123')).toBe('sku_test_123');
    });
    
    test('should handle empty string', () => {
      expect(normalizeSkuForSearch('')).toBe('');
      expect(normalizeSkuForSearch('   ')).toBe('');
    });
  });
  
  describe('buildSearchTokens', () => {
    test('should generate tokens for "Galvaniz Vida"', () => {
      const tokens = buildSearchTokens('Galvaniz Vida', '', '');
      
      // Should contain prefixes from "galvaniz"
      expect(tokens).toContain('ga');
      expect(tokens).toContain('gal');
      expect(tokens).toContain('galv');
      
      // Should contain prefixes from "vida"
      expect(tokens).toContain('vi');
      expect(tokens).toContain('vid');
      expect(tokens).toContain('vida');
    });
    
    test('should generate tokens for Turkish text "Şarjlı"', () => {
      const tokens = buildSearchTokens('Şarjlı', '', '');
      
      // Should normalize and generate prefixes
      expect(tokens).toContain('sa');
      expect(tokens).toContain('sar');
      expect(tokens).toContain('sarj');
    });
    
    test('should include SKU in tokens', () => {
      const tokens = buildSearchTokens('Test Product', 'VD-04', '');
      
      expect(tokens).toContain('vd');
      expect(tokens).toContain('vd-');
      expect(tokens).toContain('vd-0');
      expect(tokens).toContain('vd-04');
    });
    
    test('should include barcode in tokens', () => {
      const tokens = buildSearchTokens('Product', 'SKU-1', '1234567890');
      
      // Should include barcode prefixes
      expect(tokens.some(t => t.startsWith('12'))).toBe(true);
    });
    
    test('should limit tokens to max 250', () => {
      // Create a very long product name
      const longName = 'A'.repeat(100) + ' ' + 'B'.repeat(100) + ' ' + 'C'.repeat(100);
      const tokens = buildSearchTokens(longName, '', '');
      
      expect(tokens.length).toBeLessThanOrEqual(250);
    });
    
    test('should generate prefixes 2-10 characters', () => {
      const tokens = buildSearchTokens('Galvaniz', '', '');
      
      // Should have 2-char prefix
      expect(tokens).toContain('ga');
      // Should have 10-char prefix (if word is long enough)
      const tenCharPrefix = tokens.find(t => t.length === 10);
      if (tenCharPrefix) {
        expect(tenCharPrefix).toBe('galvaniz');
      }
      // Should not have 1-char prefix
      expect(tokens.every(t => t.length >= 2)).toBe(true);
      // Should not have >10-char prefix
      expect(tokens.every(t => t.length <= 10)).toBe(true);
    });
    
    test('should return empty array for empty input', () => {
      expect(buildSearchTokens('', '', '')).toEqual([]);
      expect(buildSearchTokens('   ', '', '')).toEqual([]);
    });
    
    test('should be deterministic (same input = same output)', () => {
      const tokens1 = buildSearchTokens('Galvaniz Vida', 'VD-04', '123');
      const tokens2 = buildSearchTokens('Galvaniz Vida', 'VD-04', '123');
      
      expect(tokens1.sort()).toEqual(tokens2.sort());
    });
  });
  
  describe('tokensChanged', () => {
    test('should return true when tokens are different', () => {
      const newTokens = ['ga', 'gal', 'vida'];
      const oldTokens = ['ga', 'gal'];
      
      expect(tokensChanged(newTokens, oldTokens)).toBe(true);
    });
    
    test('should return false when tokens are the same', () => {
      const tokens = ['ga', 'gal', 'vida'];
      
      expect(tokensChanged(tokens, tokens)).toBe(false);
      expect(tokensChanged(tokens, [...tokens])).toBe(false);
    });
    
    test('should return true when oldTokens is null or undefined', () => {
      const newTokens = ['ga', 'gal'];
      
      expect(tokensChanged(newTokens, null)).toBe(true);
      expect(tokensChanged(newTokens, undefined)).toBe(true);
    });
    
    test('should handle empty arrays', () => {
      expect(tokensChanged([], [])).toBe(false);
      expect(tokensChanged(['ga'], [])).toBe(true);
      expect(tokensChanged([], ['ga'])).toBe(true);
    });
    
    test('should ignore token order', () => {
      const tokens1 = ['ga', 'gal', 'vida'];
      const tokens2 = ['vida', 'ga', 'gal'];
      
      expect(tokensChanged(tokens1, tokens2)).toBe(false);
    });
  });
});

describe('Autocomplete Token Selection - Helper Tests', () => {
  // These tests verify the client-side token generation logic
  // (matching the logic in scripts/sale-new-form.js)
  
  function generateSearchTokensForQuery(text) {
    const normalizeTR = (text) => {
      if (!text || typeof text !== 'string') return '';
      return text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    const normalized = normalizeTR(text);
    const words = normalized.split(/\s+/).filter(Boolean);
    const tokens = new Set();
    
    if (words.length === 1) {
      // Single word: generate prefixes 2-10 chars
      const word = words[0];
      for (let i = 2; i <= Math.min(10, word.length); i++) {
        tokens.add(word.slice(0, i));
      }
      return Array.from(tokens);
    } else {
      // Multiple words: generate prefixes from each word, limit to first 10 tokens
      for (const word of words) {
        for (let i = 2; i <= Math.min(10, word.length); i++) {
          if (tokens.size >= 10) break;
          tokens.add(word.slice(0, i));
        }
        if (tokens.size >= 10) break;
      }
      return Array.from(tokens).slice(0, 10);
    }
  }
  
  test('single word input should generate multiple tokens', () => {
    const tokens = generateSearchTokensForQuery('galvaniz');
    
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens).toContain('ga');
    expect(tokens).toContain('gal');
  });
  
  test('multiple word input should limit to 10 tokens', () => {
    const tokens = generateSearchTokensForQuery('galvaniz vida çelik boru');
    
    expect(tokens.length).toBeLessThanOrEqual(10);
  });
  
  test('min 2 characters should be enforced', () => {
    const tokens = generateSearchTokensForQuery('a');
    
    expect(tokens.length).toBe(0);
  });
  
  test('should handle Turkish characters in query', () => {
    const tokens = generateSearchTokensForQuery('şarjlı');
    
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some(t => t.startsWith('sa'))).toBe(true);
  });
});


