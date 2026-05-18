import { getAdminDb } from '../server/utils/firestore';

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  const provider = 'openai';
  const model = 'gpt-5.5-pro';
  const payload = {
    provider,
    model,
    label: 'OpenAI - GPT 5.5 Pro',
    isActive: true,
    freeEligible: false,
    sort: 4,
    inputCostPer1MTokensUSD: 30,
    outputCostPer1MTokensUSD: 180,
    costPer1kTokensUSD: ((30 * 0.7) + (180 * 0.3)) / 1000,
    currency: 'USD',
    updatedAt: Date.now(),
    updatedBy: 'script:add-gpt-5-5-pro',
  };

  const snap = await db
    .collection('ai_model_catalog')
    .where('provider', '==', provider)
    .where('model', '==', model)
    .limit(1)
    .get();

  if (!snap.empty) {
    const doc = snap.docs[0];
    await doc.ref.update(payload);
    console.log(`UPDATED: ${provider}/${model} (${doc.id})`);
    return;
  }

  const docRef = await db.collection('ai_model_catalog').add(payload);
  console.log(`ADDED: ${provider}/${model} (${docRef.id})`);
}

run().catch((error) => {
  console.error('GPT-5.5 Pro eklenemedi:', error);
  process.exit(1);
});
