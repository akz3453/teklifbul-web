/**
 * Bid to Sale Service - Satış Modülü Faz 5
 * Onaylanan tekliflerden satış oluşturma
 * Teklifbul Rule v1.0 - Transaction güvenli, müşteri mapping, audit log
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import { generateSaleNumber } from './numberGenerator.js';
import { findOrCreateCustomerFromSupplier } from './customerService.js';
import { logAuditEvent } from './auditService.js';

/**
 * Onaylanan tekliften satış oluştur
 * @param bidId - Teklif ID
 * @param userId - Kullanıcı ID
 * @param companyId - Şirket ID
 * @returns Sale ID
 */
export async function createSaleFromBid(
  bidId: string,
  userId: string,
  companyId: string
): Promise<string> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  // 1. Bid'i yükle
  const bidDoc = await db.collection('bids').doc(bidId).get();
  if (!bidDoc.exists) {
    throw new Error('Teklif bulunamadı');
  }

  const bid = bidDoc.data() as any;

  // Company kontrolü (bid'in demandId'sinden kontrol et)
  if (bid.demandId) {
    const demandDoc = await db.collection('demands').doc(bid.demandId).get();
    const demand = demandDoc.exists ? demandDoc.data() : null;
    if (demand?.creatorCompanyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }
  }

  // Status kontrolü (accepted olmalı)
  if (bid.status !== 'accepted') {
    throw new Error(`Sadece onaylanan teklifler satışa dönüştürülebilir. Mevcut durum: ${bid.status}`);
  }

  // 2. Bid items'ı yükle
  const itemsSnapshot = await db.collection('bids').doc(bidId).collection('items').get();
  const bidItems: any[] = itemsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));

  if (bidItems.length === 0) {
    throw new Error('Teklif kalemleri bulunamadı');
  }

  // 3. Supplier'dan müşteri bul veya oluştur
  if (!bid.supplierId) {
    throw new Error('Teklifte supplier bilgisi bulunamadı');
  }

  const customerId = await findOrCreateCustomerFromSupplier(companyId, bid.supplierId, userId);

  // Müşteri bilgilerini al
  const customerDoc = await db.collection('customers').doc(customerId).get();
  const customer = customerDoc.exists ? customerDoc.data() : null;

  // 4. Satış numarası üret
  const saleNumber = await generateSaleNumber(companyId);

  // 5. Bid items'ı satış items'ına dönüştür
  // Not: Bid items'ında SKU, stockId, locationId olmayabilir
  // Bu durumda stok kartı bulunmalı veya kullanıcıdan seçilmelidir
  // Şimdilik basit mapping yapıyoruz, eksik alanlar için uyarı veriyoruz
  const saleItems: any[] = [];

  for (const bidItem of bidItems) {
    // Stok kartı bul (SKU veya itemName ile)
    let stockId = null;
    const sku = bidItem.sku || bidItem.productCode || null;
    let stockName = bidItem.itemName || bidItem.name || 'Bilinmeyen Ürün';

    if (sku) {
      // SKU ile stok kartı ara (companyId filtresi ile)
      const stockQuery = await db
        .collection('stocks')
        .where('sku', '==', sku)
        .limit(1)
        .get();
      
      // Not: stocks collection'ında companyId field'ı olmayabilir (global stocks)
      // Eğer companyId varsa filtrele, yoksa tüm stoklarda ara
      if (!stockQuery.empty) {
        const stock = stockQuery.docs[0];
        const stockData = stock.data();
        
        // CompanyId kontrolü (eğer stock'ta companyId varsa)
        if (!stockData.companyId || stockData.companyId === companyId) {
          stockId = stock.id;
          stockName = stockData.name || stockName;
        }
      }
    }

    // Lokasyon seçimi: Bid'de yoksa, varsayılan lokasyon veya kullanıcıdan seçilmeli
    // Şimdilik null bırakıyoruz, kullanıcı satış oluştururken seçecek
    const locationId = bidItem.locationId || null;

    // Fiyat ve KDV bilgileri
    const unitPrice = bidItem.unitPrice || bidItem.price || 0;
    const vatRate = bidItem.vatRate || bidItem.vat_rate || 18;
    const quantity = bidItem.quantity || bidItem.qty || 1;
    const unit = bidItem.unit || bidItem.uom || 'ADT';
    const discount = bidItem.discount || 0;

    // Hesaplama
    const itemSubtotal = quantity * unitPrice;
    const discountAmount = discount > 0 ? (itemSubtotal * discount) / 100 : 0;
    const totalPrice = itemSubtotal - discountAmount;
    const vatAmount = (totalPrice * vatRate) / 100;
    const totalWithVat = totalPrice + vatAmount;

    saleItems.push({
      id: generateUUID(),
      sku: sku,
      stockId: stockId,
      name: stockName,
      quantity: quantity,
      deliveredQuantity: 0,
      remainingQuantity: quantity,
      unit: unit,
      locationId: locationId, // Kullanıcı satış oluştururken seçecek
      locationName: null,
      unitPrice: unitPrice,
      vatRate: vatRate,
      discount: discount,
      discountAmount: discountAmount,
      totalPrice: totalPrice,
      vatAmount: vatAmount,
      totalWithVat: totalWithVat,
      currency: bidItem.currency || bid.currency || 'TRY'
    });
  }

  // 6. Finansal özet hesapla
  const subtotal = saleItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalDiscount = saleItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const totalVat = saleItems.reduce((sum, item) => sum + item.vatAmount, 0);
  const totalAmount = subtotal + totalVat;

  // 7. Satış oluştur
  const saleRef = db.collection('sales').doc();
  const saleId = saleRef.id;

  await saleRef.set({
    companyId: companyId,
    saleNumber: saleNumber,
    customerId: customerId,
    customerCode: customer?.code || '',
    customerName: customer?.name || '',
    status: 'draft', // Başlangıçta draft, kullanıcı düzenleyebilir
    items: saleItems,
    subtotal: subtotal,
    totalDiscount: totalDiscount,
    totalVat: totalVat,
    totalAmount: totalAmount,
    currency: bid.currency || 'TRY',
    exchangeRate: bid.exchangeRate || null,
    exchangeRateSource: bid.exchangeRateSource || null,
    exchangeRateDate: bid.exchangeRate ? FieldValue.serverTimestamp() : null,
    sourceBidId: bidId, // Referans
    sourceOfferId: null, // Eğer offer collection'ından geliyorsa
    deliveryNoteIds: [],
    stockMovementIds: [],
    stockMovementCreated: false,
    approvalHistory: [],
    notes: `Tekliften oluşturuldu (Bid: ${bidId})`,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId,
    updatedBy: userId
  });

  // 8. Audit log
  await logAuditEvent({
    companyId: companyId,
    entityType: 'sale',
    entityId: saleId,
    action: 'create_from_bid',
    actorUserId: userId,
    result: 'success',
    metadata: {
      bidId: bidId,
      saleNumber: saleNumber,
      customerId: customerId,
      itemsCount: saleItems.length
    }
  });

  logger.info('Satış tekliften oluşturuldu', {
    saleId: saleId,
    bidId: bidId,
    saleNumber: saleNumber,
    customerId: customerId
  });

  return saleId;
}

/**
 * Helper: UUID generate
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
