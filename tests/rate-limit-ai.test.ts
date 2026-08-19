/**
 * Teklifbul Rule v1.0 — rateLimitAi must not trust spoofed x-company-id
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const getCompanyIdFromRequest = vi.fn();
const getUserPlan = vi.fn();
const getAdminDb = vi.fn();

vi.mock('../server/src/services/permissionService.js', () => ({
  getCompanyIdFromRequest: (...args: unknown[]) => getCompanyIdFromRequest(...args),
}));

vi.mock('../server/services/userService.js', () => ({
  getUserPlan: (...args: unknown[]) => getUserPlan(...args),
}));

vi.mock('../server/utils/firestore.js', () => ({
  getAdminDb: (...args: unknown[]) => getAdminDb(...args),
}));

const { rateLimitAi } = await import('../server/middleware/rateLimitAi.js');

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
  };
  return res;
}

describe('rateLimitAi tenant key', () => {
  beforeEach(() => {
    getCompanyIdFromRequest.mockReset();
    getUserPlan.mockReset();
    getAdminDb.mockReset();
    getAdminDb.mockResolvedValue(null);
    getUserPlan.mockResolvedValue('free');
  });

  test('spoofed premium x-company-id does not raise the free-plan limit', async () => {
    getCompanyIdFromRequest.mockResolvedValue(null);
    const uid = `rl-spoof-${Date.now()}`;
    const req: any = {
      user: { uid },
      headers: { 'x-company-id': 'premium-victim-company' },
    };

    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 25; i += 1) {
      const res = mockRes();
      const next = vi.fn();
      await rateLimitAi(req, res, next);
      if (next.mock.calls.length) allowed += 1;
      if (res.statusCode === 429) blocked += 1;
    }

    expect(allowed).toBe(20);
    expect(blocked).toBe(5);
    expect(getAdminDb).not.toHaveBeenCalled();
  });
});
