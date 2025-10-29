export type DemandVisibility = "ozel" | "liste-disi" | "genel";
export type InviteMode = "auto" | "custom";
export type BidVisibility = "gizli" | "acik" | "hibrit";

export type DemandInput = {
  ownerId: string;
  title: string;
  bidVisibility: BidVisibility;
  demandVisibility: DemandVisibility;
  selectedGroupIds: string[];
  inviteMode: InviteMode;
  invitedSupplierIds: string[]; // custom ise dolu gelir
};


