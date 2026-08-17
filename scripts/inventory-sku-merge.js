/**
 * SKU Merge Utility
 * Teklifbul Rule v1.0 - İki SKU'yu birleştirme özelliği
 * 
 * Kaynak SKU'dan hedef SKU'ya veri aktarımı yapar.
 */

import { db } from '/firebase.js';
import { collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { getStockBalance, getStockBalancesBySku } from '/scripts/inventory-balances.js';

// Teklifbul Rule v1.0 - Frontend'de console.log kullanılabilir
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
};

/**
 * SKU Merge Preview
 * Teklifbul Rule v1.0 - Merge önizlemesi
 * 
 * @param {string} companyId - Company ID
 * @param {string} sourceSku - Kaynak SKU
 * @param {string} targetSku - Hedef SKU
 * @returns {Promise<Object>} Merge preview data
 */
export async function getSkuMergePreview(companyId, sourceSku, targetSku) {
  try {
    if (!companyId || !sourceSku || !targetSku) {
      throw new Error('Eksik parametreler: companyId, sourceSku, targetSku gerekli');
    }

    if (sourceSku === targetSku) {
      throw new Error('Kaynak ve hedef SKU aynı olamaz');
    }

    // Kaynak ve hedef stock'ları al
    const sourceStockQuery = query(collection(db, 'stocks'), where('companyId', '==', companyId), where('sku', '==', sourceSku));
    const targetStockQuery = query(collection(db, 'stocks'), where('companyId', '==', companyId), where('sku', '==', targetSku));

    const [sourceStockSnap, targetStockSnap] = await Promise.all([
      getDocs(sourceStockQuery),
      getDocs(targetStockQuery)
    ]);

    if (sourceStockSnap.empty) {
      throw new Error(`Kaynak SKU bulunamadı: ${sourceSku}`);
    }
    if (targetStockSnap.empty) {
      throw new Error(`Hedef SKU bulunamadı: ${targetSku}`);
    }

    const sourceStock = { id: sourceStockSnap.docs[0].id, ...sourceStockSnap.docs[0].data() };
    const targetStock = { id: targetStockSnap.docs[0].id, ...targetStockSnap.docs[0].data() };

    // Stock balances'ları al
    const sourceBalances = await getStockBalancesBySku(companyId, sourceSku);
    const targetBalances = await getStockBalancesBySku(companyId, targetSku);

    // Stock movements sayısını al
    const sourceMovementsQuery = query(
      collection(db, 'stock_movements'),
      where('companyId', '==', companyId),
      where('sku', '==', sourceSku)
    );
    const targetMovementsQuery = query(
      collection(db, 'stock_movements'),
      where('companyId', '==', companyId),
      where('sku', '==', targetSku)
    );

    const [sourceMovementsSnap, targetMovementsSnap] = await Promise.all([
      getDocs(sourceMovementsQuery),
      getDocs(targetMovementsQuery)
    ]);

    const sourceMovementsCount = sourceMovementsSnap.size;
    const targetMovementsCount = targetMovementsSnap.size;

    // Toplam miktar ve ortalama maliyet hesapla
    const sourceTotalQty = sourceBalances.reduce((sum, b) => sum + (b.quantity || 0), 0);
    const targetTotalQty = targetBalances.reduce((sum, b) => sum + (b.quantity || 0), 0);

    // Preview data
    return {
      sourceStock: {
        id: sourceStock.id,
        sku: sourceStock.sku,
        name: sourceStock.name,
        brand: sourceStock.brand,
        model: sourceStock.model,
        unit: sourceStock.unit,
        avgCost: sourceStock.avgCost || 0,
        lastPurchasePrice: sourceStock.lastPurchasePrice || 0,
        salePrice: sourceStock.salePrice || 0
      },
      targetStock: {
        id: targetStock.id,
        sku: targetStock.sku,
        name: targetStock.name,
        brand: targetStock.brand,
        model: targetStock.model,
        unit: targetStock.unit,
        avgCost: targetStock.avgCost || 0,
        lastPurchasePrice: targetStock.lastPurchasePrice || 0,
        salePrice: targetStock.salePrice || 0
      },
      sourceBalances: sourceBalances.map(b => ({
        locationId: b.locationId,
        quantity: b.quantity || 0,
        avgCost: b.avgCost || 0
      })),
      targetBalances: targetBalances.map(b => ({
        locationId: b.locationId,
        quantity: b.quantity || 0,
        avgCost: b.avgCost || 0
      })),
      sourceMovementsCount,
      targetMovementsCount,
      sourceTotalQty,
      targetTotalQty,
      estimatedNewQty: sourceTotalQty + targetTotalQty
    };
  } catch (error) {
    logger.error('SKU merge preview hatası', {
      error: error.message || String(error),
      companyId,
      sourceSku,
      targetSku
    });
    throw error;
  }
}

/**
 * Merge SKUs via API (Admin SDK)
 * Teklifbul Rule v1.0 - SKU birleştirme
 */
export async function mergeSkus({ companyId, sourceSku, targetSku, userId }) {
  try {
    if (!companyId || !sourceSku || !targetSku || !userId) {
      throw new Error('Eksik parametreler: companyId, sourceSku, targetSku, userId gerekli');
    }

    if (sourceSku === targetSku) {
      throw new Error('Kaynak ve hedef SKU aynı olamaz');
    }

    const { authFetch } = await import('../assets/js/utils/api-helpers.js');
    const response = await authFetch('/api/stock-movements/sku-merge', {
      method: 'POST',
      body: JSON.stringify({ sourceSku, targetSku }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const code = result.error || '';
      if (response.status === 402 || code === 'premium_required') {
        throw new Error(
          result.message ||
            'Premium plan gereklidir. Ayarlar > Premium Hesap üzerinden yükseltebilirsiniz.'
        );
      }
      if (code === 'subscription_expired') {
        throw new Error(
          result.message ||
            'Premium aboneliğinizin süresi dolmuş. Lütfen planınızı yenileyin.'
        );
      }
      throw new Error(result.message || result.error || 'SKU birleştirme başarısız');
    }

    return {
      success: true,
      sourceSku: result.sourceSku || sourceSku,
      targetSku: result.targetSku || targetSku,
      movementsUpdated: result.movementsUpdated || 0,
      balancesMerged: result.balancesMerged || 0,
    };
  } catch (error) {
    logger.error('SKU merge hatası', {
      error: error.message || String(error),
      companyId,
      sourceSku,
      targetSku,
    });
    throw error;
  }
}

