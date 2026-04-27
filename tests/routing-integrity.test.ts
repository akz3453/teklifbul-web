import { describe, test, expect } from 'vitest';
import { recomputeDerivedFromItems, isSameSet } from '../src/routing/routing-integrity.js';

describe('TEKLİFBUL Routing Integrity (pure helpers)', () => {
  test('recomputeDerivedFromItems unions itemCategoryIds (dedupe + drop falsy)', () => {
    const items = [
      { itemCategoryIds: ['CAT.X', 'CAT.Y', ''] },
      { itemCategoryIds: ['CAT.Y', 'CAT.Z'] },
      { itemCategoryIds: null as any },
      {} as any
    ];
    const out = recomputeDerivedFromItems(items);
    expect(new Set(out)).toEqual(new Set(['CAT.X', 'CAT.Y', 'CAT.Z']));
  });

  test('isSameSet compares as sets (order/dupes ignored)', () => {
    expect(isSameSet(['A', 'B', 'B'], ['B', 'A'])).toBe(true);
    expect(isSameSet(['A', 'B'], ['A', 'C'])).toBe(false);
  });
});


