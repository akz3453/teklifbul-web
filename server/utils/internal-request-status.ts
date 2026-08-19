/**
 * Teklifbul Rule v1.0 — İç talep onay/red geçişleri (Admin SDK API)
 */

const FROM_DRAFT = ['REJECTED', 'cancelled', 'CANCELLED'] as const;
const FROM_SENT = ['APPROVED', 'REJECTED', 'cancelled', 'CANCELLED'] as const;

const ALLOWED: Record<string, readonly string[]> = {
  DRAFT: FROM_DRAFT,
  draft: FROM_DRAFT,
  SENT: FROM_SENT,
  pending: FROM_SENT,
  PENDING: FROM_SENT,
};

export function canTransitionInternalRequestStatus(from: string | undefined, to: string): boolean {
  const oldStatus = from && from.length > 0 ? from : 'DRAFT';
  const allowed = ALLOWED[oldStatus];
  return Array.isArray(allowed) && allowed.includes(to);
}
