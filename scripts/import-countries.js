#!/usr/bin/env node

/**
 * Import world countries into Firestore: countries/{autoId} -> { name }
 * Data source: https://restcountries.com/v3.1/all?fields=name
 * Turkey should appear as "Türkiye" and be preferred.
 * Usage: node scripts/import-countries.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  const https = await import('node:https');
  return await new Promise((resolve, reject) => {
    https.default.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function toTRName(entry) {
  const common = entry?.name?.common || '';
  // Map Turkey explicitly
  if (common === 'Turkey') return 'Türkiye';
  // Prefer Turkish translation if present
  const tur = entry?.translations?.tur?.common || entry?.translations?.tur?.official;
  return (tur || common || '').trim();
}

async function main() {
  console.log('🔄 Fetching countries dataset...');
  const url = 'https://restcountries.com/v3.1/all?fields=name,translations';
  const data = await robustFetch(url);
  if (!Array.isArray(data)) throw new Error('Unexpected dataset shape');

  const names = data.map(toTRName).filter(Boolean);
  const unique = Array.from(new Set(names)).sort((a,b)=> a.localeCompare(b,'tr'));

  console.log(`📦 Countries: ${unique.length}`);

  // Clear existing (optional) — skip to be idempotent
  let added = 0;
  const batch = db.batch();
  unique.forEach((name) => {
    const ref = db.collection('countries').doc(name);
    batch.set(ref, { name, isPreferred: name === 'Türkiye' });
    added++;
  });
  await batch.commit();
  console.log(`✅ Upserted ${added} countries`);
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error('❌ Import failed:', e); process.exit(1); });


