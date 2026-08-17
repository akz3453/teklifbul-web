import { describe, expect, test } from 'vitest';
import { sanitizeEventParams } from '../assets/js/analytics-params.js';

describe('analytics param sanitizer', () => {
  test('drops email phone uid and tokens', () => {
    const out = sanitizeEventParams({
      method: 'password',
      email: 'a@b.com',
      phone: '05551112233',
      uid: 'abc',
      userId: 'abc',
      token: 'secret',
    });
    expect(out).toEqual({ method: 'password' });
  });

  test('drops values that look like email', () => {
    const out = sanitizeEventParams({ note: 'user@example.com', status: 'draft' });
    expect(out).toEqual({ status: 'draft' });
  });
});
