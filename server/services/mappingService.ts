/**
 * Mapping service orchestrates document parsing → field mapping.
 * Summary: reuse existing parsers (xlsx/docx/pdf) and apply normalization/scoring/supplier-memory
 * to produce demand/items with confidence and review flags.
 */

import { previewXlsx } from "./importParser";
import { previewDocx } from "./docxParser";
import { previewPdf } from "./pdfParser";
import { CandidateValue, enrichCandidate, normalizeKey, parseDateTR, parseNumberTR } from "./normalization";
import { getSupplierMemoryStore } from "./supplierMemory";
import { scoreCandidate, TargetField } from "./scorers";
// Teklifbul Rule v1.0 - Template detection
import { detectTemplate } from "./templateDetector";

type SourceType = "xlsx" | "docx" | "pdf";

interface RawDocument {
  type: SourceType;
  demand: any;
  items: any[];
  headers?: string[];
  matrix?: string[][];
  fieldCandidates?: { label: string; value: string }[];
  warnings?: string[];
}

export interface MappingOptions {
  filename?: string;
  mimeType?: string;
  supplierId?: string | null;
}

export interface FieldResult {
  value: any;
  confidence: number;
  needsReview: boolean;
  sourceLabel?: string;
}

export interface ItemResult {
  value: Record<string, any>;
  confidence: number;
  needsReview: boolean;
}

export interface ColumnMapping {
  field: TargetField;
  columnIndex: number;
  columnLabel: string;
  score: number;
  confidence: number;
}

export interface MappingResult {
  demand: Record<string, FieldResult>;
  items: ItemResult[];
  warnings: string[];
  columnMappings?: ColumnMapping[]; // Teklifbul Rule v1.0 - Kalemler için eşleştirme detayları
  demandMappings?: ColumnMapping[]; // Teklifbul Rule v1.0 - Talep bilgileri için eşleştirme detayları
  fieldCandidates?: { label: string; value: string }[]; // Teklifbul Rule v1.0 - Label-value çiftleri (mapping için)
  isTemplate?: boolean; // Teklifbul Rule v1.0 - Şablon tanıma
  templateConfidence?: number; // Teklifbul Rule v1.0 - Şablon güven skoru
}

function detectType(opts: MappingOptions): SourceType {
  const ext = (opts.filename || "").toLowerCase();
  if (ext.endsWith(".xlsx")) return "xlsx";
  if (ext.endsWith(".docx")) return "docx";
  if (ext.endsWith(".pdf")) return "pdf";
  const mime = (opts.mimeType || "").toLowerCase();
  if (mime.includes("spreadsheet")) return "xlsx";
  if (mime.includes("word")) return "docx";
  return "pdf";
}

async function parseRawDocument(buffer: Buffer, options: MappingOptions): Promise<RawDocument> {
  const type = detectType(options);
  try {
    if (type === "xlsx") {
      const parsed = await previewXlsx(buffer);
      return { type, ...parsed };
    }
    if (type === "docx") {
      const parsed = await previewDocx(buffer);
      return { type, ...parsed } as any;
    }
    const parsed = await previewPdf(buffer);
    return { type: "pdf", ...parsed } as any;
  } catch (parseError: any) {
    // Teklifbul Rule v1.0 - Daha detaylı hata mesajı
    console.error('[Mapping] Parse error details:', {
      type,
      filename: options.filename,
      errorMessage: parseError.message,
      errorStack: parseError.stack,
      bufferSize: buffer.length
    });
    throw new Error(`Dosya parse edilemedi (${type}): ${parseError.message || String(parseError)}`);
  }
}

const ITEM_FIELDS: TargetField[] = [
  "itemName",
  "sku", // Teklifbul Rule v1.0 - Stok Kodu eklendi
  "qty",
  "unit",
  "brand",
  "model",
  "unitPriceExcl",
  "vatPct",
];

const DEMAND_FIELDS: TargetField[] = [
  "title",
  "siteName", // Teklifbul Rule v1.0 - Şantiye eklendi
  "purchaseLocation", // Teklifbul Rule v1.0 - Alım Yeri eklendi
  "categories", // Teklifbul Rule v1.0 - Kategori(ler) eklendi
  "priority", // Teklifbul Rule v1.0 - Öncelik eklendi
  "currency",
  "biddingMode", // Teklifbul Rule v1.0 - Talep Tipi eklendi
  "phaseStart", // Teklifbul Rule v1.0 - Süre (Başlangıç) eklendi
  "phaseEnd", // Teklifbul Rule v1.0 - Süre (Bitiş) eklendi
  "paymentTerms", // Teklifbul Rule v1.0 - Ödeme Şartları eklendi
  "deliveryMethod", // Teklifbul Rule v1.0 - Teslim Şekli eklendi
  "deliveryAddress", // Teklifbul Rule v1.0 - Teslimat Adresi eklendi
  "invoiceAddress", // Teklifbul Rule v1.0 - Fatura Adresi eklendi
  "approver", // Teklifbul Rule v1.0 - Onay Kişileri eklendi
  "requester",
  "demandDate",
  "dueDate",
  "note",
];

