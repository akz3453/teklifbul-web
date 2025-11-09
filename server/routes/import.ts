import { Router } from 'express';
import multer from 'multer';
import { commitDemand } from '../services/commit';
import { matchSuppliers } from '../services/supplierMatch';
import { mapDocument, FieldResult } from '../services/mappingService';
// Teklifbul Rule v1.0 - Kategori öneri sistemi
import { suggestCategory } from '../../src/modules/categories/services/categorySuggest';

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
    
  console.info(`[Import] ${name} (${format}) - ${req.file.buffer.length} bytes`);
    
    if (format === 'unknown') {
      return res.status(415).json({
        ok: false,
        error: 'unsupported_format',
        details: `Desteklenen formatlar: .xlsx, .docx, .pdf. Algılanan: ${format}`
      });
    }

    let mapping;
    try {
      mapping = await mapDocument(req.file.buffer, {
        filename: name,
        mimeType: req.file.mimetype,
        supplierId: (req.body?.supplierId || req.query?.supplierId) as string | undefined,
      });
    } catch (parseError: any) {
      console.error('[Import] Parse error:', parseError);
      return res.status(400).json({
        ok: false,
        error: 'parse_error',
        details: parseError.message || String(parseError),
        stack: parseError.stack,
      });
    }

    const demandValues: Record<string, any> = {};
    const demandMeta: Record<string, any> = {};
    Object.entries(mapping.demand).forEach(([field, result]) => {
      const fieldResult = result as FieldResult;
      demandValues[field] = fieldResult.value;
      demandMeta[field] = {
        confidence: fieldResult.confidence,
        needsReview: fieldResult.needsReview,
        sourceLabel: fieldResult.sourceLabel,
      };
    });

    const items = mapping.items.map((item) => item.value);
    const itemMeta = mapping.items.map((item) => ({
      confidence: item.confidence,
      needsReview: item.needsReview,
    }));

    if (!items.length) {
      mapping.warnings.push('Dosyadan kalem çıkarılamadı. Dosya formatını kontrol edin.');
    }

    // Teklifbul Rule v1.0 - Her item için kategori önerisi
    const itemsWithSuggestions = await Promise.all(items.map(async (item) => {
      // Ürün adı ve açıklamadan kategori önerisi oluştur
      const text = [item.itemName || '', item.note || ''].filter(Boolean).join(' ').trim();
      
      if (!text || text.length < 3) {
        return {
          ...item,
          categorySuggestions: [],
          suggestedCategory: null
        };
      }
      
      try {
        const suggestion = await suggestCategory(text);
        return {
          ...item,
          categorySuggestions: suggestion.suggestions.slice(0, 3), // Top-3
          suggestedCategory: suggestion.auto_select // Skor ≥0.70 ise otomatik seçim
        };
      } catch (e: any) {
    console.warn('[Import] Category suggestion failed for item:', item.itemName, e.message);
        return {
          ...item,
          categorySuggestions: [],
          suggestedCategory: null
        };
      }
    }));

    return res.json({
      ok: true,
      demand: demandValues,
      items: itemsWithSuggestions,
      demandMeta,
      itemMeta,
      warnings: mapping.warnings,
    });
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


