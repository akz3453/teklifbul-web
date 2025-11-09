/**
 * Normalization helpers for purchase request mapping pipeline.
 *
 * Responsibilities:
 * - Turkish-aware lowercasing & diacritic removal
 * - Numeric/date/currency parsing with TR format support ("1.234,56")
 * - Keyword synonym dictionary for field names
 *
 * NOTE: If you extend this file, keep summary comments short (as per repo guideline).
 */

import { parse as parseDateFns, isValid as isValidDate } from "date-fns";

const TURKISH_LOWER_MAP: Record<string, string> = {
  İ: "i",
  I: "ı",
  Ş: "ş",
  Ğ: "ğ",
  Ü: "ü",
  Ö: "ö",
  Ç: "ç",
};

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

export function lowercaseTR(input: string): string {
  if (!input) return "";
  let result = input;
  Object.keys(TURKISH_LOWER_MAP).forEach((char) => {
    result = result.replace(new RegExp(char, "g"), TURKISH_LOWER_MAP[char]);
  });
  return result.toLowerCase().normalize("NFD").replace(DIACRITICS_REGEX, "");
}

const PUNCTUATION_REGEX = /[\"'`~!@#$%^&*()\[\]{}<>|\\/:;.,?+=_-]/g;

export function normalizeKey(raw: string): string {
  const s = lowercaseTR(raw || "");
  return s.replace(PUNCTUATION_REGEX, " ").replace(/\s+/g, " ").trim();
}

const NUMBER_THOUSANDS = /[\.\u00A0\s]/g; // dots, nbsp, spaces
const NUMBER_DECIMAL_COMMA = /,/;

export function parseNumberTR(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;

  let normalized = raw
    .replace(/%/g, "")
    .replace(/TL|₺|TRY|USD|EUR|GBP|\$/gi, "")
    .trim();

  const hasComma = NUMBER_DECIMAL_COMMA.test(normalized);
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(NUMBER_THOUSANDS, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(/,/g, ".");
  } else {
    const match = normalized.match(/^(\d{1,3}(\.\d{3})+)(\.\d+)?$/);
    if (match && !match[3]) normalized = normalized.replace(NUMBER_THOUSANDS, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd.MM.yyyy",
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "MM/dd/yyyy",
];

export function parseDateTR(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;

  for (const fmt of DATE_FORMATS) {
    const date = parseDateFns(raw, fmt, new Date());
    if (isValidDate(date)) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}

const CURRENCY_MAP: Record<string, string> = {
  tl: "TRY",
  try: "TRY",
  "₺": "TRY",
  usd: "USD",
  $: "USD",
  dolar: "USD",
  eur: "EUR",
  euro: "EUR",
  "€": "EUR",
  gbp: "GBP",
  "£": "GBP",
};

export function detectCurrency(raw: unknown): string | null {
  if (!raw) return null;
  const normalized = lowercaseTR(String(raw)).replace(/[^a-z₺$€£]/g, "");
  return CURRENCY_MAP[normalized] || null;
}

/** Synonym dictionary for mapping keys → canonical field names */
export const FIELD_SYNONYMS: Record<string, string> = {
  "satin alma talep eden": "requester",
  "talep eden": "requester",
  "istek sahibi": "requester",
  "talep tarihi": "demandDate",
  "istenen tarih": "dueDate",
  "termin": "dueDate",
  "para birimi": "currency",
  "pb": "currency",
  "doviz": "currency",
  "birim": "unit",
  "miktar": "qty",
  "adet": "qty",
  "urun adi": "itemName",
  "urun ismi": "itemName",
  "malzeme": "itemName",
  "stok adi": "itemName",
  "birim fiyat": "unitPriceExcl",
  "net fiyat": "unitPriceExcl",
  "kdv": "vatPct",
  "kdv orani": "vatPct",
  "not": "note",
  "aciklama": "note",
};

export function mapSynonymToField(raw: string): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  return FIELD_SYNONYMS[key] || null;
}

export interface CandidateValue {
  raw: string;
  normalized?: string;
  number?: number | null;
  date?: string | null;
  currency?: string | null;
}

export function enrichCandidate(raw: unknown): CandidateValue {
  const str = raw == null ? "" : String(raw);
  return {
    raw: str,
    normalized: normalizeKey(str),
    number: parseNumberTR(str),
    date: parseDateTR(str),
    currency: detectCurrency(str),
  };
}


