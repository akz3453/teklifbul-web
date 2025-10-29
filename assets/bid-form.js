// assets/bid-form.js
// Talep detayındaki items dizisini sırayla çizip teklif toplar.
// Gerekli: sayfada <table id="bidTable"> ve bir Kaydet/İndir butonu.

export function renderBidTable(demand) {
  const tbody = document.querySelector("#bidTable tbody");
  if (!tbody) {
    console.warn("bidTable tbody bulunamadı");
    return;
  }
  
  tbody.innerHTML = "";

  const items = [...(demand.items || [])].sort((a,b)=>(a.no??0)-(b.no??0));

  items.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.qty = it.qty ?? 0;
    tr.innerHTML = `
      <td>${it.no ?? idx+1}</td>
      <td>${it.sku ?? ""}</td>
      <td>${it.name ?? ""}</td>
      <td>${it.brand ?? ""}</td>
      <td>${it.qty ?? 0}</td>
      <td>${it.unit ?? ""}</td>
      <td><input type="number" step="0.0001" min="0" class="unitPrice" placeholder="0"></td>
      <td><input type="number" step="0.1" min="0" class="vatRate" value="20"></td>
      <td class="lineNet">0</td>
      <td class="lineVat">0</td>
      <td class="lineGross">0</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.addEventListener("input", (e) => {
    const tr = e.target.closest("tr"); 
    if (!tr) return;
    
    const qty = Number(tr.dataset.qty || 0);
    const price = Number(tr.querySelector(".unitPrice").value || 0);
    const vatR  = Number(tr.querySelector(".vatRate").value || 0);
    const net = qty*price;
    const vat = net*(vatR/100);
    
    tr.querySelector(".lineNet").textContent = net.toFixed(2);
    tr.querySelector(".lineVat").textContent = vat.toFixed(2);
    tr.querySelector(".lineGross").textContent = (net+vat).toFixed(2);
    
    recalcTotals();
  });

  function recalcTotals() {
    let sN=0, sV=0, sG=0;
    document.querySelectorAll("#bidTable tbody tr").forEach(tr=>{
      sN+=Number(tr.querySelector(".lineNet").textContent||0);
      sV+=Number(tr.querySelector(".lineVat").textContent||0);
      sG+=Number(tr.querySelector(".lineGross").textContent||0);
    });
    
    const sumNetEl = document.getElementById("sumNet");
    const sumVatEl = document.getElementById("sumVat");
    const sumGrossEl = document.getElementById("sumGross");
    
    if (sumNetEl) sumNetEl.textContent = sN.toFixed(2);
    if (sumVatEl) sumVatEl.textContent = sV.toFixed(2);
    if (sumGrossEl) sumGrossEl.textContent = sG.toFixed(2);
  }
}

export function collectBidPayload(demand, firma) {
  const items = [...(demand.items || [])].sort((a,b)=>(a.no??0)-(b.no??0));
  const fiyatlar = [];
  
  document.querySelectorAll("#bidTable tbody tr").forEach(tr=>{
    const price = tr.querySelector(".unitPrice").value;
    fiyatlar.push(price !== "" ? Number(price) : null);
  });
  
  return {
    stf_no: demand.stf_no,
    talep_kodu: demand.talep_kodu,
    santiye: demand.santiye,
    usd_try: demand.usd_try,
    talep_konusu: demand.talep_konusu,
    alim_yeri: demand.alim_yeri,
    aciklama: demand.aciklama,
    items: items.map(it=>({no:it.no,name:it.name,qty:it.qty,unit:it.unit})),
    firms: [{
      firma_adi: firma.ad,
      tel: firma.tel || "",
      odeme: firma.odeme || "",
      termin: firma.termin || "",
      fiyatlar
    }]
  };
}

export async function exportComparisonExcel(payload){
  try {
    const res = await fetch("/export-comparison", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    
    if(!res.ok) {
      throw new Error(`Excel oluşturulamadı: ${res.status} ${res.statusText}`);
    }
    
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href:url, 
      download:`mukayese_tablo_${payload.stf_no||"STF"}.xlsx`
    });
    a.click(); 
    URL.revokeObjectURL(url);
    
    console.log("✅ Excel dosyası indirildi:", `mukayese_tablo_${payload.stf_no||"STF"}.xlsx`);
  } catch (error) {
    console.error("❌ Excel indirme hatası:", error);
    alert("Excel dosyası indirilemedi: " + error.message);
  }
}
