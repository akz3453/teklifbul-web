/**
 * Test Tax Offices API
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
      if (Array.isArray(data)) {
        console.log(`✅ Success: ${data.length} items`);
        if (data.length > 0) {
          console.log(`   Example: ${JSON.stringify(data[0], null, 2).substring(0, 150)}`);
        }
      } else {
        console.log(`✅ Success: ${JSON.stringify(data, null, 2).substring(0, 200)}`);
      }
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
  console.log('🧪 Testing Tax Offices API...\n');
  console.log(`API Base: ${API_BASE}\n`);
  
  // 1. GET /api/tax-offices/provinces
  await testEndpoint('GET', '/api/tax-offices/provinces');
  
  // 2. GET /api/tax-offices?province=ANKARA
  await testEndpoint('GET', '/api/tax-offices?province=ANKARA');
  
  // 3. GET /api/tax-offices?province=ANKARA&district=Polatlı
  await testEndpoint('GET', '/api/tax-offices?province=ANKARA&district=Polatlı');
  
  // 4. GET /api/tax-offices?province=İSTANBUL
  await testEndpoint('GET', '/api/tax-offices?province=İSTANBUL');
  
  console.log('✅ API tests completed');
}

testAll().catch(console.error);

