/**
 * PostgreSQL → Firestore Migration Script
 * Teklifbul Rule v1.0
 * 
 * PostgreSQL'deki verileri Firestore'a aktarır
 * 
 * Kullanım: tsx scripts/migrate-postgres-to-firestore.ts
 * 
 * Gereksinimler:
 * - PostgreSQL çalışıyor olmalı
 * - Firestore bağlantısı kurulmuş olmalı
 * - .env dosyasında PostgreSQL bilgileri olmalı
 */

import { getPgPool } from '../src/db/connection';
import { db } from '../src/lib/firebase';
import { collection, doc, setDoc, batch } from 'firebase/firestore';

// Logger helper
function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const prefix = {
    info: '📦',
    success: '✅',
    error: '❌',
    warn: '⚠️'
  }[type];
  console.log(`${prefix} ${message}`);
}

interface Category {
  id: number;
  name: string;
  short_desc?: string;
  examples?: string[];
  created_at?: Date;
  updated_at?: Date;
}

interface CategoryKeyword {
  id: number;
  category_id: number;
  keyword: string;
  weight: number;
}

interface TaxOffice {
  id: number;
  province_name: string;
  district_name?: string;
  office_name: string;
  office_code?: string;
  office_type?: string;
}

/**
 * Categories migration
 */
async function migrateCategories() {
  log('Migrating categories...', 'info');
  
  try {
    // PostgreSQL bağlantı kontrolü
    const pool = getPgPool();
    if (!pool) {
      throw new Error('PostgreSQL connection pool is null');
    }
    
    // Firestore bağlantı kontrolü
    if (!db) {
      throw new Error('Firestore db is null');
    }
    
    const result = await pool.query('SELECT * FROM categories ORDER BY id');
    const categories = result.rows as Category[];
    
    log(`Found ${categories.length} categories`, 'info');
    
    if (categories.length === 0) {
      log('No categories to migrate', 'warn');
      return;
    }
    
    // Batch write (Firestore limit: 500 per batch)
    const batches: any[] = [];
    let currentBatch = batch(db);
    let batchCount = 0;
    
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const categoryRef = doc(db, 'categories', category.id.toString());
      
      currentBatch.set(categoryRef, {
        id: category.id,
        name: category.name,
        short_desc: category.short_desc || null,
        examples: category.examples || [],
        createdAt: category.created_at || new Date(),
        updatedAt: category.updated_at || new Date()
      });
      
      batchCount++;
      
      // Her 500'de bir yeni batch oluştur
      if (batchCount >= 500) {
        batches.push(currentBatch);
        currentBatch = batch(db);
        batchCount = 0;
      }
    }
    
    // Son batch'i ekle
    if (batchCount > 0) {
      batches.push(currentBatch);
    }
    
    // Batch'leri çalıştır
    for (const b of batches) {
      await b.commit();
    }
    
    log(`Migrated ${categories.length} categories`, 'success');
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      log('PostgreSQL bağlantı hatası. PostgreSQL çalışıyor mu?', 'error');
      log('Lütfen PostgreSQL\'i başlatın veya .env dosyasını kontrol edin.', 'warn');
      process.exit(1);
    }
    log(`Migration error: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Category Keywords migration
 */
async function migrateCategoryKeywords() {
  log('Migrating category keywords...', 'info');
  
  try {
    const pool = getPgPool();
    if (!pool) {
      throw new Error('PostgreSQL connection pool is null');
    }
    
    const result = await pool.query('SELECT * FROM category_keywords ORDER BY id');
    const keywords = result.rows as CategoryKeyword[];
    
    log(`Found ${keywords.length} keywords`, 'info');
    
    if (keywords.length === 0) {
      log('No keywords to migrate', 'warn');
      return;
    }
    
    // Batch write
    const batches: any[] = [];
    let currentBatch = batch(db);
    let batchCount = 0;
    
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      const keywordRef = doc(db, 'category_keywords', keyword.id.toString());
      
      currentBatch.set(keywordRef, {
        id: keyword.id,
        category_id: keyword.category_id,
        keyword: keyword.keyword,
        weight: keyword.weight,
        createdAt: new Date()
      });
      
      batchCount++;
      
      if (batchCount >= 500) {
        batches.push(currentBatch);
        currentBatch = batch(db);
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      batches.push(currentBatch);
    }
    
    for (const b of batches) {
      await b.commit();
    }
    
    log(`Migrated ${keywords.length} keywords`, 'success');
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      log('PostgreSQL bağlantı hatası', 'error');
      process.exit(1);
    }
    log(`Migration error: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Tax Offices migration
 */
async function migrateTaxOffices() {
  log('Migrating tax offices...', 'info');
  
  try {
    const pool = getPgPool();
    if (!pool) {
      throw new Error('PostgreSQL connection pool is null');
    }
    
    const result = await pool.query('SELECT * FROM tax_offices ORDER BY id');
    const offices = result.rows as TaxOffice[];
    
    log(`Found ${offices.length} tax offices`, 'info');
    
    if (offices.length === 0) {
      log('No tax offices to migrate', 'warn');
      return;
    }
    
    // Batch write
    const batches: any[] = [];
    let currentBatch = batch(db);
    let batchCount = 0;
    
    for (let i = 0; i < offices.length; i++) {
      const office = offices[i];
      const officeRef = doc(db, 'tax_offices', office.id.toString());
      
      currentBatch.set(officeRef, {
        id: office.id,
        province_name: office.province_name,
        district_name: office.district_name || null,
        office_name: office.office_name,
        office_code: office.office_code || null,
        office_type: office.office_type || null,
        createdAt: new Date()
      });
      
      batchCount++;
      
      if (batchCount >= 500) {
        batches.push(currentBatch);
        currentBatch = batch(db);
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      batches.push(currentBatch);
    }
    
    for (const b of batches) {
      await b.commit();
    }
    
    log(`Migrated ${offices.length} tax offices`, 'success');
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      log('PostgreSQL bağlantı hatası', 'error');
      process.exit(1);
    }
    log(`Migration error: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Main migration function
 */
async function main() {
  log('Starting PostgreSQL → Firestore migration...', 'info');
  console.log('');
  
  try {
    // 1. Categories
    await migrateCategories();
    console.log('');
    
    // 2. Category Keywords
    await migrateCategoryKeywords();
    console.log('');
    
    // 3. Tax Offices
    await migrateTaxOffices();
    console.log('');
    
    log('Migration completed successfully!', 'success');
    process.exit(0);
  } catch (error: any) {
    log(`Migration failed: ${error.message}`, 'error');
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run migration (TypeScript/ESM compatible)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('migrate-postgres-to-firestore')) {
  main().catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

export { migrateCategories, migrateCategoryKeywords, migrateTaxOffices };

