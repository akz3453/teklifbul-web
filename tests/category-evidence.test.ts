import { describe, test, expect } from 'vitest';
import { extractEvidenceTokens, evaluateAutoApprove } from '../src/routing/category-evidence.js';

describe('Category Evidence (learning dictionary)', () => {
  test('extractEvidenceTokens returns stable top tokens', () => {
    const tokens = extractEvidenceTokens('Çimento Portland 42,5 R torba 50kg', { maxTokens: 3 });
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens).toContain('cimento');
  });

  test('evaluateAutoApprove gates auto by total/ratio/margin', () => {
    // qualifies: total 20, top 18 (0.9), second 1 (margin 17)
    expect(evaluateAutoApprove({ total: 20, votes: { 'CAT.INS': 18, 'CAT.TEM': 1, 'CAT.OTHER': 1 } }).status).toBe('auto');

    // fails ratio
    expect(evaluateAutoApprove({ total: 10, votes: { 'CAT.INS': 8, 'CAT.TEM': 2 } }).status).toBe('learning');

    // fails margin
    expect(evaluateAutoApprove({ total: 10, votes: { 'CAT.INS': 9, 'CAT.TEM': 7 } }).status).toBe('learning');
  });
});


