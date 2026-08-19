/**
 * Teklifbul Rule v1.0 — Ücretsiz AI varsayılanları (Groq)
 * free_local/basic stub değil; gerçek ücretsiz bulut modeli.
 */

export const DEFAULT_FREE_AI_PROVIDER = 'groq' as const;
export const DEFAULT_FREE_AI_MODEL = 'llama-3.3-70b-versatile' as const;

export const DEFAULT_FREE_AI = {
  provider: DEFAULT_FREE_AI_PROVIDER,
  model: DEFAULT_FREE_AI_MODEL,
} as const;

/** free_local stub yerine gerçek ücretsiz adayları tercih et */
export function pickPreferredFreeModel<T extends { provider: string; model: string; freeEligible?: boolean; sort?: number }>(
  candidates: T[]
): T | null {
  if (!candidates?.length) return null;
  const real = candidates.filter((m) => m.provider !== 'free_local');
  const pool = real.length ? real : candidates;
  const sorted = [...pool].sort((a, b) => {
    const sortA = a.sort ?? 9999;
    const sortB = b.sort ?? 9999;
    if (sortA !== sortB) return sortA - sortB;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider, 'en');
    return a.model.localeCompare(b.model, 'en');
  });
  return sorted[0] || null;
}
