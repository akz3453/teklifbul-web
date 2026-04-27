/**
 * Stock Balances Collection Utility
 * Teklifbul Rule v1.0 - Otomatik stok bakiye yönetimi
 * 
 * Her stock movement'te stock_balances koleksiyonunu otomatik günceller.
 */

import { db } from '/firebase.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { weightedAvgCost } from '/scripts/inventory-cost.js';

// Teklifbul Rule v1.0 - Frontend'de console.log kullanılabilir (logger frontend'de yok)
// Teklifbul Rule v1.0 - Performans: Batch işlemlerde detaylı log'ları kapat (sadece hata log'ları)
const ENABLE_DETAILED_LOGS = false; // Batch işlemlerde false yap (performans için)
const logger = {
  info: (msg, data) => {
    if (ENABLE_DETAILED_LOGS) {
      console.log(`[INFO] ${msg}`, data || '');
    }
  },
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
};

/**
 * Stock Balance Interface
 * @typedef {Object} StockBalance
 * @property {string} companyId - Company ID
 * @property {string} sku - Stock SKU
 * @property {string} locationId - Location ID
 * @property {number} quantity - Current quantity
 * @property {number} avgCost - Weighted average cost
 * @property {Date} lastUpdated - Last update timestamp
 * @property {string} lastMovementId - Last movement document ID
 */

/**
 * Stock Movement Interface (for balance update)
 * @typedef {Object} StockMovement
 * @property {string} id - Movement document ID
 * @property {string} companyId - Company ID
 * @property {string} stockId - Stock document ID
 * @property {string} sku - Stock SKU
 * @property {string} locationId - Location ID
 * @property {string} type - Movement type (IN, OUT, TRANSFER, ADJUST)
 * @property {number} qty - Quantity
 * @property {number} unitCost - Unit cost (for IN movements)
 * @property {string} toLocationId - Target location (for TRANSFER)
 */

/**
 * Stock balance document ID oluştur
 * Format: {companyId}_{sku}_{locationId}
 */
function getBalanceDocId(companyId, sku, locationId) {
  return `${companyId}_${sku}_${locationId}`;
}

/**
 * Stock balance'ı güncelle veya oluştur
 * Teklifbul Rule v1.0 - Otomatik stok bakiye yönetimi
 * 
 * @param {StockMovement} movement - Stock movement object
 * @returns {Promise<void>}
 */
export async function updateStockBalance(movement) {
  try {
    if (!movement.companyId || !movement.sku || !movement.locationId) {
      logger.warn('Stock balance update skipped: missing required fields', {
        companyId: movement.companyId,
        sku: movement.sku,
        locationId: movement.locationId
      });
      return;
    }

    // Teklifbul Rule v1.0 - Şirket ayarını kontrol et (eksiye düşme izni)
    const { getDoc: getDocFn, doc: docFn } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    const companyDoc = await getDocFn(docFn(db, 'companies', movement.companyId));
    const companyData = companyDoc.exists() ? companyDoc.data() : {};
    const allowNegativeStock = companyData.allowNegativeStock === true;

    const balanceDocId = getBalanceDocId(movement.companyId, movement.sku, movement.locationId);
    const balanceRef = doc(db, 'stock_balances', balanceDocId);

    // Mevcut balance'ı al
    const balanceDoc = await getDoc(balanceRef);
    const existingBalance = balanceDoc.exists() ? balanceDoc.data() : null;

    let newQuantity = 0;
    let newAvgCost = 0;

    // Movement type'a göre hesapla
    if (movement.type === 'IN') {
      // Giriş: Miktar artar, avgCost ağırlıklı ortalama ile güncellenir
      const oldQty = existingBalance?.quantity || 0;
      const oldAvg = existingBalance?.avgCost || 0;
      const inQty = movement.qty || 0;
      const inUnitCost = movement.unitCost || 0;

      newQuantity = oldQty + inQty;
      newAvgCost = weightedAvgCost(oldQty, oldAvg, inQty, inUnitCost);

    } else if (movement.type === 'OUT') {
      // Çıkış: Miktar azalır, avgCost değişmez
      const oldQty = existingBalance?.quantity || 0;
      const oldAvg = existingBalance?.avgCost || 0;

      // Teklifbul Rule v1.0 - Ayar kontrolü: eksiye düşme izni varsa Math.max kullanma
      if (allowNegativeStock) {
        newQuantity = oldQty - (movement.qty || 0);
      } else {
        newQuantity = Math.max(0, oldQty - (movement.qty || 0));
      }
      newAvgCost = oldAvg; // Çıkışta avgCost değişmez

    } else if (movement.type === 'TRANSFER') {
      // Transfer: Kaynak lokasyondan çıkar, hedef lokasyona eklenir (ayrı fonksiyon)
      // Bu fonksiyon sadece kaynak lokasyonu günceller
      const oldQty = existingBalance?.quantity || 0;
      const oldAvg = existingBalance?.avgCost || 0;

      // Teklifbul Rule v1.0 - Ayar kontrolü: eksiye düşme izni varsa Math.max kullanma
      if (allowNegativeStock) {
        newQuantity = oldQty - (movement.qty || 0);
      } else {
        newQuantity = Math.max(0, oldQty - (movement.qty || 0));
      }
      newAvgCost = oldAvg; // Transfer'de avgCost değişmez

      // Hedef lokasyon için ayrı update gerekir (updateStockBalanceTransfer çağrılmalı)
      if (movement.toLocationId) {
        await updateStockBalanceTransfer(movement);
      }

    } else if (movement.type === 'ADJUST') {
      // Düzeltme: Miktar direkt set edilir, avgCost değişmez
      const oldAvg = existingBalance?.avgCost || 0;

      newQuantity = movement.qty || 0;
      newAvgCost = oldAvg; // Düzeltmede avgCost değişmez
    }

    // Balance'ı güncelle veya oluştur
    const balanceData = {
      companyId: movement.companyId,
      sku: movement.sku,
      locationId: movement.locationId,
      stockId: movement.stockId,
      quantity: newQuantity,
      avgCost: newAvgCost,
      lastUpdated: serverTimestamp(),
      lastMovementId: movement.id
    };

    if (existingBalance) {
      await updateDoc(balanceRef, balanceData);
      logger.info('Stock balance updated', {
        balanceDocId,
        sku: movement.sku,
        locationId: movement.locationId,
        quantity: newQuantity,
        avgCost: newAvgCost
      });
    } else {
      await setDoc(balanceRef, balanceData);
      logger.info('Stock balance created', {
        balanceDocId,
        sku: movement.sku,
        locationId: movement.locationId,
        quantity: newQuantity,
        avgCost: newAvgCost
      });
    }

  } catch (error) {
    logger.error('Stock balance update error', {
      error: error.message || String(error),
      movement: {
        id: movement.id,
        sku: movement.sku,
        type: movement.type
      }
    });
    // Hata olsa bile movement kaydedilmiş olabilir, sadece log yaz
  }
}