interface ColumnAssignment {
  field: TargetField;
  column: number;
  score: number;
}

function gatherColumnLabels(doc: RawDocument): string[] {
  if (doc.headers && doc.headers.length) return doc.headers;
  if (doc.matrix && doc.matrix.length) return doc.matrix[0];
  return [];
}

function pickSampleValue(doc: RawDocument, column: number): CandidateValue {
  if (doc.matrix && doc.matrix.length) {
    for (const row of doc.matrix) {
      if (row[column] && row[column].trim()) {
        return enrichCandidate(row[column]);
      }
    }
  }
  return enrichCandidate("");
}

function assignColumns(doc: RawDocument, supplierAliases: string[], minConfidence?: number): ColumnAssignment[] {
  const labels = gatherColumnLabels(doc);
  const assignments: ColumnAssignment[] = [];
  const usedColumns = new Set<number>();

  for (const field of ITEM_FIELDS) {
    let best: ColumnAssignment | null = null;
    labels.forEach((label, idx) => {
      // Teklifbul Rule v1.0 - Zaten kullanılmış kolonları atla (çakışma önleme)
      if (usedColumns.has(idx)) return;
      
      const candidateValue = pickSampleValue(doc, idx);
      const baseScore = scoreCandidate(field, label, candidateValue).score;
      const aliasBoost = supplierAliases.some((alias) => normalizeKey(alias) === normalizeKey(label)) ? 0.1 : 0;
      let total = Math.min(1, baseScore + aliasBoost);
      
      // Teklifbul Rule v1.0 - Şablon ise minimum güven skoru uygula
      if (minConfidence && total < minConfidence) {
        total = minConfidence;
      }
      
      // Teklifbul Rule v1.0 - Minimum skor kontrolü (0.55 -> 0.65)
      if (total < 0.65) return;
      
      if (!best || total > best.score) {
        best = { field, column: idx, score: total };
      }
    });
    
    // Teklifbul Rule v1.0 - En iyi eşleştirmeyi ekle (eğer yeterince iyi ise)
    if (best && best.score >= 0.65) {
      assignments.push(best);
      usedColumns.add(best.column);
    }
  }

  // Teklifbul Rule v1.0 - Greedy unique assignment by descending score (zaten yapılıyor ama tekrar kontrol)
  assignments.sort((a, b) => b.score - a.score);
  const unique: ColumnAssignment[] = [];
  const finalUsedColumns = new Set<number>();
  
  for (const a of assignments) {
    if (finalUsedColumns.has(a.column)) {
      // Çakışma var - daha yüksek skorlu olanı tut
      const existing = unique.find(u => u.column === a.column);
      if (existing && a.score > existing.score) {
        const idx = unique.indexOf(existing);
        unique[idx] = a;
      }
      continue;
    }
    finalUsedColumns.add(a.column);
    unique.push(a);
  }
  
  return unique;
}

/**
 * Kolon eşleştirme detaylarını oluştur
 * Teklifbul Rule v1.0 - Frontend için detaylı eşleştirme bilgisi
 */
function createColumnMappings(
  doc: RawDocument,
  assignments: ColumnAssignment[]
): ColumnMapping[] {
  const labels = gatherColumnLabels(doc);
  return assignments.map((assign) => ({
    field: assign.field,
    columnIndex: assign.column,
    columnLabel: labels[assign.column] || `Kolon ${assign.column + 1}`,
    score: assign.score,
    confidence: assign.score, // Score = confidence
  }));
}

