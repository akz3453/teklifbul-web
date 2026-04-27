/**
 * Inventory Notifications Utility
 * Teklifbul Rule v1.0 - Stok bildirimleri sistemi
 * 
 * Stok düşük, hareket onayı, talep bildirimi gibi bildirimler oluşturur.
 */

import { db } from '/firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// Teklifbul Rule v1.0 - Frontend'de console.log kullanılabilir
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
};

/**
 * Notification Types
 * @typedef {'stock_low' | 'movement_approved' | 'request_created' | 'invoice_matched' | 'stock_transfer'} NotificationType
 */

/**
 * Create a notification
 * Teklifbul Rule v1.0 - Bildirim oluşturma
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {NotificationType} params.type - Notification type
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {Object} [params.data] - Additional data (demandId, bidId, etc.)
 * @param {string} [params.actionUrl] - Action URL (optional)
 * @returns {Promise<string|null>} Notification document ID
 */
export async function createNotification({ userId, type, title, message, data = {}, actionUrl = null }) {
  try {
    if (!userId || !type || !title || !message) {
      logger.warn('Notification oluşturulamadı: eksik parametreler', { userId, type, title, message });
      return null;
    }

    const notificationData = {
      userId,
      type,
      title,
      message,
      body: message, // Alias for compatibility
      read: false,
      createdAt: serverTimestamp(),
      data: {
        ...data,
        actionUrl: actionUrl || data.actionUrl || null
      }
    };

    const docRef = await addDoc(collection(db, 'notifications'), notificationData);
    logger.info('Notification oluşturuldu', {
      id: docRef.id,
      userId,
      type,
      title
    });

    return docRef.id;
  } catch (error) {
    logger.error('Notification oluşturma hatası', {
      error: error.message || String(error),
      userId,
      type,
      title
    });
    return null;
  }
}

/**
 * Create stock low notification
 * Teklifbul Rule v1.0 - Düşük stok bildirimi
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.sku - Stock SKU
 * @param {string} params.stockName - Stock name
 * @param {number} params.currentQty - Current quantity
 * @param {number} params.minQty - Minimum quantity
 * @param {string} params.locationId - Location ID (optional)
 * @param {string} params.locationName - Location name (optional)
 * @returns {Promise<string|null>} Notification document ID
 */
export async function createStockLowNotification({ userId, sku, stockName, currentQty, minQty, locationId = null, locationName = null }) {
  const locationText = locationName ? ` (${locationName})` : '';
  const title = `⚠️ Düşük Stok: ${stockName}${locationText}`;
  const message = `${stockName} (SKU: ${sku}) stok miktarı minimum seviyenin altında. Mevcut: ${currentQty}, Minimum: ${minQty}${locationText ? ` - Lokasyon: ${locationName}` : ''}`;

  return await createNotification({
    userId,
    type: 'stock_low',
    title,
    message,
    data: {
      sku,
      stockName,
      currentQty,
      minQty,
      locationId,
      locationName
    },
    actionUrl: `/pages/stock-movements.html?sku=${sku}${locationId ? `&location=${locationId}` : ''}`
  });
}

/**
 * Create movement approved notification
 * Teklifbul Rule v1.0 - Hareket onay bildirimi
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.movementType - Movement type (IN, OUT, TRANSFER, ADJUST)
 * @param {string} params.sku - Stock SKU
 * @param {string} params.stockName - Stock name
 * @param {number} params.qty - Quantity
 * @param {string} params.locationName - Location name
 * @returns {Promise<string|null>} Notification document ID
 */
export async function createMovementApprovedNotification({ userId, movementType, sku, stockName, qty, locationName }) {
  const typeText = {
    'IN': 'Giriş',
    'OUT': 'Çıkış',
    'TRANSFER': 'Transfer',
    'ADJUST': 'Düzeltme'
  }[movementType] || movementType;

  const title = `✅ Hareket Onaylandı: ${typeText}`;
  const message = `${stockName} (SKU: ${sku}) için ${qty} adet ${typeText.toLowerCase()} hareketi onaylandı. Lokasyon: ${locationName}`;

  return await createNotification({
    userId,
    type: 'movement_approved',
    title,
    message,
    data: {
      movementType,
      sku,
      stockName,
      qty,
      locationName
    },
    actionUrl: `/pages/stock-movements.html?sku=${sku}`
  });
}

/**
 * Check and create stock low notifications
 * Teklifbul Rule v1.0 - Düşük stok kontrolü ve bildirim
 * 
 * @param {Object} params
 * @param {string} params.companyId - Company ID
 * @param {string} params.sku - Stock SKU
 * @param {string} params.locationId - Location ID
 * @param {number} params.currentQty - Current quantity
 * @param {number} params.minQty - Minimum quantity (from stock document)
 * @param {string} params.stockName - Stock name
 * @param {string} params.locationName - Location name (optional)
 * @param {string} params.userId - User ID to notify (optional, defaults to company owner)
 * @returns {Promise<void>}
 */
export async function checkAndNotifyStockLow({ companyId, sku, locationId, currentQty, minQty, stockName, locationName = null, userId = null }) {
  try {
    // Minimum miktar kontrolü
    if (!minQty || minQty <= 0) {
      return; // Minimum miktar tanımlı değilse bildirim gönderme
    }

    // Stok düşük mü kontrol et
    if (currentQty >= minQty) {
      return; // Stok yeterli
    }

    // User ID yoksa, company owner'ı bul (basit implementasyon)
    let targetUserId = userId;
    if (!targetUserId) {
      // TODO: Company owner'ı bul (şimdilik userId parametresi gerekli)
      logger.warn('User ID bulunamadı, bildirim gönderilemedi', { companyId, sku });
      return;
    }

    // Bildirim oluştur
    await createStockLowNotification({
      userId: targetUserId,
      sku,
      stockName,
      currentQty,
      minQty,
      locationId,
      locationName
    });

    logger.info('Düşük stok bildirimi gönderildi', {
      sku,
      stockName,
      currentQty,
      minQty,
      locationName
    });
  } catch (error) {
    logger.error('Düşük stok bildirimi hatası', {
      error: error.message || String(error),
      sku,
      currentQty,
      minQty
    });
  }
}

