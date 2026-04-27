import type { DemandPayload, Supplier } from "./types";
// @ts-expect-error -- assets/js/utils/api-helpers.js JS modülü, type tanımı eklenecek
import { authFetch } from "../../../assets/js/utils/api-helpers.js";

export async function fetchGroupMembers(groupIds: string[]): Promise<Supplier[]> {
  if (!groupIds.length) return [];
  // Teklifbul Rule v1.0 - authFetch ile token + x-company-id ekleniyor
  const res = await authFetch(`/api/groups/members?ids=${groupIds.join(",")}`);
  if (!res.ok) throw new Error("Grup uyeleri alinamadi");
  return res.json();
}

export async function createDemand(payload: DemandPayload) {
  // Teklifbul Rule v1.0 - authFetch zorunlu (Bearer token + x-company-id)
  const res = await authFetch("/api/demands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || "Talep olusturulamadi");
  }
  return res.json();
}


