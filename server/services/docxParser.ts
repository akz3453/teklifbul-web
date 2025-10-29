import * as mammoth from 'mammoth';
import { z } from 'zod';

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
  
  // Tablo benzeri yapılar için satırları parse et
  const items: any[] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    
    // Basit parsing: virgül/sekme ile ayrılmış alanlar
    const parts = line.split(/,|\t/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      items.push({
        itemName: parts[0],
        qty: parseFloat(parts[1]) || null,
        unit: parts[2],
        brand: parts[3] || null,
        model: parts[4] || null,
        unitPriceExcl: parts[5] ? parseFloat(parts[5]) : null,
        vatPct: parts[6] ? parseFloat(parts[6]) : 18,
        currency: 'TRY',
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
    demand: demandSchema.parse({ title, requester, currency: 'TRY' }),
    items,
    requiredItemFields: ['itemName', 'qty', 'unit'],
    warnings: items.length === 0 ? ['DOCX formatı basit parsing kullanıyor. Excel formatı önerilir.'] : []
  };
}

