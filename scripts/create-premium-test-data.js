// Teklifbul Rule v1.0
/**
 * Geliştirme ortamı için örnek abonelik ve ödeme verileri oluşturur.
 * Çalıştırma:
 *   node scripts/create-premium-test-data.js
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

async function createSampleData() {
  initAdmin();
  const db = admin.firestore();
  const now = new Date();
  const activeFuture = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);
  const expiredPast = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  const samples = [
    {
      userId: 'dev-premium-active',
      planId: 'premium_monthly',
      planName: 'Premium Aylık',
      status: 'active',
      startedAt: now,
      currentPeriodEnd: activeFuture,
      billingInterval: 'monthly'
    },
    {
      userId: 'dev-premium-expired',
      planId: 'premium_monthly',
      planName: 'Premium Aylık',
      status: 'canceled',
      startedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: expiredPast,
      billingInterval: 'monthly',
      cancelAtPeriodEnd: true
    }
  ];

  for (const sample of samples) {
    const docRef = await db.collection('subscriptions').add({
      ...sample,
      createdAt: now,
      updatedAt: now,
      paymentProviderSubscriptionId: `mock-${sample.userId}`
    });
    console.log(`Subscription created: ${docRef.id} (${sample.userId})`);
  }

  await db.collection('payment_intents').add({
    userId: 'dev-premium-active',
    planId: 'premium_monthly',
    amount: 400,
    currency: 'TRY',
    status: 'succeeded',
    providerSessionId: `mock-session-${Date.now()}`,
    createdAt: now,
    updatedAt: now
  });

  await db.collection('payment_intents').add({
    userId: 'dev-premium-expired',
    planId: 'premium_monthly',
    amount: 400,
    currency: 'TRY',
    status: 'failed',
    providerSessionId: `mock-failed-${Date.now()}`,
    createdAt: now,
    updatedAt: now
  });

  console.log('Örnek abonelik ve ödeme verileri hazırlandı.');
  process.exit(0);
}

createSampleData().catch((err) => {
  console.error('Örnek veri oluşturulamadı:', err);
  process.exit(1);
});

