/**
 * Gelişmiş Stok Arama Utility
 * Teklifbul Rule v1.0 - ETA programı gibi akıllı arama
 * 
 * Özellikler:
 * - Önce başlayanlar, sonra içinde geçenler
 * - Yıldız (*) ile wildcard arama desteği
 * - Skorlama ile sıralama
 * - Türkçe karakter desteği
 */

import { normalizeTRLower, matchesWildcard } from './tr-utils.js';

/**
 * Stokları arama fonksiyonu
 * @param {Array} stocks - Aranacak stok listesi
 * @param {string} query - Arama sorgusu
 * @param {number} limit - Maksimum sonuç sayısı (varsayılan: 50)
 * @returns {Array} Sıralanmış stok listesi
 */
export function searchStocks(stocks, query, limit = 50) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  const normalizedQuery = normalizeTRLower(query.trim());
  const hasWildcard = query.includes('*');
  
  // Wildcard arama (* * kullanarak)
  if (hasWildcard) {
    return stocks.filter(s => {
      return matchesWildcard(s.name, query) || matchesWildcard(s.sku, query);
    }).slice(0, limit);
  }
  
  // Normal arama - skorlama ile sıralama
  const scored = stocks.map(stock => {
    const nameNorm = normalizeTRLower(stock.name || '');
    const skuNorm = normalizeTRLower(stock.sku || '');
    
    let score = 0;
    
    // Tam eşleşme (en yüksek öncelik)
    if (nameNorm === normalizedQuery) score += 1000;
    if (skuNorm === normalizedQuery) score += 1000;
    
    // Başlangıç eşleşmesi (öncelikli)
    if (nameNorm.startsWith(normalizedQuery)) score += 500;
    if (skuNorm.startsWith(normalizedQuery)) score += 500;
    
    // İçeriyor mu (başlangıçtan sonra)
    if (nameNorm.includes(normalizedQuery)) {
      const index = nameNorm.indexOf(normalizedQuery);
      score += 300 - (index * 2); // Erken bulunanlar daha yüksek skor
    }
    if (skuNorm.includes(normalizedQuery)) {
      const index = skuNorm.indexOf(normalizedQuery);
      score += 200 - (index * 2);
    }
    
    // Kelime bazlı eşleşme
    const queryWords = normalizedQuery.split(/\s+/);
    const nameWords = nameNorm.split(/\s+/);
    queryWords.forEach(qw => {
      nameWords.forEach(nw => {
        if (nw.startsWith(qw)) score += 100;
        if (nw.includes(qw)) score += 50;
      });
    });
    
    return { stock, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit)
  .map(item => item.stock);
  
  return scored;
}

