/**
 * TEKLİFBUL – Öğrenen Sözlük (pure helpers)
 * - No Firebase, no DOM.
 */

import { normalizeForRule } from "./category-rule-engine.js";

const STOPWORDS = new Set([
  "ve","ile","icin","için","adet","ad","kg","gr","g","lt","l","ml","m","cm","mm",
  "set","paket","kutu","torba","bidon","varil","sac","sac","saci","sacı",
  "urun","ürün","malzeme","tane","top","rulo"
].map(x => normalizeForRule(x)));

/**
 * Extract top-K evidence tokens from free text.
 * @param {string} text
 * @param {{ maxTokens?: number }} [opts]
 * @returns {string[]}
 */
export function extractEvidenceTokens(text, opts = {}) {
  const maxTokens = Number.isFinite(opts.maxTokens) ? opts.maxTokens : 3;
  const norm = normalizeForRule(text);
  if (!norm) return [];
  const rawTokens = norm.split(" ").filter(Boolean);
  const cleaned = rawTokens
    .filter(t => t.length >= 3)
    .filter(t => !STOPWORDS.has(t));
  const uniq = Array.from(new Set(cleaned));
  return uniq.slice(0, maxTokens);
}

/**
 * Decide whether evidence can be auto-approved.
 * Conditions:
 * - total >= 5
 * - topVotes/total >= 0.85
 * - (topVotes - secondVotes) >= 3
 *
 * @param {{ votes?: Record<string, number>, total?: number }} evidenceDoc
 * @returns {{ status: 'learning'|'auto', autoCategoryIds: string[], topCategoryId: string|null }}
 */
export function evaluateAutoApprove(evidenceDoc = {}) {
  const votes = evidenceDoc?.votes && typeof evidenceDoc.votes === "object" ? evidenceDoc.votes : {};
  const entries = Object.entries(votes).filter(([k, v]) => k && Number.isFinite(v));
  const total = Number.isFinite(evidenceDoc?.total) ? evidenceDoc.total : entries.reduce((a, [,v]) => a + (Number(v)||0), 0);
  if (total < 5 || entries.length === 0) {
    return { status: "learning", autoCategoryIds: [], topCategoryId: null };
  }
  entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  const top = entries[0];
  const second = entries[1] || [null, 0];
  const topVotes = Number(top[1]) || 0;
  const secondVotes = Number(second[1]) || 0;

  const ratio = topVotes / total;
  const margin = topVotes - secondVotes;
  if (ratio >= 0.85 && margin >= 3) {
    return { status: "auto", autoCategoryIds: [top[0]], topCategoryId: top[0] };
  }
  return { status: "learning", autoCategoryIds: [], topCategoryId: top[0] || null };
}


