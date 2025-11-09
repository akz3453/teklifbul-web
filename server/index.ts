import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import importRouter from './routes/import';
import ExcelJS from 'exceljs';

// Teklifbul Rule v1.0 - Categories router
import categoriesRouter from '../src/modules/categories/routes/categories';
// Teklifbul Rule v1.0 - Tax Offices router
import taxOfficesRouter from '../src/modules/taxOffices/routes/taxOffices';
// Teklifbul Rule v1.0 - Address router
import addrRouter from './routes/addr';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Public (import.html vs.)
app.use(express.static(join(process.cwd(), 'public')));

// Routes
app.use('/api/import', importRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/tax-offices', taxOfficesRouter);
app.use('/api/addr', addrRouter); // Teklifbul Rule v1.0 - Adres sistemi

// Export: Satın Alma Formu (Excel)
app.get('/api/export/purchase-form', (_req, res) => {
  res.status(405).json({ ok:false, error:'method_not_allowed', hint:'Use POST with meta, items' });
});
app.post('/api/export/purchase-form', async (req, res) => {
  try {
    const { meta = {}, items = [], userRole, userName, demandCode, demandData } = req.body || {};
    const code = demandCode || `SATFK-${Date.now()}`;
    // Resolve template path with fallbacks
    const candidates = [
      join(process.cwd(), 'backend', 'templates', 'örnek satın alma formu.xlsx'),
      join(process.cwd(), 'backend', 'templates', 'ornek satin alma formu.xlsx'),
      join(process.cwd(), 'assets', 'örnek satın alma formu.xlsx'),
      join(process.cwd(), 'assets', 'ornek satin alma formu.xlsx'),
    ];
    const templatePath = candidates.find(p => fs.existsSync(p));

    const wb = new ExcelJS.Workbook();
    if (templatePath) {
      await wb.xlsx.readFile(templatePath);
    } else {
      // Fallback: build minimal workbook if template missing
      const ws = wb.addWorksheet('SATFK');
      ws.getCell('H3').value = 'SATFK';
      ws.getCell('I3').value = code;
      ws.getRow(5).values = [,'No','Malzeme Kodu','Malzeme Tanımı','Marka/Model','Miktar','Birim','Depo','Görsel','Termin','Açıklama'];
    }
    const ws = wb.worksheets[0];

    // Header cells with all requested information
    // I3: Talep Kodu (SATFK)
    ws.getCell('I3').value = code;
    
    // I2: Başlık
    if (demandData?.title) ws.getCell('I2').value = demandData.title;
    
    // K2: Talep Tarihi
    if (demandData?.demandDate) ws.getCell('K2').value = demandData.demandDate;
    
    // I4: Alım Yeri (İl)
    if (demandData?.purchaseLocation) ws.getCell('I4').value = demandData.purchaseLocation;
    
    // I1: Şantiye
    if (demandData?.siteName) ws.getCell('I1').value = demandData.siteName;
    
    // K1: Talep Tipi
    if (demandData?.biddingMode) {
      const biddingModeText = getBiddingModeText(demandData.biddingMode);
      ws.getCell('K1').value = biddingModeText;
    }
    
    // K3: Süreli (Başlangıç ve Bitiş Tarihi)
    if (demandData?.phaseStart && demandData?.phaseEnd) {
      ws.getCell('K3').value = `${demandData.phaseStart} / ${demandData.phaseEnd}`;
    }
    
    // K4: Öncelik
    if (demandData?.priority) ws.getCell('K4').value = demandData.priority;
    
    // Para birimi (default TRY if not specified)
    const currency = demandData?.currency || "TRY";
    
    // L6: Ödeme Şartları (for first item)
    if (demandData?.paymentTerms && items.length > 0) {
      ws.getCell('L6').value = demandData.paymentTerms;
    }
    
    // Role-dependent names
    // K11: Onay Veren
    if (userRole === 'approver') ws.getCell('K11').value = userName || '';
    // H11: Genel Müdür
    if (demandData?.generalManager) ws.getCell('H11').value = demandData.generalManager;
    // G11: Satın Alma Yetkilisi
    if (userRole === 'satinalma_yetkilisi') ws.getCell('G11').value = userName || '';
    // F11: Talep Eden
    if (demandData?.requester) ws.getCell('F11').value = demandData.requester;
    
    // A11 and onwards: Açıklamalar
    if (Array.isArray(demandData?.descriptions)) {
      demandData.descriptions.forEach((desc: string, index: number) => {
        if (desc && desc.trim()) {
          const row = 11 + index; // Start from A11
          ws.getCell(`A${row}`).value = desc.trim();
        }
      });
    } else if (demandData?.spec) {
      ws.getCell('A11').value = demandData.spec;
    }

    // D12: Teslim Şekli + Adres
    const deliveryCombined = `${meta.deliveryMethod || ''} ${meta.deliveryAddress || ''}`.trim();
    ws.getCell('D12').value = deliveryCombined || null;

    // Items start at row 6
    const rowIdx = 6;
    items.forEach((it: any, i: number) => {
      const r = ws.getRow(rowIdx + i);
      r.getCell(1).value = it.lineNo ?? i + 1;          // A: No
      r.getCell(2).value = it.sku || '';                // B: SKU
      r.getCell(3).value = it.name || '';               // C: Ad
      r.getCell(4).value = it.brandModel || '';         // D: Marka/Model
      r.getCell(5).value = it.qty ?? null;              // E: Miktar
      r.getCell(6).value = it.unit || '';               // F: Birim
      r.getCell(7).value = it.warehouseQty ?? null;     // G: Depodaki
      r.getCell(8).value = it.imageUrl || '';           // H: Görsel
      r.getCell(9).value = it.requestedDate || '';      // I: Termin
      r.getCell(10).value = it.note || '';              // J: Açıklama
      r.commit();
      
      // For each item, set the delivery date in the appropriate cell
      // I6 for first item, I7 for second item, etc.
      if (it.requestedDate) {
        ws.getCell(`I${6 + i}`).value = it.requestedDate;
      }
    });

    res.setHeader('Content-Disposition', `attachment; filename="SATFK_${code}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('export purchase-form error', e);
    res.status(500).json({ ok:false, error:'export_failed' });
  }
});

// Helper function to get bidding mode text
function getBiddingModeText(mode: string) {
  const modeMap: Record<string, string> = {
    "secret": "Gizli Teklif (tek tur)",
    "open": "Açık Teklif (tek tur)",
    "hybrid": "Hibrit (1. tur gizli, 2. tur açık)"
  };
  return modeMap[mode] || mode || "-";
}

// Save JSON helpers
function ensureDirSync(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// POST /save-mahalle-json { districtId, districtName, neighborhoods }
app.post('/save-mahalle-json', (req, res) => {
  try {
    const { districtId, districtName, neighborhoods } = req.body || {};
    if (!districtId || !Array.isArray(neighborhoods)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    const outDir = join(process.cwd(), 'public', 'assets', 'mahalle');
    ensureDirSync(outDir);
    const outPath = join(outDir, `${districtId}.json`);
    const payload = { districtId, districtName, neighborhoods };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    return res.json({ ok: true, path: `/assets/mahalle/${districtId}.json` });
  } catch (e) {
    console.error('save-mahalle-json error', e);
    return res.status(500).json({ ok: false });
  }
});

// POST /save-street-json { districtId, districtName, neighborhoodId, neighborhoodName, streets }
app.post('/save-street-json', (req, res) => {
  try {
    const { districtId, neighborhoodId, districtName, neighborhoodName, streets } = req.body || {};
    if (!districtId || !neighborhoodId || !Array.isArray(streets)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    const outDir = join(process.cwd(), 'public', 'assets', 'sokak');
    ensureDirSync(outDir);
    const outPath = join(outDir, `${districtId}_mah-${neighborhoodId}.json`);
    const payload = { districtId, districtName, neighborhoodId, neighborhoodName, streets };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    return res.json({ ok: true, path: `/assets/sokak/${districtId}_mah-${neighborhoodId}.json` });
  } catch (e) {
    console.error('save-street-json error', e);
    return res.status(500).json({ ok: false });
  }
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : (process.env.PORT ? Number(process.env.PORT) : 5174);
app.listen(PORT, () => console.log(`[API] listening on http://localhost:${PORT}`));


