import { useState } from "react";

export default function PurchaseRequest() {
  const [preview, setPreview] = useState<any|null>(null);
  const [file, setFile] = useState<File|null>(null);

  const downloadBlank = () => {
    fetch("/api/forms/purchase/blank")
      .then(r => { if(!r.ok) throw new Error("Şablon bulunamadı"); return r.blob(); })
      .then(b => {
        const url = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = url; a.download = "satinalma_talep_sablon.xlsx";
        a.click(); URL.revokeObjectURL(url);
      })
      .catch(e => alert(e.message));
  };

  const uploadFilled = async () => {
    if (!file) return alert("Dosya seçin");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/forms/purchase/upload", { method: "POST", body: fd });
    if (!r.ok) return alert("Form okunamadı");
    const data = await r.json();
    setPreview(data);
  };

  const confirmCreate = async (vendorGroupIds:number[] = []) => {
    if (!preview) return;
    const r = await fetch("/api/forms/purchase/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: preview.meta, items: preview.items, vendorGroupIds })
    });
    const data = await r.json();
    alert(`Talep oluşturuldu: ${data.requestId}`);
  };

  return (
    <div className="space-y-3">
      <h2>Satın Alma Talebi</h2>
      <div className="flex gap-2">
        <button onClick={downloadBlank}>Boş Şablonu İndir</button>
        <input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0] || null)} />
        <button onClick={uploadFilled}>Dolu Formu Yükle</button>
      </div>

      {preview && (
        <>
          <h3>Önizleme ({preview.item_count} kalem)</h3>
          <table border={1} cellPadding={4}>
            <thead><tr>
              <th>Sıra</th><th>Kod</th><th>Tanım</th><th>Marka</th>
              <th>Birim</th><th>Miktar</th><th>Teslim Tarihi</th>
            </tr></thead>
            <tbody>
              {preview.items.slice(0,20).map((it:any,i:number)=>(
                <tr key={i}>
                  <td>{it.sira_no}</td><td>{it.malzeme_kodu}</td><td>{it.malzeme_tanimi}</td>
                  <td>{it.marka}</td><td>{it.birim}</td><td>{it.miktar}</td><td>{String(it.istenilen_teslim_tarihi||"")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* örnek vendor group seçimi */}
          <div className="mt-2">
            <button onClick={()=>confirmCreate([1,2])}>Talebi Oluştur ve Grup(1,2)'ye Gönder</button>
          </div>
        </>
      )}
    </div>
  );
}
