import { DemandInput } from "../types/demand";

// Bu fonksiyon, groupIds -> supplierIds hesaplar (DB/Firestore'dan gerçek veriyi çekmelidir).
export async function resolveGroupMembers(groupIds: string[]): Promise<string[]> {
  // TODO: Firestore/DB sorguları ile gerçek üyeleri getir.
  // Örnek dummy:
  if (!groupIds.length) return [];
  return ["supplier_1", "supplier_2"]; // PLACEHOLDER
}

export async function computeInvitedSupplierIds(input: DemandInput): Promise<string[]> {
  if (input.demandVisibility !== "ozel") return [];
  if (input.inviteMode === "auto") {
    const members = await resolveGroupMembers(input.selectedGroupIds);
    return Array.from(new Set(members)); // uniq
  } else {
    // custom
    return Array.from(new Set(input.invitedSupplierIds));
  }
}


