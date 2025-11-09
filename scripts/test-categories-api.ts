/**
 * Test Categories API
 * Teklifbul Rule v1.0
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_URL || 'http://localhost:5174';

async function testEndpoint(method: string, path: string, body?: any) {
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
    const data = await response.json();
    
    console.log(`${method} ${path}: ${response.status}`);
    if (response.ok) {
      console.log('✅ Success:', JSON.stringify(data, null, 2).substring(0, 200));
    } else {
      console.log('❌ Error:', data);
    }
    console.log('');
    
    return { ok: response.ok, data };
  } catch (e: any) {
    console.log(`❌ ${method} ${path}: ${e.message}\n`);
    return { ok: false, error: e.message };
  }
}

async function testAll() {
  console.log('🧪 Testing Categories API...\n');
  console.log(`API Base: ${API_BASE}\n`);
  
  // 1. GET /api/categories
  await testEndpoint('GET', '/api/categories?withDesc=true&size=5');
  
  // 2. GET /api/categories/:id (assuming ID 1 exists)
  await testEndpoint('GET', '/api/categories/1');
  
  // 3. POST /api/categories/suggest
  await testEndpoint('POST', '/api/categories/suggest', {
    text: 'elektrik kablosu sigorta'
  });
  
  await testEndpoint('POST', '/api/categories/suggest', {
    text: 'çimento tuğla inşaat malzemesi'
  });
  
  // 4. POST /api/categories/feedback
  await testEndpoint('POST', '/api/categories/feedback', {
    query: 'test query',
    suggested_category_id: 1,
    chosen_category_id: 1
  });
  
  console.log('✅ API tests completed');
}

testAll().catch(console.error);

