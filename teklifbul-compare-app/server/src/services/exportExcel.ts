import ExcelJS from "exceljs";
import path from "path";

export type VendorCellMap = { unitPrice: string; total: string; totalTL: string };

export const TEMPLATE_MAP = {
  headerRow: 7,
  dataStartRow: 9,
  cols: {
    no: "B", urun: "C", qty: "D", unit: "E",
    vendors: [
      { unitPrice:"F", total:"G", totalTL:"H" },
      { unitPrice:"I", total:"J", totalTL:"K" },
      { unitPrice:"L", total:"M", totalTL:"N" },
      { unitPrice:"O", total:"P", totalTL:"Q" },
      { unitPrice:"R", total:"S", totalTL:"T" }
    ] as VendorCellMap[]
  },
  footer: { odeme:22, teslim:24, not:28, bestVendor:31 }
};

function cell(ws: ExcelJS.Worksheet, addr: string) {
  return ws.getCell(addr); // exceljs mevcut stilleri korur; sadece value set ediyoruz
}

export async function exportCompareTemplate(payload: {
  items: Array<{ no: number; name: string; qty: number; unit: string;
                 vendors: Array<{ name:string; unitPrice:number; total:number; totalTL:number }> }>;
  footer?: { odeme?: string; teslim?: string; not?: string; bestVendor?: string };
  membership: "standard" | "premium";
}) {
  const file = path.resolve(__dirname, "../../assets/TEKLİF MUKAYESE FORMU.xlsx");
  const wb = new ExcelJS.Workbook();
  
  try { 
    await wb.xlsx.readFile(file); 
  } catch {
    throw new Error("Şablon dosyası eksik: assets/TEKLİF MUKAYESE FORMU.xlsx");
  }
  
  const base = wb.worksheets[0];

  // üyelik kuralı → standartta max 3 vendor göster
  const groupSize = 5; // premium'da 5'erli sheet
  const visibleVendors = (payload.membership === "standard") ? 3 : groupSize;

  // premium'da 5'er grup halinde sheet çoğalt
  const vendorChunks: number[][] = [];
  const maxVendorCount = Math.max(...payload.items.map(i => i.vendors.length), 0);
  
  if (payload.membership === "premium" && maxVendorCount > groupSize) {
    for (let i=0;i<maxVendorCount;i+=groupSize) {
      vendorChunks.push([i, Math.min(i+groupSize, maxVendorCount)]);
    }
  } else {
    vendorChunks.push([0, Math.min(visibleVendors, maxVendorCount || groupSize)]);
  }

  vendorChunks.forEach((range, idx) => {
    const ws = idx === 0 && vendorChunks.length === 1 ? base : wb.addWorksheet(`Vendors ${range[0]+1}-${range[1]}`);
    
    if (ws !== base && idx > 0) {
      // yeni sayfa: base'in kopyasını almak istiyorsan: ExcelJS doğrudan kopyalamaz; basit stiller korunur.
      // pratik yol: şablonu her seferinde tekrar oku ve addWorksheet yerine base'yi kopyalayacak helper yaz.
    }

    let row = TEMPLATE_MAP.dataStartRow;
    for (const item of payload.items) {
      cell(ws, `${TEMPLATE_MAP.cols.no}${row}`).value   = item.no;
      cell(ws, `${TEMPLATE_MAP.cols.urun}${row}`).value = item.name;
      cell(ws, `${TEMPLATE_MAP.cols.qty}${row}`).value  = item.qty;
      cell(ws, `${TEMPLATE_MAP.cols.unit}${row}`).value = item.unit;

      const slice = item.vendors.slice(range[0], range[1]);
      slice.forEach((v, j) => {
        const map = TEMPLATE_MAP.cols.vendors[j];
        if (!map) return;
        cell(ws, `${map.unitPrice}${row}`).value = v.unitPrice;
        cell(ws, `${map.total}${row}`).value     = v.total;
        cell(ws, `${map.totalTL}${row}`).value   = v.totalTL;
      });
      row++;
    }

    // footer
    if (payload.footer?.odeme)      cell(ws, `B${TEMPLATE_MAP.footer.odeme}`).value = payload.footer.odeme;
    if (payload.footer?.teslim)     cell(ws, `B${TEMPLATE_MAP.footer.teslim}`).value = payload.footer.teslim;
    if (payload.footer?.not)        cell(ws, `B${TEMPLATE_MAP.footer.not}`).value = payload.footer.not;
    if (payload.footer?.bestVendor) cell(ws, `B${TEMPLATE_MAP.footer.bestVendor}`).value = `En uygun firma: ${payload.footer.bestVendor}`;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Alias for compatibility
export const exportWithTemplate = exportCompareTemplate;

// Export service class
export class ExportService {
  static async exportWithTemplate(payload: any) {
    return await exportCompareTemplate(payload);
  }
}

// Default export
export default {
  exportWithTemplate: exportCompareTemplate,
  exportCompareTemplate
};

// Named export
export { exportCompareTemplate as exportWithTemplate };