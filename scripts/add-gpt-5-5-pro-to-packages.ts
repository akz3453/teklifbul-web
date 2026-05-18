import { getAdminDb } from '../server/utils/firestore';

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  const targetModel = 'gpt-5.5-pro';
  const snap = await db.collection('ai_token_packages').get();

  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const allowedProviders = Array.isArray(data.allowedProviders)
      ? data.allowedProviders.map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    // Sadece OpenAI paketleri
    if (!allowedProviders.includes('openai')) {
      skipped += 1;
      continue;
    }

    const rawAllowedModels = data.allowedModels;
    // null => tum modeller acik, eklemeye gerek yok
    if (rawAllowedModels === null || rawAllowedModels === undefined) {
      skipped += 1;
      continue;
    }

    const allowedModels = Array.isArray(rawAllowedModels)
      ? rawAllowedModels.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];

    if (allowedModels.includes(targetModel)) {
      skipped += 1;
      continue;
    }

    allowedModels.push(targetModel);
    await doc.ref.update({
      allowedModels,
      updatedAt: Date.now(),
      updatedBy: 'script:add-gpt-5-5-pro-to-packages',
    });
    updated += 1;
    console.log(`UPDATED PACKAGE: ${doc.id}`);
  }

  console.log(`DONE - updated: ${updated}, skipped: ${skipped}`);
}

run().catch((error) => {
  console.error('Paket guncelleme hatasi:', error);
  process.exit(1);
});
