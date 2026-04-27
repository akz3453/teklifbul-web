// assets/bid-form-import.js
// Excel teklif formundan içe aktar (webten)

// Teklifbul Rule v1.0 - Toast Bildirim Sistemi
import { toast } from '../src/shared/ui/toast.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../src/shared/log/logger.js';
import { MESSAGES } from '../src/shared/constants/messages.js';

export async function importBidExcel(fileInput, onLoaded){
  const file = fileInput.files[0];
  if(!file) {
    logger.warn("Dosya seçilmedi");
    return;
  }
  
  logger.info("📁 Teklif Excel dosyası yükleniyor", { fileName: file.name });
  
  try {
    const fd = new FormData(); 
    fd.append("file", file);
    
    const res = await fetch("/import-bid-form", { 
      method:"POST", 
      body: fd 
    });
    
    if(!res.ok) {
      const errorText = await res.text();
      throw new Error(`Teklif formu okunamadı: ${res.status} ${res.statusText}\n${errorText}`);
    }
    
    const bid = await res.json(); // {firma_adi, fiyatlar[], items[]...}
    logger.info("✅ Teklif Excel başarıyla okundu", bid);
    
    onLoaded?.(bid);
    
    return bid;
  } catch (error) {
    logger.error("❌ Teklif Excel okuma hatası", error);
    toast.error(MESSAGES.ERROR_EXCEL_READ_BID.replace('{message}', error.message));
    throw error;
  }
}

// Yardımcı fonksiyon: Teklif verilerini mevcut tabloya uygula
export function applyBidToTable(bid) {
  logger.info("📝 Teklif verileri tabloya uygulanıyor", bid);
  
  // Fiyatları inputlara yerleştir
  document.querySelectorAll("#bidTable tbody tr").forEach((tr, i)=>{
    const price = bid.fiyatlar[i]; 
    if(price != null) {
      const priceInput = tr.querySelector(".unitPrice");
      if (priceInput) {
        priceInput.value = price;
        // Input event'ini tetikle ki hesaplamalar yapılsın
        tr.dispatchEvent(new Event("input", {bubbles:true}));
      }
    }
  });
  
  logger.info("✅ Teklif fiyatları tabloya uygulandı");
}

// Yardımcı fonksiyon: Teklif bilgilerini form alanlarına doldur
export function fillBidFormFromExcel(bid) {
  logger.info("📝 Teklif formu dolduruluyor", bid);
  
  // Firma bilgileri
  const firmaAdiEl = document.getElementById("firmaAdi");
  if (firmaAdiEl && bid.firma_adi) {
    firmaAdiEl.value = bid.firma_adi;
  }
  
  const telEl = document.getElementById("tel");
  if (telEl && bid.tel) {
    telEl.value = bid.tel;
  }
  
  const odemeEl = document.getElementById("odeme");
  if (odemeEl && bid.odeme) {
    odemeEl.value = bid.odeme;
  }
  
  const terminEl = document.getElementById("termin");
  if (terminEl && bid.termin) {
    terminEl.value = bid.termin;
  }
  
  // Talep bilgileri
  const talepKoduEl = document.getElementById("talepKodu");
  if (talepKoduEl && bid.talep_kodu) {
    talepKoduEl.value = bid.talep_kodu;
  }
  
  const stfNoEl = document.getElementById("stfNo");
  if (stfNoEl && bid.stf_no) {
    stfNoEl.value = bid.stf_no;
  }
  
  logger.info("✅ Teklif formu başarıyla dolduruldu");
}
