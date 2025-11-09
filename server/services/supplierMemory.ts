/**
 * Lightweight supplier alias memory.
 * - Stores mapping between supplier-specific labels and canonical fields
 * - Keeps running average confidence, capped by LRU size
 * - Persists in JSON file under data/supplier-memory.json (created lazily)
 */

import fs from "fs";
import path from "path";

export interface MemoryEntry {
  field: string;
  alias: string;
  confidence: number;
  seen: number;
}

export interface SupplierMemoryStore {
  getAliases(supplierId: string | null): MemoryEntry[];
  remember(supplierId: string | null, alias: string, field: string, confidence: number): void;
}

const MEMORY_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(MEMORY_DIR, "supplier-memory.json");
const MAX_ENTRIES = 1000;

function ensureFile(): Record<string, MemoryEntry[]> {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, JSON.stringify({}), "utf8");
  try {
    const raw = fs.readFileSync(MEMORY_FILE, "utf8");
    return JSON.parse(raw || "{}") as Record<string, MemoryEntry[]>;
  } catch (err) {
    console.warn("[SupplierMemory] Cannot read memory file, recreating", err);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify({}), "utf8");
    return {};
  }
}

function saveStore(store: Record<string, MemoryEntry[]>): void {
  const entries = Object.entries(store);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(MAX_ENTRIES);
  }
  const trimmed = Object.fromEntries(entries);
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(trimmed, null, 2), "utf8");
}

class FileSupplierMemory implements SupplierMemoryStore {
  private cache: Record<string, MemoryEntry[]>;

  constructor() {
    this.cache = ensureFile();
  }

  private key(id: string | null): string {
    return id && id.trim() ? id.trim() : "__generic__";
  }

  getAliases(supplierId: string | null): MemoryEntry[] {
    const key = this.key(supplierId);
    return this.cache[key] || [];
  }

  remember(supplierId: string | null, alias: string, field: string, confidence: number): void {
    if (!alias || !field) return;
    const key = this.key(supplierId);
    const entries = this.cache[key] || [];
    const existing = entries.find((e) => e.alias === alias && e.field === field);
    if (existing) {
      existing.seen += 1;
      existing.confidence = (existing.confidence * (existing.seen - 1) + confidence) / existing.seen;
    } else {
      entries.push({ alias, field, confidence, seen: 1 });
    }
    this.cache[key] = entries.slice(-MAX_ENTRIES);
    saveStore(this.cache);
  }
}

let defaultStore: SupplierMemoryStore | null = null;

export function getSupplierMemoryStore(): SupplierMemoryStore {
  if (!defaultStore) defaultStore = new FileSupplierMemory();
  return defaultStore;
}


