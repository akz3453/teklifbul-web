/**
 * TEKLİFBUL – Routing/Kategori regression helpers (pure functions)
 * - No Firebase, no DOM, no side effects.
 * - Safe to import in Vitest / Node.
 */

/**
 * Compute derivedCategoryIds = union(items[].itemCategoryIds)
 * @param {Array<{ itemCategoryIds?: string[] | null }>} items
 * @returns {string[]}
 */
export function unionDerivedCategoryIds(items = []) {
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
 * Compute recipientCategoryIds = supplierCategoryIds ∩ derivedCategoryIds
 * (order follows derivedCategoryIds to keep deterministic display ordering)
 * @param {string[]} supplierCategoryIds
 * @param {string[]} derivedCategoryIds
 * @returns {string[]}
 */
export function intersectSupplierDemandCats(supplierCategoryIds = [], derivedCategoryIds = []) {
  const s = new Set((Array.isArray(supplierCategoryIds) ? supplierCategoryIds : []).filter(Boolean));
  const d = Array.isArray(derivedCategoryIds) ? derivedCategoryIds : [];
  return d.filter((id) => id && s.has(id));
}

/**
 * Pool routing threshold helper.
 * @param {number} candidateCount
 * @param {number} maxRecipients
 * @returns {{ routingMode: 'direct' | 'pool', maxRecipients: number, candidateCount: number }}
 */
export function poolThreshold(candidateCount, maxRecipients = 200) {
  const max = Number.isFinite(maxRecipients) ? maxRecipients : 200;
  const count = Number.isFinite(candidateCount) ? candidateCount : 0;
  return {
    routingMode: count > max ? 'pool' : 'direct',
    maxRecipients: max,
    candidateCount: count
  };
}


