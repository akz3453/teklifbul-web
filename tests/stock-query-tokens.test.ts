import { describe, expect, test } from 'vitest';
import { buildQuerySearchTokens } from '../src/shared/stock-query-tokens.js';
import { STOCK_LIST_PAGE_SIZE, STOCK_SEARCH_QUERY_LIMIT, STOCK_MATCH_QUERY_LIMIT, STOCK_CATALOG_MAX_PAGES, STOCK_MOVEMENTS_REPORT_QUERY_LIMIT, STOCK_BALANCES_QUERY_LIMIT, INTERNAL_DEMANDS_QUERY_LIMIT, COMPANY_MEMBERS_QUERY_LIMIT, CUSTOMERS_QUERY_LIMIT } from '../src/shared/constants/timing.js';

describe('stock search query tokens', () => {
  test('builds prefix tokens without dumping the catalog', () => {
    const tokens = buildQuerySearchTokens('Çimento 32 kg');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.length).toBeLessThanOrEqual(10);
    expect(tokens.some((t) => t.startsWith('cim'))).toBe(true);
  });

  test('list/search page sizes stay below 2000-doc dumps', () => {
    expect(STOCK_SEARCH_QUERY_LIMIT).toBeLessThanOrEqual(50);
    expect(STOCK_LIST_PAGE_SIZE).toBeLessThanOrEqual(200);
    expect(STOCK_MATCH_QUERY_LIMIT).toBeLessThanOrEqual(200);
    expect(STOCK_LIST_PAGE_SIZE * STOCK_CATALOG_MAX_PAGES).toBeLessThanOrEqual(2000);
    expect(STOCK_MOVEMENTS_REPORT_QUERY_LIMIT).toBeLessThanOrEqual(500);
    expect(STOCK_BALANCES_QUERY_LIMIT).toBeLessThanOrEqual(1000);
    expect(INTERNAL_DEMANDS_QUERY_LIMIT).toBeLessThanOrEqual(200);
    expect(COMPANY_MEMBERS_QUERY_LIMIT).toBeLessThanOrEqual(200);
    expect(CUSTOMERS_QUERY_LIMIT).toBeLessThanOrEqual(1000);
  });
});
