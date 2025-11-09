/**
 * Debug API Test - Detailed error messages
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5174';

async function test() {
  console.log('🔍 Testing API endpoints with detailed errors...\n');
  
  // Test 1: Health
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    console.log('✅ Health:', data);
  } catch (e: any) {
    console.log('❌ Health failed:', e.message);
  }
  
  // Test 2: Categories list
  try {
    const res = await fetch(`${API_BASE}/api/categories?withDesc=true&size=5`);
    const text = await res.text();
    console.log('\n📋 Categories Response:');
    console.log('Status:', res.status);
    console.log('Body:', text.substring(0, 500));
    try {
      const data = JSON.parse(text);
      console.log('Parsed:', JSON.stringify(data, null, 2).substring(0, 500));
    } catch {}
  } catch (e: any) {
    console.log('❌ Categories failed:', e.message);
  }
  
  // Test 3: Suggest
  try {
    const res = await fetch(`${API_BASE}/api/categories/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'elektrik kablosu' })
    });
    const text = await res.text();
    console.log('\n💡 Suggest Response:');
    console.log('Status:', res.status);
    console.log('Body:', text.substring(0, 500));
  } catch (e: any) {
    console.log('❌ Suggest failed:', e.message);
  }
}

test().catch(console.error);

