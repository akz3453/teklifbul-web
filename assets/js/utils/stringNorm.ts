// Teklifbul Rule v1.0 - Türkçe string normalizasyon
export const trNorm = (t?: string): string =>
  (t || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

