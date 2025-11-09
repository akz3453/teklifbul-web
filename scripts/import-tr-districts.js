#!/usr/bin/env node

/**
 * Import Turkey provinces/districts into Firestore: trDistricts/{province} -> { districts: string[] }
 * Data source: https://raw.githubusercontent.com/muhammederdem/il-ilce-json/master/il-ilce.json
 * Usage: node scripts/import-tr-districts.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin (serviceAccountKey.json if present, else ADC)
if (!admin.apps.length) {
  try {
    const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (e) {
    console.log('Service account not found, using application default credentials');
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}

const db = admin.firestore();

async function robustFetch(url) {
  if (typeof fetch === 'function') {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }
  return await new Promise((resolve, reject) => {
    const https = await import('node:https');
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function normalizeName(s) {
  return String(s || '').trim();
}

async function main() {
  console.log('🔄 Fetching TR districts dataset...');
  const url = 'https://raw.githubusercontent.com/muhammederdem/il-ilce-json/master/il-ilce.json';
  const data = await robustFetch(url);
  if (!Array.isArray(data)) throw new Error('Unexpected dataset shape');

  console.log(`📦 Provinces found: ${data.length}`);
  let written = 0;
  for (const rec of data) {
    const province = normalizeName(rec.il);
    const districts = Array.isArray(rec.ilceleri) ? rec.ilceleri.map((d) => normalizeName(d)).filter(Boolean) : [];
    if (!province) continue;
    await db.collection('trDistricts').doc(province).set({ districts }, { merge: true });
    written++;
  }
  console.log(`✅ Imported ${written} provinces into trDistricts`);
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error('❌ Import failed:', e); process.exit(1); });


