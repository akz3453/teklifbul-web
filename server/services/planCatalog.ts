// Teklifbul Rule v1.0
import { logger } from '../../src/shared/log/logger.js';

export type PlanId = 'free' | 'premium_monthly' | 'premium_yearly' | 'premium_plus_monthly' | 'premium_plus_yearly';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  billingInterval: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  description: string;
  features: string[];
  intervalDays: number;
}

export const planCatalog: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Ücretsiz Plan',
    billingInterval: 'monthly',
    amount: 0,
    currency: 'TRY',
    description: 'Temel teklif ve stok yönetimi',
    features: [
      'Sınırlı teklif oluşturma',
      'Temel raporlar',
      'Standart destek'
    ],
    intervalDays: 30
  },
  premium_monthly: {
    id: 'premium_monthly',
    name: 'Premium Aylık',
    billingInterval: 'monthly',
    amount: 359,              // ₺359 (KDV dahil) - Premium Tedarikçi veya Alıcı
    currency: 'TRY',
    description: 'Gelişmiş teklif ve stok yönetimi',
    features: [
      'Sınırsız teklif ve depo',
      'Temel raporlar',
      'Öncelikli destek'
    ],
    intervalDays: 30
  },
  premium_yearly: {
    id: 'premium_yearly',
    name: 'Premium Yıllık',
    billingInterval: 'yearly',
    amount: 3949,             // ₺359 * 11 (yıllık avantaj)
    currency: 'TRY',
    description: 'Yıllık avantajlı premium paket',
    features: [
      'Sınırsız teklif ve depo',
      'Temel raporlar',
      'Öncelikli destek',
      'Yıllık ödeme avantajı'
    ],
    intervalDays: 365
  },
  premium_plus_monthly: {
    id: 'premium_plus_monthly',
    name: 'Premium Plus Aylık',
    billingInterval: 'monthly',
    amount: 600,
    currency: 'TRY',
    description: 'Premium Plus ile AI özelliklerine erişim (token paketi gerekli)',
    features: [
      'Sınırsız teklif ve depo',
      'AI satın alma asistanı (token paketi ile)',
      'Gelişmiş raporlar',
      'Öncelikli destek',
      'AI özelliklerine erişim'
    ],
    intervalDays: 30
  },
  premium_plus_yearly: {
    id: 'premium_plus_yearly',
    name: 'Premium Plus Yıllık',
    billingInterval: 'yearly',
    amount: 6600,
    currency: 'TRY',
    description: 'Yıllık avantajlı Premium Plus paket (token paketi gerekli)',
    features: [
      'Sınırsız teklif ve depo',
      'AI satın alma asistanı (token paketi ile)',
      'Gelişmiş raporlar',
      'Öncelikli destek',
      'Yıllık ödeme avantajı',
      'AI özelliklerine erişim'
    ],
    intervalDays: 365
  }
};

export function getPlanDefinition(planId: string): PlanDefinition | null {
  const plan = planCatalog[planId as PlanId];
  if (!plan) {
    logger.warn('Plan not found', { planId });
    return null;
  }
  return plan;
}

/** Display-only fallback — asla ödeme/yetki kararı için kullanma */
export function getPlanDefinitionOrFree(planId: string): PlanDefinition {
  return getPlanDefinition(planId) || planCatalog.free;
}

/** Ücretli Premium / Premium Plus plan id (free ve bilinmeyen id false) */
export function isPaidPremiumPlanId(planId: string | null | undefined): boolean {
  const id = String(planId || '').trim().toLowerCase();
  if (!id || id === 'free') return false;
  return id.includes('premium');
}

export function parseExpiryDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Şirket dokümanı Premium verir mi?
 * isPremium bayrağı tek başına yetmez; ücretli planId + (varsa) süre gerekir.
 */
export function companyGrantsPremiumAccess(
  companyData: Record<string, unknown> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!companyData) return false;
  const planId = String(
    companyData.planId ||
      companyData.plan ||
      companyData.subscriptionPlanId ||
      (companyData.subscription as { planId?: string } | undefined)?.planId ||
      ''
  );
  if (!isPaidPremiumPlanId(planId)) return false;
  const expiresAt = parseExpiryDate(
    companyData.premiumExpiresAt ||
      companyData.expiresAt ||
      (companyData.subscription as { expiresAt?: unknown } | undefined)?.expiresAt
  );
  if (expiresAt && expiresAt < now) return false;
  return true;
}

export function subscriptionGrantsPremiumAccess(
  subscription: { planId?: string; status?: string; currentPeriodEnd?: Date | string | null } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active' && subscription.status !== 'trialing') return false;
  if (!isPaidPremiumPlanId(subscription.planId)) return false;
  const end = parseExpiryDate(subscription.currentPeriodEnd);
  if (end && end < now) return false;
  return true;
}

