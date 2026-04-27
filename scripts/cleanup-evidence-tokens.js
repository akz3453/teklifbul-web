#!/usr/bin/env node
/**
 * TEKLİFBUL – Cleanup script for categoryEvidenceTokens
 *
 * Goal:
 * - Delete very low-signal tokens to prevent unbounded growth.
 *
 * Policy (safe default):
 * - lastSeenAt older than 180 days AND total < 3  => delete
 *
 * Env gating:
 * - TB_ENV required: dev|staging|prod
 * - prod requires --confirm-prod
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadCredential() {
  const candidates = [
    join(__dirname, '..', 'server', 'serviceAccountKey.json'),
    join(__dirname, '..', 'serviceAccountKey.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  for (const p of candidates) {
    if (p && existsSync(p)) {
      const sa = JSON.parse(readFileSync(p, 'utf8'));
      console.log(`✅ Service account key bulundu: ${p}`);
      return admin.credential.cert(sa);
    }
  }
  console.log('⚠️ Service account key bulunamadı, applicationDefault kullanılıyor');
  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: loadCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'teklifbul',
  });
}

const db = admin.firestore();

async function main() {
  const TB_ENV = String(process.env.TB_ENV || '').trim();
  if (!TB_ENV || !['dev', 'staging', 'prod'].includes(TB_ENV)) {
    console.error('❌ TB_ENV zorunlu: dev | staging | prod');
    process.exit(1);
  }
  const args = new Set(process.argv.slice(2));
  if (TB_ENV === 'prod' && !args.has('--confirm-prod')) {
    console.error('❌ PROD koruması: çalıştırmak için --confirm-prod gerekli');
    console.error('   TB_ENV=prod node scripts/cleanup-evidence-tokens.js --confirm-prod');
    process.exit(1);
  }

  const days = 180;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

  console.log(`🔄 Cleanup starting (TB_ENV=${TB_ENV}) cutoff=${cutoff.toISOString().slice(0,10)}`);

  let totalDeleted = 0;
  let totalScanned = 0;
  let page = 0;

  let lastDoc = null;
  while (true) {
    page++;
    let q = db.collection('categoryEvidenceTokens')
      .where('lastSeenAt', '<', cutoffTs)
      .orderBy('lastSeenAt')
      .limit(400);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    const scanned = snap.size;
    totalScanned += scanned;

    if (snap.empty) {
      if (page === 1) console.log('✅ No old tokens found');
      break;
    }

    const batch = db.batch();
    let deleted = 0;
    for (const d of snap.docs) {
      const data = d.data() || {};
      const total = Number.isFinite(data.total) ? data.total : 0;
      if (total < 3) {
        batch.delete(d.ref);
        deleted++;
      }
    }

    if (deleted > 0) {
      await batch.commit();
      totalDeleted += deleted;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`ℹ️ Page ${page}: scanned=${scanned} deleted=${deleted} (totalScanned=${totalScanned} totalDeleted=${totalDeleted})`);

    if (scanned < 400) break;
  }

  console.log(`✅ Cleanup done. totalScanned=${totalScanned} totalDeleted=${totalDeleted}`);
}

main().catch((e) => {
  console.error('❌ Cleanup failed:', e);
  process.exit(1);
});


