# Mapping Pipeline Notes

## Architecture Overview

- `server/services/normalization.ts`
  - Turkish-aware text normalization, number/date/currency parsing, synonym map.
- `server/services/scorers.ts`
  - String similarity (Levenshtein + Jaro-Winkler) + type/rule confidence scoring.
- `server/services/supplierMemory.ts`
  - JSON-backed alias memory keyed by supplierId with running confidence averages.
- `server/services/mappingService.ts`
  - Orchestrates parsing (xlsx/docx/pdf), builds candidates, scores columns/fields, emits `{ value, confidence, needsReview }`.
  - Persists alias learnings and returns warnings for low-confidence matches.
- `/api/import/preview`
  - Calls `mapDocument`, returns `demand`, `items`, and companion meta objects for UI highlights.
- Front-end (`demand-new.html`)
  - Applies mapped fields, highlights `needsReview`, alerts warnings.

## Config Knobs

- `ScoreConfig` weights in `scorers.ts` (`stringWeight`, `typeWeight`, `ruleWeight`).
- Supplier memory file: `data/supplier-memory.json` (LRU max 1000 entries).
- Confidence threshold: `0.55` (below → `needsReview: true`).
- CLI: `node scripts/test-mapping.js <file> [--supplier SUPPLIER_ID]`.

## Running Tests / CLI

```bash
npm test             # jest (includes normalization/scorer tests)
npm run test:mapping path/to/file.xlsx --supplier DEMO
```

## Adding New Aliases

Supplier-specific alias boosts are recorded automatically when mapping confidence is high. To seed aliases manually: edit `data/supplier-memory.json` and add `{ alias, field, confidence, seen }` entries under the supplier key.


