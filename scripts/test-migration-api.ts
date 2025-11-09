/**
 * Migration Sonrası API Test Script
 * Teklifbul Rule v1.0
 * 
 * Tüm API endpoint'lerini test eder
 */

const API_BASE = 'http://localhost:5174/api';

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

// Test helper
async function testEndpoint(name: string, url: string, method: string = 'GET', body?: any) {
  try {
    log(`Testing ${name}...`, 'info');
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.ok) {
      log(`${name}: OK (${response.status})`, 'success');
      if (data.data && Array.isArray(data.data)) {
        log(`  → ${data.data.length} items returned`, 'info');
      }
      return { success: true, data };
    } else {
      log(`${name}: FAILED (${response.status}) - ${data.error || 'Unknown error'}`, 'error');
      return { success: false, error: data };
    }
  } catch (error: any) {
    log(`${name}: ERROR - ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function main() {
  log('Starting API tests...', 'info');
  console.log('');
  
  // Wait for server to be ready
  log('Waiting for API server to be ready...', 'info');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const results: { [key: string]: boolean } = {};
  
  // 1. Health Check
  const health = await testEndpoint('Health Check', `${API_BASE}/health`);
  results['health'] = health.success;
  console.log('');
  
  // 2. Categories API
  const categoriesList = await testEndpoint('Categories List', `${API_BASE}/categories`);
  results['categories_list'] = categoriesList.success;
  console.log('');
  
  const categoriesSearch = await testEndpoint('Categories Search', `${API_BASE}/categories?q=elektrik`);
  results['categories_search'] = categoriesSearch.success;
  console.log('');
  
  const categoriesSuggest = await testEndpoint(
    'Categories Suggest',
    `${API_BASE}/categories/suggest`,
    'POST',
    { text: 'elektrik kablosu' }
  );
  results['categories_suggest'] = categoriesSuggest.success;
  console.log('');
  
  // 3. Tax Offices API
  const taxProvinces = await testEndpoint('Tax Offices Provinces', `${API_BASE}/tax-offices/provinces`);
  results['tax_provinces'] = taxProvinces.success;
  console.log('');
  
  const taxOffices = await testEndpoint('Tax Offices List', `${API_BASE}/tax-offices?province=ANKARA`);
  results['tax_offices'] = taxOffices.success;
  console.log('');
  
  // Summary
  console.log('');
  log('Test Summary:', 'info');
  console.log('');
  
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r).length;
  const failed = total - passed;
  
  Object.entries(results).forEach(([name, success]) => {
    log(`${name}: ${success ? 'PASS' : 'FAIL'}`, success ? 'success' : 'error');
  });
  
  console.log('');
  log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`, passed === total ? 'success' : 'warn');
  
  if (failed > 0) {
    log('Some tests failed. Check API server logs.', 'warn');
    process.exit(1);
  } else {
    log('All tests passed!', 'success');
    process.exit(0);
  }
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});

