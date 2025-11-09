import * as mammoth from 'mammoth';
import { z } from 'zod';
import { parseNumberTR, detectCurrency } from './normalization';

const demandSchema = z.object({
  title: z.string().min(1),
  requester: z.string().nullable().optional(),
  demandDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: z.enum(['TRY','USD','EUR','GBP']).default('TRY'),
  satfk: z.string().nullable().optional()
});

export async function previewDocx(buf: Buffer){
  const result = await mammoth.extractRawText({ buffer: buf });
  const text = result.value;
  const lines = text.split('\n').filter(l => l.trim());
  
  // İlk satırlar talep başlığı olabilir
  const title = lines[0]?.trim() || 'Başlıksız Talep';
  const requester = lines[1]?.trim() || null;
  const currency = detectCurrency(text) ?? 'TRY';
  
  // Tablo benzeri yapılar için satırları parse et
  const items: any[] = [];
  const matrix: string[][] = [];
  const fieldCandidates: { label: string; value: string }[] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    
    const colonSplit = line.split(/[:=]/);
    if (colonSplit.length === 2) {
      const label = colonSplit[0].trim();
      const value = colonSplit[1].trim();
      if (label && value) fieldCandidates.push({ label, value });
    }

    // Basit parsing: virgül/sekme ile ayrılmış alanlar
    const parts = line.split(/,|\t|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length) matrix.push(parts);
    if (parts.length >= 3) {
      const qty = parseNumberTR(parts[1]);
      const unitPriceExcl = parseNumberTR(parts[5]);
      const vatPct = parseNumberTR(parts[6]) ?? 18;
      items.push({
        itemName: parts[0],
        qty: qty,
        unit: parts[2],
        brand: parts[3] || null,
        model: parts[4] || null,
        unitPriceExcl: unitPriceExcl,
        vatPct: vatPct,
        currency: currency as any,
        deliveryDate: null,
        note: null
      });
    }
  }
  
  return {
    profileHint: 'docx',
    headerRow: 1,
    headers: ['Ürün Adı', 'Miktar', 'Birim', 'Marka', 'Model', 'Birim Fiyat', 'KDV'],
    colIdx: { itemName: 0, qty: 1, unit: 2, brand: 3, model: 4, unitPriceExcl: 5, vatPct: 6 },
    confidence: items.length > 0 ? 70 : 30,
    demand: demandSchema.parse({ title, requester, currency }),
    items,
    matrix,
    fieldCandidates,
    requiredItemFields: ['itemName', 'qty', 'unit'],
    warnings: items.length === 0 ? ['DOCX formatı basit parsing kullanıyor. Excel formatı önerilir.'] : []
  };
}

