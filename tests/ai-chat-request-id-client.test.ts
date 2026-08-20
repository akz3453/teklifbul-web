/**
 * Client x-request-id contract for paid /api/chat
 * Teklifbul Rule v1.0
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { createAiChatRequestId, AI_CHAT_REQUEST_ID_PATTERN } from '../assets/js/utils/ai-chat-request-id.js';
import { resolveAiChatRequestId } from '../server/utils/aiChatRequestId.js';

describe('paid AI x-request-id client contract', () => {
  test('createAiChatRequestId matches server pattern and is accepted as client id', () => {
    const requestId = createAiChatRequestId();
    expect(requestId).toMatch(AI_CHAT_REQUEST_ID_PATTERN);
    const resolved = resolveAiChatRequestId(requestId);
    expect(resolved).toEqual({ ok: true, requestId, fromClient: true });
  });

  test('crypto.randomUUID() is a valid x-request-id', () => {
    const requestId = crypto.randomUUID();
    const resolved = resolveAiChatRequestId(requestId);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.fromClient).toBe(true);
      expect(resolved.requestId).toBe(requestId);
    }
  });

  test('paid widget and authFetch send x-request-id', () => {
    const widget = readFileSync('assets/js/ai-assistant-widget.js', 'utf8');
    expect(widget).toContain('x-request-id');
    expect(widget).toContain('createAiChatRequestId');

    const authFetch = readFileSync('assets/js/utils/api-helpers.js', 'utf8');
    expect(authFetch).toContain('x-request-id');
    expect(authFetch).toContain('createAiChatRequestId');

    const chatWidget = readFileSync('assets/js/chatWidget.js', 'utf8');
    expect(chatWidget).toContain('x-request-id');
    expect(chatWidget).toContain('createAiChatRequestId');
  });

  test('payment-request.html is a Vite MPA input', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');
    expect(viteConfig).toMatch(/['"]payment-request['"]\s*:\s*['"]payment-request\.html['"]/);
  });
});
