import { useEffect, useMemo, useState } from "react";
import { Group, Supplier, DemandVisibility, InviteMode } from "./types";
import { fetchGroupMembers } from "./api";

export function InviteSection({
  allGroups,
  visibility,
  onVisibilityChange,
  selectedGroupIds,
  onSelectedGroupIdsChange,
  inviteMode,
  onInviteModeChange,
  customInvitees,
  onCustomInviteesChange,
  supplierSearch,
}: {
  allGroups: Group[];
  visibility: DemandVisibility;
  onVisibilityChange: (v: DemandVisibility) => void;
  selectedGroupIds: string[];
  onSelectedGroupIdsChange: (ids: string[]) => void;
  inviteMode: InviteMode;
  onInviteModeChange: (m: InviteMode) => void;
  customInvitees: Supplier[];
  onCustomInviteesChange: (list: Supplier[]) => void;
  supplierSearch: (q: string) => Promise<Supplier[]>;
}) {
  const isPrivate = visibility === "ozel";
  const [autoMembers, setAutoMembers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPrivate && inviteMode === "auto" && selectedGroupIds.length) {
      setLoading(true);
      fetchGroupMembers(selectedGroupIds).then(setAutoMembers).finally(() => setLoading(false));
    } else if (inviteMode === "auto") {
      setAutoMembers([]);
    }
  }, [isPrivate, inviteMode, selectedGroupIds]);

  const finalInvitees = useMemo(
    () => (inviteMode === "auto" ? autoMembers : customInvitees),
    [inviteMode, autoMembers, customInvitees]
  );

  return (
    <div className="space-y-4">
      <fieldset className="border rounded p-3">
        <legend className="font-medium">Talep Görünürlüğü (Talebi kimler görebilir?)</legend>
        <Radio name="vis" label="Özel (davetli)" value="ozel" checked={isPrivate} onChange={() => onVisibilityChange("ozel")} />
        <p className="text-xs text-gray-500 ml-6">Seçtiğiniz gruplardaki tüm firmalar otomatik davet edilir. İsterseniz özelleştirebilirsiniz.</p>
        <Radio name="vis" label="Liste dışı (link ile)" value="liste-disi" checked={visibility==="liste-disi"} onChange={() => onVisibilityChange("liste-disi")} />
        <Radio name="vis" label="Genel (tüm kullanıcılar)" value="genel" checked={visibility==="genel"} onChange={() => onVisibilityChange("genel")} />
      </fieldset>

      {isPrivate && (
        <fieldset className="border rounded p-3 space-y-3">
          <legend className="font-medium">Davetliler</legend>

          <MultiSelect
            label="Tedarikçi Grupları"
            options={allGroups.map(g => ({ value: g.id, label: `${g.name} (${g.memberCount})` }))}
            value={selectedGroupIds}
            onChange={onSelectedGroupIdsChange}
            placeholder="Grup seçin"
          />

          <div className="flex gap-6">
            <Radio name="mode" value="auto" label="Gruba göre otomatik" checked={inviteMode==="auto"} onChange={() => onInviteModeChange("auto")} />
            <Radio name="mode" value="custom" label="Özelleştir (firma seç)" checked={inviteMode==="custom"} onChange={() => onInviteModeChange("custom")} />
          </div>

          {inviteMode === "auto" ? (
            <div className="text-sm text-gray-700">
              {loading ? "Grup üyeleri yükleniyor..." : `Otomatik davetli sayısı: ${finalInvitees.length}`}
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600">Listeyi gör</summary>
                <ul className="list-disc ml-5">
                  {finalInvitees.map(s => <li key={s.id}>{s.name}</li>)}
                </ul>
              </details>
            </div>
          ) : (
            <CustomInviteEditor
              value={customInvitees}
              onChange={onCustomInviteesChange}
              search={supplierSearch}
              seedFromGroups={async () => {
                const seed = await fetchGroupMembers(selectedGroupIds);
                onCustomInviteesChange(seed);
              }}
            />
          )}
        </fieldset>
      )}

      <input type="hidden" name="invitedSupplierIds" value={finalInvitees.map(s=>s.id).join(",")} />
    </div>
  );
}

function Radio(props: any) { return (
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="radio" {...props} className="h-4 w-4" />
    <span>{props.label}</span>
  </label>
);}

function MultiSelect({ label, options, value, onChange, placeholder }:{
  label:string; options:{value:string; label:string}[]; value:string[]; onChange:(v:string[])=>void; placeholder?:string;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-sm">{label}</label>
      <select multiple className="border rounded p-2"
        value={value}
        onChange={(e)=>onChange(Array.from(e.target.selectedOptions).map(o=>o.value))}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="text-xs text-gray-500">{placeholder}</p>
    </div>
  );
}

function CustomInviteEditor({
  value, onChange, search, seedFromGroups
}:{
  value: Supplier[]; onChange:(v:Supplier[])=>void;
  search:(q:string)=>Promise<Supplier[]>; seedFromGroups:()=>Promise<void>;
}) {
  const [q, setQ] = useState(""); const [results, setResults] = useState<Supplier[]>([]);
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 flex-1" placeholder="Firma ara…" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={async ()=>{
          const r = await search(q); setResults(r);
        }}>Ara</button>
        <button className="px-3 py-1 rounded bg-gray-600 text-white" onClick={seedFromGroups}>Gruplardan başlat</button>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="font-medium text-sm mb-1">Sonuçlar</div>
          <ul className="border rounded p-2 h-40 overflow-auto">
            {results.map(s => (
              <li key={s.id} className="flex justify-between items-center py-1">
                <span>{s.name}</span>
                <button className="text-blue-600 text-sm" onClick={()=>onChange([...value, s])}>Ekle</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm mb-1">Davetliler</div>
          <ul className="border rounded p-2 h-40 overflow-auto">
            {value.map(s => (
              <li key={s.id} className="flex justify-between items-center py-1">
                <span>{s.name}</span>
                <button className="text-red-600 text-sm" onClick={()=>onChange(value.filter(x=>x.id!==s.id))}>Kaldır</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}


