import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import ExcelJS from "exceljs";
import dayjs from "dayjs";

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

// === 1) BOŞ ŞABLON İNDİR ===
r.get("/forms/purchase/blank", async (req, res) => {
  const p = path.resolve(__dirname, "../../assets/satin_alma_talep_formu.xlsx");
  console.log("Looking for template at:", p);
  console.log("File exists:", fs.existsSync(p));
  if (!fs.existsSync(p)) {
    return res.status(404).json({ error: "Şablon eksik: assets/satın alma talep formu.xlsx", path: p });
  }
  const stamp = dayjs().format("YYYY-MM-DD_HHmm");
  res.setHeader("Content-Disposition", `attachment; filename="satinalma_talep_sablon_${stamp}.xlsx"`);
  fs.createReadStream(p).pipe(res);
});

// === 2) DOLU FORM YÜKLE & PARSE → TALEP ÖNİZLE ===
// form-data: file=<xlsx>
r.post("/forms/purchase/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya yok" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const ws = wb.worksheets[0]; // aktif sayfa

  // ====== FORM MAP (daha önce analiz ettik) ======
  const HEADER_ROW = 7;
  const DATA_START = 9;
  const COL = { sira:"A", kod:"B", tanim:"C", marka:"D", birim:"E", miktar:"F",
                teslim:"G", ambar:"H", siparis:"I", hedef:"J", genelToplamTL:"L" };
  const META = { santiye:3, stf_no:4, stf_tarihi:5, alim_yeri:6 };
  const pick = (col: string, row: number) => ws.getCell(`${col}${row}`).value;

  // ---- Meta alanlar (etiket sağındaki ilk dolu hücre)
  function readRight(row: number, fromCol = 8) {
    for (let c = fromCol+1; c <= fromCol+6; c++) {
      const v = ws.getRow(row).getCell(c).value;
      if (v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
    return null;
  }
  const meta = {
    santiye: readRight(META.santiye),
    stf_no: readRight(META.stf_no),
    stf_tarihi: readRight(META.stf_tarihi),
    alim_yeri: readRight(META.alim_yeri)
  };

  // ---- Kalemleri oku
  const items: any[] = [];
  let rix = DATA_START;
  while (true) {
    const sira = pick(COL.sira, rix);
    const tanim = pick(COL.tanim, rix);
    // tamamen boş satırda dur
    const rowIsEmpty = [COL.sira, COL.kod, COL.tanim, COL.miktar].every(c => {
      const v = pick(c, rix);
      return v === null || v === undefined || String(v).trim() === "";
    });
    if (rowIsEmpty) break;

    items.push({
      sira_no: sira,
      malzeme_kodu: pick(COL.kod, rix),
      malzeme_tanimi: tanim,
      marka: pick(COL.marka, rix),
      birim: pick(COL.birim, rix),
      miktar: Number(pick(COL.miktar, rix) || 0),
      istenilen_teslim_tarihi: pick(COL.teslim, rix),
      ambardaki_miktar: Number(pick(COL.ambar, rix) || 0),
      siparis_miktari: Number(pick(COL.siparis, rix) || 0),
      hedef_fiyat: Number(pick(COL.hedef, rix) || 0),
      genel_toplam_tl: Number(pick(COL.genelToplamTL, rix) || 0),
    });
    rix++;
    if (rix - DATA_START > 5000) break; // güvenlik
  }

  // ---- Sistem talebi oluşturMA (sadece önizleme döndür)
  res.json({
    meta,
    item_count: items.length,
    items
  });
});

// === 3) ÖNİZLEYİ ONAYLA → TALEP OLUŞTUR ===
r.post("/forms/purchase/confirm", async (req, res) => {
  // req.body: { meta, items, vendorGroupIds[] }
  // TODO: repo.createPurchaseRequest(req.body)  → PR-ID
  // TODO: rfqService.send(PR-ID, vendorGroupIds) → RFQ kayıtları
  // Mock cevap:
  res.json({ requestId: "PR-2025-0001", rfqs: [{groupId:1,status:"sent"}] });
});

export default r;
