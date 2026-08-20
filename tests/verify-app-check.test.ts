import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const verifyToken = vi.fn();

vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    appCheck: () => ({ verifyToken }),
  },
}));

const {
  isAppCheckSkippedPath,
  isAppCheckEnforced,
  verifyAppCheck,
} = await import('../server/middleware/verify-app-check.ts');

function mockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe('verifyAppCheck', () => {
  const original = process.env.APP_CHECK_ENFORCE;

  beforeEach(() => {
    verifyToken.mockReset();
    delete process.env.APP_CHECK_ENFORCE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.APP_CHECK_ENFORCE;
    else process.env.APP_CHECK_ENFORCE = original;
  });

  test('skips health, metrics, webhook and email-token paths', () => {
    expect(isAppCheckSkippedPath('/api/health')).toBe(true);
    expect(isAppCheckSkippedPath('/health')).toBe(true);
    expect(isAppCheckSkippedPath('/api/payments/webhook')).toBe(true);
    expect(isAppCheckSkippedPath('/api/bid-invites')).toBe(true);
    expect(isAppCheckSkippedPath('/api/submit-bid')).toBe(true);
    expect(isAppCheckSkippedPath('/api/ai/chat')).toBe(false);
  });

  test('enforce is off unless APP_CHECK_ENFORCE=1', () => {
    expect(isAppCheckEnforced()).toBe(false);
    process.env.APP_CHECK_ENFORCE = '1';
    expect(isAppCheckEnforced()).toBe(true);
  });

  test('monitor mode allows missing token', async () => {
    const next = vi.fn();
    const res = mockRes();
    await verifyAppCheck({ path: '/api/ai/chat', headers: {}, originalUrl: '/api/ai/chat' } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  test('enforced mode rejects missing token', async () => {
    process.env.APP_CHECK_ENFORCE = '1';
    const next = vi.fn();
    const res = mockRes();
    await verifyAppCheck({ path: '/api/ai/chat', headers: {}, originalUrl: '/api/ai/chat' } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error?: string }).error).toBe('APP_CHECK_REQUIRED');
  });

  test('invalid token is rejected even in monitor mode', async () => {
    verifyToken.mockRejectedValue(new Error('bad token'));
    const next = vi.fn();
    const res = mockRes();
    await verifyAppCheck({
      path: '/api/ai/chat',
      originalUrl: '/api/ai/chat',
      headers: { 'x-firebase-appcheck': 'invalid' },
    } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error?: string }).error).toBe('APP_CHECK_INVALID');
  });

  test('OPTIONS preflight is not gated', async () => {
    process.env.APP_CHECK_ENFORCE = '1';
    const next = vi.fn();
    const res = mockRes();
    await verifyAppCheck({
      method: 'OPTIONS',
      path: '/api/ai/chat',
      originalUrl: '/api/ai/chat',
      headers: {},
    } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  test('webhook is not gated by App Check', async () => {
    process.env.APP_CHECK_ENFORCE = '1';
    const next = vi.fn();
    const res = mockRes();
    await verifyAppCheck({
      path: '/api/payments/webhook',
      originalUrl: '/api/payments/webhook',
      headers: {},
    } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
