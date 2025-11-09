export const trNorm = (t?: string) =>
  (t || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

