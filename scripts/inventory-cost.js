/**
 * Inventory cost calculation utilities
 */

export function weightedAvgCost(oldQty, oldAvg, inQty, inUnitCost) {
  if (!oldQty) return inUnitCost;
  return ((oldQty * oldAvg) + (inQty * inUnitCost)) / (oldQty + inQty);
}

export function allocateExtras(totalExtras, totalQty) {
  return totalQty > 0 ? (totalExtras / totalQty) : 0;
}

