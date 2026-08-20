import { describe, expect, test } from 'vitest';
import { scrubSentryEvent } from '../src/shared/log/sentry-scrub.ts';

describe('scrubSentryEvent', () => {
  test('redacts secrets, tokens and PII keys', () => {
    const cleaned = scrubSentryEvent({
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sid=1',
          'x-company-id': 'tax-0450650024',
          'content-type': 'application/json',
        },
        data: { taxNumber: '0450650024', note: 'ok' },
      },
      extra: {
        token: 'abc',
        email: 'a@b.com',
        phone: '555',
        nested: { authorization: 'x', city: 'Ankara' },
      },
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
    });
    const request = cleaned?.request as Record<string, unknown>;
    const headers = request.headers as Record<string, unknown>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers['x-company-id']).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
    expect((request.data as Record<string, unknown>).taxNumber).toBe('[FILTERED]');
    expect((cleaned?.extra as Record<string, unknown>).token).toBe('[FILTERED]');
    expect((cleaned?.extra as Record<string, unknown>).email).toBe('[FILTERED]');
    expect((cleaned?.user as Record<string, unknown>).email).toBeUndefined();
    expect((cleaned?.user as Record<string, unknown>).id).toBe('u1');
  });

  test('redacts private keys and bearer tokens in strings', () => {
    const cleaned = scrubSentryEvent({
      extra: {
        private_key: 'BEGIN KEY',
        note: 'Authorization Bearer abc.def.ghi leftover',
      },
    });
    const extra = cleaned?.extra as Record<string, unknown>;
    expect(extra.private_key).toBe('[FILTERED]');
    expect(String(extra.note)).toContain('Bearer [FILTERED]');
  });

  test('returns null for empty event', () => {
    expect(scrubSentryEvent(null)).toBeNull();
  });
});
