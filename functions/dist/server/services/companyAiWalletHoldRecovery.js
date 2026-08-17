/**
 * Stuck AI token hold recovery (H-007A)
 * Teklifbul Rule v1.0
 *
 * Only reserved holds older than TTL are touched.
 * Provider-success / capture_pending → capture (never release).
 * Provider-fail / timeout → release.
 * Unknown pending crash → needs_reconciliation (no wallet mutation).
 *
 * Pagination: recon holds stay status=reserved and would starve a single
 * limit-50 page. Pages walk createdAtMs ASC via startAfter on the existing
 * (status, createdAtMs) index. Recon/in-flight holds are skipped, then the
 * next page is fetched until the scan budget is exhausted.
 */
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { AI_HOLD_BILLING_STATUS, AI_HOLD_PROVIDER_STATUS, AI_TOKEN_HOLD_STATUS, buildAiTokenHoldId, captureCompanyTokensTransactional, getAiHoldTtlMs, isHoldProviderSuccessPendingCapture, markCompanyAiHoldNeedsReconciliation, releaseCompanyTokensTransactional, } from './companyAiWalletService.js';
/** Firestore page size — matches the existing composite index query. */
export const RECOVERY_PAGE_SIZE = 50;
/**
 * Max pages per scheduler invocation.
 * 10 × 50 = 500 reads, well under the 120s function timeout, and enough to
 * walk past a large recon backlog without an unbounded loop.
 */
