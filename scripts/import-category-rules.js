#!/usr/bin/env node
/**
 * TEKLİFBUL – categoryRules seed/import script
 *
 * Usage:
 *   npm run seed:categoryRules
 *
 * Reads: docs/SEED_CATEGORY_RULES_TR.json
 * Upserts into: categoryRules (Firestore)
 * Deterministic docId: sha1(matchType|normalizedPattern|categoryId)
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { normalizeForRule } from '../src/routing/category-rule-engine.js';

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
const { FieldValue } = admin.firestore;

function deterministicId({ pattern, matchType, categoryId }) {
  const normalizedPattern = normalizeForRule(pattern);
  const key = `${matchType}|${normalizedPattern}|${categoryId}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 24);
}

async function main() {
  // ====================
  // Env gating (Prod Safety Pack)
  // ====================
  const TB_ENV = String(process.env.TB_ENV || '').trim();
  if (!TB_ENV || !['dev', 'staging', 'prod'].includes(TB_ENV)) {
    console.error('❌ TB_ENV zorunlu: dev | staging | prod');
    console.error('   Örn: TB_ENV=dev npm run seed:categoryRules');
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));

  const seedPath = join(process.cwd(), 'docs', 'SEED_CATEGORY_RULES_TR.json');
  if (!existsSync(seedPath)) {
    console.error(`❌ Seed JSON bulunamadı: ${seedPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('❌ Seed JSON array olmalı');
    process.exit(1);
  }

  console.log(`🔄 Import starting: ${raw.length} rule(s) from ${seedPath} (TB_ENV=${TB_ENV})`);

  if (TB_ENV === 'prod' && !args.has('--confirm-prod')) {
    console.log('⚠️ PROD koruması aktif. Üretimde seed/import çalıştırmak için:');
    console.log('   TB_ENV=prod npm run seed:categoryRules -- --confirm-prod');
    console.log(`   Bu koşuda yazılacak kural sayısı (yaklaşık): ${raw.length}`);
    process.exit(1);
  }

  let upserts = 0;
  let skipped = 0;

  const batchSize = 400;
  let batch = db.batch();
  let batchOps = 0;

  const now = FieldValue.serverTimestamp();

  for (const r of raw) {
    const pattern = String(r?.pattern || '').trim();
    const matchType = String(r?.matchType || 'contains').trim();
    const isActive = r?.isActive !== false;
    const priority = Number.isFinite(r?.priority) ? r.priority : 100;
    const categoryIds = Array.isArray(r?.categoryIds) ? r.categoryIds.filter(Boolean) : [];

    if (!pattern || !categoryIds.length) {
      skipped++;
      continue;
    }

    // Write one doc per categoryId (keeps deterministic IDs stable and avoids conflicts)
    for (const categoryId of categoryIds) {
      const id = deterministicId({ pattern, matchType, categoryId });
      const ref = db.collection('categoryRules').doc(id);
      const payload = {
        pattern,
        matchType,
        categoryIds: [categoryId],
        priority,
        isActive,
        updatedAt: now,
      };
      batch.set(ref, payload, { merge: true });
      upserts++;
      batchOps++;

      if (batchOps >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log(`✅ Import completed: upserts=${upserts}, skipped=${skipped}`);
}

main().catch((e) => {
  console.error('❌ Import failed:', e);
  process.exit(1);
});


