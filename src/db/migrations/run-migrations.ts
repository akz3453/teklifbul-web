/**
 * Migration Runner
 * Teklifbul Rule v1.0
 * 
 * Usage: tsx src/db/migrations/run-migrations.ts [migration-file]
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getPgPool } from '../connection';

async function runMigration(filePath: string): Promise<void> {
  const pool = getPgPool();
  const sql = readFileSync(filePath, 'utf-8');
  
  console.info(`Running migration: ${filePath}`);
  
  try {
  await pool.query(sql);
  console.info(`✅ Migration completed: ${filePath}`);
  } catch (e: any) {
      if (e.code === '42P07' || e.message?.includes('already exists')) {
      console.info(`⚠️  Table/index already exists, skipping: ${filePath}`);
    } else {
      console.error(`❌ Migration failed: ${filePath}`, e);
      throw e;
    }
  }
}

async function main() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: tsx run-migrations.ts <migration-file>');
    process.exit(1);
  }
  
  const fullPath = join(process.cwd(), migrationFile);
  
  try {
    await runMigration(fullPath);
    process.exit(0);
  } catch (e) {
    console.error('Migration execution failed:', e);
    process.exit(1);
  }
}

// ES module entry point
main().catch(console.error);

