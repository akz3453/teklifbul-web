import { getAdminDb } from '../server/utils/firestore';

type CatalogModel = {
  provider: string;
  model: string;
  label: string;
  isActive: boolean;
  freeEligible: boolean;
  sort: number;
  costPer1kTokensUSD: number;
  currency: string;
};

const GEMINI_MODELS: CatalogModel[] = [
  {
    provider: 'gemini',
    model: 'gemini-pro',
    label: 'Google Gemini Pro',
    isActive: true,
    freeEligible: false,
    sort: 17,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.0-flash',
    label: 'Google Gemini 3.0 Flash',
    isActive: true,
    freeEligible: false,
    sort: 19,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.0-pro',
    label: 'Google Gemini 3.0 Pro',
    isActive: true,
    freeEligible: false,
    sort: 18,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    label: 'Google Gemini 3.5 Flash',
    isActive: true,
    freeEligible: false,
    sort: 20,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    label: 'Google Gemini 3.5 Flash Lite',
    isActive: true,
    freeEligible: false,
    sort: 21,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: 'Google Gemini 2.5 Pro',
    isActive: true,
    freeEligible: false,
    sort: 22,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    label: 'Google Gemini 2.5 Flash',
    isActive: true,
    freeEligible: false,
    sort: 23,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    label: 'Google Gemini 3.6 Flash',
    isActive: true,
    freeEligible: false,
    sort: 24,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    label: 'Google Gemini 2.0 Flash',
    isActive: true,
    freeEligible: false,
    sort: 25,
    costPer1kTokensUSD: 0,
    currency: 'USD',
  },
];

async function upsertModel(db: any, modelData: CatalogModel) {
  const snap = await db
    .collection('ai_model_catalog')
    .where('provider', '==', modelData.provider)
    .where('model', '==', modelData.model)
    .limit(1)
    .get();

  const payload = {
    ...modelData,
    updatedAt: Date.now(),
    updatedBy: 'script:add-gemini-latest-models',
  };

  if (!snap.empty) {
    const doc = snap.docs[0];
    await doc.ref.update(payload);
    return { action: 'updated', id: doc.id, key: `${modelData.provider}/${modelData.model}` };
  }

  const docRef = await db.collection('ai_model_catalog').add(payload);
  return { action: 'added', id: docRef.id, key: `${modelData.provider}/${modelData.model}` };
}

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  for (const model of GEMINI_MODELS) {
    const result = await upsertModel(db, model);
    console.log(`${result.action.toUpperCase()}: ${result.key} (${result.id})`);
  }
}

run().catch((error) => {
  console.error('Gemini modelleri eklenemedi:', error);
  process.exit(1);
});
