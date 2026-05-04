// Teklifbul Rule v1.0 - fast-levenshtein icin minimal ambient module declaration
// fast-levenshtein'in resmi @types paketi yok; sadece kullanilan API'yi tipliyoruz.

declare module 'fast-levenshtein' {
  export interface LevenshteinOptions {
    useCollator?: boolean;
  }

  export function get(str1: string, str2: string, options?: LevenshteinOptions): number;

  const _default: {
    get: typeof get;
  };
  export default _default;
}
