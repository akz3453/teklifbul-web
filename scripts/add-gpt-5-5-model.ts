import { getAdminDb } from '../server/utils/firestore';

async function addGpt55Model() {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore baglantisi kurulamadi');
  }

  const provider = 'openai';
  const model = 'gpt-5.5';
  const payload = {
    provider,
    model,
    label: 'OpenAI - GPT 5.5',
    isActive: true,
    freeEligible: false,
    sort: 5,
    costPer1kTokensUSD: 0,
    currency: 'USD',
    updatedAt: Date.now(),
    updatedBy: 'script:add-gpt-5-5-model'
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
    console.log(`Updated existing model: ${provider}/${model} (${doc.id})`);
    return;
  }

  const docRef = await db.collection('ai_model_catalog').add(payload);
  console.log(`Added new model: ${provider}/${model} (${docRef.id})`);
}

addGpt55Model().catch((error) => {
  console.error('GPT 5.5 ekleme hatasi:', error);
  process.exit(1);
});
