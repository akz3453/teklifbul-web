/**
 * Client paid-chat request id
 * Teklifbul Rule v1.0
 *
 * Matches server/utils/aiChatRequestId.ts:
 * /^[A-Za-z0-9._:-]{8,128}$/
 *
 * This is a contract header, not a security control.
 * Auth, company, premium, wallet, and idempotency stay on the server.
 */

export const AI_CHAT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function fallbackRequestId() {
  const rand = Math.random().toString(36).slice(2, 12);
  return `req-${Date.now().toString(36)}-${rand}`;
}

export function createAiChatRequestId() {
  let requestId = '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    requestId = crypto.randomUUID();
  } else {
    requestId = fallbackRequestId();
  }
  if (!AI_CHAT_REQUEST_ID_PATTERN.test(requestId)) {
    requestId = fallbackRequestId();
  }
  return requestId.slice(0, 128);
}