/**
 * Transfer hareketi için hedef lokasyon balance'ını güncelle
 * Teklifbul Rule v1.0 - Transfer için çift güncelleme
 * 
 * @param {StockMovement} movement - Transfer movement (toLocationId içermeli)
 * @returns {Promise<void>}
 */
async function updateStockBalanceTransfer(movement) {
  try {
    if (!movement.toLocationId) {
      return; // Transfer değil
    }

    const toBalanceDocId = getBalanceDocId(movement.companyId, movement.sku, movement.toLocationId);
    const toBalanceRef = doc(db, 'stock_balances', toBalanceDocId);

    const toBalanceDoc = await getDoc(toBalanceRef);
    const existingToBalance = toBalanceDoc.exists() ? toBalanceDoc.data() : null;

    // Kaynak lokasyondan avgCost al (transfer edilen maliyet)
    const fromBalanceDocId = getBalanceDocId(movement.companyId, movement.sku, movement.locationId);
    const fromBalanceDoc = await getDoc(doc(db, 'stock_balances', fromBalanceDocId));
    const fromBalance = fromBalanceDoc.exists() ? fromBalanceDoc.data() : null;

    const transferAvgCost = fromBalance?.avgCost || movement.unitCost || 0;
    const transferQty = movement.qty || 0;

    // Hedef lokasyona ekle
    const oldToQty = existingToBalance?.quantity || 0;
    const oldToAvg = existingToBalance?.avgCost || 0;

    const newToQuantity = oldToQty + transferQty;
    const newToAvgCost = weightedAvgCost(oldToQty, oldToAvg, transferQty, transferAvgCost);

    const toBalanceData = {
      companyId: movement.companyId,
      sku: movement.sku,
      locationId: movement.toLocationId,
      stockId: movement.stockId,
      quantity: newToQuantity,
      avgCost: newToAvgCost,
      lastUpdated: serverTimestamp(),
      lastMovementId: movement.id
    };

    if (existingToBalance) {
      await updateDoc(toBalanceRef, toBalanceData);
    } else {
      await setDoc(toBalanceRef, toBalanceData);
    }

    logger.info('Stock balance transfer (target location) updated', {
      toBalanceDocId,
      sku: movement.sku,
      toLocationId: movement.toLocationId,
      quantity: newToQuantity,
      avgCost: newToAvgCost
    });

  } catch (error) {
    logger.error('Stock balance transfer (target) update error', {
      error: error.message || String(error),
      movement: {
        id: movement.id,
        sku: movement.sku,
        toLocationId: movement.toLocationId
      }
    });
  }
}

/**
 * Stock balance'ı oku
 * Teklifbul Rule v1.0 - Hızlı stok sorgulama
 * 
 * @param {string} companyId - Company ID
 * @param {string} sku - Stock SKU
 * @param {string} locationId - Location ID
 * @returns {Promise<StockBalance|null>}
 */
export async function getStockBalance(companyId, sku, locationId) {
  try {
    const balanceDocId = getBalanceDocId(companyId, sku, locationId);
    const balanceRef = doc(db, 'stock_balances', balanceDocId);
    const balanceDoc = await getDoc(balanceRef);

    if (!balanceDoc.exists()) {
      return null;
    }

    return {
      id: balanceDoc.id,
      ...balanceDoc.data()
    };
  } catch (error) {
    logger.error('Stock balance read error', {
      error: error.message || String(error),
      companyId,
      sku,
      locationId
    });
    return null;
  }
}

/**
 * Tüm lokasyonlar için stock balance'ları oku
 * Teklifbul Rule v1.0 - Toplam stok sorgulama
 * 
 * @param {string} companyId - Company ID
 * @param {string} sku - Stock SKU
 * @returns {Promise<StockBalance[]>}
 */
export async function getStockBalancesBySku(companyId, sku) {
  try {
    const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
    const q = query(
      collection(db, 'stock_balances'),
      where('companyId', '==', companyId),
      where('sku', '==', sku)
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    logger.error('Stock balances by SKU read error', {
      error: error.message || String(error),
      companyId,
      sku
    });
    return [];
  }
}

