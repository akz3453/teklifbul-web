/**
 * AI Daily Counter Service
 * Teklifbul Rule v3.1 - Daily Counter Visibility
 * 
 * Helper to get today's paid token usage from counter doc
 */

import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';

/**
 * Get today's paid used tokens from counter doc
 * @param companyId Company ID
 * @returns { dateKey: string, paidUsedTokens: number }
 */
export async function getTodayPaidUsedTokens(companyId: string): Promise<{ dateKey: string; paidUsedTokens: number }> {
  const db = await getAdminDb();
  if (!db) {
    logger.warn('Database unavailable for daily counter', { companyId });
    return { dateKey: '', paidUsedTokens: 0 };
  }

  // Generate today key (YYYY-MM-DD UTC)
  const now = new Date();
  const dateKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  try {
    const counterRef = db.collection('companies').doc(companyId).collection('aiDailyCounters').doc(dateKey);
    const counterSnap = await counterRef.get();

    if (counterSnap.exists) {
      const counterData = counterSnap.data() || {};
      const paidUsedTokens = Number(counterData.paidUsedTokens || 0);
      return { dateKey, paidUsedTokens };
    }

    // Counter doc yoksa 0 döndür
    return { dateKey, paidUsedTokens: 0 };
  } catch (err) {
    logger.warn('Failed to get today paid used tokens', { companyId, dateKey, error: err });
    return { dateKey, paidUsedTokens: 0 };
  }
}

