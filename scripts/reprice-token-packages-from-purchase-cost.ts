import { getAdminDb } from '../server/utils/firestore';

const PURCHASE_VAT_PERCENT = 20;
const MARGIN_PERCENT = 20;
const SALES_VAT_PERCENT = 20;

function computeSalePriceFromPurchaseExVat(purchaseCostTRY: number): number {
  const purchaseVatMultiplier = 1 + (PURCHASE_VAT_PERCENT / 100);
  const marginMultiplier = 1 + (MARGIN_PERCENT / 100);
  const salesVatMultiplier = 1 + (SALES_VAT_PERCENT / 100);
  const next = Number(purchaseCostTRY || 0) * purchaseVatMultiplier * marginMultiplier * salesVatMultiplier;
  return Math.round(next * 100) / 100;
}

async function run() {
  const db = await getAdminDb();
  if (!db) throw new Error('Firestore baglantisi kurulamadi');

  const packagesSnap = await db.collection('ai_token_packages').get();
  let updatedCount = 0;

  for (const pkgDoc of packagesSnap.docs) {
    const pkg = pkgDoc.data() || {};
    const existingPurchase = Number(pkg.purchaseCostTRY || 0);
    const fallbackPurchase = Number(pkg.priceTRY || 0);
    const purchaseCostTRY = existingPurchase > 0 ? existingPurchase : fallbackPurchase;
    if (!Number.isFinite(purchaseCostTRY) || purchaseCostTRY < 0) continue;

    const suggestedPriceTRY = computeSalePriceFromPurchaseExVat(purchaseCostTRY);

    await pkgDoc.ref.update({
      purchaseCostTRY,
      suggestedPriceTRY,
      priceTRY: suggestedPriceTRY,
      pricingFormula: 'purchaseCostTRY(KDV haric) x 1.20(alis KDV) x 1.20(kar) x 1.20(satis KDV)',
      pricingMeta: {
        source: 'purchase_cost_reprice_v1_script',
        purchaseVatPercent: PURCHASE_VAT_PERCENT,
        marginPercent: MARGIN_PERCENT,
        salesVatPercent: SALES_VAT_PERCENT,
        multiplier: 1.728,
        syncedAt: new Date().toISOString(),
      },
      updatedAt: Date.now(),
      updatedBy: 'script:reprice-token-packages-from-purchase-cost',
    });

    updatedCount += 1;
  }

  console.log(`DONE - updatedCount: ${updatedCount}, multiplier: 1.728`);
}

run().catch((error) => {
  console.error('Paket purchase-cost repricing hatasi:', error);
  process.exit(1);
});
