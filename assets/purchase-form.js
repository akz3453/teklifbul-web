// assets/purchase-form.js
// Excel satın alma formunu içe aktar (webten)
// Bununla kullanıcı tarayıcıdan Excel'i seçer → FastAPI /import-purchase-form'a atar → dönen JSON'u talep formunuza doldurursunuz.

export async function importPurchaseExcel(fileInput, onLoaded){
  const file = fileInput.files[0];
  if(!file) {
    console.warn("Dosya seçilmedi");
    return;
  }
  
  console.log("📁 Excel dosyası yükleniyor:", file.name);
  
  try {
    const fd = new FormData(); 
    fd.append("file", file);
    
    const res = await fetch("/import-purchase-form", { 
      method:"POST", 
      body: fd 
    });
    
    if(!res.ok) {
      const errorText = await res.text();
      throw new Error(`Excel okunamadı: ${res.status} ${res.statusText}\n${errorText}`);
    }
    
    const demand = await res.json();
    console.log("✅ Excel başarıyla okundu:", demand);
    
    onLoaded?.(demand);
    
    return demand;
  } catch (error) {
    console.error("❌ Excel okuma hatası:", error);
    alert("Excel dosyası okunamadı: " + error.message);
    throw error;
  }
}

// Yardımcı fonksiyon: JSON'u form alanlarına doldur
export function fillFormFromDemand(demand) {
  console.log("📝 Form dolduruluyor:", demand);
  
  // Temel alanlar
  const fieldMappings = {
    "stfNo": demand.stf_no,
    "title": demand.talep_konusu,
    "santiye": demand.santiye,
    "dueDate": demand.termin_tarihi,
    "alimYeri": demand.alim_yeri,
    "spec": demand.aciklama,
    "usdTry": demand.usd_try
  };
  
  // Form alanlarını doldur
  Object.entries(fieldMappings).forEach(([fieldId, value]) => {
    const element = document.getElementById(fieldId);
    if (element && value !== null && value !== undefined) {
      element.value = value;
      console.log(`📝 ${fieldId} = ${value}`);
    }
  });
  
  // Ürün kalemlerini tabloya ekle
  if (demand.items && demand.items.length > 0) {
    const itemsBody = document.getElementById("itemsBody");
    if (itemsBody) {
      itemsBody.innerHTML = ""; // Mevcut kalemleri temizle
      
      demand.items.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${item.no || index + 1}</td>
          <td><input type="text" value="${item.sku || ''}" placeholder="Malzeme Kodu"></td>
          <td><input type="text" value="${item.name || ''}" placeholder="Ürün İsmi" required></td>
          <td><input type="text" value="${item.brand || ''}" placeholder="Marka/Model"></td>
          <td><input type="number" step="0.01" value="${item.qty || 0}" placeholder="Miktar" required></td>
          <td><input type="text" value="${item.unit || ''}" placeholder="Birim" required></td>
          <td><input type="date" value="${item.req_date || ''}" placeholder="Teslim Tarihi"></td>
          <td><button type="button" class="delBtn" onclick="this.closest('tr').remove()">Sil</button></td>
        `;
        itemsBody.appendChild(tr);
      });
      
      console.log(`✅ ${demand.items.length} adet ürün kalemi eklendi`);
    }
  }
  
  // Talep kodu varsa göster
  if (demand.talep_kodu) {
    const demandCodeEl = document.getElementById("demandCode");
    if (demandCodeEl) {
      demandCodeEl.textContent = demand.talep_kodu;
    }
  }
  
  console.log("✅ Form başarıyla dolduruldu");
}
