import ExcelJS from 'exceljs';
import levenshtein from 'fast-levenshtein';
import { parse as parseDate, isValid } from 'date-fns';
import { z } from 'zod';

const DICT: Record<string,string[]> = {
  itemName: ['ürün adı','ürün ismi','malzeme','stok adı','açıklama','ürün'],
  qty: ['miktar','qty','adet'],
  unit: ['birim','unit'],
  unitPriceExcl: ['birim fiyat','net fiyat','b.fiyat','bf'],
  vatPct: ['kdv','kdv %','kdv oranı'],
  currency: ['para birimi','pb','currency','döviz','doviz'],
  deliveryDate: ['teslim tarihi','sevk tarihi','termin'],
  brand: ['marka'],
  model: ['model'],
  note: ['not','açıklama']
};

const REQUIRED_ITEM = ['itemName','qty','unit'] as const;

const demandSchema = z.object({
  title: z.string().min(1),
  requester: z.string().nullable().optional(),
  demandDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: z.enum(['TRY','USD','EUR','GBP']).default('TRY'),
  satfk: z.string().nullable().optional()
});

const N = (s:any)=> String(s??'').trim().toLowerCase();
const sim = (a:string,b:string)=>{ a=N(a); b=N(b); if(!a||!b) return 0; const d=levenshtein.get(a,b); return 1 - d/Math.max(a.length,b.length); };

function pick(headers: string[], key: string){
  let best = { idx: -1, score: 0 };
  headers.forEach((h,i) => {
    const terms = DICT[key] || [];
    const s = Math.max(sim(h,key), ...terms.map(t=>sim(h,t)));
    if (s > best.score) best = { idx:i, score:s };
  });
  return best.score >= 0.55 ? best.idx : -1;
}

// ---- Helpers: cell reading, numbers, dates, currency ---------------------

function readCell(v:any): any {
  // ExcelJS cell.value çeşitli tiplerde olabilir
  if (v == null) return undefined;
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v;

  // Formula
  if (typeof v === 'object' && 'formula' in v && 'result' in v) {
    return (v as any).result ?? (v as any).formula;
  }
  // RichText
  if (typeof v === 'object' && 'richText' in v) {
    const parts = (v as any).richText || [];
    return parts.map((p:any)=>p.text).join('');
  }
  // Hyperlink
  if (typeof v === 'object' && 'text' in v) {
    return (v as any).text;
  }
  return String(v);
}

function toISO(v:any){
  const raw = readCell(v);
  if (!raw) return undefined;
  if (raw instanceof Date) return raw.toISOString().slice(0,10);
  const s = String(raw).trim();
  const fmts = ['yyyy-MM-dd','dd.MM.yyyy','dd/MM/yyyy','MM/dd/yyyy'];
  for (const f of fmts){ const d = parseDate(s, f, new Date()); if (isValid(d)) return d.toISOString().slice(0,10); }
  return s || undefined;
}

function parseNumberTR(input:any): number | undefined {
  const raw = readCell(input);
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') return isFinite(raw) ? raw : undefined;
  const s0 = String(raw).trim();
  if (!s0) return undefined;

  const hasDot = s0.includes('.');
  const hasComma = s0.includes(',');
  let s = s0;

  if (hasDot && hasComma) {
    // son görülen ayırıcıyı ondalık kabul et
    if (s0.lastIndexOf(',') > s0.lastIndexOf('.')) {
      s = s0.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
    } else {
      s = s0.replace(/,/g, ''); // 1,234.56 -> 1234.56
    }
  } else if (hasComma && !hasDot) {
    s = s0.replace(',', '.'); // 1234,56 -> 1234.56
  } else {
    // 1.234 -> 1234 (binlik olabilir)
    const m = s0.match(/^(\d{1,3}(\.\d{3})+)(\.\d+)?$/);
    if (m && !m[3]) s = s0.replace(/\./g, '');
  }

  const n = Number(s);
  return isFinite(n) ? n : undefined;
}

type EnumCurrency = z.infer<typeof demandSchema>['currency'];
const CURRENCY_MAP: Record<string, EnumCurrency> = {
  TL: 'TRY', TRY: 'TRY', '₺': 'TRY',
  USD: 'USD', $: 'USD', DOLAR: 'USD',
  EUR: 'EUR', EURO: 'EUR', '€': 'EUR',
  GBP: 'GBP', '£': 'GBP'
};

function normalizeCurrency(v:any): EnumCurrency | undefined {
  const raw = readCell(v);
  const s = String(raw ?? '').trim().toUpperCase();
  const cleaned = s.replace(/[^A-Z£$€₺]/g,''); // boşluk/simge temizliği
  return CURRENCY_MAP[cleaned as keyof typeof CURRENCY_MAP];
}

function isRowMeaningful(i:any){
  // en azından itemName var ve qty veya unit’ten biri doluysa anlamlı say
  return !!(i.itemName && (i.qty != null || (i.unit && String(i.unit).trim().length>0)));
}

// -------------------------------------------------------------------------

