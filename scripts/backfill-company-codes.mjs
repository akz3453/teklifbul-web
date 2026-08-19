/**
 * Teklifbul Rule v1.0
 * Mevcut companies dokumanlarindan companyCodes lookup koleksiyonunu doldurur.
 *
 * Kullanim (service account gerekir):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/backfill-company-codes.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length) return;
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) {
    initializeApp({ credential: cert(JSON.parse(fromEnv)) });
    return;
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || resolve(process.cwd(), 'serviceAccountKey.json');
  if (!existsSync(keyPath)) {
    throw new Error(`Service account bulunamadi: ${keyPath}`);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection('companies').limit(500).get();
  let written = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const code = String(data.code || '').trim().toUpperCase();
    if (!code) {
      skipped += 1;
      continue;
    }
    const ownerId = data.ownerId || data.ownerUid || null;
    if (!ownerId) {
      skipped += 1;
      continue;
    }
    const ref = db.collection('companyCodes').doc(code);
    const existing = await ref.get();
    if (existing.exists) {
      skipped += 1;
      continue;
    }
    await ref.set({
      companyId: docSnap.id,
      name: data.name || '',
      ownerId,
      autoApproveJoinRequests: data.autoApproveJoinRequests === true,
      createdAt: data.createdAt || new Date()
    });
    written += 1;
  }

  console.info(`companyCodes backfill: written=${written}, skipped=${skipped}, scanned=${snap.size}`);
}

main().catch((err) => {
  console.error('backfill failed', err);
  process.exit(1);
});
