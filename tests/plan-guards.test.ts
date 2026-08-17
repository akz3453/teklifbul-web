import { describe, expect, test } from 'vitest';
import {
  companyGrantsPremiumAccess,
  getPlanDefinition,
  isPaidPremiumPlanId,
  subscriptionGrantsPremiumAccess,
} from '../server/services/planCatalog.js';

describe('plan guards', () => {
  test('unknown planId does not fall back to free for payments', () => {
    expect(getPlanDefinition('not-a-plan')).toBeNull();
    expect(getPlanDefinition('free')?.id).toBe('free');
  });

  test('free is not a paid premium plan', () => {
    expect(isPaidPremiumPlanId('free')).toBe(false);
    expect(isPaidPremiumPlanId('')).toBe(false);
    expect(isPaidPremiumPlanId('premium_monthly')).toBe(true);
    expect(isPaidPremiumPlanId('premium_plus_yearly')).toBe(true);
  });

  test('isPremium flag without paid planId does not grant access', () => {
    expect(companyGrantsPremiumAccess({ isPremium: true, planId: 'free' })).toBe(false);
    expect(companyGrantsPremiumAccess({ isPremium: true })).toBe(false);
    expect(companyGrantsPremiumAccess({ planId: 'premium_monthly' })).toBe(true);
  });

  test('expired company plan is denied', () => {
    expect(companyGrantsPremiumAccess({
      planId: 'premium_monthly',
      premiumExpiresAt: new Date('2020-01-01'),
    })).toBe(false);
  });

  test('active free subscription is not premium', () => {
    expect(subscriptionGrantsPremiumAccess({
      planId: 'free',
      status: 'active',
      currentPeriodEnd: new Date('2099-01-01'),
    })).toBe(false);
    expect(subscriptionGrantsPremiumAccess({
      planId: 'premium_monthly',
      status: 'active',
      currentPeriodEnd: new Date('2099-01-01'),
    })).toBe(true);
  });
});
