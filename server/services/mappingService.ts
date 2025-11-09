/**
 * Mapping service orchestrates document parsing → field mapping.
 * Summary: reuse existing parsers (xlsx/docx/pdf) and apply normalization/scoring/supplier-memory
 * to produce demand/items with confidence and review flags.
 */

import path from "path";
import { previewXlsx } from "./importParser";
import { previewDocx } from "./docxParser";
import { previewPdf } from "./pdfParser";
import { CandidateValue, enrichCandidate, mapSynonymToField, normalizeKey, parseDateTR, parseNumberTR } from "./normalization";
import { getSupplierMemoryStore } from "./supplierMemory";
import { scoreCandidate, TargetField } from "./scorers";

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

export interface MappingResult {
  demand: Record<string, FieldResult>;
  items: ItemResult[];
  warnings: string[];
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
}

const ITEM_FIELDS: TargetField[] = [
  "itemName",
  "qty",
  "unit",
  "brand",
  "model",
  "unitPriceExcl",
  "vatPct",
];

const DEMAND_FIELDS: TargetField[] = [
  "title",
  "requester",
  "demandDate",
  "dueDate",
  "currency",
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

function assignColumns(doc: RawDocument, supplierAliases: string[]): ColumnAssignment[] {
  const labels = gatherColumnLabels(doc);
  const assignments: ColumnAssignment[] = [];
  const usedColumns = new Set<number>();

  for (const field of ITEM_FIELDS) {
    let best: ColumnAssignment | null = null;
    labels.forEach((label, idx) => {
      const candidateValue = pickSampleValue(doc, idx);
      const baseScore = scoreCandidate(field, label, candidateValue).score;
      const aliasBoost = supplierAliases.some((alias) => normalizeKey(alias) === normalizeKey(label)) ? 0.1 : 0;
      const total = Math.min(1, baseScore + aliasBoost);
      if (!best || total > best.score) {
        best = { field, column: idx, score: total };
      }
    });
    if (best) assignments.push(best);
  }

  // Greedy unique assignment by descending score
  assignments.sort((a, b) => b.score - a.score);
  const unique: ColumnAssignment[] = [];
  for (const a of assignments) {
    if (usedColumns.has(a.column)) continue;
    usedColumns.add(a.column);
    unique.push(a);
  }
  return unique;
}

function mapDemandFields(doc: RawDocument, supplierAliases: string[]): Record<string, FieldResult> {
  const fieldResults: Record<string, FieldResult> = {};
  const candidates = doc.fieldCandidates || [];
  const aliasNormalized = supplierAliases.map((a) => normalizeKey(a));

  for (const target of DEMAND_FIELDS) {
    let best: { score: number; candidate: { label: string; value: string } } | null = null;
    candidates.forEach((cand) => {
      const enriched = enrichCandidate(cand.value);
      const score = scoreCandidate(target, cand.label, enriched).score;
      const aliasBoost = aliasNormalized.includes(normalizeKey(cand.label)) ? 0.1 : 0;
      const total = Math.min(1, score + aliasBoost);
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

  return fieldResults;
}

function mapItems(doc: RawDocument, assignments: ColumnAssignment[]): ItemResult[] {
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
      const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.3;
      results.push({ value: item, confidence: avgConfidence, needsReview: avgConfidence < 0.55 });
    }
  }
  return results;
}

export async function mapDocument(buffer: Buffer, options: MappingOptions = {}): Promise<MappingResult> {
  const raw = await parseRawDocument(buffer, options);
  const supplierStore = getSupplierMemoryStore();
  const aliases = supplierStore.getAliases(options.supplierId || null).map((a) => a.alias);

  const assignments = assignColumns(raw, aliases);
  const demandFields = mapDemandFields(raw, aliases);
  const items = mapItems(raw, assignments);

  // Persist memory from matched columns
  assignments.forEach((assign) => {
    const label = gatherColumnLabels(raw)[assign.column];
    if (label) supplierStore.remember(options.supplierId || null, label, assign.field, assign.score);
  });
  Object.entries(demandFields).forEach(([field, result]) => {
    if (result.sourceLabel) supplierStore.remember(options.supplierId || null, result.sourceLabel, field, result.confidence);
  });

  return {
    demand: demandFields,
    items,
    warnings: raw.warnings || [],
  };
}


