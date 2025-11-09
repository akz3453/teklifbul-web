/**
 * Test Database Connections
 * Teklifbul Rule v1.0
 */

import { testConnection, getRedisClient, closeConnections } from '../src/db/connection';

async function testAll() {
  console.log('🔍 Testing connections...\n');
  
  // Test PostgreSQL
  console.log('1. Testing PostgreSQL connection...');
  const pgOk = await testConnection();
  if (pgOk) {
    console.log('✅ PostgreSQL: Connected\n');
  } else {
    console.log('❌ PostgreSQL: Connection failed');
    console.log('   Please check:');
    console.log('   - POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD');
    console.log('   - PostgreSQL is running\n');
  }
  
  // Test Redis
  console.log('2. Testing Redis connection...');
  let redisOk = false;
  
  if (process.env.CACHE_DISABLED === '1') {
    console.log('⚠️  Redis: Cache disabled (CACHE_DISABLED=1)\n');
    redisOk = true; // Devre dışı ama sorun değil
  } else {
    try {
      const redis = getRedisClient();
      if (!redis) {
        console.log('⚠️  Redis: Client not available (cache disabled)\n');
        redisOk = true; // Sorun değil, cache opsiyonel
      } else {
        await redis.connect(); // lazyConnect=true olduğu için manuel bağlan
        const pong = await redis.ping();
        if (pong === 'PONG') {
          redisOk = true;
          console.log('✅ Redis: Connected\n');
        } else {
          console.log('❌ Redis: Unexpected response\n');
        }
      }
    } catch (e: any) {
      console.log('⚠️  Redis: Connection failed (cache will be disabled)');
      console.log('   Error:', e.message);
      console.log('   Tip: CACHE_DISABLED=1 ile cache\'i devre dışı bırakabilirsiniz\n');
      redisOk = false; // Uyarı ama uygulama çalışır
    }
  }
  
  console.log('📋 Summary:');
  console.log(`   PostgreSQL: ${pgOk ? '✅' : '❌'}`);
  console.log(`   Redis: ${redisOk ? '✅' : '❌'}`);
  
  if (!pgOk || !redisOk) {
    console.log('\n💡 Setup Instructions:');
    if (!pgOk) {
      console.log('\n   PostgreSQL:');
      console.log('   - Install PostgreSQL: https://www.postgresql.org/download/');
      console.log('   - Create database: CREATE DATABASE teklifbul;');
      console.log('   - Set env vars: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD');
    }
    if (!redisOk) {
      console.log('\n   Redis:');
      console.log('   - Install Redis: https://redis.io/download');
      console.log('   - Start Redis: redis-server');
      console.log('   - Set env vars: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (optional)');
    }
  }
}

testAll()
  .then(() => closeConnections())
  .catch((e) => {
    console.error('Test failed:', e);
    closeConnections();
    process.exit(1);
  });

