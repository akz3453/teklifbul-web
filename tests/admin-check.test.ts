/**
 * Teklifbul Rule v1.0 — Platform admin: custom claims only
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isAdminUser, isOpsUser } from '../server/auth/admin-check.js';

describe('isAdminUser claims-only', () => {
  test('superAdmin claim grants admin', () => {
    expect(isAdminUser({ uid: 'u1', customClaims: { superAdmin: true } })).toBe(true);
  });

  test('admin / isAdmin / role=admin claims grant admin', () => {
    expect(isAdminUser({ uid: 'u1', customClaims: { admin: true } })).toBe(true);
    expect(isAdminUser({ uid: 'u1', customClaims: { isAdmin: true } })).toBe(true);
    expect(isAdminUser({ uid: 'u1', customClaims: { role: 'admin' } })).toBe(true);
  });

  test('Firestore-shaped isAdmin/role without claims is denied', () => {
    expect(isAdminUser({ uid: 'u1', isAdmin: true, role: 'admin' })).toBe(false);
  });

  test('ops claim is not platform admin', () => {
    expect(isAdminUser({ uid: 'u1', customClaims: { ops: true, role: 'ops' } })).toBe(false);
    expect(isOpsUser({ uid: 'u1', customClaims: { ops: true } })).toBe(true);
  });

  test('null user is not admin', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isOpsUser(undefined)).toBe(false);
  });
});

describe('isAdminUser ADMIN_EMAILS', () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
    vi.resetModules();
  });

  test('allowlisted email is admin', async () => {
    vi.resetModules();
    process.env.ADMIN_EMAILS = 'ops@example.com';
    const { isAdminUser: check } = await import('../server/auth/admin-check.js');
    expect(check({ uid: 'u1', email: 'ops@example.com' })).toBe(true);
    expect(check({ uid: 'u2', email: 'other@example.com' })).toBe(false);
  });
});
