/**
 * Teklifbul Rule v1.0 — Search-first stock catalog queries (no 2000-doc dump)
 */
import {
  collection, getDocs, query, where, limit as fsLimit, orderBy, startAfter,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { buildQuerySearchTokens } from '../../../src/shared/stock-query-tokens.js';
import { STOCK_LIST_PAGE_SIZE, STOCK_SEARCH_QUERY_LIMIT, FIRESTORE_IN_QUERY_LIMIT, STOCK_CATALOG_MAX_PAGES } from '../../../src/shared/constants/timing.js';
import { searchStocks as filterStocksClient } from '../../../scripts/lib/stock-search.js';
import { logger } from '../../../src/shared/log/logger.js';

function isActiveStock(data) {
  return data?.isActive !== false;
}

export async function findCompanyStockBySku(db, companyId, sku) {
  const skuUpper = String(sku || '').trim();
  if (!db || !companyId || !skuUpper) return null;
  const stocksQuery = query(
    collection(db, 'stocks'),
    where('companyId', '==', companyId),
    where('sku', '==', skuUpper),
    fsLimit(1)
  );
  const snap = await getDocs(stocksQuery);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  if (!isActiveStock(data)) return null;
  return { id: snap.docs[0].id, ...data };
}

export async function searchCompanyStocks(db, companyId, searchText, resultLimit = 10) {
  const text = String(searchText || '').trim();
  if (!db || !companyId || text.length < 2) return [];

  const tokens = buildQuerySearchTokens(text).slice(0, 10);
  let results = [];

  if (tokens.length > 0) {
    try {
      const tokenQuery = tokens.length === 1
        ? query(
          collection(db, 'stocks'),
          where('companyId', '==', companyId),
          where('searchTokens', 'array-contains', tokens[0]),
          fsLimit(STOCK_SEARCH_QUERY_LIMIT)
        )
        : query(
          collection(db, 'stocks'),
          where('companyId', '==', companyId),
          where('searchTokens', 'array-contains-any', tokens),
          fsLimit(STOCK_SEARCH_QUERY_LIMIT)
        );
      const snap = await getDocs(tokenQuery);
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (isActiveStock(data)) results.push({ id: docSnap.id, ...data });
      });
    } catch (error) {
      logger.warn('searchTokens stok sorgusu başarısız, sayfa fallback', error);
    }
  }

  if (results.length === 0) {
    const pageQuery = query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      fsLimit(STOCK_LIST_PAGE_SIZE)
    );
    const pageSnap = await getDocs(pageQuery);
    const pageRows = [];
    pageSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (isActiveStock(data)) pageRows.push({ id: docSnap.id, ...data });
    });
    results = filterStocksClient(pageRows, text, resultLimit);
  } else {
    results = filterStocksClient(results, text, resultLimit);
  }

  return results.slice(0, resultLimit);
}

export async function findCompanyStocksBySkus(db, companyId, skus) {
  const unique = [...new Set((skus || []).map((sku) => String(sku || '').trim()).filter(Boolean))];
  const bySku = new Map();
  for (let i = 0; i < unique.length; i += FIRESTORE_IN_QUERY_LIMIT) {
    const chunk = unique.slice(i, i + FIRESTORE_IN_QUERY_LIMIT);
    const snap = await getDocs(query(
      collection(db, 'stocks'),
      where('companyId', '==', companyId),
      where('sku', 'in', chunk)
    ));
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!isActiveStock(data)) return;
      const sku = String(data.sku || '').trim();
      if (!sku) return;
      const list = bySku.get(sku) || [];
      list.push({ id: docSnap.id, ...data });
      bySku.set(sku, list);
    });
  }
  return bySku;
}

export async function loadCompanyStocksPaged(db, companyId) {
  const rows = [];
  if (!db || !companyId) return { rows, capped: false };
  let lastDoc = null;
  let capped = false;
  for (let page = 0; page < STOCK_CATALOG_MAX_PAGES; page++) {
    const pageQuery = lastDoc
      ? query(
        collection(db, 'stocks'),
        where('companyId', '==', companyId),
        orderBy('sku'),
        startAfter(lastDoc),
        fsLimit(STOCK_LIST_PAGE_SIZE)
      )
      : query(
        collection(db, 'stocks'),
        where('companyId', '==', companyId),
        orderBy('sku'),
        fsLimit(STOCK_LIST_PAGE_SIZE)
      );
    let snap;
    try {
      snap = await getDocs(pageQuery);
    } catch (error) {
      logger.warn('paged stock query failed, single page fallback', error);
      snap = await getDocs(query(
        collection(db, 'stocks'),
        where('companyId', '==', companyId),
        fsLimit(STOCK_LIST_PAGE_SIZE)
      ));
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (isActiveStock(data)) rows.push({ id: docSnap.id, ...data });
      });
      return { rows, capped: snap.size >= STOCK_LIST_PAGE_SIZE };
    }
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (isActiveStock(data)) rows.push({ id: docSnap.id, ...data });
    });
    if (snap.empty || snap.size < STOCK_LIST_PAGE_SIZE) {
      capped = false;
      break;
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (page === STOCK_CATALOG_MAX_PAGES - 1) capped = true;
  }
  return { rows, capped };
}
