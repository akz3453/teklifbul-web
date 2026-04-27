// Teklifbul Rule v1.0
// Firestore operations for stock movements history (pagination + export)

import { db } from '../../../firebase.js';
import { logger } from '../../../src/shared/log/logger.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * @typedef {Object} MovementPageCursor
 * @property {any} lastDoc - Firestore DocumentSnapshot
 */

/**
 * @param {Object} params
 * @param {string} params.stockId
 * @param {Date|null} params.startDate
 * @param {Date|null} params.endDate
 * @param {number} params.pageSize
 * @param {any|null} params.cursorDoc
 */
export async function fetchStockMovementsPage({
  stockId,
  startDate = null,
  endDate = null,
  locationId = null,
  pageSize = 50,
  cursorDoc = null,
}) {
  logger.group('stock-movements:fetchPage');
  try {
    const constraints = [where('stockId', '==', stockId), orderBy('createdAt', 'desc'), limit(pageSize)];

    if (startDate instanceof Date) {
      constraints.unshift(where('createdAt', '>=', Timestamp.fromDate(startDate)));
    }

    if (endDate instanceof Date) {
      // inclusive end-date: end of day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      constraints.unshift(where('createdAt', '<=', Timestamp.fromDate(end)));
    }

    if (locationId) {
      constraints.unshift(where('locationId', '==', locationId));
    }

    if (cursorDoc) constraints.push(startAfter(cursorDoc));

    const q = query(collection(db, 'stock_movements'), ...constraints);
    const snap = await getDocs(q);

    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nextCursorDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

    logger.info('Page loaded', { count: items.length, hasNext: !!nextCursorDoc });
    logger.end();
    return { items, nextCursorDoc };
  } catch (err) {
    logger.error('fetchStockMovementsPage error', err);
    logger.end();
    throw err;
  }
}

/**
 * Async generator that yields batches for export.
 * @param {Object} params
 * @param {string} params.stockId
 * @param {Date} params.startDate
 * @param {Date} params.endDate
 * @param {number} params.batchSize
 * @param {() => boolean} params.isCancelled
 */
export async function* iterateStockMovementsForExport({
  stockId,
  startDate = null,
  endDate = null,
  batchSize = 500,
  isCancelled,
}) {
  logger.group('stock-movements:iterateExport');
  try {
    let cursorDoc = null;
    let total = 0;
     
    while (true) {
      if (isCancelled && isCancelled()) {
        logger.warn('Export cancelled before batch', { total });
        break;
      }

      const { items, nextCursorDoc } = await fetchStockMovementsPage({
        stockId,
        startDate,
        endDate,
        pageSize: batchSize,
        cursorDoc,
      });

      if (!items.length) break;
      total += items.length;
      yield { items, total };

      cursorDoc = nextCursorDoc;
      if (!cursorDoc) break;
    }
  } finally {
    logger.end();
  }
}


