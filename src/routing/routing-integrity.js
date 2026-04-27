/**
 * TEKLİFBUL – Routing Integrity Guard + Self-heal helpers
 * - Pure helpers: recomputeDerivedFromItems, isSameSet
 * - Firestore self-heal: validateAndHealDemandDerived (inject Firestore funcs to keep module testable)
 */

/**
 * @param {Array<{ itemCategoryIds?: string[] | null }>} items
 * @returns {string[]}
 */
export function recomputeDerivedFromItems(items = []) {
  const out = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const ids = Array.isArray(it?.itemCategoryIds) ? it.itemCategoryIds : [];
    for (const id of ids) {
      if (typeof id === 'string' && id.trim()) out.add(id);
    }
  }
  return Array.from(out);
}

/**
 * Set equality ignoring order/dupes.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
export function isSameSet(a = [], b = []) {
  const aa = new Set((Array.isArray(a) ? a : []).filter(Boolean));
  const bb = new Set((Array.isArray(b) ? b : []).filter(Boolean));
  if (aa.size !== bb.size) return false;
  for (const v of aa) if (!bb.has(v)) return false;
  return true;
}

/**
 * Validate + self-heal demand.derivedCategoryIds against union(items[].itemCategoryIds).
 * Runs a write ONLY when missing/mismatch.
 *
 * @param {object} ctx
 * @param {any} ctx.db
 * @param {string} ctx.demandId
 * @param {object|null} [ctx.demandData]
 * @param {Array<object>|null} [ctx.itemsData] If provided, avoids extra items read.
 * @param {object} ctx.fs Firestore functions injection
 * @param {Function} ctx.fs.doc
 * @param {Function} ctx.fs.getDoc
 * @param {Function} ctx.fs.updateDoc
 * @param {Function} ctx.fs.collection
 * @param {Function} ctx.fs.getDocs
 * @param {Function} ctx.fs.query
 * @param {Function} ctx.fs.limit
 * @param {Function} [ctx.logger]
 * @param {string} [ctx.routingTraceId]
 * @returns {Promise<{ routingTraceId: string, healed: boolean, derivedCategoryIds: string[], reason?: string }>}
 */
export async function validateAndHealDemandDerived(ctx) {
  const {
    db,
    demandId,
    demandData = null,
    itemsData = null,
    fs,
    logger = null,
    routingTraceId = `${demandId}_${Math.random().toString(36).slice(2, 6)}`
  } = ctx || {};

  if (!db || !demandId || !fs) {
    throw new Error('validateAndHealDemandDerived: missing db/demandId/fs');
  }

  const logInfo = (msg, data) => (logger?.info ? logger.info(msg, data) : console.info(msg, data));
  const logWarn = (msg, data) => (logger?.warn ? logger.warn(msg, data) : console.warn(msg, data));

  let demand = demandData;
  try {
    if (!demand) {
      const snap = await fs.getDoc(fs.doc(db, 'demands', demandId));
      demand = snap.exists() ? (snap.data() || {}) : null;
    }
  } catch (e) {
    logWarn('integrity: failed to read demand', { routingTraceId, demandId, error: e });
  }

  const current = Array.isArray(demand?.derivedCategoryIds) ? demand.derivedCategoryIds.filter(Boolean) : [];

  let union = [];
  if (Array.isArray(itemsData) && itemsData.length) {
    union = recomputeDerivedFromItems(itemsData).filter(Boolean);
  } else {
    try {
      const snap = await fs.getDocs(fs.query(fs.collection(db, 'demands', demandId, 'items'), fs.limit(500)));
      const items = snap.docs.map(d => d.data() || {});
      union = recomputeDerivedFromItems(items).filter(Boolean);
    } catch (e) {
      logWarn('integrity: failed to read items for derived recompute', { routingTraceId, demandId, error: e });
    }
  }

  if (!union.length) {
    if (current.length > 0) {
      logWarn('integrity: recomputed derivedCategoryIds is empty but current has values (bug suspected)', {
        routingTraceId,
        demandId,
        currentCount: current.length
      });
    } else {
      // It is normal for legacy/unmapped demands to have no item categories
      logInfo('integrity: recomputed derivedCategoryIds is empty (no categories mapped on items)', {
        routingTraceId,
        demandId
      });
    }
    return { routingTraceId, healed: false, derivedCategoryIds: current, reason: 'union_empty' };
  }

  if (!current.length || !isSameSet(current, union)) {
    try {
      await fs.updateDoc(fs.doc(db, 'demands', demandId), { derivedCategoryIds: union });
      logInfo('integrity: heal_derived_mismatch', {
        routingTraceId,
        demandId,
        reason: !current.length ? 'missing' : 'mismatch',
        derivedCategoryIdsCount: union.length
      });
      return { routingTraceId, healed: true, derivedCategoryIds: union, reason: !current.length ? 'missing' : 'mismatch' };
    } catch (e) {
      logWarn('integrity: failed to write healed derivedCategoryIds', { routingTraceId, demandId, error: e });
      return { routingTraceId, healed: false, derivedCategoryIds: union, reason: 'write_failed' };
    }
  }

  return { routingTraceId, healed: false, derivedCategoryIds: current, reason: 'ok' };
}


