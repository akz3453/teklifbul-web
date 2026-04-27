import { describe, test, expect } from 'vitest';
import { unionDerivedCategoryIds, intersectSupplierDemandCats, poolThreshold } from '../src/routing/routing-utils.js';

describe('TEKLİFBUL Routing Utils (pure) - regression tests', () => {
  test('unionDerivedCategoryIds unions itemCategoryIds (dedupe + drop falsy)', () => {
    const items = [
      { itemCategoryIds: ['CAT.A', 'CAT.B', ''] },
      { itemCategoryIds: ['CAT.B', 'CAT.C', null as any] },
      { itemCategoryIds: undefined },
      {} as any
    ];
    const derived = unionDerivedCategoryIds(items);
    expect(new Set(derived)).toEqual(new Set(['CAT.A', 'CAT.B', 'CAT.C']));
  });

  test('intersectSupplierDemandCats returns intersection in derived order', () => {
    const supplierCats = ['CAT.B', 'CAT.C'];
    const derived = ['CAT.A', 'CAT.C', 'CAT.B'];
    expect(intersectSupplierDemandCats(supplierCats, derived)).toEqual(['CAT.C', 'CAT.B']);
  });

  test('poolThreshold routes to pool when count > MAX', () => {
    expect(poolThreshold(201, 200).routingMode).toBe('pool');
    expect(poolThreshold(200, 200).routingMode).toBe('direct');
    expect(poolThreshold(0, 200).routingMode).toBe('direct');
  });

  test('poolThreshold handles non-numbers defensively', () => {
    expect(poolThreshold(NaN as any, 200).routingMode).toBe('direct');
    expect(poolThreshold(250, NaN as any).routingMode).toBe('pool');
  });
});


