/**
 * Comprehensive Category System Test
 * Teklifbul Rule v1.0
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_URL || 'http://localhost:5174';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: any;
}

async function testEndpoint(method: string, path: string, body?: any): Promise<TestResult> {
  const testName = `${method} ${path}`;
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
    
    if (!response.ok && response.status !== 404) {
      return {
        name: testName,
        passed: false,
        error: `HTTP ${response.status}: ${await response.text()}`
      };
    }
    
    const data = response.status === 404 ? null : await response.json();
    
    return {
      name: testName,
      passed: true,
      data: data
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      error: e.message
    };
  }
}

async function runAllTests() {
  console.log('🧪 Category System Test Suite\n');
  console.log(`API Base: ${API_BASE}\n`);
  
  const results: TestResult[] = [];
  
  // Test 1: Health check
  console.log('1. Testing API health...');
  const health = await testEndpoint('GET', '/api/health');
  results.push(health);
  if (!health.passed) {
    console.log('❌ API server is not running!\n');
    console.log('💡 Start the server with: npm run dev:api\n');
    return;
  }
  console.log('✅ API server is running\n');
  
  // Test 2: Get categories list
  console.log('2. Testing GET /api/categories...');
  const categories = await testEndpoint('GET', '/api/categories?withDesc=true&size=5');
  results.push(categories);
  if (categories.passed && Array.isArray(categories.data) && categories.data.length > 0) {
    console.log(`✅ Found ${categories.data.length} categories`);
    if (categories.data[0].short_desc) {
      console.log(`   Example: "${categories.data[0].name}" - ${categories.data[0].short_desc.substring(0, 50)}...`);
    }
    console.log('');
  } else {
    console.log('⚠️  Categories list empty or error\n');
  }
  
  // Test 3: Get single category detail
  console.log('3. Testing GET /api/categories/:id...');
  if (categories.passed && Array.isArray(categories.data) && categories.data.length > 0) {
    const firstCat = categories.data[0];
    const detail = await testEndpoint('GET', `/api/categories/${firstCat.id}?withDesc=true`);
    results.push(detail);
    if (detail.passed && detail.data) {
      console.log(`✅ Category detail loaded: "${detail.data.name}"`);
      if (detail.data.short_desc) {
        console.log(`   Description: ${detail.data.short_desc.substring(0, 60)}...`);
      }
      if (detail.data.examples && detail.data.examples.length > 0) {
        console.log(`   Examples: ${detail.data.examples.slice(0, 3).join(', ')}`);
      }
      console.log('');
    } else {
      console.log('⚠️  Category detail failed\n');
    }
  }
  
  // Test 4: Category suggestion
  console.log('4. Testing POST /api/categories/suggest...');
  const suggest1 = await testEndpoint('POST', '/api/categories/suggest', {
    text: 'elektrik kablosu sigorta'
  });
  results.push(suggest1);
  if (suggest1.passed && suggest1.data && Array.isArray(suggest1.data.suggestions)) {
    console.log(`✅ Suggestion returned ${suggest1.data.suggestions.length} results`);
    if (suggest1.data.suggestions.length > 0) {
      const top = suggest1.data.suggestions[0];
      console.log(`   Top: "${top.name}" (${Math.round(top.score * 100)}%)`);
      if (top.reasons && top.reasons.length > 0) {
        console.log(`   Reasons: ${top.reasons.slice(0, 3).join(', ')}`);
      }
      if (suggest1.data.auto_select) {
        console.log(`   Auto-select: "${suggest1.data.auto_select}"`);
      }
    }
    console.log('');
  } else {
    console.log('⚠️  Suggestion failed\n');
  }
  
  // Test 5: Another suggestion test
  console.log('5. Testing suggestion with different text...');
  const suggest2 = await testEndpoint('POST', '/api/categories/suggest', {
    text: 'çimento tuğla inşaat malzemesi'
  });
  results.push(suggest2);
  if (suggest2.passed && suggest2.data) {
    console.log(`✅ Second suggestion: ${suggest2.data.suggestions?.length || 0} results\n`);
  }
  
  // Test 6: Feedback endpoint
  console.log('6. Testing POST /api/categories/feedback...');
  const feedback = await testEndpoint('POST', '/api/categories/feedback', {
    query: 'test query',
    suggested_category_id: 1,
    chosen_category_id: 1
  });
  results.push(feedback);
  if (feedback.passed) {
    console.log('✅ Feedback saved\n');
  } else {
    console.log('⚠️  Feedback save failed\n');
  }
  
  // Summary
  console.log('\n📋 Test Summary:');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}\n`);
  
  if (failed > 0) {
    console.log('❌ Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});

