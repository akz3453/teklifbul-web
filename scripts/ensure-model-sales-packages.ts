import { getAdminDb } from '../server/utils/firestore';

function normalizeLower(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function computeModelCostPer1kUsd(model: any): number {
  const inputPer1M = Number(model.inputCostPer1MTokensUSD || 0);
  const outputPer1M = Number(model.outputCostPer1MTokensUSD || 0);
  if (inputPer1M > 0 || outputPer1M > 0) {
    return ((inputPer1M * 0.7) + (outputPer1M * 0.3)) / 1000;
  }
  return Number(model.costPer1kTokensUSD || 0);
}

function computePriceTry(params: {
  tokens: number;
  costPer1kUsd: number;
  usdTry: number;
  margin: number;
  vatPercent: number;
}): number {
  const baseCostTry = (params.tokens / 1000) * params.costPer1kUsd * params.usdTry;
  const vatMultiplier = 1 + Math.max(0, params.vatPercent) / 100;
  return Math.round(baseCostTry * params.margin * vatMultiplier * 100) / 100;
}

async function fetchLiveUsdTry(): Promise<number | null> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/TRY', {
      headers: { 'User-Agent': 'Teklifbul-Package-Seed/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    const usdRateRaw = payload?.rates?.USD;
    if (!usdRateRaw) return null;
    const usdTry = Number((1 / Number(usdRateRaw)).toFixed(4));
    return Number.isFinite(usdTry) && usdTry > 0 ? usdTry : null;
  } catch {
    return null;
  }
}

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  const cfgSnap = await db.collection('system_config').doc('ai_pricing_config').get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const configuredUsdTry = Number(cfg.usdTry || 40);
  const configuredMargin = Number(cfg.marginMultiplier || 2.2);
  const minMargin = Number(cfg.minMarginMultiplier || 1.15);
  const vatPercent = Number(cfg.vatPercent ?? 20);
  const useLive = cfg.useLiveUsdTry !== false;
  const liveUsdTry = useLive ? await fetchLiveUsdTry() : null;
  const usdTry = liveUsdTry || configuredUsdTry;
  const margin = Math.max(configuredMargin, minMargin);

  const [modelsSnap, packagesSnap] = await Promise.all([
    db.collection('ai_model_catalog').get(),
    db.collection('ai_token_packages').get(),
  ]);

  const existingKeys = new Set<string>();
  packagesSnap.docs.forEach((doc) => {
    const p = doc.data() || {};
    const providers = Array.isArray(p.allowedProviders) ? p.allowedProviders.map(normalizeLower) : [];
    const models = Array.isArray(p.allowedModels) ? p.allowedModels.map((m: any) => String(m || '').trim()) : [];
    for (const provider of providers) {
      for (const model of models) {
        if (provider && model) existingKeys.add(`${provider}::${model}`);
      }
    }
  });

  const TOKENS = 100_000;
  let added = 0;
  let skipped = 0;

  for (const doc of modelsSnap.docs) {
    const m = doc.data() || {};
    if (m.isActive === false) continue;
    if (m.freeEligible === true) continue; // Ucretsiz modeller icin satis paketi gerekmiyor

    const provider = normalizeLower(m.provider);
    const model = String(m.model || '').trim();
    if (!provider || !model) continue;

    const key = `${provider}::${model}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    const costPer1kUsd = computeModelCostPer1kUsd(m);
    if (!(costPer1kUsd > 0)) {
      skipped += 1;
      continue;
    }

    const priceTRY = computePriceTry({
      tokens: TOKENS,
      costPer1kUsd,
      usdTry,
      margin,
      vatPercent,
    });

    const packageName = `${String(m.label || `${provider}/${model}`)} - ${Math.round(TOKENS / 1000)}K`;
    const sort = Number(m.sort || 100) + 1000;

    await db.collection('ai_token_packages').add({
      name: packageName,
      tokens: TOKENS,
      priceTRY,
      planRequired: 'premium_plus',
      isActive: true,
      sort,
      allowedProviders: [provider],
      allowedModels: [model],
      description: `${provider.toUpperCase()} ${model} modeli icin tekli satis paketi`,
      updatedAt: Date.now(),
      updatedBy: 'script:ensure-model-sales-packages',
      pricingMeta: {
        source: 'model_package_auto_seed_v1',
        usdTry,
        marginMultiplier: margin,
        vatPercent,
        syncedAt: new Date().toISOString(),
      },
    });
    existingKeys.add(key);
    added += 1;
    console.log(`ADDED PACKAGE: ${provider}/${model}`);
  }

  console.log(`DONE - added: ${added}, skipped: ${skipped}, usdTry: ${usdTry}, margin: ${margin}, vat: ${vatPercent}`);
}

run().catch((error) => {
  console.error('Model bazli paket olusturma hatasi:', error);
  process.exit(1);
});
