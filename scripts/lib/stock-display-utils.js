/**
 * Stock Display Utilities
 * Teklifbul Rule v1.0 - Stok miktarını görüntüleme için ayara göre düzenleme
 */

import { db } from '/firebase.js';
import { getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

let cachedCompanySettings = new Map();

/**
 * Teklifbul Rule v1.0 - Stok miktarını görüntüleme için ayara göre düzenle
 * Ayar kapalıyken eksi stoklar 0 olarak gösterilir
 * 
 * @param {string} companyId - Company ID
 * @param {number} quantity - Gerçek stok miktarı
 * @returns {Promise<number>} - Görüntülenecek miktar (ayara göre düzenlenmiş)
 */
export async function getDisplayQuantity(companyId, quantity) {
  if (quantity >= 0) return quantity; // Pozitif veya 0 ise olduğu gibi döndür
  
  if (!companyId) return quantity; // CompanyId yoksa olduğu gibi döndür
  
  // Şirket ayarını kontrol et (cache'den veya Firestore'dan)
  let allowNegativeStock = false;
  
  if (cachedCompanySettings.has(companyId)) {
    allowNegativeStock = cachedCompanySettings.get(companyId);
  } else {
    try {
      const companyDoc = await getDoc(doc(db, 'companies', companyId));
      if (companyDoc.exists()) {
        const companyData = companyDoc.data();
        allowNegativeStock = companyData.allowNegativeStock === true;
        cachedCompanySettings.set(companyId, allowNegativeStock);
      }
    } catch (error) {
      console.warn('Şirket ayarı alınamadı, varsayılan olarak eksi stoklar gösterilmeyecek', error);
    }
  }
  
  // Ayar kapalıysa ve miktar negatifse 0 döndür
  if (!allowNegativeStock && quantity < 0) {
    return 0;
  }
  
  return quantity;
}

/**
 * Cache'i temizle (ayar değiştiğinde kullanılabilir)
 */
export function clearCompanySettingsCache(companyId = null) {
  if (companyId) {
    cachedCompanySettings.delete(companyId);
  } else {
    cachedCompanySettings.clear();
  }
}