export async function previewXlsx(buf: Buffer){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  const names = wb.worksheets.map(s=>s.name.toLowerCase());
  const ws0 = wb.worksheets[0];
  if (!ws0) throw new Error('Excel sayfası boş görünüyor');

  const byName = wb.worksheets.find(s => /kalem|malzeme|item|urun|satir|rows?/.test((s.name||'').toLowerCase()));
  const second = wb.worksheets[1];
  const wsItems = byName || second || ws0; // tek sayfa ise ws0 kullan

  // ---- Üst bilgi alanları
  const rawCurrency = readCell(ws0.getCell('B6')?.value);
  const currency = normalizeCurrency(rawCurrency) ?? 'TRY';

  let title = String(readCell(ws0.getCell('B2')?.value) || readCell(ws0.getCell('C2')?.value) || '').trim();
  if (!title) {
    title = String(readCell(ws0.getCell('A1')?.value) || readCell(ws0.getCell('B1')?.value) || '').trim() || 'Talep Başlığı';
  }

  const demandRaw:any = {
    satfk: readCell(ws0.getCell('B1')?.value) ?? null,
    title,
    requester: (String(readCell(ws0.getCell('B3')?.value) || '').trim()) || null,
    demandDate: toISO(ws0.getCell('B4')?.value),
    dueDate: toISO(ws0.getCell('B5')?.value),
    currency
  };
  const demand = demandSchema.parse({ ...demandRaw });

  // Prepare field candidates before pushing into it
  const fieldCandidates: { label: string; value: string }[] = [];
  // Collect high-level field candidates from the first sheet (label/value pairs)
  for (let r = 1; r <= Math.min(40, ws0.rowCount); r++) {
    const row = ws0.getRow(r);
    const label = String(readCell(row.getCell(1).value) || "").trim();
    const value = String(readCell(row.getCell(2).value) || "").trim();
    if (label && value) {
      fieldCandidates.push({ label, value });
    }
  }

  if (!wsItems || wsItems.rowCount === 0) throw new Error('Kalem sayfası bulunamadı veya boş');

  // ---- Header satırını bul
  let headerRow = 1, maxScore = -1;
  for (let r=1; r<=Math.min(30, wsItems.rowCount); r++){
    const vals = (wsItems.getRow(r).values as any[]).map(v=> String(readCell(v) || ''));
    const score = Object.values(DICT)
      .flat()
      .reduce((acc,k)=> acc + (vals.some(h=>sim(h,k)>0.7)?1:0), 0);
    if (score > maxScore){ maxScore = score; headerRow = r; }
  }

  const headers = (wsItems.getRow(headerRow).values as any[]).map(v=> String(readCell(v) || ''));
  const colIdx = {
    itemName:      pick(headers,'itemName'),
    brand:         pick(headers,'brand'),
    model:         pick(headers,'model'),
    qty:           pick(headers,'qty'),
    unit:          pick(headers,'unit'),
    unitPriceExcl: pick(headers,'unitPriceExcl'),
    vatPct:        pick(headers,'vatPct'),
    currency:      pick(headers,'currency'),
    deliveryDate:  pick(headers,'deliveryDate'),
    note:          pick(headers,'note')
  };

  const items:any[] = [];
  const matrix:string[][] = [];
  const invalidRows:number[] = [];

  for (let r=headerRow+1; r<=wsItems.rowCount; r++){
    const row = wsItems.getRow(r);
    // collect raw row values (first 25 columns) for mapping UI
    const rawVals:string[] = [];
    for (let c=1; c<=Math.min(25, row.cellCount || 25); c++){
      rawVals.push(String(readCell(row.getCell(c).value) ?? ''));
    }
    if (rawVals.some(v=>v && v.trim())) matrix.push(rawVals);
    const get = (k:keyof typeof colIdx)=> colIdx[k]===-1 ? undefined : readCell(row.getCell(colIdx[k]+1).value);

    const rowCurrency = normalizeCurrency(get('currency')) ?? demand.currency;
    const i = {
      itemName: get('itemName'),
      brand: get('brand') ?? null,
      model: get('model') ?? null,
      qty: parseNumberTR(get('qty')),
      unit: (get('unit') ? String(get('unit')).trim() : null),
      unitPriceExcl: parseNumberTR(get('unitPriceExcl')),
      vatPct: parseNumberTR(get('vatPct')) ?? 18,
      currency: rowCurrency,
      deliveryDate: toISO(get('deliveryDate')) ?? null,
      note: get('note') ?? null
    };

    // tamamen boş/gürültü satırları atla
    const hasAny = Object.values(i).some(v => v != null && String(v).trim() !== '');
    if (!hasAny) continue;

    if (isRowMeaningful(i)) {
      items.push(i);
    } else {
      invalidRows.push(r);
    }
  }

  // kolon bulunurluğu
  const found = Object.values(colIdx).filter(v=>v!==-1).length;
  const total = Object.keys(colIdx).length;

  // confidence: kolon eşleşme * ve geçerli item sayısı
  const columnScore = found / total;
  const itemScore = Math.min(items.length / 5, 1); // 5+ satır varsa tam puan
  const confidence = Math.round(100 * (0.6 * columnScore + 0.4 * itemScore));

  const warnings: string[] = [];
  if (confidence < 60) warnings.push('Düşük eşleşme: Mapping ekranı önerilir');
  if (invalidRows.length) warnings.push(`Bazı satırlar eksik alanlardan dolayı atlandı: ${invalidRows.slice(0,10).join(', ')}${invalidRows.length>10?'…':''}`);
  if (!items.length) warnings.push('Kalem tespit edilemedi. Başlık satırlarını belirginleştirin veya Excel şablonunu kullanın.');
  if (!normalizeCurrency(currency)) warnings.push('Para birimi algılanamadı/normalize edilemedi; TRY varsayıldı.');

  return {
    profileHint: names.join(','),
    headerRow, headers, colIdx, confidence,
    demand, items,
    matrix,
    fieldCandidates,
    requiredItemFields: REQUIRED_ITEM,
    warnings
  };
}
