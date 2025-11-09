#!/usr/bin/env tsx
// Quick CLI to exercise mapping service with local fixtures.
// Usage: npx tsx scripts/test-mapping.ts path/to/file --supplier SUPPLIER_ID

import fs from "fs";
import path from "path";
import { mapDocument } from "../server/services/mappingService";

async function main() {
  const [, , fileArg, ...rest] = process.argv;
  if (!fileArg) {
    console.error("Usage: tsx scripts/test-mapping.ts <file> [--supplier SUPPLIER_ID]");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let supplierId: string | undefined;
  rest.forEach((tok, idx) => {
    if (tok === "--supplier") supplierId = rest[idx + 1];
  });

  const buffer = fs.readFileSync(filePath);
  const result = await mapDocument(buffer, {
    filename: path.basename(filePath),
    supplierId,
  });

  console.log(JSON.stringify({
    demand: result.demand,
    items: result.items,
    warnings: result.warnings,
  }, null, 2));
}

main().catch((err) => {
  console.error("[test-mapping] failed", err);
  process.exit(1);
});


