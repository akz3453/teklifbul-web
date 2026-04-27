/**
 * Waybill text extraction (PDF + Image)
 * Teklifbul Rule v1.0 - OCR/parse pipeline (async/await, structured logging)
 */

import { createRequire } from 'module';
import { logger } from '../../src/shared/log/logger.js';
import { Buffer } from 'buffer';

const require = createRequire(import.meta.url);

type SourceKind = 'pdf' | 'image' | 'unknown';

interface TextResult {
  text: string;
  sourceType: SourceKind;
  warnings: string[];
}

const PDF_MAX_PAGES = 40;
const VISION_MODEL_ID = process.env.GEMINI_VISION_MODEL_ID || 'gemini-1.5-flash';

let cachedPdfParse: null | ((buf: Buffer | Uint8Array) => Promise<{ text: string }>) = null;

async function getPdfParser(): Promise<((buf: Buffer | Uint8Array) => Promise<{ text: string }>) | null> {
  if (cachedPdfParse) return cachedPdfParse;
  try {
    const mod: any = await import('pdf-parse');
    const fn = typeof mod === 'function' ? mod : (typeof mod?.default === 'function' ? mod.default : null);
    if (fn) {
      cachedPdfParse = fn;
      return fn;
    }
  } catch (err) {
    logger.warn('PDF parse module load failed, trying cjs fallback', { error: (err as any)?.message });
  }
  try {
     
    const mod = require('pdf-parse');
    const fn = typeof mod === 'function' ? mod : (typeof (mod as any)?.default === 'function' ? (mod as any).default : null);
    if (fn) {
      cachedPdfParse = fn;
      return fn;
    }
  } catch (err) {
    logger.error('PDF parse require fallback failed', { error: (err as any)?.message });
  }
  return null;
}

async function parseWithPdfJs(buf: Buffer | Uint8Array): Promise<{ text: string }> {
  let pdfjs: any = null;
  const candidates = [
    'pdfjs-dist/legacy/build/pdf.mjs',
    'pdfjs-dist/build/pdf.mjs',
  ];
  for (const id of candidates) {
    try {
      // @ts-ignore - dynamic import
      pdfjs = await import(id);
      if (pdfjs?.getDocument) break;
    } catch (err: any) {
      logger.warn('pdfjs-dist candidate failed', { id, error: err?.message });
    }
  }
  if (!pdfjs?.getDocument) {
    throw new Error('pdfjs-dist yüklenemedi');
  }
  const u8 = buf instanceof Uint8Array ? new Uint8Array(buf) : new Uint8Array(Buffer.from(buf));
  const loadingTask = pdfjs.getDocument({ data: u8 });
  const pdf = await loadingTask.promise;
  let out = '';
  const total = pdf.numPages || 0;
  const cappedTotal = Math.min(total, PDF_MAX_PAGES);
  for (let p = 1; p <= cappedTotal; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = (content.items || []).map((it: any) => it.str || '').join(' ');
    out += (out ? '\n' : '') + text;
  }
  try { await pdf?.destroy?.(); } catch { /* ignore */ }
  return { text: out };
}

async function extractPdfText(buffer: Buffer): Promise<TextResult> {
  const parser = await getPdfParser();
  const parsed = parser ? await parser(buffer) : await parseWithPdfJs(buffer);
  const text = (parsed.text || '').replace(/\r/g, '');
  return {
    text,
    sourceType: 'pdf',
    warnings: [],
  };
}

async function extractImageTextWithGemini(buffer: Buffer, mimeType: string): Promise<TextResult> {
  const warnings: string[] = [];
  if (!process.env.GEMINI_API_KEY) {
    warnings.push('GEMINI_API_KEY tanımsız, görsel OCR pasif');
    return { text: '', sourceType: 'image', warnings };
  }

  try {
    // Lazy import to avoid mandatory dependency at startup
     
    // @ts-ignore - @google/genai types not provided
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const base64 = buffer.toString('base64');

    const prompt = [
      'Bu görsel bir irsaliye / teslim irsaliyesi içeriyor.',
      'Lütfen tam metni satır satır çıkar ve aşağıdaki alanlara odaklan:',
      '- İrsaliye/Belge numarası',
      '- Tarih',
      '- Gönderen firma, alan firma',
      '- Malzeme kalemleri (ürün adı, miktar, birim)',
    ].join('\n');

    const response = await client.models.generateContent({
      model: VISION_MODEL_ID,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType: mimeType || 'image/png' } },
        ],
      }],
    });

    const text = typeof response?.text === 'function'
      ? response.text()
      : (response as any)?.response?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('\n') || '';

    return {
      text: text || '',
      sourceType: 'image',
      warnings,
    };
  } catch (error: any) {
    logger.error('Gemini OCR error', { error: error?.message });
    warnings.push(`Gemini OCR hatası: ${error?.message || 'bilinmiyor'}`);
    return {
      text: '',
      sourceType: 'image',
      warnings,
    };
  }
}

export async function extractWaybillText(buffer: Buffer, mimeType: string): Promise<TextResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Boş dosya alındı');
  }

  const lowerMime = (mimeType || '').toLowerCase();
  if (lowerMime.includes('pdf')) {
    return extractPdfText(buffer);
  }
  if (lowerMime.startsWith('image/')) {
    return extractImageTextWithGemini(buffer, lowerMime);
  }
  // Unknown: try pdf as fallback
  const warnings = ['Bilinmeyen içerik tipi, PDF olarak deneniyor'];
  try {
    const pdfResult = await extractPdfText(buffer);
    pdfResult.warnings.push(...warnings);
    return pdfResult;
  } catch (error: any) {
    warnings.push(`PDF denemesi başarısız: ${error?.message}`);
  }
  return {
    text: '',
    sourceType: 'unknown',
    warnings,
  };
}

export type { TextResult, SourceKind };


