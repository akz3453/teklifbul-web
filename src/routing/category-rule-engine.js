/**
 * TEKLİFBUL – AI’sız Kategori Kural Motoru (pure)
 * - No Firebase, no DOM, no side effects.
 */

const TR_MAP = {
  "ı": "i",
  "İ": "i",
  "ş": "s",
  "Ş": "s",
  "ğ": "g",
  "Ğ": "g",
  "ü": "u",
  "Ü": "u",
  "ö": "o",
  "Ö": "o",
  "ç": "c",
  "Ç": "c",
};

/**
 * normalizeForRule(text): Turkish normalize + lowercase + special remove
 * Compatible with search normalization principles (stable tokens).
 * @param {string} text
 * @returns {string}
 */
export function normalizeForRule(text) {
  if (!text) return "";
  let s = String(text);
  // apply TR map first to avoid locale pitfalls
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => TR_MAP[ch] || ch);
  s = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function scoreForMatchType(matchType) {
  if (matchType === "regex") return 1.0;
  if (matchType === "prefix") return 0.9;
  return 0.7; // contains default
}

/**
 * @typedef {object} CategoryRule
 * @property {string} [ruleId]
 * @property {string} pattern
 * @property {'contains'|'prefix'|'regex'} matchType
 * @property {string[]} categoryIds
 * @property {number} [priority]
 * @property {boolean} [isActive]
 */

/**
 * matchRules(text, rules) -> { categoryIds, matchedRuleIds, score }
 * - highest priority wins
 * - returns up to 2 unique categoryIds
 * @param {string} text
 * @param {CategoryRule[]} rules
 */
export function matchRules(text, rules = []) {
  const normalizedText = normalizeForRule(text);
  if (!normalizedText) return { categoryIds: [], matchedRuleIds: [], score: 0 };

  const tokens = normalizedText.split(" ").filter(Boolean);
  const matches = [];

  for (const r of Array.isArray(rules) ? rules : []) {
    if (!r || r.isActive === false) continue;
    const pattern = normalizeForRule(r.pattern || "");
    if (!pattern) continue;
    const matchType = r.matchType || "contains";
    let ok = false;

    if (matchType === "contains") {
      ok = normalizedText.includes(pattern);
    } else if (matchType === "prefix") {
      ok = tokens.some((t) => t.startsWith(pattern));
    } else if (matchType === "regex") {
      try {
        // treat pattern as already meaningful in normalized domain
        const re = new RegExp(r.pattern, "i");
        ok = re.test(normalizedText);
      } catch {
        ok = false;
      }
    }

    if (!ok) continue;
    const priority = Number.isFinite(r.priority) ? r.priority : 100;
    const score = scoreForMatchType(matchType);
    matches.push({
      ruleId: r.ruleId || r.id || r.pattern,
      priority,
      score,
      categoryIds: Array.isArray(r.categoryIds) ? r.categoryIds.filter(Boolean) : [],
    });
  }

  if (!matches.length) return { categoryIds: [], matchedRuleIds: [], score: 0 };

  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.score - a.score;
  });

  const outCats = [];
  const used = new Set();
  const matchedRuleIds = [];
  let bestScore = matches[0]?.score || 0;

  for (const m of matches) {
    if (m.ruleId && matchedRuleIds.length < 6) matchedRuleIds.push(m.ruleId);
    for (const cid of m.categoryIds) {
      if (!cid || used.has(cid)) continue;
      used.add(cid);
      outCats.push(cid);
      if (outCats.length >= 2) break;
    }
    if (outCats.length >= 2) break;
  }

  return { categoryIds: outCats, matchedRuleIds, score: bestScore };
}


