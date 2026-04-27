// Teklifbul Rule v1.0
/**
 * Eski kullanıcı kayıtlarına planId ve isPremium alanlarını ekler.
 * Çalıştırma:
 *   node scripts/migrate-set-default-plan.js
 * FIREBASE_SERVICE_ACCOUNT veya serviceAccountKey.json gerektirir.
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function initAdmin() {
  if (admin.apps.length) return;
  let credentials;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    const candidate = join(__dirname, '..', 'serviceAccountKey.json');
    if (!existsSync(candidate)) {
      throw new Error('Service account bilgisi bulunamadı. FIREBASE_SERVICE_ACCOUNT veya serviceAccountKey.json sağlayın.');
    }
    credentials = JSON.parse(readFileSync(candidate, 'utf8'));
  }
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: credentials.project_id
  });
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const usersSnap = await db.collection('users').get();
  console.log(`Toplam kullanıcı: ${usersSnap.size}`);
  const batchSize = 400;
  let processed = 0;
  let batch = db.batch();
  let batchCount = 0;
  const freePlan = {
    planId: 'free',
    planName: 'Ücretsiz Plan',
    billingInterval: 'monthly',
    isPremium: false,
    cancelAtPeriodEnd: false
  };

  for (const doc of usersSnap.docs) {
    batch.update(doc.ref, {
      ...freePlan,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    processed += 1;
    if (processed % batchSize === 0) {
      batchCount += 1;
      await batch.commit();
      console.log(`Batch ${batchCount} işlendi`);
      batch = db.batch();
    }
  }

  if (processed % batchSize !== 0) {
    await batch.commit();
    console.log('Son batch işlendi');
  }

  console.log(`Tamamlandı. Güncellenen kullanıcı sayısı: ${processed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration başarısız:', err);
  process.exit(1);
});

