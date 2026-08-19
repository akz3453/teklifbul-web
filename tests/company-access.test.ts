/**
 * Teklifbul Rule v1.0 — Tenant isolation: companyAccess helpers
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const getAdminDb = vi.fn();

vi.mock('../server/utils/firestore.js', () => ({
  getAdminDb: (...args: unknown[]) => getAdminDb(...args),
}));

const {
  userBelongsToCompany,
  resolveTrustedCompanyId,
  resolveTrustedCompanyIdAsync,
  hasAcceptedJoinStatus,
} = await import('../server/utils/companyAccess.js');

describe('companyAccess membership', () => {
  beforeEach(() => {
    getAdminDb.mockReset();
    getAdminDb.mockResolvedValue(null);
  });

  test('missing companyJoinStatus is not accepted', () => {
    expect(hasAcceptedJoinStatus({ companyId: 'tax-aaa' })).toBe(false);
    expect(userBelongsToCompany({ companyId: 'tax-aaa', companies: ['tax-aaa'] }, 'tax-aaa')).toBe(false);
  });

  test('Test 3: x-company-id victim without membership returns null', () => {
    const userA = {
      companyId: 'company-a',
      activeCompanyId: 'company-a',
      companies: ['company-a'],
      companyJoinStatus: 'accepted',
    };
    expect(resolveTrustedCompanyId(userA, 'company-b', { userId: 'user-a' })).toBeNull();
  });

  test('accepted member may select own company via header', () => {
    const userA = {
      companyId: 'company-a',
      activeCompanyId: 'company-a',
      companyJoinStatus: 'accepted',
    };
    expect(resolveTrustedCompanyId(userA, 'company-a', { userId: 'user-a' })).toBe('company-a');
  });

  test('pending user cannot use company header', () => {
    const pending = {
      companyId: 'company-a',
      companyJoinStatus: 'pending',
    };
    expect(userBelongsToCompany(pending, 'company-a')).toBe(false);
    expect(resolveTrustedCompanyId(pending, 'company-a')).toBeNull();
  });

  test('companies[] spoof without accepted status is denied', () => {
    const attacker = {
      companyId: 'solo-x',
      companies: ['victim-company'],
      activeCompanyId: 'victim-company',
    };
    expect(userBelongsToCompany(attacker, 'victim-company')).toBe(false);
    expect(resolveTrustedCompanyId(attacker, 'victim-company')).toBeNull();
  });

  test('body/query equivalent: belongs check fails for other company', () => {
    const userA = {
      companyId: 'company-a',
      companyJoinStatus: 'accepted',
    };
    expect(userBelongsToCompany(userA, 'company-b')).toBe(false);
  });

  test('async header spoof still denied when members doc missing', async () => {
    getAdminDb.mockResolvedValue({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({ exists: false, data: () => null }),
            }),
          }),
        }),
      }),
    });

    const userA = {
      companyId: 'company-a',
      companyJoinStatus: 'accepted',
    };
    const result = await resolveTrustedCompanyIdAsync(userA, 'company-b', { userId: 'user-a' });
    expect(result).toBeNull();
  });

  test('async allows members/{uid} accepted even if user join status lags', async () => {
    getAdminDb.mockResolvedValue({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({ exists: true, data: () => ({ status: 'accepted', userId: 'user-a' }) }),
            }),
          }),
        }),
      }),
    });

    const userA = { companyId: 'solo-x' };
    const result = await resolveTrustedCompanyIdAsync(userA, 'company-a', { userId: 'user-a' });
    expect(result).toBe('company-a');
  });

  test('pending user with matching companyId is not a member (customers/invoices leftover)', () => {
    const pending = {
      companyId: 'company-a',
      activeCompanyId: 'company-a',
      companies: ['company-a'],
      companyJoinStatus: 'pending',
    };
    expect(userBelongsToCompany(pending, 'company-a')).toBe(false);
  });
});
