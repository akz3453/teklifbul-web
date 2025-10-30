import { z } from "zod";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let __pdfParseFn: null | ((buf: Buffer | Uint8Array) => Promise<{ text: string }>) = null;
async function getPdfParse(): Promise<((buf: Buffer | Uint8Array) => Promise<{ text: string }>) | null> {
  if (__pdfParseFn) return __pdfParseFn;
  // Prefer dynamic import to let Node/tsx resolve ESM/CJS shapes
  try {
    const sub: any = await import('pdf-parse/lib/pdf-parse.js');
    const fn = typeof sub === 'function' ? sub : (typeof sub?.default === 'function' ? sub.default : null);
    if (fn) { __pdfParseFn = fn; return fn; }
  } catch {}
  try {
    const mod: any = await import('pdf-parse');
    const fn = typeof mod === 'function' ? mod : (typeof mod?.default === 'function' ? mod.default : null);
    if (fn) { __pdfParseFn = fn; return fn; }
  } catch {}
  // Last resort: require (CJS)
  try {
    const sub = require('pdf-parse/lib/pdf-parse.js');
    const fn = typeof sub === 'function' ? sub : (typeof (sub as any)?.default === 'function' ? (sub as any).default : null);
    if (fn) { __pdfParseFn = fn; return fn; }
  } catch {}
  try {
    const mod = require('pdf-parse');
    const fn = typeof mod === 'function' ? mod : (typeof (mod as any)?.default === 'function' ? (mod as any).default : null);
    if (fn) { __pdfParseFn = fn; return fn; }
  } catch {}
  // Could not resolve pdf-parse; signal null so caller can fallback
  return null;
}

// Fallback parser using pdfjs-dist (no external native deps)
async function parseWithPdfJs(buf: Buffer | Uint8Array): Promise<{ text: string }>{
  // Try multiple build entrypoints for node/esm
  let pdfjs: any = null;
  let lastErr: any = null;
  const candidates = [
    'pdfjs-dist/legacy/build/pdf.mjs',
    'pdfjs-dist/legacy/build/pdf.js',
    'pdfjs-dist/build/pdf.mjs',
    'pdfjs-dist/build/pdf.js'
  ];
  for (const id of candidates) {
    try {
      pdfjs = await import(id);
      if (pdfjs?.getDocument) break;
    } catch (e) { lastErr = e; }
  }
  if (!pdfjs?.getDocument) {
    throw new Error(`[pdfParser] Unable to load pdfjs-dist fallback: ${(lastErr as any)?.message || lastErr}`);
  }
  // Ensure plain Uint8Array (Buffer subclasses may be rejected)
  const u8 = buf instanceof Uint8Array ? new Uint8Array(buf) : new Uint8Array(Buffer.from(buf as any));
  const loadingTask = pdfjs.getDocument({ data: u8 });
  const pdf = await loadingTask.promise;
  let out = '';
  const total = pdf.numPages || 0;
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = (content.items || []).map((it: any) => it.str || '').join(' ');
    out += (out ? '\n' : '') + text;
  }
  try { await pdf?.destroy?.(); } catch{}
  return { text: out };
}

const demandSchema = z.object({
  title: z.string().min(1),
  requester: z.string().nullable().optional(),
  demandDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]).default("TRY"),
  satfk: z.string().nullable().optional(),
});

type Demand = z.infer<typeof demandSchema>;

type Item = {
  itemName: string;
  qty: number | null;
  unit: string | null;
  brand?: string | null;
  model?: string | null;
  unitPriceExcl?: number | null;
  vatPct?: number | null;
  currency?: "TRY" | "USD" | "EUR" | "GBP";
  deliveryDate?: string | null;
  note?: string | null;
};

// --- Helpers --------------------------------------------------------------

const CURRENCY_MAP: Record<string, Demand["currency"]> = {
  TL: "TRY",
  TRY: "TRY",
  "₺": "TRY",
  USD: "USD",
  $: "USD",
  DOLAR: "USD",
  EUR: "EUR",
  EURO: "EUR",
  "€": "EUR",
  GBP: "GBP",
  "£": "GBP",
};

function normalizeCurrency(s: unknown): Demand["currency"] | undefined {
  const raw = String(s ?? "").trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z£$€₺]/g, "");
  return CURRENCY_MAP[cleaned as keyof typeof CURRENCY_MAP];
}

/** TR ve EN sayı biçimlerini destekler: "1.234,56" | "1,234.56" | "1234,56" | "1234.56" | "1234" */
function parseNumberTR(input?: string | number | null): number | null {
  if (input == null) return null;
  if (typeof input === "number") return isFinite(input) ? input : null;
  const s = input.toString().trim();
  if (!s) return null;

  // hem nokta hem virgül varsa -> hangisi ondalık?
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized = s;

  if (hasDot && hasComma) {
    // Son görülen ayırıcıyı ondalık kabul et
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // "1.234,56" -> "1234.56"
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56" -> "1234.56"
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // "1234,56" -> "1234.56"
    normalized = s.replace(",", ".");
  } else {
    // "1.234" -> "1234" (muhtemelen binlik)
    // eğer sadece tek nokta varsa ve 3 haneli grupsa kaldır
    const m = s.match(/^(\d{1,3}(\.\d{3})+)(\.\d+)?$/);
    if (m && !m[3]) normalized = s.replace(/\./g, "");
  }

  const n = Number(normalized);
  return isFinite(n) ? n : null;
}

