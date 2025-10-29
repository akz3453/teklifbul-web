import { Router } from 'express';
import multer from 'multer';
import { previewXlsx } from '../services/importParser';
import { previewDocx } from '../services/docxParser';
import { previewPdf } from '../services/pdfParser';
import { commitDemand } from '../services/commit';
import { matchSuppliers } from '../services/supplierMatch';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const r = Router();

// Magic sniff helper
function sniffFormat(buf: Buffer, name: string): string {
  const head = buf.subarray(0, 8).toString('hex');
  const lower = name.toLowerCase();
  
  // Office docs (ZIP magic: PK\x03\x04)
  if (head.startsWith('504b03') || lower.endsWith('.xlsx') || lower.endsWith('.docx')) {
    if (lower.endsWith('.xlsx')) return 'xlsx';
    if (lower.endsWith('.docx')) return 'docx';
    return 'unknown-zip';
  }
  
  // PDF magic: %PDF
  if (head.startsWith('25504446') || lower.endsWith('.pdf')) return 'pdf';
  
  return 'unknown';
}

r.post('/preview', upload.single('file'), async (req, res) => {
  try {
    // 1. Dosya kontrolü
    if (!req.file) {
      return res.status(400).json({ 
        ok: false, 
        error: 'file_missing', 
        details: 'FormData ile "file" alanı bekleniyor.' 
      });
    }
    
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'empty_file', 
        details: 'Dosya boş görünüyor.' 
      });
    }
    
    // 2. Format tespit et
    const name = req.file.originalname || '';
    const format = sniffFormat(req.file.buffer, name);
    
    console.log(`[Import] ${name} (${format}) - ${req.file.buffer.length} bytes`);
    
    let result;
    try {
      switch (format) {
        case 'xlsx':
          result = await previewXlsx(req.file.buffer);
          break;
        case 'docx':
          result = await previewDocx(req.file.buffer);
          break;
        case 'pdf':
          result = await previewPdf(req.file.buffer);
          break;
        default:
          return res.status(415).json({ 
            ok: false, 
            error: 'unsupported_format', 
            details: `Desteklenen formatlar: .xlsx, .docx, .pdf. Algılanan: ${format}` 
          });
      }
    } catch (parseError: any) {
      console.error('[Import] Parse error:', parseError);
      return res.status(400).json({ 
        ok: false, 
        error: 'parse_error', 
        details: parseError.message || String(parseError),
        stack: parseError.stack 
      });
    }
    
    // 3. Minimum doğrulama
    if (!result?.demand?.title) {
      return res.status(400).json({ 
        ok: false, 
        error: 'missing_title', 
        details: 'Belgeden başlık çıkarılamadı.' 
      });
    }
    
    if (!Array.isArray(result?.items)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'items_not_array', 
        details: 'Kalem listesi üretilemedi.' 
      });
    }
    
    // 4. Boş kalem listesi için warning
    if (result.items.length === 0) {
      console.warn('[Import] No items found');
      result.warnings = [
        ...(result.warnings || []),
        'Dosyadan kalem çıkarılamadı. Dosya formatını kontrol edin.'
      ];
    }
    
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[Import] General error:', e);
    return res.status(500).json({ 
      ok: false, 
      error: 'server_error', 
      details: e.message || String(e),
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
});

r.post('/commit', async (req, res) => {
  try {
    const { demand, items, options } = (req.body || {}) as any;
    if (!demand || !Array.isArray(items)) return res.status(400).json({ error: 'Eksik gövde' });

    const saved = await commitDemand({ demand, items });
    const matches = await matchSuppliers(items);

    return res.json({ ok: true, demandId: saved.demandId, satfk: saved.satfk, matchedSuppliers: matches, options });
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Commit hatası' });
  }
});

export default r;


