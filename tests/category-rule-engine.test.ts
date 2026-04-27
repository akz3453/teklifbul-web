import { describe, test, expect } from 'vitest';
import { normalizeForRule, matchRules } from '../src/routing/category-rule-engine.js';

describe('Category Rule Engine (AI-less)', () => {
  test('normalizeForRule normalizes Turkish + punctuation', () => {
    expect(normalizeForRule('ÇİMENTO 42,5 R!')).toBe('cimento 42 5 r');
    expect(normalizeForRule('Şarjlı Matkap')).toBe('sarjli matkap');
  });

  test('matchRules picks highest priority match', () => {
    const rules = [
      { ruleId: 'r1', pattern: 'cimento', matchType: 'contains', categoryIds: ['CAT.INS'], priority: 50, isActive: true },
      { ruleId: 'r2', pattern: 'cimento', matchType: 'contains', categoryIds: ['CAT.INS2'], priority: 200, isActive: true },
    ];
    const res = matchRules('Portland Çimento 42,5', rules as any);
    expect(res.categoryIds[0]).toBe('CAT.INS2');
    expect(res.matchedRuleIds).toContain('r2');
  });

  test('matchRules supports prefix', () => {
    const rules = [
      { ruleId: 'r1', pattern: 'priz', matchType: 'prefix', categoryIds: ['CAT.ELEKTRIK'], priority: 100, isActive: true },
    ];
    const res = matchRules('Priz anahtar seti', rules as any);
    expect(res.categoryIds).toEqual(['CAT.ELEKTRIK']);
    expect(res.score).toBeGreaterThanOrEqual(0.8);
  });
});


