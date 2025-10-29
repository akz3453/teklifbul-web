import { useState } from "react";
import { InviteSection } from "./InviteSection";
import { BidVisibility, DemandPayload, DemandVisibility, Group, InviteMode, Supplier } from "./types";
import { createDemand } from "./api";

export function DemandForm({ allGroups, supplierSearch }:{ allGroups: Group[]; supplierSearch:(q:string)=>Promise<Supplier[]> }) {
  const [title, setTitle] = useState("");
  const [bidVisibility, setBidVisibility] = useState<BidVisibility>("gizli");
  const [demandVisibility, setDemandVisibility] = useState<DemandVisibility>("genel");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [inviteMode, setInviteMode] = useState<InviteMode>("auto");
  const [customInvitees, setCustomInvitees] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: DemandPayload = {
      title,
      bidVisibility,
      demandVisibility,
      selectedGroupIds,
      inviteMode,
      invitedSupplierIds: customInvitees.map(s=>s.id),
    };
    setLoading(true);
    try {
      await createDemand(payload);
      alert("Talep oluşturuldu");
    } catch (e:any) {
      alert(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div>
        <label className="text-sm">Başlık</label>
        <input className="border rounded p-2 w-full" value={title} onChange={e=>setTitle(e.target.value)} />
      </div>

      <fieldset className="border rounded p-3">
        <legend className="font-medium">Talep Tipi (Tekliflerin görünürlüğü)</legend>
        <Radio name="bidVis" label="Gizli" value="gizli" checked={bidVisibility==="gizli"} onChange={()=>setBidVisibility("gizli")} />
        <Radio name="bidVis" label="Açık" value="acik" checked={bidVisibility==="acik"} onChange={()=>setBidVisibility("acik")} />
        <Radio name="bidVis" label="Hibrit" value="hibrit" checked={bidVisibility==="hibrit"} onChange={()=>setBidVisibility("hibrit")} />
      </fieldset>

      <InviteSection
        allGroups={allGroups}
        visibility={demandVisibility}
        onVisibilityChange={setDemandVisibility}
        selectedGroupIds={selectedGroupIds}
        onSelectedGroupIdsChange={setSelectedGroupIds}
        inviteMode={inviteMode}
        onInviteModeChange={setInviteMode}
        customInvitees={customInvitees}
        onCustomInviteesChange={setCustomInvitees}
        supplierSearch={supplierSearch}
      />

      <div>
        <button className="px-4 py-2 rounded bg-blue-600 text-white" disabled={loading}>{loading?"Kaydediliyor…":"Kaydet"}</button>
      </div>
    </form>
  );
}

function Radio(props: any) { return (
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="radio" {...props} className="h-4 w-4" />
    <span>{props.label}</span>
  </label>
);}


