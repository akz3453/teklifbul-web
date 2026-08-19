/**
 * Paid /api/chat request idempotency id
 * Teklifbul Rule v1.0
 *
 * Client x-request-id is scoped by companyId at hold lookup.
 * Same header on another company cannot reuse another tenant's hold.
 */

import { randomUUID } from 'crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export type ResolvedAiChatRequestId =
  | { ok: true; requestId: string; fromClient: boolean }
  | { ok: false; error: 'invalid_request_id' };

export function resolveAiChatRequestId(headerValue: unknown): ResolvedAiChatRequestId {
  if (headerValue === undefined || headerValue === null) {
    return { ok: true, requestId: randomUUID(), fromClient: false };
  }

  const raw = Array.isArray(headerValue) ? String(headerValue[0] ?? '') : String(headerValue);
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, requestId: randomUUID(), fromClient: false };
  }

  if (!REQUEST_ID_PATTERN.test(trimmed)) {
    return { ok: false, error: 'invalid_request_id' };
  }

  return { ok: true, requestId: trimmed, fromClient: true };
}