function mapDemandFields(doc: RawDocument, supplierAliases: string[], minConfidence?: number): Record<string, FieldResult> {
  const fieldResults: Record<string, FieldResult> = {};
  const candidates = doc.fieldCandidates || [];
  const aliasNormalized = supplierAliases.map((a) => normalizeKey(a));

  for (const target of DEMAND_FIELDS) {
    let best: { score: number; candidate: { label: string; value: string } } | null = null;
    candidates.forEach((cand) => {
      const enriched = enrichCandidate(cand.value);
      const score = scoreCandidate(target, cand.label, enriched).score;
      const aliasBoost = aliasNormalized.includes(normalizeKey(cand.label)) ? 0.1 : 0;
      let total = Math.min(1, score + aliasBoost);
      
      // Teklifbul Rule v1.0 - Şablon ise minimum güven skoru uygula
      if (minConfidence && total < minConfidence) {
        total = minConfidence;
      }
      
      if (!best || total > best.score) best = { score: total, candidate: cand };
    });

    if (best) {
      const { candidate, score } = best;
      let value: any = candidate.value;
      if (target === "demandDate" || target === "dueDate") value = parseDateTR(value) || value;
      if (target === "currency") value = (candidate.value || doc.demand?.currency || "TRY").toString().toUpperCase();
      if (target === "note") value = candidate.value;
      if (target === "title" && !value) value = doc.demand?.title || "";
      fieldResults[target] = {
        value,
        confidence: score,
        needsReview: score < 0.55,
        sourceLabel: candidate.label,
      };
    }
  }

  if (doc.demand?.title && !fieldResults.title) {
    fieldResults.title = {
      value: doc.demand.title,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "title",
    };
  }

  if (doc.demand?.currency && !fieldResults.currency) {
    fieldResults.currency = {
      value: doc.demand.currency,
      confidence: 0.6,
      needsReview: false,
      sourceLabel: "currency",
    };
  }

  // Teklifbul Rule v1.0 - Şablon alanlarını doc.demand'den ekle
  if (doc.demand?.siteName && !fieldResults.siteName) {
    fieldResults.siteName = {
      value: doc.demand.siteName,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Şantiye:",
    };
  }

  if (doc.demand?.deliveryAddress && !fieldResults.deliveryAddress) {
    fieldResults.deliveryAddress = {
      value: doc.demand.deliveryAddress,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Teslimat Adresi:",
    };
  }

  if (doc.demand?.invoiceAddress && !fieldResults.invoiceAddress) {
    fieldResults.invoiceAddress = {
      value: doc.demand.invoiceAddress,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Fatura Adresi:",
    };
  }

  // Teklifbul Rule v1.0 - Yeni şablon alanları
  if (doc.demand?.deliveryMethod && !fieldResults.deliveryMethod) {
    fieldResults.deliveryMethod = {
      value: doc.demand.deliveryMethod,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Teslim Şekli *:",
    };
  }

  if (doc.demand?.paymentTerms && !fieldResults.paymentTerms) {
    fieldResults.paymentTerms = {
      value: doc.demand.paymentTerms,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Ödeme Şartları:",
    };
  }

  if (doc.demand?.biddingMode && !fieldResults.biddingMode) {
    fieldResults.biddingMode = {
      value: doc.demand.biddingMode,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Talep Tipi:",
    };
  }

  if (doc.demand?.priority && !fieldResults.priority) {
    fieldResults.priority = {
      value: doc.demand.priority,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Öncelik *:",
    };
  }

  if (doc.demand?.approver && !fieldResults.approver) {
    fieldResults.approver = {
      value: doc.demand.approver,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Onaylayan:",
    };
  }

  // Teklifbul Rule v1.0 - Alım Yeri (İl)
  if (doc.demand?.purchaseLocation && !fieldResults.purchaseLocation) {
    fieldResults.purchaseLocation = {
      value: doc.demand.purchaseLocation,
      confidence: 0.9,
      needsReview: false,
      sourceLabel: "Alım Yeri (İl):",
    };
  }

  // Teklifbul Rule v1.0 - Kategoriler: "hepsi" veya "Tüm Tedarikçi Gruplarım (25)" kontrolü
  if (doc.demand?.categories) {
    const categoriesValue = String(doc.demand.categories).trim();
    // "hepsi", "TÜM_KATEGORILER", "Tüm Tedarikçi Gruplarım (25)" veya benzeri ifadeleri kontrol et
    const isAllCategories = categoriesValue === 'TÜM_KATEGORILER' || 
                           /^hepsi$/i.test(categoriesValue) ||
                           /tüm.*tedarikçi.*grup|all.*supplier.*group/i.test(categoriesValue);
    
    if (isAllCategories) {
      // Tüm kategoriler seçildi - özel işaretleme
      fieldResults.categories = {
        value: "TÜM_KATEGORILER", // Özel değer, client-side'da tüm kategorileri seçecek
        confidence: 1.0,
        needsReview: false,
        sourceLabel: "Kategoriler:",
      };
    } else {
      // Normal kategori değeri
      fieldResults.categories = {
        value: categoriesValue,
        confidence: 0.8,
        needsReview: false,
        sourceLabel: "Kategoriler:",
      };
    }
  }

  return fieldResults;
}

