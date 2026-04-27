/**
 * Migration Status API Test Script
 * Teklifbul Rule v1.0 - Status API endpoint'ini test eder
 * 
 * Usage: tsx scripts/test-migration-status-api.ts
 */

import 'dotenv/config';
import { logger } from '../src/shared/log/logger.js';

const API_BASE_URL = process.env.API_URL || 'http://localhost:5174';

async function testRequest(name: string, method: string, path: string, options: {
  body?: any;
  headers?: Record<string, string>;
  expectedStatus?: number | number[];
} = {}) {
  try {
    logger.group(`🧪 ${name}`);
    
    const url = `${API_BASE_URL}${path}`;
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    const data = await response.json().catch(() => ({}));

    const expectedStatuses = Array.isArray(options.expectedStatus) 
      ? options.expectedStatus 
      : [options.expectedStatus || 200];

    if (expectedStatuses.includes(response.status)) {
      logger.info(`✅ ${name} - Status: ${response.status} (${duration}ms)`);
      if (Object.keys(data).length > 0) {
        logger.info(`Response:`, data);
      }
      logger.end();
      return true;
    } else {
      logger.error(`❌ ${name} - Expected status ${expectedStatuses.join(' or ')}, got ${response.status}`);
      logger.error(`Response:`, data);
      logger.end();
      return false;
    }
  } catch (error: any) {
    logger.error(`❌ ${name} - Error:`, error.message);
    logger.end();
    return false;
  }
}

async function runTests() {
  logger.group('🚀 Migration Status API Tests');
  logger.info(`Testing API at: ${API_BASE_URL}`);
  logger.end();

  const results: Array<{ name: string; passed: boolean }> = [];

  // Test 1: Health check
  const healthCheck = await testRequest(
    'Health Check',
    'GET',
    '/health',
    { expectedStatus: [200, 503] }
  );
  results.push({ name: 'Health Check', passed: healthCheck });

  // Test 2: Status API - Missing runId
  const statusMissing = await testRequest(
    'GET /api/migration/status - Missing runId',
    'GET',
    '/api/migration/status',
    { expectedStatus: [400, 404] }
  );
  results.push({ name: 'Status API - Missing runId', passed: statusMissing });

  // Test 3: Status API - Invalid runId
  const statusInvalid = await testRequest(
    'GET /api/migration/status - Invalid runId',
    'GET',
    '/api/migration/status?runId=invalid-run-id-12345',
    { expectedStatus: [200, 404] }
  );
  results.push({ name: 'Status API - Invalid runId', passed: statusInvalid });

  // Test 4: Status API - Valid format (should return null or status)
  const statusValid = await testRequest(
    'GET /api/migration/status - Valid format',
    'GET',
    '/api/migration/status?runId=test-run-id-12345',
    { expectedStatus: [200, 404] }
  );
  results.push({ name: 'Status API - Valid format', passed: statusValid });

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

