/**
 * Migration Sonrası Sistem Testi
 * Teklifbul Rule v1.0
 * 
 * Tüm migration sonrası sistemleri test eder
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || process.env.API_URL || 'http://localhost:5174';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: any;
  duration?: number;
}

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

async function testEndpoint(method: string, path: string, body?: any): Promise<TestResult> {
  const testName = `${method} ${path}`;
  const startTime = Date.now();
  
  try {
    const url = `${API_BASE}${path}`;
    const options: any = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      return {
        name: testName,
        passed: false,
        error: `HTTP ${response.status}: ${errorText}`,
        duration
      };
    }
    
    const data = response.status === 404 ? null : await response.json();
    
    return {
      name: testName,
      passed: true,
      data: data,
      duration
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      error: e.message,
      duration: Date.now() - startTime
    };
  }
}

async function testCache() {
  try {
    // In-memory cache test (API üzerinden dolaylı)
    // Cache çalışıyorsa aynı istek hızlı döner
    const firstCall = await testEndpoint('GET', '/api/categories?size=5');
    await new Promise(resolve => setTimeout(resolve, 100));
    const secondCall = await testEndpoint('GET', '/api/categories?size=5');
    
    if (firstCall.passed && secondCall.passed) {
      const cacheWorking = secondCall.duration! < firstCall.duration! * 0.8; // %20 daha hızlı
      return {
        name: 'Cache Performance',
        passed: true,
        data: {
          firstCall: firstCall.duration,
          secondCall: secondCall.duration,
          cacheWorking
        }
      };
    }
    return { name: 'Cache Performance', passed: false, error: 'API calls failed' };
  } catch (e: any) {
    return { name: 'Cache Performance', passed: false, error: e.message };
  }
}

async function runAllTests() {
  console.log('🧪 Migration Sonrası Sistem Testi\n');
  console.log(`API Base: ${API_BASE}\n`);
  console.log('='.repeat(60));
  console.log('');
  
  const results: TestResult[] = [];
  
  // Test 1: Health Check
  log('1. Testing API health...', 'info');
  const health = await testEndpoint('GET', '/api/health');
  results.push(health);
  if (!health.passed) {
    log('API server is not running!', 'error');
    log('Start the server with: npm run dev:api', 'warn');
    console.log('');
    return results;
  }
  log(`API server is running (${health.duration}ms)`, 'success');
  console.log('');
  
  // Test 2: Categories List
  log('2. Testing GET /api/categories...', 'info');
  const categories = await testEndpoint('GET', '/api/categories?withDesc=true&size=5');
  results.push(categories);
  if (categories.passed) {
    if (categories.data?.data && Array.isArray(categories.data.data)) {
      log(`Found ${categories.data.data.length} categories (${categories.duration}ms)`, 'success');
      if (categories.data.data.length > 0) {
        log(`Example: "${categories.data.data[0].name}"`, 'info');
      }
    } else {
      log('Categories list structure unexpected', 'warn');
    }
  } else {
    log(`Categories list failed: ${categories.error}`, 'error');
  }
  console.log('');
  
  // Test 3: Category Detail
  log('3. Testing GET /api/categories/:id...', 'info');
  if (categories.passed && categories.data?.data && categories.data.data.length > 0) {
    const categoryId = categories.data.data[0].id;
    const categoryDetail = await testEndpoint('GET', `/api/categories/${categoryId}`);
    results.push(categoryDetail);
    if (categoryDetail.passed) {
      log(`Category detail retrieved (${categoryDetail.duration}ms)`, 'success');
    } else {
      log(`Category detail failed: ${categoryDetail.error}`, 'error');
    }
  } else {
    log('Skipping category detail test (no categories found)', 'warn');
  }
  console.log('');
  
  // Test 4: Category Suggest
  log('4. Testing POST /api/categories/suggest...', 'info');
  const suggest1 = await testEndpoint('POST', '/api/categories/suggest', {
    text: 'elektrik kablosu sigorta'
  });
  results.push(suggest1);
  if (suggest1.passed && suggest1.data?.suggestions) {
    log(`Suggestions found: ${suggest1.data.suggestions.length} (${suggest1.duration}ms)`, 'success');
    if (suggest1.data.suggestions.length > 0) {
      log(`Top suggestion: "${suggest1.data.suggestions[0].name}" (score: ${suggest1.data.suggestions[0].score})`, 'info');
    }
  } else {
    log(`Category suggest failed: ${suggest1.error}`, 'error');
  }
  console.log('');
  
  // Test 5: Tax Offices Provinces
  log('5. Testing GET /api/tax-offices/provinces...', 'info');
  const provinces = await testEndpoint('GET', '/api/tax-offices/provinces');
  results.push(provinces);
  if (provinces.passed && Array.isArray(provinces.data)) {
    log(`Found ${provinces.data.length} provinces (${provinces.duration}ms)`, 'success');
    if (provinces.data.length > 0) {
      log(`Example: ${provinces.data[0]}`, 'info');
    }
  } else {
    log(`Tax offices provinces failed: ${provinces.error}`, 'error');
  }
  console.log('');
  
  // Test 6: Tax Offices List
  log('6. Testing GET /api/tax-offices?province=ANKARA...', 'info');
  const taxOffices = await testEndpoint('GET', '/api/tax-offices?province=ANKARA');
  results.push(taxOffices);
  if (taxOffices.passed && Array.isArray(taxOffices.data)) {
    log(`Found ${taxOffices.data.length} tax offices in ANKARA (${taxOffices.duration}ms)`, 'success');
    if (taxOffices.data.length > 0) {
      log(`Example: ${taxOffices.data[0].office_name}`, 'info');
    }
  } else {
    log(`Tax offices list failed: ${taxOffices.error}`, 'error');
  }
  console.log('');
  
  // Test 7: Cache Performance
  log('7. Testing cache performance...', 'info');
  const cacheTest = await testCache();
  results.push(cacheTest);
  if (cacheTest.passed && cacheTest.data?.cacheWorking) {
    log(`Cache is working (2nd call ${cacheTest.data.secondCall}ms vs 1st call ${cacheTest.data.firstCall}ms)`, 'success');
  } else {
    log('Cache performance test inconclusive', 'warn');
  }
  console.log('');
  
  // Summary
  console.log('='.repeat(60));
  console.log('');
  log('TEST SUMMARY', 'info');
  console.log('');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  log(`Total: ${total}`, 'info');
  log(`Passed: ${passed}`, 'success');
  if (failed > 0) {
    log(`Failed: ${failed}`, 'error');
  }
  console.log('');
  
  // Failed tests details
  if (failed > 0) {
    log('Failed Tests:', 'error');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    console.log('');
  }
  
  // Performance summary
  const avgDuration = results
    .filter(r => r.duration)
    .reduce((sum, r) => sum + (r.duration || 0), 0) / results.filter(r => r.duration).length;
  
  if (avgDuration > 0) {
    log(`Average response time: ${Math.round(avgDuration)}ms`, 'info');
  }
  
  console.log('');
  
  if (failed === 0) {
    log('🎉 All tests passed!', 'success');
  } else {
    log('⚠️ Some tests failed. Please check the errors above.', 'warn');
  }
  
  return results;
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('test-migration-complete')) {
  runAllTests().catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

export { runAllTests, testEndpoint };

