import { describe, expect, test } from 'vitest';
import { corsOriginDelegate } from '../server/constants/allowed-origins.ts';

function decide(origin, allowed) {
  let err = null;
  let allow;
  corsOriginDelegate(allowed)(origin, (e, value) => {
    err = e;
    allow = value;
  });
  return { err, allow };
}

describe('CORS origin delegate', () => {
  const allowed = ['https://nefisoft.com', 'https://www.nefisoft.com'];

  test('allows missing origin (same-origin / curl)', () => {
    const result = decide(undefined, allowed);
    expect(result.err).toBeNull();
    expect(result.allow).toBe(true);
  });

  test('allows allowlisted origin', () => {
    const result = decide('https://nefisoft.com', allowed);
    expect(result.err).toBeNull();
    expect(result.allow).toBe(true);
  });

  test('denies unknown origin without throwing', () => {
    const result = decide('https://evil.example', allowed);
    expect(result.err).toBeNull();
    expect(result.allow).toBe(false);
  });
});
