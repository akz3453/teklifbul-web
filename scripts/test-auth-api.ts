/**
 * Auth API Test Script
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * Auth endpoint'lerini test eder
 * 
 * Usage:
 *   npm run test:auth-api
 *   veya
 *   tsx scripts/test-auth-api.ts
 */

import { logger } from '../src/shared/log/logger.js';

const API_BASE_URL = process.env.API_URL || 'http://localhost:5174';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];

/**
 * Test helper - API isteği gönder
 */
async function testRequest(
  name: string,
  method: string,
  endpoint: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    expectedStatus?: number;
  } = {}
): Promise<void> {
  try {
    logger.group(`🧪 Test: ${name}`);
    
    const url = `${API_BASE_URL}${endpoint}`;
    const { body, headers = {}, expectedStatus = 200 } = options;

    logger.info(`Request: ${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const responseData = await response.json().catch(() => ({}));
    // expectedStatus array olabilir (birden fazla kabul edilebilir status)
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const statusMatch = expectedStatuses.includes(response.status);

    logger.info(`Status: ${response.status} (expected: ${expectedStatus})`);
    logger.info(`Response:`, responseData);

    if (statusMatch) {
      results.push({
        name,
        passed: true,
        response: responseData
      });
      logger.info('✅ Test passed');
    } else {
      results.push({
        name,
        passed: false,
        error: `Expected status ${expectedStatus}, got ${response.status}`,
        response: responseData
      });
      logger.warn('❌ Test failed');
    }

    logger.end();
  } catch (error: any) {
    results.push({
      name,
      passed: false,
      error: error.message || String(error)
    });
    logger.error('❌ Test error', error);
    logger.end();
  }
}

/**
 * Ana test fonksiyonu
 */
async function runTests() {
  logger.group('🚀 Auth API Tests Başlatılıyor');
  logger.info(`API Base URL: ${API_BASE_URL}`);
  logger.end();

  // Test 1: Health check (API çalışıyor mu?)
  // Not: Database bağlantısı yoksa 503 dönebilir (normal development'ta)
  await testRequest(
    'Health Check',
    'GET',
    '/health',
    { expectedStatus: [200, 503] } // Her iki durum da kabul edilebilir
  );

  // Test 2: POST /api/auth/verify - Token eksik
  await testRequest(
    'POST /api/auth/verify - Token eksik',
    'POST',
    '/api/auth/verify',
    {
      body: {},
      expectedStatus: 400
    }
  );

  // Test 3: POST /api/auth/verify - Geçersiz token
  await testRequest(
    'POST /api/auth/verify - Geçersiz token',
    'POST',
    '/api/auth/verify',
    {
      body: { idToken: 'invalid-token-12345' },
      expectedStatus: 400 // Token formatı hatalı olduğu için 400 daha uygun
    }
  );

  // Test 4: GET /api/auth/me - Authorization header eksik
  await testRequest(
    'GET /api/auth/me - Authorization header eksik',
    'GET',
    '/api/auth/me',
    {
      expectedStatus: 401
    }
  );

  // Test 5: GET /api/auth/me - Geçersiz token
  await testRequest(
    'GET /api/auth/me - Geçersiz token',
    'GET',
    '/api/auth/me',
    {
      headers: {
        'Authorization': 'Bearer invalid-token-12345'
      },
      expectedStatus: 401
    }
  );

  // Test 6: Rate limiting test (5 istek gönder, 6. istekte rate limit)
  logger.group('🧪 Rate Limiting Test');
  logger.info('6 istek gönderiliyor (rate limit testi - ilk istekten sonra rate limit devreye girer)...');
  
  for (let i = 1; i <= 6; i++) {
    // İlk istek: token format hatası (400)
    // 2-6. istekler: rate limit (429) - çünkü aynı IP'den çok istek
    const expectedStatus = i === 1 ? 400 : 429;
    
    await testRequest(
      `Rate Limit Test - İstek ${i}/6`,
      'POST',
      '/api/auth/verify',
      {
        body: { idToken: 'test-token' },
        expectedStatus
      }
    );
    
    // Kısa bir bekleme
    if (i < 6) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  logger.end();

  // Sonuçları göster
  logger.group('📊 Test Sonuçları');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  logger.info(`Toplam: ${total} test`);
  logger.info(`✅ Başarılı: ${passed}`);
  logger.info(`❌ Başarısız: ${failed}`);

  if (failed > 0) {
    logger.warn('\nBaşarısız Testler:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        logger.warn(`  - ${r.name}`);
        if (r.error) {
          logger.warn(`    Hata: ${r.error}`);
        }
      });
  }

  logger.end();

  // Exit code
  if (failed > 0) {
    logger.error('❌ Bazı testler başarısız!');
    process.exit(1);
  } else {
    logger.info('✅ Tüm testler başarılı!');
    process.exit(0);
  }
}

// Script çalıştır
runTests().catch(error => {
  logger.error('Test script hatası', error);
  process.exit(1);
});

