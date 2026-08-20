import { describe, expect, test } from 'vitest';
import { buildPublicCompanyProfilePayload } from '../functions/src/sync-public-company-profile.ts';

describe('buildPublicCompanyProfilePayload', () => {
  test('whitelists marketplace fields and omits private company data', () => {
    const payload = buildPublicCompanyProfilePayload(
      'tax-0450650024',
      {
        name: 'A Ltd',
        companyName: 'A Limited',
        logoUrl: 'https://cdn.example/logo.png',
        about: 'Supplier',
        website: 'https://a.example',
        city: 'Ankara',
        isSupplier: true,
        isBuyer: false,
        isMarketplaceVisible: true,
        supplierCategoryIds: ['cement'],
        taxNumber: '0450650024',
        taxOffice: 'Çankaya',
        address: 'Gizli cad',
        phone: '5551112233',
        email: 'secret@a.example',
        planId: 'premium_monthly',
        isPremium: true,
        billing: { iban: 'TR00' },
        ownerId: 'uid-owner',
        balanceTokens: 9000,
      },
      'ts'
    );
    expect(payload).toMatchObject({
      companyId: 'tax-0450650024',
      name: 'A Ltd',
      companyName: 'A Limited',
      city: 'Ankara',
      isSupplier: true,
      isMarketplaceVisible: true,
    });
    expect(payload).not.toHaveProperty('taxNumber');
    expect(payload).not.toHaveProperty('address');
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('planId');
    expect(payload).not.toHaveProperty('billing');
    expect(payload).not.toHaveProperty('ownerId');
    expect(payload).not.toHaveProperty('balanceTokens');
    expect(Object.keys(payload || {})).toEqual([
      'companyId',
      'name',
      'companyName',
      'logoUrl',
      'about',
      'website',
      'city',
      'isSupplier',
      'isBuyer',
      'isMarketplaceVisible',
      'supplierCategoryIds',
      'updatedAt',
    ]);
  });

  test('returns null when company has no display name', () => {
    expect(buildPublicCompanyProfilePayload('c1', { taxNumber: '1' }, 'ts')).toBeNull();
  });
});
