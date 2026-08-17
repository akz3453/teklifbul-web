import { describe, expect, test } from 'vitest';
import { buildPublicProfilePayload } from '../functions/src/sync-public-profile.ts';

describe('buildPublicProfilePayload', () => {
  test('strips PII and keeps marketplace fields', () => {
    const payload = buildPublicProfilePayload({
      email: 'secret@test.com',
      phone: '555',
      taxNumber: '123',
      isAdmin: true,
      isSupplier: true,
      isActive: true,
      displayName: 'Ali',
      companyName: 'A Ltd',
      companyId: 'tax-0450650024',
      supplierCategoryIds: ['cement'],
    }, 'ts');
    expect(payload).toMatchObject({
      displayName: 'Ali',
      companyName: 'A Ltd',
      isSupplier: true,
      companyId: 'tax-0450650024',
    });
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('taxNumber');
    expect(payload).not.toHaveProperty('isAdmin');
  });

  test('returns null for non-supplier', () => {
    expect(buildPublicProfilePayload({ isSupplier: false, displayName: 'X' }, 'ts')).toBeNull();
  });
});
