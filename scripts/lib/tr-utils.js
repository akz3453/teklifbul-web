/**
 * Turkish text utilities and wildcard search
 */

// Türkçe'ye duyarlı normalize
export function normalizeTR(s) {
  if (!s) return "";
  return s
    // Unicode aksanları temizle
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    // Türkçe büyük harfe çevir
    .toLocaleUpperCase('tr-TR')
    // Özel eşlemeler (gerekirse)
    .replaceAll('Ç','C').replaceAll('Ğ','G').replaceAll('İ','I')
    .replaceAll('Ö','O').replaceAll('Ş','S').replaceAll('Ü','U');
}

// Normalize edilmiş string için küçük harf versiyonu (indexleme için)
export function normalizeTRLower(s = '') {
  return normalizeTR(s).toLowerCase();
}

export function tokenizeForIndex(s) {
  const t = normalizeTRLower(s).split(/\s+/).filter(Boolean);
  const out = new Set();
  t.forEach(w => {
    for (let i = 1; i <= Math.min(8, w.length); i++) {
      out.add(w.slice(0, i));
    }
  });
  return [...out];
}

// Wildcard eşleştirme (regex tabanlı)
export function wildcardMatch(text, pattern) {
  const t = normalizeTR(text);
  const p = normalizeTR(pattern).replace(/\*/g, '.*'); // * -> regex wildcard
  return new RegExp(`^${p}$`).test(t);
}

// Geriye uyumluluk için eski fonksiyon (wildcardMatch kullanır)
export function matchesWildcard(name, query) {
  return wildcardMatch(name, query);
}