function pickCurrencyFromText(text: string): Demand["currency"] | undefined {
  // metinde geçen ilk para birimini yakala
  const token = (text.match(/(TRY|TL|USD|\$|EUR|€|GBP|£)/i) || [])[1];
  return normalizeCurrency(token);
}

// Başlık/alan çıkarımları için regex’ler
const RX = {
  requester: /(Satınalma\s*Personeli|Talep Eden|İstek Sahibi)\s*[:\n]\s*([^\n]+)/i,
  demandDate: /(Talep\s*Tarihi|Tarih)\s*[:\n]\s*([0-3]?\d[./-][01]?\d[./-](?:20)?\d{2})/i,
  dueDate: /(Termin|Teslim|Son Tarih)\s*[:\n]\s*([0-3]?\d[./-][01]?\d[./-](?:20)?\d{2})/i,
  pnSnLine: /(?:^|\s)(?:P\/?N|PN)\s*[: ]\s*([^\n]+?)\s+(?:S\/?N|SN)\s*[: ]\s*([^\n]+)/i,
};

// --- Core -----------------------------------------------------------------

export async function previewPdf(buf: Buffer) {
  const pdfParse = await getPdfParse();
  const data = pdfParse ? await pdfParse(buf) : await parseWithPdfJs(buf);
  const text = (data.text || "").replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // ---- Header alanları
  const title = lines[0] || "Başlıksız Talep";
  const requester =
    (text.match(RX.requester)?.[2] || lines[1] || "").trim() || null;
  const demandDate = (text.match(RX.demandDate)?.[2] || null);
  const dueDate = (text.match(RX.dueDate)?.[2] || null);
  const currency = pickCurrencyFromText(text) ?? "TRY";

  // ---- Kalem çıkarımı
  const items: Item[] = [];
  const warnings: string[] = [];

  // 1) PN/SN tabanlı kalemler
  for (const line of lines) {
    const m = line.match(RX.pnSnLine);
    if (m) {
      items.push({
        itemName: `P/N: ${m[1].trim()} S/N: ${m[2].trim()}`,
        qty: 1,
        unit: "ADET",
        currency,
        vatPct: 18,
      });
    }
  }

  // 2) Tablo benzeri (virgül/sekme/çoklu boşluk) satırlar
  // Başlıkları dışla
  const headerLike = /ÜRÜN|KALEM|MALZEME|BİRİM|MİKTAR|FİYAT|KDV/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headerLike.test(line)) continue;
    // min 3 hücre bekliyoruz: ad, miktar, birim
    const parts = line
      .split(/,|\t| {2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length >= 3) {
      const [name, qtyRaw, unit, brand, model, priceRaw, vatRaw] = parts;
      // Eğer bu satır PN/SN içeriyorsa, zaten eklenmiştir.
      if (RX.pnSnLine.test(line)) continue;

      const qty = parseNumberTR(qtyRaw);
      const unitPriceExcl = parseNumberTR(priceRaw);
      const vatPct = parseNumberTR(vatRaw) ?? 18;

      // isim çok kısa ise (gürültü) atla
      if (name.length < 3) continue;

      items.push({
        itemName: name,
        qty,
        unit: unit || null,
        brand: brand || null,
        model: model || null,
        unitPriceExcl,
        vatPct,
        currency,
        deliveryDate: null,
        note: null,
      });
    }
  }

  // tekrarları temizle (aynı itemName + qty + unit)
  const dedupKey = (i: Item) => `${i.itemName}__${i.qty ?? ""}__${i.unit ?? ""}`;
  const seen = new Set<string>();
  const uniqueItems = items.filter((i) => {
    const k = dedupKey(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (uniqueItems.length === 0) {
    warnings.push(
      "PDF metninden tablo tespit edilemedi. PN/SN ya da sütunlar arası çift boşluk/sekme kullanımı önerilir. Excel formatı daha sağlıklıdır."
    );
  }

  // ---- Demand oluştur & doğrula
  const demand: Demand = demandSchema.parse({
    title,
    requester,
    demandDate,
    dueDate,
    currency,
  });

  // güven puanı
  const confidence =
    uniqueItems.length >= 3 ? 85 :
    uniqueItems.length > 0 ? 65 :
    25;

  return {
    profileHint: "pdf",
    headerRow: 1,
    headers: ["Ürün Adı", "Miktar", "Birim", "Marka", "Model", "Birim Fiyat", "KDV"],
    colIdx: { itemName: 0, qty: 1, unit: 2, brand: 3, model: 4, unitPriceExcl: 5, vatPct: 6 },
    confidence,
    demand,
    items: uniqueItems,
    requiredItemFields: ["itemName", "qty", "unit"],
    warnings,
  };
}
