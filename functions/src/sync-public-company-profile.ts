/**
 * Teklifbul Rule v1.0 — publicCompanyProfiles: PII-free company marketplace projection
 */

export const PUBLIC_COMPANY_PROFILE_FIELDS = [
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
] as const;

export type PublicCompanyProfilePayload = {
  companyId: string;
  name: string;
  companyName: string;
  logoUrl: string | null;
  about: string | null;
  website: string | null;
  city: string | null;
  isSupplier: boolean;
  isBuyer: boolean;
  isMarketplaceVisible: boolean;
  supplierCategoryIds: string[];
  updatedAt: unknown;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function isTruthyFlag(data: Record<string, unknown>, key: string, roleKey?: string): boolean {
  if (data[key] === true) return true;
  const roles = data.roles;
  if (roleKey && roles && typeof roles === 'object' && !Array.isArray(roles)) {
    return (roles as Record<string, unknown>)[roleKey] === true;
  }
  return false;
}

/**
 * Marketplace-safe company card. Never includes tax, phones, emails, address,
 * billing, wallet, owners, or admin fields.
 */
export function buildPublicCompanyProfilePayload(
  companyId: string,
  companyData: Record<string, unknown> | undefined,
  updatedAt: unknown
): PublicCompanyProfilePayload | null {
  if (!companyData) return null;
  const name = asString(companyData.name || companyData.companyName || companyData.title);
  const companyName = asString(companyData.companyName || companyData.name || companyData.title) || name;
  if (!name && !companyName) return null;

  const city = asString(companyData.city)
    || asString((companyData.addressParts as { city?: unknown } | undefined)?.city);

  return {
    companyId,
    name: name || companyName,
    companyName: companyName || name,
    logoUrl: asString(companyData.logoUrl) || null,
    about: asString(companyData.about) || null,
    website: asString(companyData.website) || null,
    city: city || null,
    isSupplier: isTruthyFlag(companyData, 'isSupplier', 'supplier'),
    isBuyer: isTruthyFlag(companyData, 'isBuyer', 'buyer'),
    isMarketplaceVisible: companyData.isMarketplaceVisible === true,
    supplierCategoryIds: asStringList(companyData.supplierCategoryIds),
    updatedAt,
  };
}
