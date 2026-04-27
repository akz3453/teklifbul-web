// assets/purchase-form.js
// Excel satın alma formunu içe aktar (webten)
// Bununla kullanıcı tarayıcıdan Excel'i seçer → FastAPI /import-purchase-form'a atar → dönen JSON'u talep formunuza doldurursunuz.

// Teklifbul Rule v1.0 - Toast Bildirim Sistemi
import { toast } from '../src/shared/ui/toast.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../src/shared/log/logger.js';
import { MESSAGES } from '../src/shared/constants/messages.js';

export async function importPurchaseExcel(fileInput, onLoaded){
  const file = fileInput.files[0];
  if(!file) {
    logger.warn("Dosya seçilmedi");
    return;
  }
  
  logger.info("📁 Excel dosyası yükleniyor", { fileName: file.name });
  
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
    logger.info("✅ Excel başarıyla okundu", demand);
    
    onLoaded?.(demand);
    
    return demand;
  } catch (error) {
    logger.error("Excel okuma hatası", error);
    toast.error(`${MESSAGES.ERROR_EXCEL_READ}: ${error.message}`);
    throw error;
  }
}

// Yardımcı fonksiyon: JSON'u form alanlarına doldur
export function fillFormFromDemand(demand) {
  logger.info("📝 Form dolduruluyor", demand);
  
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
      logger.info(`📝 ${fieldId} = ${value}`);
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
          <td><input type="text" value="${item.sku || ''}" placeholder="Stok Kodu"></td>
          <td><input type="text" value="${item.name || ''}" placeholder="Ürün İsmi" required></td>
          <td><input type="text" value="${item.brand || ''}" placeholder="Marka/Model"></td>
          <td><input type="number" step="0.01" value="${item.qty || 0}" placeholder="Miktar" required></td>
          <td><input type="text" value="${item.unit || ''}" placeholder="Birim" required></td>
          <td><input type="date" value="${item.req_date || ''}" placeholder="Teslim Tarihi"></td>
          <td><button type="button" class="delBtn" onclick="this.closest('tr').remove()">Sil</button></td>
        `;
        itemsBody.appendChild(tr);
      });
      
      logger.info(`✅ ${demand.items.length} adet ürün kalemi eklendi`);
    }
  }
  
  // Talep kodu varsa göster
  if (demand.talep_kodu) {
    const demandCodeEl = document.getElementById("demandCode");
    if (demandCodeEl) {
      demandCodeEl.textContent = demand.talep_kodu;
    }
  }
  
  logger.info("✅ Form başarıyla dolduruldu");
}
