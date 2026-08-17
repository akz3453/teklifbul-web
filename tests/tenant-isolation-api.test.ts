/**
 * Teklifbul Rule v1.0 — API tenant isolation (x-company-id / body / query spoof)
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const getCachedUserDoc = vi.fn();
const getAdminDb = vi.fn();

vi.mock('../server/src/utils/userDocCache.js', () => ({
  getCachedUserDoc: (...args: unknown[]) => getCachedUserDoc(...args),
}));

vi.mock('../server/utils/firestore.js', () => ({
  getAdminDb: (...args: unknown[]) => getAdminDb(...args),
}));

const { getCompanyIdFromRequest } = await import('../server/src/services/permissionService.js');
const { requirePermission } = await import('../server/middleware/requirePermission.js');

const USER_A = {
  companyId: 'company-a',
  activeCompanyId: 'company-a',
  companies: ['company-a'],
  companyJoinStatus: 'accepted',
};

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { uid: 'user-a' },
    headers: {},
    body: {},
    query: {},
    path: '/api/sales',
    ...overrides,
  } as any;
}

describe('API tenant isolation', () => {
  beforeEach(() => {
    getCachedUserDoc.mockReset();
    getAdminDb.mockReset();
    getAdminDb.mockResolvedValue(null);
    getCachedUserDoc.mockResolvedValue({ exists: true, data: USER_A });
  });

  test('Test 3: x-company-id Company B without membership returns null', async () => {
    const req = makeReq({ headers: { 'x-company-id': 'company-b' } });
    const companyId = await getCompanyIdFromRequest(req);
    expect(companyId).toBeNull();
  });

  test('accepted member may select own company via header', async () => {
    const req = makeReq({ headers: { 'x-company-id': 'company-a' } });
    const companyId = await getCompanyIdFromRequest(req);
    expect(companyId).toBe('company-a');
  });

  test('body companyId Company B does not grant access', async () => {
    const req = makeReq({ body: { companyId: 'company-b' } });
    const companyId = await getCompanyIdFromRequest(req);
    expect(companyId).toBeNull();
  });

  test('query companyId Company B does not grant access', async () => {
    const req = makeReq({ query: { companyId: 'company-b' } });
    const companyId = await getCompanyIdFromRequest(req);
    expect(companyId).toBeNull();
  });

  test('pending join cannot use company fields as API tenant', async () => {
    getCachedUserDoc.mockResolvedValue({
      exists: true,
      data: {
        companyId: 'company-a',
        activeCompanyId: 'company-a',
        companyJoinStatus: 'pending',
      },
    });
    const req = makeReq();
    const companyId = await getCompanyIdFromRequest(req);
    expect(companyId).toBeNull();
  });

  test('missing companyJoinStatus is not accepted for API company context', async () => {
    getCachedUserDoc.mockResolvedValue({
      exists: true,
      data: { companyId: 'company-a', companies: ['company-a'] },
    });
    const req = makeReq({ headers: { 'x-company-id': 'company-a' } });
    const companyId = await getCompanyIdFromRequest(req);
    expect(companyId).toBeNull();
  });

  test('requirePermission returns 403 when x-company-id is spoofed', async () => {
    const req = makeReq({ headers: { 'x-company-id': 'company-b' } });
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    await requirePermission('sales.create')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('requirePermission returns 403 when body companyId is Company B', async () => {
    const req = makeReq({ body: { companyId: 'company-b' } });
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    await requirePermission('sales.edit')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
