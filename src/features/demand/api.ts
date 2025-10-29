import { DemandPayload, Supplier } from "./types";

export async function fetchGroupMembers(groupIds: string[]): Promise<Supplier[]> {
  if (!groupIds.length) return [];
  const res = await fetch(`/api/groups/members?ids=${groupIds.join(",")}`);
  if (!res.ok) throw new Error("Grup üyeleri alınamadı");
  return res.json();
}

export async function createDemand(payload: DemandPayload) {
  const res = await fetch("/api/demands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Talep oluşturulamadı");
  }
  return res.json();
}


