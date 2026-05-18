import { getAdminDb } from '../server/utils/firestore';

type TokenPackageSeed = {
  name: string;
  tokens: number;
  priceTRY: number;
  planRequired: string;
  isActive: boolean;
  sort: number;
  allowedProviders: string[];
  allowedModels: string[] | null;
  description: string;
};

const PACKAGE_SEEDS: TokenPackageSeed[] = [
  {
    name: 'Basic - GPT-5.5 Mini (100K)',
    tokens: 100_000,
    priceTRY: 990,
    planRequired: 'premium_plus',
    isActive: true,
    sort: 10,
    allowedProviders: ['openai'],
    allowedModels: ['gpt-5.5-mini'],
    description: 'Günlük kullanım için uygun başlangıç paketi.',
  },
  {
    name: 'Premium - GPT-5.5 (250K)',
    tokens: 250_000,
    priceTRY: 3490,
    planRequired: 'premium_plus',
    isActive: true,
    sort: 20,
    allowedProviders: ['openai'],
    allowedModels: ['gpt-5.5'],
    description: 'Yoğun analiz ve operasyonel kullanım için premium paket.',
  },
  {
    name: 'Ultra - GPT-5.5 Pro (500K)',
    tokens: 500_000,
    priceTRY: 12490,
    planRequired: 'premium_plus',
    isActive: true,
    sort: 30,
    allowedProviders: ['openai'],
    allowedModels: ['gpt-5.5-pro'],
    description: 'Ağır reasoning ve ileri seviye AI iş yükleri için ultra paket.',
  },
];

async function upsertPackage(db: any, seed: TokenPackageSeed) {
  const snap = await db
    .collection('ai_token_packages')
    .where('name', '==', seed.name)
    .limit(1)
    .get();

  const payload = {
    ...seed,
    updatedAt: Date.now(),
    updatedBy: 'script:seed-ai-token-packages',
  };

  if (!snap.empty) {
    const doc = snap.docs[0];
    await doc.ref.update(payload);
    console.log(`UPDATED: ${seed.name} (${doc.id})`);
    return;
  }

  const docRef = await db.collection('ai_token_packages').add(payload);
  console.log(`ADDED: ${seed.name} (${docRef.id})`);
}

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  for (const seed of PACKAGE_SEEDS) {
    await upsertPackage(db, seed);
  }
}

run().catch((error) => {
  console.error('Paket seed islemi basarisiz:', error);
  process.exit(1);
});