export const RECOVERY_MAX_PAGES = 10;
function companyIdFromHoldPath(path) {
    const parts = String(path || '').split('/');
    if (parts.length >= 4 && parts[0] === 'companies' && parts[2] === 'aiTokenHolds') {
        return parts[1];
    }
    return null;
}
function toHoldCandidate(doc, fallbackCompanyId) {
    const data = (doc.data() || {});
    const companyId = fallbackCompanyId || companyIdFromHoldPath(doc.ref.path) || String(data.companyId || '');
    if (!companyId)
        return null;
    return {
        companyId,
        requestId: String(data.requestId || ''),
        providerKey: String(data.providerKey || 'openai'),
        createdAtMs: Number(data.createdAtMs || 0),
        data,
    };
}
async function listReservedHoldPage(db, companyId, pageSize, cursor) {
    const base = companyId
        ? db.collection('companies').doc(companyId).collection('aiTokenHolds')
        : db.collectionGroup('aiTokenHolds');
    let query = base
        .where('status', '==', AI_TOKEN_HOLD_STATUS.RESERVED)
        .orderBy('createdAtMs', 'asc');
    if (cursor) {
        query = query.startAfter(cursor);
    }
    query = query.limit(pageSize);
    const snap = await query.get();
    const holds = [];
    snap.forEach((doc) => {
        const hold = toHoldCandidate(doc, companyId);
        if (hold)
            holds.push(hold);
    });
    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { holds, lastDoc };
}
export async function recoverStuckCompanyAiHolds(options) {
    const nowMs = options?.nowMs ?? Date.now();
    const ttlMs = options?.ttlMs ?? getAiHoldTtlMs();
    const pageSize = Math.max(1, options?.pageSize ?? RECOVERY_PAGE_SIZE);
    const maxPages = Math.max(1, options?.maxPages ?? RECOVERY_MAX_PAGES);
    const maxScanned = Math.max(1, options?.limit ?? pageSize * maxPages);
    const cutoffMs = nowMs - ttlMs;
    const result = {
        scanned: 0,
        captured: 0,
        released: 0,
        reconciled: 0,
        skipped: 0,
        pages: 0,
    };
    const db = await getAdminDb();
    if (!db) {
        logger.warn('stuck hold recovery skipped — firestore unavailable');
        return result;
    }
    logger.group('companyAiWallet:recoverStuckHolds');
    logger.info('recovery start', {
        ttlMs,
        cutoffMs,
        companyId: options?.companyId || null,
        pageSize,
        maxPages,
        maxScanned,
    });
    let cursor = null;
    try {
        while (result.pages < maxPages && result.scanned < maxScanned) {
            const take = Math.min(pageSize, maxScanned - result.scanned);
            const page = await listReservedHoldPage(db, options?.companyId, take, cursor);
            result.pages += 1;
            if (page.holds.length === 0) {
                break;
            }
            for (const hold of page.holds) {
                result.scanned += 1;
                const status = String(hold.data.status || '');
                if (status !== AI_TOKEN_HOLD_STATUS.RESERVED) {
                    result.skipped += 1;
                    continue;
                }
                if (!hold.requestId || hold.createdAtMs > cutoffMs) {
                    result.skipped += 1;
                    continue;
                }
                const billingStatus = String(hold.data.billingStatus || '');
                if (billingStatus === AI_HOLD_BILLING_STATUS.NEEDS_RECONCILIATION) {
                    result.skipped += 1;
                    continue;
                }
                const pendingCapture = isHoldProviderSuccessPendingCapture(hold.data);
                const actualFromHold = Number(hold.data.actualTokens || 0);
                const estimated = Number(hold.data.estimatedTokens || 0);
                const actualTokens = actualFromHold > 0 ? actualFromHold : estimated;
                const providerStatus = String(hold.data.providerStatus || AI_HOLD_PROVIDER_STATUS.PENDING);
                try {
                    if (pendingCapture && actualTokens > 0) {
                        const captured = await captureCompanyTokensTransactional({
                            companyId: hold.companyId,
                            requestId: hold.requestId,
                            provider: hold.providerKey,
                            userId: 'system-hold-recovery',
                            actualTokens,
                            reason: 'chat.holdRecovery',
                            meta: {
                                route: '/internal/ai-hold-recovery',
                                recovered: true,
                                totalTokens: actualTokens,
                            },
                        });
                        if (!captured.applied) {
                            result.skipped += 1;
                            continue;
                        }
                        result.captured += 1;
                        logger.info('recovery captured', {
                            companyId: hold.companyId,
                            requestId: hold.requestId,
                            provider: hold.providerKey,
                            actualTokens,
                            holdStatus: AI_TOKEN_HOLD_STATUS.RESERVED,
                        });
                        continue;
                    }
                    if (providerStatus === AI_HOLD_PROVIDER_STATUS.FAILURE ||
                        providerStatus === AI_HOLD_PROVIDER_STATUS.TIMEOUT) {
                        const released = await releaseCompanyTokensTransactional({
                            companyId: hold.companyId,
                            requestId: hold.requestId,
                            provider: hold.providerKey,
                            userId: 'system-hold-recovery',
                            billingStatus: AI_HOLD_BILLING_STATUS.RELEASED,
                        });
                        if (!released.applied) {
                            result.skipped += 1;
                            continue;
                        }
                        result.released += 1;
                        continue;
                    }
                    const marked = await markCompanyAiHoldNeedsReconciliation({
                        companyId: hold.companyId,
                        requestId: hold.requestId,
                        provider: hold.providerKey,
                    });
                    if (marked.alreadyReconciled) {
                        result.skipped += 1;
                        continue;
                    }
                    const holdId = buildAiTokenHoldId(hold.requestId);
                    logger.error('H-007A_AI_HOLD_NEEDS_RECONCILIATION', {
                        companyId: hold.companyId,
                        requestId: hold.requestId,
                        holdId,
                        provider: hold.providerKey,
                        estimatedTokens: estimated,
                        createdAtMs: hold.createdAtMs,
                        billingStatus: marked.billingStatus,
                        holdStatus: marked.status,
                        providerStatus: marked.providerStatus,
                    });
                    result.reconciled += 1;
                }
                catch (err) {
                    result.skipped += 1;
                    logger.error('stuck hold recovery item failed', {
                        companyId: hold.companyId,
                        requestId: hold.requestId,
                        error: err?.message || err,
                    });
                }
            }
            if (page.holds.length < take || !page.lastDoc) {
                break;
            }
            cursor = page.lastDoc;
        }
    }
    catch (err) {
        logger.error('stuck hold recovery failed', err);
        logger.end();
        throw err;
    }
    logger.info('recovery done', result);
    logger.end();
    return result;
}
