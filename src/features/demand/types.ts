export type DemandVisibility = "ozel" | "liste-disi" | "genel";
export type InviteMode = "auto" | "custom";
export type BidVisibility = "gizli" | "acik" | "hibrit";

export type Group = { id: string; name: string; memberCount: number };
export type Supplier = { id: string; name: string };

export type DemandPayload = {
  title: string;
  bidVisibility: BidVisibility;           // Tekliflerin görünürlüğü
  demandVisibility: DemandVisibility;     // Talebi kimler görür
  selectedGroupIds: string[];             // Özel ise: seçilen gruplar
  inviteMode: InviteMode;                 // "auto" | "custom"
  invitedSupplierIds: string[];           // custom modda dolu; auto modda sunucu hesaplar
  schedule?: { mode: "now" | "scheduled"; startAt?: string; endAt?: string };
};


