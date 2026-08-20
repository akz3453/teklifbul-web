import { afterEach, describe, expect, test } from 'vitest';
import { createRedisRateLimitStore, getProductionRedisUrl } from '../server/middleware/redis-rate-limit-store.ts';

describe('redis rate-limit store', () => {
  const original = process.env.REDIS_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  });

  test('does not default to localhost when REDIS_URL is unset', () => {
    delete process.env.REDIS_URL;
    expect(getProductionRedisUrl()).toBeNull();
    expect(createRedisRateLimitStore()).toBeNull();
  });

  test('reads REDIS_URL when set', () => {
    process.env.REDIS_URL = 'redis://example.internal:6379';
    expect(getProductionRedisUrl()).toBe('redis://example.internal:6379');
  });
});
