import { getAdminDb } from '../server/utils/firestore';

type PricingConfig = {
  usdTry: number;
  marginMultiplier: number;
  minMarginMultiplier: number;
  vatPercent: number;
  useLiveUsdTry: boolean;
};

function normalizeLower(value: any): string {
  return String(value || '').trim().toLowerCase();
}

async function fetchLiveUsdTry(): Promise<number | null> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/TRY', {
      headers: { 'User-Agent': 'Teklifbul-AI-Pricing-Script/1.0' },
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

function computePackagePriceTRYFromCosts(params: {
  tokens: number;
  allowedProviders: string[];
  allowedModels: string[] | null;
  catalogModels: Array<{
    provider: string;
    model: string;
    costPer1kTokensUSD: number;
    inputCostPer1MTokensUSD?: number;
    outputCostPer1MTokensUSD?: number;
    isActive: boolean;
  }>;
  usdTry: number;
  marginMultiplier: number;
  vatPercent: number;
}): number | null {
  const { tokens, allowedProviders, allowedModels, catalogModels, usdTry, marginMultiplier, vatPercent } = params;
  if (!Number.isFinite(tokens) || tokens <= 0) return null;

  const providerSet = new Set((allowedProviders || []).map(normalizeLower).filter(Boolean));
  const modelSet = Array.isArray(allowedModels) ? new Set(allowedModels.map(normalizeLower).filter(Boolean)) : null;

  const getEffectiveCostPer1kUsd = (m: {
    costPer1kTokensUSD: number;
    inputCostPer1MTokensUSD?: number;
    outputCostPer1MTokensUSD?: number;
  }) => {
    const inputPer1M = Number(m.inputCostPer1MTokensUSD || 0);
    const outputPer1M = Number(m.outputCostPer1MTokensUSD || 0);
    if (inputPer1M > 0 || outputPer1M > 0) {
      return ((inputPer1M * 0.7) + (outputPer1M * 0.3)) / 1000;
    }
    return Number(m.costPer1kTokensUSD || 0);
  };

  const candidateCosts = catalogModels
    .filter((m) => m.isActive !== false)
    .filter((m) => providerSet.size === 0 || providerSet.has(normalizeLower(m.provider)))
    .filter((m) => !modelSet || modelSet.has(normalizeLower(m.model)))
    .map(getEffectiveCostPer1kUsd)
    .filter((v) => Number.isFinite(v) && v > 0);

  if (candidateCosts.length === 0) return null;
  const minCostPer1kUsd = Math.min(...candidateCosts);
  const baseCostTry = (tokens / 1000) * minCostPer1kUsd * usdTry;
  const vatMultiplier = 1 + (Math.max(0, Number(vatPercent || 0)) / 100);
  return Math.round(baseCostTry * marginMultiplier * vatMultiplier * 100) / 100;
}

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  const cfgSnap = await db.collection('system_config').doc('ai_pricing_config').get();
  const cfgData = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const config: PricingConfig = {
    usdTry: Number(cfgData.usdTry || 40),
    marginMultiplier: Number(cfgData.marginMultiplier || 2.2),
    minMarginMultiplier: Number(cfgData.minMarginMultiplier || 1.15),
    vatPercent: Number(cfgData.vatPercent ?? 20),
    useLiveUsdTry: cfgData.useLiveUsdTry !== false,
  };

  let usdTry = config.usdTry;
  if (config.useLiveUsdTry) {
    const liveUsdTry = await fetchLiveUsdTry();
    if (liveUsdTry) usdTry = liveUsdTry;
  }
  const effectiveMargin = Math.max(config.marginMultiplier, config.minMarginMultiplier);

  const [modelsSnap, packagesSnap] = await Promise.all([
    db.collection('ai_model_catalog').get(),
    db.collection('ai_token_packages').get(),
  ]);

  const catalogModels = modelsSnap.docs.map((d) => {
    const data = d.data() || {};
    return {
      provider: String(data.provider || ''),
      model: String(data.model || ''),
      costPer1kTokensUSD: Number(data.costPer1kTokensUSD || 0),
      inputCostPer1MTokensUSD: Number(data.inputCostPer1MTokensUSD || 0),
      outputCostPer1MTokensUSD: Number(data.outputCostPer1MTokensUSD || 0),
      isActive: data.isActive !== false,
    };
  });

  let updatedCount = 0;
  for (const pkgDoc of packagesSnap.docs) {
    const pkg = pkgDoc.data() || {};
    const nextPrice = computePackagePriceTRYFromCosts({
      tokens: Number(pkg.tokens || 0),
      allowedProviders: Array.isArray(pkg.allowedProviders) ? pkg.allowedProviders : [],
      allowedModels: Array.isArray(pkg.allowedModels) ? pkg.allowedModels : null,
      catalogModels,
      usdTry,
      marginMultiplier: effectiveMargin,
      vatPercent: config.vatPercent,
    });
    if (nextPrice === null) continue;

    await pkgDoc.ref.update({
      priceTRY: nextPrice,
      updatedAt: Date.now(),
      updatedBy: 'script:reprice-token-packages',
      pricingMeta: {
        source: 'model_cost_sync_v1_script',
        usdTry,
        marginMultiplier: config.marginMultiplier,
        minMarginMultiplier: config.minMarginMultiplier,
        effectiveMarginMultiplier: effectiveMargin,
        vatPercent: config.vatPercent,
        useLiveUsdTry: config.useLiveUsdTry,
        syncedAt: new Date().toISOString(),
      },
    });
    updatedCount += 1;
  }

  console.log(`DONE - updatedCount: ${updatedCount}, usdTry: ${usdTry}, effectiveMargin: ${effectiveMargin}, vatPercent: ${config.vatPercent}`);
}

run().catch((error) => {
  console.error('Paket repricing script hatasi:', error);
  process.exit(1);
});