function mapItems(doc: RawDocument, assignments: ColumnAssignment[], minConfidence?: number): ItemResult[] {
  if (!doc.matrix || !doc.matrix.length) {
    // Fallback to parser-provided items
    return (doc.items || []).map((item) => ({ value: item, confidence: 0.4, needsReview: true }));
  }
  const results: ItemResult[] = [];
  const headerRow = gatherColumnLabels(doc);
  const fieldByColumn = new Map<number, TargetField>();
  assignments.forEach((a) => fieldByColumn.set(a.column, a.field));

  for (const row of doc.matrix) {
    const item: Record<string, any> = {};
    const confidences: number[] = [];
    fieldByColumn.forEach((field, column) => {
      const raw = row[column] || "";
      const enriched = enrichCandidate(raw);
      item[field] = raw;
      switch (field) {
        case "qty":
        case "unitPriceExcl":
        case "vatPct": {
          const num = parseNumberTR(raw);
          if (num != null) item[field] = num;
          break;
        }
        case "demandDate":
        case "dueDate": {
          const date = parseDateTR(raw);
          if (date) item[field] = date;
          break;
        }
        case "currency": {
          item[field] = (raw || doc.demand?.currency || "TRY").toString().toUpperCase();
          break;
        }
        default:
          item[field] = raw;
      }
      const label = headerRow[column] || field;
      const sc = scoreCandidate(field, label, enriched);
      confidences.push(sc.score);
    });
    if (Object.values(item).some((val) => String(val || "").trim())) {
      let avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.3;
      
      // Teklifbul Rule v1.0 - Şablon ise minimum güven skoru uygula
      if (minConfidence && avgConfidence < minConfidence) {
        avgConfidence = minConfidence;
      }
      
      results.push({ value: item, confidence: avgConfidence, needsReview: avgConfidence < 0.55 });
    }
  }
  return results;
}

export async function mapDocument(buffer: Buffer, options: MappingOptions = {}): Promise<MappingResult> {
  const raw = await parseRawDocument(buffer, options);
  const supplierStore = getSupplierMemoryStore();
  const aliases = supplierStore.getAliases(options.supplierId || null).map((a) => a.alias);

  // Teklifbul Rule v1.0 - Şablon tanıma
  let isTemplate = false;
  let templateConfidence = 0;
  
  if (raw.type === 'xlsx') {
    try {
      const templateResult = await detectTemplate(buffer);
      isTemplate = templateResult.isTemplate;
      templateConfidence = templateResult.confidence;
      
      // Eğer şablon ise, yüksek güven skoru atama
      if (isTemplate && templateConfidence >= 0.95) {
        // Tüm eşleştirmelere yüksek güven skoru ekle
        // Bu, assignColumns ve mapDemandFields'de kullanılacak
      }
    } catch (error: any) {
      // Template detection hatası kritik değil, devam et
      console.warn('[Mapping] Template detection failed', error.message);
    }
  }

  const assignments = assignColumns(raw, aliases, isTemplate ? 0.95 : undefined);
  const demandFields = mapDemandFields(raw, aliases, isTemplate ? 0.95 : undefined);
  const items = mapItems(raw, assignments, isTemplate ? 0.95 : undefined);
  const columnMappings = createColumnMappings(raw, assignments);

  // Persist memory from matched columns
  assignments.forEach((assign) => {
    const label = gatherColumnLabels(raw)[assign.column];
    if (label) supplierStore.remember(options.supplierId || null, label, assign.field, assign.score);
  });
  Object.entries(demandFields).forEach(([field, result]) => {
    if (result.sourceLabel) supplierStore.remember(options.supplierId || null, result.sourceLabel, field, result.confidence);
  });

  // Teklifbul Rule v1.0 - Talep bilgileri için de eşleştirme oluştur
  // Duplicate kontrolü: Aynı columnLabel'ı tekrar ekleme
  const seenLabels = new Set<string>();
  const demandMappings: ColumnMapping[] = Object.entries(demandFields)
    .map(([field, result]) => ({
      field: field as TargetField,
      columnIndex: -1, // Talep bilgileri için sütun index yok, field candidates kullanılıyor
      columnLabel: result.sourceLabel || field,
      score: result.confidence,
      confidence: result.confidence,
    }))
    .filter(m => {
      // Sadece eşleşen alanları göster (sourceLabel varsa) ve duplicate kontrolü
      if (!m.columnLabel || m.columnLabel === m.field) return false;
      if (seenLabels.has(m.columnLabel)) return false; // Duplicate kontrolü
      seenLabels.add(m.columnLabel);
      return true;
    });

  return {
    demand: demandFields,
    items,
    warnings: raw.warnings || [],
    columnMappings, // Teklifbul Rule v1.0 - Kalemler için eşleştirme detayları
    demandMappings, // Teklifbul Rule v1.0 - Talep bilgileri için eşleştirme detayları
    fieldCandidates: raw.fieldCandidates || [], // Teklifbul Rule v1.0 - Label-value çiftleri (mapping için)
    isTemplate, // Teklifbul Rule v1.0 - Şablon tanıma
    templateConfidence, // Teklifbul Rule v1.0 - Şablon güven skoru
  };
}


