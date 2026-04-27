/**
 * SKU Merge Utility
 * Teklifbul Rule v1.0 - İki SKU'yu birleştirme özelliği
 * 
 * Kaynak SKU'dan hedef SKU'ya veri aktarımı yapar.
 */

import { db } from '/firebase.js';
import { collection, query, where, getDocs, updateDoc, doc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { getStockBalance, getStockBalancesBySku } from '/scripts/inventory-balances.js';
import { weightedAvgCost } from '/scripts/inventory-cost.js';

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
 * Merge SKUs
 * Teklifbul Rule v1.0 - SKU birleştirme
 * 
 * @param {Object} params
 * @param {string} params.companyId - Company ID
 * @param {string} params.sourceSku - Kaynak SKU
 * @param {string} params.targetSku - Hedef SKU
 * @param {string} params.userId - User ID (for audit)
 * @returns {Promise<Object>} Merge result
 */
export async function mergeSkus({ companyId, sourceSku, targetSku, userId }) {
  try {
    if (!companyId || !sourceSku || !targetSku || !userId) {
      throw new Error('Eksik parametreler: companyId, sourceSku, targetSku, userId gerekli');
    }

    if (sourceSku === targetSku) {
      throw new Error('Kaynak ve hedef SKU aynı olamaz');
    }

    logger.info('SKU merge başlatıldı', { companyId, sourceSku, targetSku, userId });

    // Preview al
    const preview = await getSkuMergePreview(companyId, sourceSku, targetSku);

    // Batch işlemleri
    const batch = writeBatch(db);

    // 1. Stock balances'ları birleştir
    for (const sourceBalance of preview.sourceBalances) {
      const locationId = sourceBalance.locationId;
      const sourceQty = sourceBalance.quantity || 0;
      const sourceAvgCost = sourceBalance.avgCost || 0;

      if (sourceQty <= 0) {
        continue; // Miktar yoksa atla
      }

      // Hedef balance'ı bul veya oluştur
      const targetBalance = preview.targetBalances.find(b => b.locationId === locationId);
      
      if (targetBalance) {
        // Mevcut balance'ı güncelle
        const targetQty = targetBalance.quantity || 0;
        const targetAvgCost = targetBalance.avgCost || 0;
        
        // Ağırlıklı ortalama maliyet hesapla
        const newQty = sourceQty + targetQty;
        const newAvgCost = weightedAvgCost(targetQty, targetAvgCost, sourceQty, sourceAvgCost);

        const balanceDocId = `${companyId}_${targetSku}_${locationId}`;
        const balanceRef = doc(db, 'stock_balances', balanceDocId);
        
        batch.update(balanceRef, {
          quantity: newQty,
          avgCost: newAvgCost,
          lastUpdated: serverTimestamp()
        });
      } else {
        // Yeni balance oluştur
        const balanceDocId = `${companyId}_${targetSku}_${locationId}`;
        const balanceRef = doc(db, 'stock_balances', balanceDocId);
        
        batch.set(balanceRef, {
          companyId,
          sku: targetSku,
          locationId,
          stockId: preview.targetStock.id,
          quantity: sourceQty,
          avgCost: sourceAvgCost,
          lastUpdated: serverTimestamp(),
          lastMovementId: null
        });
      }

      // Kaynak balance'ı sil
      const sourceBalanceDocId = `${companyId}_${sourceSku}_${locationId}`;
      const sourceBalanceRef = doc(db, 'stock_balances', sourceBalanceDocId);
      batch.delete(sourceBalanceRef);
    }

    // 2. Stock movements'leri güncelle (SKU değiştir)
    const sourceMovementsQuery = query(
      collection(db, 'stock_movements'),
      where('companyId', '==', companyId),
      where('sku', '==', sourceSku)
    );
    const sourceMovementsSnap = await getDocs(sourceMovementsQuery);

    sourceMovementsSnap.forEach(docSnap => {
      const movementRef = doc(db, 'stock_movements', docSnap.id);
      batch.update(movementRef, {
        sku: targetSku,
        stockId: preview.targetStock.id,
        stockName: preview.targetStock.name,
        mergedFrom: sourceSku, // Audit için
        mergedAt: serverTimestamp()
      });
    });

    // 3. Target stock'u güncelle (avgCost, lastPurchasePrice, salePrice)
    const targetStockRef = doc(db, 'stocks', preview.targetStock.id);
    
    // En yüksek lastPurchasePrice'ı al
    const newLastPurchasePrice = Math.max(
      preview.sourceStock.lastPurchasePrice || 0,
      preview.targetStock.lastPurchasePrice || 0
    );

    // En yüksek salePrice'ı al
    const newSalePrice = Math.max(
      preview.sourceStock.salePrice || 0,
      preview.targetStock.salePrice || 0
    );

    // Ortalama maliyet: tüm lokasyonların ağırlıklı ortalaması
    let totalQty = 0;
    let totalCost = 0;
    
    for (const balance of [...preview.sourceBalances, ...preview.targetBalances]) {
      const qty = balance.quantity || 0;
      const avgCost = balance.avgCost || 0;
      totalQty += qty;
      totalCost += qty * avgCost;
    }
    
    const newAvgCost = totalQty > 0 ? totalCost / totalQty : preview.targetStock.avgCost || 0;

    batch.update(targetStockRef, {
      avgCost: newAvgCost,
      lastPurchasePrice: newLastPurchasePrice,
      salePrice: newSalePrice,
      updatedAt: serverTimestamp()
    });

    // 4. Source stock'u arşivle (silme, sadece merged flag ekle)
    const sourceStockRef = doc(db, 'stocks', preview.sourceStock.id);
    batch.update(sourceStockRef, {
      merged: true,
      mergedTo: targetSku,
      mergedAt: serverTimestamp(),
      mergedBy: userId,
      archived: true // Arşivle
    });

    // Batch'i commit et
    await batch.commit();

    logger.info('SKU merge tamamlandı', {
      companyId,
      sourceSku,
      targetSku,
      movementsUpdated: sourceMovementsSnap.size,
      balancesMerged: preview.sourceBalances.length
    });

    return {
      success: true,
      sourceSku,
      targetSku,
      movementsUpdated: sourceMovementsSnap.size,
      balancesMerged: preview.sourceBalances.length,
      newAvgCost,
      newLastPurchasePrice,
      newSalePrice
    };
  } catch (error) {
    logger.error('SKU merge hatası', {
      error: error.message || String(error),
      companyId,
      sourceSku,
      targetSku
    });
    throw error;
  }
}

