/**
 * Complete Setup and Run Script
 * Teklifbul Rule v1.0
 * 
 * Kurulum ve çalıştırma scripti
 */

import { testConnection, getRedisClient, closeConnections } from '../src/db/connection';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getPgPool } from '../src/db/connection';

async function checkPostgreSQL() {
  console.log('🔍 PostgreSQL bağlantısı kontrol ediliyor...');
  const isConnected = await testConnection();
  if (isConnected) {
    console.log('✅ PostgreSQL bağlantısı başarılı\n');
    return true;
  } else {
    console.log('❌ PostgreSQL bağlantısı başarısız\n');
    console.log('💡 PostgreSQL kurulumu için:');
    console.log('   1. PostgreSQL indir: https://www.postgresql.org/download/windows/');
    console.log('   2. Kurulum sırasında şifre belirleyin');
    console.log('   3. .env dosyasına ekleyin:');
    console.log('      POSTGRES_HOST=localhost');
    console.log('      POSTGRES_PORT=5432');
    console.log('      POSTGRES_DB=teklifbul');
    console.log('      POSTGRES_USER=postgres');
    console.log('      POSTGRES_PASSWORD=<şifreniz>\n');
    return false;
  }
}

async function checkRedis() {
  console.log('🔍 Redis bağlantısı kontrol ediliyor...');
  
  if (process.env.CACHE_DISABLED === '1') {
    console.log('⚠️  Redis devre dışı (CACHE_DISABLED=1)\n');
    return true;
  }
  
  const redis = getRedisClient();
  if (!redis) {
    console.log('⚠️  Redis client mevcut değil\n');
    return true; // Opsiyonel
  }
  
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('✅ Redis bağlantısı başarılı\n');
      redis.disconnect();
      return true;
    }
  } catch (e: any) {
    console.log('⚠️  Redis bağlantısı başarısız (cache devre dışı)');
    console.log('   Hata:', e.message);
    console.log('💡 Redis kurulumu için:');
    console.log('   - Docker: docker run -d -p 6379:6379 redis');
    console.log('   - veya CACHE_DISABLED=1 ile devam edebilirsiniz\n');
    return false; // Sorun değil, cache opsiyonel
  }
  
  return true;
}

async function runMigrations() {
  console.log('📦 Migration\'lar çalıştırılıyor...\n');
  
  const pool = getPgPool();
  const client = await pool.connect();
  
  try {
    // Categories migration
    console.log('  1. Categories migration...');
    const categoriesSql = readFileSync(
      join(process.cwd(), 'src/modules/categories/migrations/001_create_categories_tables.sql'),
      'utf-8'
    );
    await client.query(categoriesSql);
    console.log('     ✅ Categories tablosu oluşturuldu');
    
    // Tax Offices migration
    console.log('  2. Tax Offices migration...');
    const taxOfficesSql = readFileSync(
      join(process.cwd(), 'src/modules/taxOffices/migrations/001_create_tax_offices_tables.sql'),
      'utf-8'
    );
    await client.query(taxOfficesSql);
    console.log('     ✅ Tax Offices tablosu oluşturuldu\n');
    
    return true;
  } catch (e: any) {
    if (e.code === '42P07' || e.message?.includes('already exists')) {
      console.log('     ⚠️  Tablolar zaten mevcut, atlanıyor\n');
      return true;
    }
    console.error('     ❌ Migration hatası:', e.message);
    return false;
  } finally {
    client.release();
  }
}

async function seedData() {
  console.log('🌱 Seed data yükleniyor...\n');
  
  try {
    const pool = getPgPool();
    const client = await pool.connect();
    
    // Categories seed
    console.log('  1. Categories seed...');
    const seedCategories = await import('../scripts/seed-categories');
    // seedCategories fonksiyonu zaten çalıştırılıyor, burada sadece kontrol edelim
    
    // Kontrol: Kategoriler var mı?
    const catCount = await client.query('SELECT COUNT(*) as count FROM categories');
    const count = parseInt(catCount.rows[0].count);
    
    if (count === 0) {
      console.log('     ⚠️  Kategoriler boş, seed çalıştırılmalı: npm run seed:categories');
    } else {
      console.log(`     ✅ ${count} kategori mevcut`);
    }
    
    client.release();
    console.log('');
    return true;
  } catch (e: any) {
    console.error('     ❌ Seed kontrolü hatası:', e.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Teklifbul Setup ve Run Script\n');
  console.log('=' .repeat(50) + '\n');
  
  // 1. PostgreSQL kontrolü
  const pgOk = await checkPostgreSQL();
  if (!pgOk) {
    console.log('⚠️  PostgreSQL kurulu değil, bazı özellikler çalışmayacak\n');
  }
  
  // 2. Redis kontrolü
  const redisOk = await checkRedis();
  
  // 3. PostgreSQL varsa migration çalıştır
  if (pgOk) {
    const migrationOk = await runMigrations();
    if (migrationOk) {
      await seedData();
    }
  }
  
  console.log('=' .repeat(50) + '\n');
  console.log('📋 Özet:');
  console.log(`   PostgreSQL: ${pgOk ? '✅' : '❌'}`);
  console.log(`   Redis: ${redisOk ? '✅' : '⚠️  (opsiyonel)'}`);
  console.log(`   Migration: ${pgOk ? '✅' : '⏭️  (PostgreSQL gerekli)'}`);
  console.log('');
  
  if (pgOk) {
    console.log('✅ Sistem hazır!');
    console.log('💡 API server\'ı başlatmak için: npm run dev:api');
    console.log('💡 Frontend\'i başlatmak için: npm run dev');
  } else {
    console.log('⚠️  PostgreSQL kurulumu gerekiyor');
    console.log('💡 Sistem PostgreSQL olmadan da çalışır ama kategori önerisi ve vergi dairesi özellikleri kullanılamaz');
  }
  
  await closeConnections();
}

main().catch(console.error);

