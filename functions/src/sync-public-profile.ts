/**
 * Teklifbul Rule v1.0 — publicProfiles: PII'siz pazaryeri projeksiyonu
 */

export type PublicProfilePayload = {
  displayName: string;
  companyName: string;
  isSupplier: true;
  isActive: true;
  companyId: string | null;
  supplierCategoryIds: string[];
  photoURL: string | null;
  updatedAt: unknown;
};

function isSupplierUser(data: Record<string, unknown>): boolean {
  if (data.isSupplier === true) return true;
  const roles = data.roles;
  if (Array.isArray(roles) && roles.includes('supplier')) return true;
  if (roles && typeof roles === 'object' && (roles as { supplier?: boolean }).supplier === true) {
    return true;
  }
  return false;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * Aktif tedarikçi için publicProfiles gövdesi. PII (email/phone/tax) yok.
 * Aktif tedarikçi değilse null → doküman silinmeli.
 */
export function buildPublicProfilePayload(
  userData: Record<string, unknown> | undefined,
  updatedAt: unknown
): PublicProfilePayload | null {
  if (!userData || !isSupplierUser(userData) || userData.isActive === false) {
    return null;
  }

  const displayName = String(
    userData.displayName || userData.name || userData.companyName || ''
  ).trim();
  const companyName = String(userData.companyName || userData.displayName || '').trim();
  const rawCompanyId = userData.companyId || userData.activeCompanyId;
  const companyId =
    typeof rawCompanyId === 'string' && rawCompanyId && !rawCompanyId.startsWith('solo-')
      ? rawCompanyId
      : null;

  return {
    displayName: displayName || companyName || 'Tedarikçi',
    companyName: companyName || displayName || 'Tedarikçi',
    isSupplier: true,
    isActive: true,
    companyId,
    supplierCategoryIds: asStringList(userData.supplierCategoryIds),
    photoURL: typeof userData.photoURL === 'string' ? userData.photoURL : null,
    updatedAt,
  };
}
