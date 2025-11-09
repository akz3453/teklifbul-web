/**
 * Seed Categories: Açıklamalar ve Keywords
 * Teklifbul Rule v1.0
 * 
 * Usage: pnpm seed:categories
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getPgPool } from '../src/db/connection';

interface CategoryDesc {
  id: number;
  name: string;
  short_desc: string;
  examples: string[];
}

interface CategoryKeyword {
  category_id: number;
  keyword: string;
  weight: number;
}

async function seedCategories() {
  const pool = getPgPool();
  
  // Load JSON files
  const descPath = join(process.cwd(), 'seed', 'categories.desc.json');
  const keywordsPath = join(process.cwd(), 'seed', 'category_keywords.json');
  
  const categories: CategoryDesc[] = JSON.parse(readFileSync(descPath, 'utf-8'));
  const keywords: CategoryKeyword[] = JSON.parse(readFileSync(keywordsPath, 'utf-8'));
  
  console.log(`Seeding ${categories.length} categories...`);
  
  // Create a map from JSON category_id to actual database ID
  const categoryIdMap = new Map<number, number>();
  
  // Update categories with descriptions (by name, not ID)
  for (const cat of categories) {
    try {
      // First, ensure category exists (INSERT if not exists)
      const insertResult = await pool.query(
        `INSERT INTO categories (name, short_desc, examples)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) 
         DO UPDATE SET short_desc = EXCLUDED.short_desc, examples = EXCLUDED.examples, updated_at = now()
         RETURNING id`,
        [cat.name, cat.short_desc, cat.examples]
      );
      
      const actualId = insertResult.rows[0].id;
      categoryIdMap.set(cat.id, actualId);
      console.log(`✅ Updated category: ${cat.name} (JSON ID: ${cat.id} -> DB ID: ${actualId})`);
    } catch (e: any) {
      console.warn(`⚠️  Category ${cat.name} update failed:`, e.message);
    }
  }
  
  console.log(`\nSeeding ${keywords.length} keywords...`);
  
  // Insert keywords using mapped IDs
  let successCount = 0;
  for (const kw of keywords) {
    const actualCategoryId = categoryIdMap.get(kw.category_id);
    if (!actualCategoryId) {
      console.warn(`⚠️  Skipping keyword "${kw.keyword}": category_id ${kw.category_id} not found in map`);
      continue;
    }
    
    try {
      await pool.query(
        `INSERT INTO category_keywords (category_id, keyword, weight)
         VALUES ($1, $2, $3)
         ON CONFLICT (category_id, keyword) 
         DO UPDATE SET weight = EXCLUDED.weight`,
        [actualCategoryId, kw.keyword.toLowerCase(), kw.weight]
      );
      successCount++;
    } catch (e: any) {
      console.warn(`⚠️  Keyword insertion failed for category ${actualCategoryId}:`, e.message);
    }
  }
  
  console.log(`✅ Inserted ${successCount}/${keywords.length} keywords`);
  
  console.log('\n✅ Seed completed!');
}

async function main() {
  try {
    await seedCategories();
    process.exit(0);
  } catch (e) {
    console.error('Seed failed:', e);
    process.exit(1);
  }
}

// ES module entry point
main().catch(console.error);

