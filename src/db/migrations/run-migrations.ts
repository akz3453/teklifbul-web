/**
 * Migration Runner
 * Teklifbul Rule v1.0 - Structured Logging
 * 
 * Usage: tsx src/db/migrations/run-migrations.ts [migration-file]
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getPgPool } from '../connection';
import { logger } from '../../shared/log/logger.js';

async function runMigration(filePath: string): Promise<void> {
  const pool = getPgPool();
  const sql = readFileSync(filePath, 'utf-8');
  
  logger.info(`Running migration: ${filePath}`);
  
  try {
  await pool.query(sql);
  logger.info(`✅ Migration completed: ${filePath}`);
  } catch (e: any) {
      if (e.code === '42P07' || e.message?.includes('already exists')) {
      logger.info(`⚠️  Table/index already exists, skipping: ${filePath}`);
    } else {
      logger.error(`❌ Migration failed: ${filePath}`, e);
      throw e;
    }
  }
}

async function main() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    logger.error('Usage: tsx run-migrations.ts <migration-file>');
    process.exit(1);
  }
  
  const fullPath = join(process.cwd(), migrationFile);
  
  try {
    await runMigration(fullPath);
    process.exit(0);
  } catch (e) {
    logger.error('Migration execution failed:', e);
    process.exit(1);
  }
}

// ES module entry point
main().catch((err) => {
  logger.error('Main execution error:', err);
  process.exit(1);
});

