/**
 * Delivery Note Service - E-Belge Modülü
 * Teklifbul Rule v1.0 - Snapshot bazlı delivery note oluşturma, immutability, idempotency
 */

import { getAdminDb } from '../../utils/firestore.js';
import { logger } from '../../../src/shared/log/logger.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { generateDeliveryNoteNumber } from './numberGenerator.js';
import { logAuditEvent } from './auditService.js';
import { getEdocProvider } from '../providers/edoc/index.js';
import type {
  DeliveryNote,
  DeliveryNoteSnapshot,
  DeliveryNoteStatus
} from '../types/deliveryNote.js';

/**
 * Sale'dan delivery note draft oluştur (snapshot bazlı)
 * Teklifbul Rule v1.0 - Snapshot immutable, idempotency desteği
 */
export async function createDeliveryNoteDraftFromSale(options: {
  companyId: string;
  saleId: string;
  userId: string;
  requestId?: string; // Idempotency için
  shipDate?: Date; // Opsiyonel, yoksa şimdi
  shipToAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    country?: string;
  }; // Opsiyonel, yoksa customer address
}): Promise<{ deliveryNoteId: string; number: string }> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const { companyId, saleId, userId, requestId, shipDate, shipToAddress } = options;

  const saleRef = db.collection('sales').doc(saleId);
  const companyRef = db.collection('companies').doc(companyId);

  return await db.runTransaction(async (transaction) => {
    // 1. Sale doc'u çek
    const saleDoc = await transaction.get(saleRef);
    if (!saleDoc.exists) {
      throw new Error('Satış bulunamadı');
    }

    const sale = saleDoc.data() as any;

    // Company kontrolü
    if (sale.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // Status kontrolü (approved olmalı)
    if (sale.status !== 'approved') {
      throw new Error(`İrsaliye oluşturulamaz. Satış durumu: ${sale.status}`);
    }

    // 2. Company doc'u çek (edoc.sender)
    const companyDoc = await transaction.get(companyRef);
    if (!companyDoc.exists) {
      throw new Error('Şirket bulunamadı');
    }

    const company = companyDoc.data() as any;
    const edocSender = company?.edoc?.sender;

    if (!edocSender || !edocSender.vkn || !edocSender.title) {
      throw new Error('Şirket e-belge gönderici bilgileri eksik. Lütfen E-Belge Ayarları\'ndan gönderici bilgilerini doldurun.');
    }

    // 3. Customer doc'u çek
    const customerDoc = await transaction.get(db.collection('customers').doc(sale.customerId));
    if (!customerDoc.exists) {
      throw new Error('Müşteri bulunamadı');
    }

    const customer = customerDoc.data() as any;

    // Idempotency kontrolü
    if (requestId) {
      const existingDeliveryNoteQuery = await db
        .collection('delivery_notes')
        .where('companyId', '==', companyId)
        .where('saleId', '==', saleId)
        .where('requestId', '==', requestId)
        .limit(1)
        .get();

      if (!existingDeliveryNoteQuery.empty) {
        const existingDeliveryNote = existingDeliveryNoteQuery.docs[0];
        logger.info('Idempotency: Mevcut delivery note döndürülüyor', {
          deliveryNoteId: existingDeliveryNote.id,
          saleId,
          requestId
        });
        return {
          deliveryNoteId: existingDeliveryNote.id,
          number: existingDeliveryNote.data().number
        };
      }
    }

    // 4. Snapshot oluştur

    // Seller snapshot
    const sellerSnapshot = {
      vkn: edocSender.vkn,
      title: edocSender.title,
      taxOffice: edocSender.taxOffice || null,
      address: {
        line1: edocSender.address?.line1 || '',
        line2: edocSender.address?.line2 || null,
        city: edocSender.address?.city || '',
        district: edocSender.address?.district || null,
        postalCode: edocSender.address?.postalCode || null,
        country: edocSender.address?.country || 'TR'
      }
    };

    // Buyer snapshot
    const buyerSnapshot = {
      taxNumber: customer.taxNumber || customer.invoiceAddress?.taxNumber || null,
      name: customer.name || null,
      title: customer.name || null,
      taxOffice: customer.taxOffice || null,
      address: {
        line1: (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
        line2: (customer.invoiceAddress?.line2 || customer.address?.line2) || null,
        city: (customer.invoiceAddress?.city || customer.address?.city) || '',
        district: (customer.invoiceAddress?.district || customer.address?.district) || null,
        postalCode: (customer.invoiceAddress?.postalCode || customer.address?.postalCode) || null,
        country: (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
      },
      email: customer.email || null
    };

    // Shipment snapshot
    const finalShipDate = shipDate ? Timestamp.fromDate(shipDate) : Timestamp.now();
    
    // Teklifbul Rule v1.0 - Nakliye bilgileri: Satışta nakliye bize aitse deliveryAddress kullan
    let finalShipToAddress: { line1: string; line2?: string; city: string; district?: string; postalCode?: string; country: string };
    if (shipToAddress) {
      // API'den gelen shipToAddress öncelikli; eksik alanlari customer'dan tamamla
      finalShipToAddress = {
        line1: shipToAddress.line1 || (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
        line2: shipToAddress.line2 || undefined,
        city: shipToAddress.city || (customer.invoiceAddress?.city || customer.address?.city) || '',
        district: shipToAddress.district || undefined,
        postalCode: shipToAddress.postalCode || undefined,
        country: shipToAddress.country || (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
      };
    } else if (sale.delivery?.isOwnDelivery && sale.delivery?.deliveryAddress) {
      // Satışta nakliye bilgileri varsa kullan
      const deliveryAddr = sale.delivery.deliveryAddress;
      // Adres satırlarını oluştur (mahalle, cadde, sokak birleştirilerek line1, kapı no ve daire line2)
      const line1Parts = [
        deliveryAddr.neighborhood,
        deliveryAddr.avenue,
        deliveryAddr.street
      ].filter(Boolean);
      const line2Parts = [
        deliveryAddr.doorNumber,
        deliveryAddr.apartment
      ].filter(Boolean);
      
      finalShipToAddress = {
        line1: line1Parts.join(' ') || '',
        line2: line2Parts.join(' ') || undefined,
        city: deliveryAddr.city || '',
        district: deliveryAddr.district || undefined,
        postalCode: deliveryAddr.postalCode || undefined,
        country: deliveryAddr.country || 'TR'
      };
    } else {
      // Varsayılan: Müşteri adresi
      finalShipToAddress = {
        line1: (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
        line2: (customer.invoiceAddress?.line2 || customer.address?.line2) || undefined,
        city: (customer.invoiceAddress?.city || customer.address?.city) || '',
        district: (customer.invoiceAddress?.district || customer.address?.district) || undefined,
        postalCode: (customer.invoiceAddress?.postalCode || customer.address?.postalCode) || undefined,
        country: (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
      };
    }

    // İlk item'dan location bilgisi al (varsa)
    const firstItem = sale.items?.[0];
    const fromLocationId = firstItem?.locationId || null;
    const fromLocationName = firstItem?.locationName || null;

    const shipmentSnapshot = {
      shipDate: finalShipDate,
      shipToAddress: finalShipToAddress,
      fromLocationId: fromLocationId || undefined,
      fromLocationName: fromLocationName || undefined
    };

    // Item snapshot
    const itemSnapshots = sale.items.map((item: any) => ({
      sku: item.sku || '',
      name: item.name || '',
      quantity: item.quantity || 0,
      unit: item.unit || 'AD',
      saleItemId: item.id
    }));

    // Totals snapshot (opsiyonel, satışla uyumlu kalsın)
    const totalsSnapshot = {
      subtotal: sale.subtotal || 0,
      totalVat: sale.totalVat || 0,
      totalAmount: sale.totalAmount || 0,
      currency: sale.currency || 'TRY'
    };

    // Delivery note snapshot
    const deliveryNoteSnapshot: DeliveryNoteSnapshot = {
      seller: sellerSnapshot,
      buyer: buyerSnapshot,
      shipment: shipmentSnapshot,
      items: itemSnapshots,
      totals: totalsSnapshot
    };

    // 5. Delivery note numarası üret
    const deliveryNoteNumber = await generateDeliveryNoteNumber(companyId);

    // 6. Delivery note doc'u create et (status='draft')
    const deliveryNoteRef = db.collection('delivery_notes').doc();
    const deliveryNoteId = deliveryNoteRef.id;

    const now = Timestamp.now();

    const deliveryNoteData: Omit<DeliveryNote, 'id'> = {
      companyId,
      saleId,
      number: deliveryNoteNumber,
      status: 'draft',
      snapshot: deliveryNoteSnapshot,
      edoc: {
        providerKey: company?.edoc?.providerKey || null,
        externalId: null,
        uuid: null,
        sentAt: null,
        responseLogs: [],
        pdfUrl: null
      },
      requestId: requestId || undefined,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId
    };

    transaction.set(deliveryNoteRef, deliveryNoteData);

    // 7. Sale doc'unda deliveryNoteIds array'ine ekle ve lastDeliveredAt set et
    const currentDeliveryNoteIds = sale.deliveryNoteIds || [];
    const updatedDeliveryNoteIds = [...currentDeliveryNoteIds, deliveryNoteId];

    transaction.update(saleRef, {
      deliveryNoteIds: updatedDeliveryNoteIds,
      lastDeliveredAt: now,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log (transaction dışında)
    await logAuditEvent({
      companyId,
      entityType: 'delivery_note',
      entityId: deliveryNoteId,
      action: 'create_draft',
      actorUserId: userId,
      result: 'success',
      metadata: {
        saleId,
        deliveryNoteNumber,
        requestId: requestId || null
      }
    });

    logger.info('Delivery note draft oluşturuldu (snapshot)', {
      deliveryNoteId,
      saleId,
      deliveryNoteNumber,
      userId
    });

    return { deliveryNoteId, number: deliveryNoteNumber };
  });
}

/**
 * Direkt irsaliye oluştur (satışsız) - kullanıcının seçtiği müşteri + kalemler ile.
 * Teklifbul Rule v1.0 - Snapshot bazlı, idempotency desteği, transaction güvenli.
 */
export async function createDirectDeliveryNoteDraft(options: {
  companyId: string;
  userId: string;
  customerId: string;
  items: Array<{
    sku?: string;
    name: string;
    quantity: number;
    unit?: string;
    stockId?: string | null;
  }>;
  shipDate?: Date;
  shipToAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    country?: string;
  };
  fromLocationId?: string;
  fromLocationName?: string;
  requestId?: string;
}): Promise<{ deliveryNoteId: string; number: string }> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const {
    companyId,
    userId,
    customerId,
    items,
    shipDate,
    shipToAddress,
    fromLocationId,
    fromLocationName,
    requestId
  } = options;

  if (!customerId) {
    throw new Error('Müşteri seçimi zorunludur');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('En az bir kalem eklenmelidir');
  }
  for (const it of items) {
    if (!it.name || !Number.isFinite(Number(it.quantity))) {
      throw new Error('Kalemlerde ad ve miktar zorunludur');
    }
    if (Number(it.quantity) <= 0) {
      throw new Error(`Miktar 0'dan büyük olmalıdır: ${it.name}`);
    }
  }

  const companyRef = db.collection('companies').doc(companyId);
  const customerRef = db.collection('customers').doc(customerId);

  return await db.runTransaction(async (transaction) => {
    const [companyDoc, customerDoc] = await Promise.all([
      transaction.get(companyRef),
      transaction.get(customerRef)
    ]);

    if (!companyDoc.exists) {
      throw new Error('Şirket bulunamadı');
    }
    if (!customerDoc.exists) {
      throw new Error('Müşteri bulunamadı');
    }

    const company = companyDoc.data() as any;
    const customer = customerDoc.data() as any;

    if (customer.companyId && customer.companyId !== companyId) {
      throw new Error('Müşteri bu şirkete ait değil');
    }

    const edocSender = company?.edoc?.sender;
    if (!edocSender || !edocSender.vkn || !edocSender.title) {
      throw new Error("Şirket e-belge gönderici bilgileri eksik. Lütfen E-Belge Ayarları'ndan gönderici bilgilerini doldurun.");
    }

    if (requestId) {
      const dupQuery = await db
        .collection('delivery_notes')
        .where('companyId', '==', companyId)
        .where('requestId', '==', requestId)
        .limit(1)
        .get();
      if (!dupQuery.empty) {
        const existing = dupQuery.docs[0];
        logger.info('Idempotency: Mevcut direct delivery note döndürülüyor', {
          deliveryNoteId: existing.id,
          requestId
        });
        return { deliveryNoteId: existing.id, number: existing.data().number };
      }
    }

    const sellerSnapshot = {
      vkn: edocSender.vkn,
      title: edocSender.title,
      taxOffice: edocSender.taxOffice || null,
      address: {
        line1: edocSender.address?.line1 || '',
        line2: edocSender.address?.line2 || null,
        city: edocSender.address?.city || '',
        district: edocSender.address?.district || null,
        postalCode: edocSender.address?.postalCode || null,
        country: edocSender.address?.country || 'TR'
      }
    };

    const buyerSnapshot = {
      taxNumber: customer.taxNumber || customer.invoiceAddress?.taxNumber || null,
      name: customer.name || null,
      title: customer.name || null,
      taxOffice: customer.taxOffice || null,
      address: {
        line1: (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
        line2: (customer.invoiceAddress?.line2 || customer.address?.line2) || null,
        city: (customer.invoiceAddress?.city || customer.address?.city) || '',
        district: (customer.invoiceAddress?.district || customer.address?.district) || null,
        postalCode: (customer.invoiceAddress?.postalCode || customer.address?.postalCode) || null,
        country: (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
      },
      email: customer.email || null
    };

    const finalShipDate = shipDate ? Timestamp.fromDate(shipDate) : Timestamp.now();
    const finalShipToAddress: { line1: string; line2?: string; city: string; district?: string; postalCode?: string; country: string } = shipToAddress
      ? {
          line1: shipToAddress.line1 || (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
          line2: shipToAddress.line2 || undefined,
          city: shipToAddress.city || (customer.invoiceAddress?.city || customer.address?.city) || '',
          district: shipToAddress.district || undefined,
          postalCode: shipToAddress.postalCode || undefined,
          country: shipToAddress.country || (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
        }
      : {
          line1: (customer.invoiceAddress?.line1 || customer.address?.street || customer.address?.line1) || '',
          line2: (customer.invoiceAddress?.line2 || customer.address?.line2) || undefined,
          city: (customer.invoiceAddress?.city || customer.address?.city) || '',
          district: (customer.invoiceAddress?.district || customer.address?.district) || undefined,
          postalCode: (customer.invoiceAddress?.postalCode || customer.address?.postalCode) || undefined,
          country: (customer.invoiceAddress?.country || customer.address?.country) || 'TR'
        };

    const shipmentSnapshot = {
      shipDate: finalShipDate,
      shipToAddress: finalShipToAddress,
      fromLocationId: fromLocationId || undefined,
      fromLocationName: fromLocationName || undefined
    };

    const itemSnapshots = items.map((it, idx) => ({
      sku: it.sku || '',
      name: it.name,
      quantity: Number(it.quantity) || 0,
      unit: it.unit || 'AD',
      saleItemId: `direct_${idx}`
    }));

    const deliveryNoteSnapshot: DeliveryNoteSnapshot = {
      seller: sellerSnapshot,
      buyer: buyerSnapshot,
      shipment: shipmentSnapshot,
      items: itemSnapshots
    };

    const deliveryNoteNumber = await generateDeliveryNoteNumber(companyId);
    const deliveryNoteRef = db.collection('delivery_notes').doc();
    const deliveryNoteId = deliveryNoteRef.id;

    const now = Timestamp.now();

    const deliveryNoteData: Omit<DeliveryNote, 'id'> = {
      companyId,
      saleId: null,
      number: deliveryNoteNumber,
      status: 'draft',
      snapshot: deliveryNoteSnapshot,
      edoc: {
        providerKey: company?.edoc?.providerKey || null,
        externalId: null,
        uuid: null,
        sentAt: null,
        responseLogs: [],
        pdfUrl: null
      },
      requestId: requestId || undefined,
      origin: 'direct',
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId
    };

    transaction.set(deliveryNoteRef, deliveryNoteData);

    await logAuditEvent({
      companyId,
      entityType: 'delivery_note',
      entityId: deliveryNoteId,
      action: 'create_direct_draft',
      actorUserId: userId,
      result: 'success',
      metadata: {
        deliveryNoteNumber,
        customerId,
        itemCount: items.length,
        requestId: requestId || null
      }
    });

    logger.info('Direct delivery note oluşturuldu', {
      deliveryNoteId,
      deliveryNoteNumber,
      customerId,
      userId
    });

    return { deliveryNoteId, number: deliveryNoteNumber };
  });
}

/**
 * Delivery note güncelleme (immutability kontrolü ile)
 * Teklifbul Rule v1.0 - Snapshot immutable after sent/accepted
 */
export async function updateDeliveryNote(
  deliveryNoteId: string,
  userId: string,
  companyId: string,
  updateData: Partial<DeliveryNote>
): Promise<void> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const deliveryNoteRef = db.collection('delivery_notes').doc(deliveryNoteId);

  return await db.runTransaction(async (transaction) => {
    const deliveryNoteDoc = await transaction.get(deliveryNoteRef);
    if (!deliveryNoteDoc.exists) {
      throw new Error('İrsaliye bulunamadı');
    }

    const deliveryNote = deliveryNoteDoc.data() as DeliveryNote;

    // Company kontrolü
    if (deliveryNote.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // Immutability kontrolü
    const immutableStatuses: DeliveryNoteStatus[] = ['sent', 'accepted'];
    if (immutableStatuses.includes(deliveryNote.status)) {
      // Snapshot alanlarına update reddet
      if (updateData.snapshot) {
        throw new Error(`İrsaliye durumu '${deliveryNote.status}' olduğu için snapshot alanları güncellenemez.`);
      }
    }

    // Ready durumunda snapshot update sadece muhasebe/tam yetki ile mümkün olabilir
    // (Bu kontrol PROMPT 4/5'te permission guard ile yapılacak)
    if (deliveryNote.status === 'ready' && updateData.snapshot) {
      // Şimdilik uyarı ver, PROMPT 4/5'te permission kontrolü eklenecek
      logger.warn('Delivery note ready durumunda snapshot güncelleme denemesi', {
        deliveryNoteId,
        userId
      });
    }

    // Güncelleme verisi hazırla
    const finalUpdateData: any = {
      ...updateData,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    };

    // Snapshot'ı updateData'dan çıkar (immutability kontrolü geçtiyse)
    if (immutableStatuses.includes(deliveryNote.status)) {
      delete finalUpdateData.snapshot;
    }

    transaction.update(deliveryNoteRef, finalUpdateData);

    logger.info('Delivery note güncellendi', {
      deliveryNoteId,
      userId,
      changedFields: Object.keys(updateData)
    });
  });
}

/**
 * Delivery note prepare (validasyon + status=ready)
 * Teklifbul Rule v1.0 - Validasyon kuralları
 */
export async function prepareDeliveryNote(
  deliveryNoteId: string,
  userId: string,
  companyId: string
): Promise<void> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const deliveryNoteRef = db.collection('delivery_notes').doc(deliveryNoteId);

  return await db.runTransaction(async (transaction) => {
    const deliveryNoteDoc = await transaction.get(deliveryNoteRef);
    if (!deliveryNoteDoc.exists) {
      throw new Error('İrsaliye bulunamadı');
    }

    const deliveryNote = deliveryNoteDoc.data() as DeliveryNote;

    // Company kontrolü
    if (deliveryNote.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // Status kontrolü
    if (deliveryNote.status !== 'draft') {
      throw new Error(`İrsaliye durumu '${deliveryNote.status}' olduğu için hazırlanamaz. Sadece taslak durumundaki irsaliyeler hazırlanabilir.`);
    }

    // Validasyonlar
    const validationErrors: string[] = [];

    // Shipment validasyonları
    const shipment = deliveryNote.snapshot.shipment;
    if (!shipment.shipDate) {
      // ShipDate yoksa bugünün tarihini set et
      deliveryNote.snapshot.shipment.shipDate = Timestamp.now();
    }
    if (!shipment.shipToAddress?.line1 || !shipment.shipToAddress?.city || !shipment.shipToAddress?.country) {
      validationErrors.push('Teslimat adresi eksik (line1, city, country)');
    }

    // Items validasyonu
    if (!deliveryNote.snapshot.items || deliveryNote.snapshot.items.length === 0) {
      validationErrors.push('İrsaliye en az 1 kalem içermelidir');
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validasyon hatası: ${validationErrors.join('; ')}`);
    }

    // Status'u ready yap
    transaction.update(deliveryNoteRef, {
      status: 'ready',
      'snapshot.shipment.shipDate': deliveryNote.snapshot.shipment.shipDate, // ShipDate set edildiyse güncelle
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log
    await logAuditEvent({
      companyId,
      entityType: 'delivery_note',
      entityId: deliveryNoteId,
      action: 'prepare',
      actorUserId: userId,
      result: 'success',
      metadata: { deliveryNoteNumber: deliveryNote.number }
    });

    logger.info('Delivery note hazırlandı', { deliveryNoteId, deliveryNoteNumber: deliveryNote.number });
  });
}

/**
 * Delivery note send (provider'a gönder)
 * Teklifbul Rule v1.0 - Idempotent, provider-agnostic
 */
export async function sendDeliveryNote(
  deliveryNoteId: string,
  userId: string,
  companyId: string
): Promise<{ externalId: string; uuid: string }> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const deliveryNoteRef = db.collection('delivery_notes').doc(deliveryNoteId);

  return await db.runTransaction(async (transaction) => {
    const deliveryNoteDoc = await transaction.get(deliveryNoteRef);
    if (!deliveryNoteDoc.exists) {
      throw new Error('İrsaliye bulunamadı');
    }

    const deliveryNote = deliveryNoteDoc.data() as DeliveryNote;

    // Company kontrolü
    if (deliveryNote.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // Status kontrolü
    if (deliveryNote.status === 'draft') {
      throw new Error('İrsaliye önce hazırlanmalıdır (prepare).');
    }
    if (deliveryNote.status !== 'ready') {
      throw new Error(`İrsaliye durumu '${deliveryNote.status}' olduğu için gönderilemez.`);
    }

    // Idempotency: Eğer zaten gönderilmişse mevcut state'i dön
    if (deliveryNote.edoc.externalId) {
      logger.info('Delivery note zaten gönderilmiş (idempotent)', {
        deliveryNoteId,
        externalId: deliveryNote.edoc.externalId
      });
      return {
        externalId: deliveryNote.edoc.externalId,
        uuid: deliveryNote.edoc.uuid || ''
      };
    }

    // Provider'ı al
    const { provider, credentials } = await getEdocProvider(companyId);

    // Provider'a gönder
    const sendResult = await provider.sendDespatch(
      deliveryNote.snapshot,
      deliveryNote.edoc,
      credentials
    );

    // Response'u sanitize et
    const sanitizedResponse = {
      externalId: sendResult.externalId,
      uuid: sendResult.uuid,
      pdfUrl: sendResult.pdfUrl,
      timestamp: new Date().toISOString()
    };

    // Delivery note'u güncelle
    const updatedEdoc = {
      ...deliveryNote.edoc,
      providerKey: deliveryNote.edoc.providerKey || (await db.collection('companies').doc(companyId).get()).data()?.edoc?.providerKey || null,
      externalId: sendResult.externalId,
      uuid: sendResult.uuid,
      pdfUrl: sendResult.pdfUrl || null,
      sentAt: Timestamp.now(),
      responseLogs: [...(deliveryNote.edoc.responseLogs || []), sanitizedResponse]
    };

    transaction.update(deliveryNoteRef, {
      status: 'sent',
      edoc: updatedEdoc,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log
    await logAuditEvent({
      companyId,
      entityType: 'delivery_note',
      entityId: deliveryNoteId,
      action: 'send',
      actorUserId: userId,
      result: 'success',
      metadata: {
        deliveryNoteNumber: deliveryNote.number,
        externalId: sendResult.externalId,
        uuid: sendResult.uuid
      }
    });

    logger.info('Delivery note gönderildi', {
      deliveryNoteId,
      deliveryNoteNumber: deliveryNote.number,
      externalId: sendResult.externalId,
      uuid: sendResult.uuid
    });

    return {
      externalId: sendResult.externalId,
      uuid: sendResult.uuid
    };
  });
}

/**
 * Delivery note status sync (provider'dan durum çek)
 */
export async function syncDeliveryNoteStatus(
  deliveryNoteId: string,
  userId: string,
  companyId: string
): Promise<{ status: DeliveryNoteStatus; pdfUrl?: string }> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const deliveryNoteRef = db.collection('delivery_notes').doc(deliveryNoteId);

  return await db.runTransaction(async (transaction) => {
    const deliveryNoteDoc = await transaction.get(deliveryNoteRef);
    if (!deliveryNoteDoc.exists) {
      throw new Error('İrsaliye bulunamadı');
    }

    const deliveryNote = deliveryNoteDoc.data() as DeliveryNote;

    // Company kontrolü
    if (deliveryNote.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // ExternalId kontrolü
    if (!deliveryNote.edoc.externalId) {
      throw new Error('İrsaliye henüz gönderilmemiş (externalId yok)');
    }

    // Provider'ı al
    const { provider, credentials } = await getEdocProvider(companyId);

    // Provider'dan durum çek
    const statusResult = await provider.getDespatchStatus(
      deliveryNote.edoc.externalId,
      credentials
    );

    // Status mapping
    let newStatus: DeliveryNoteStatus = deliveryNote.status;
    if (statusResult.status === 'accepted') {
      newStatus = 'accepted';
    } else if (statusResult.status === 'rejected') {
      newStatus = 'rejected';
    }

    // Response'u sanitize et
    const sanitizedResponse = {
      status: statusResult.status,
      pdfUrl: statusResult.pdfUrl,
      rejectionReason: statusResult.rejectionReason,
      timestamp: new Date().toISOString()
    };

    // Delivery note'u güncelle
    const updatedEdoc = {
      ...deliveryNote.edoc,
      pdfUrl: statusResult.pdfUrl || deliveryNote.edoc.pdfUrl || null,
      responseLogs: [...(deliveryNote.edoc.responseLogs || []), sanitizedResponse]
    };

    transaction.update(deliveryNoteRef, {
      status: newStatus,
      edoc: updatedEdoc,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log
    await logAuditEvent({
      companyId,
      entityType: 'delivery_note',
      entityId: deliveryNoteId,
      action: 'status_sync',
      actorUserId: userId,
      result: 'success',
      metadata: {
        deliveryNoteNumber: deliveryNote.number,
        oldStatus: deliveryNote.status,
        newStatus,
        externalId: deliveryNote.edoc.externalId
      }
    });

    logger.info('Delivery note durum senkronize edildi', {
      deliveryNoteId,
      deliveryNoteNumber: deliveryNote.number,
      oldStatus: deliveryNote.status,
      newStatus
    });

    return {
      status: newStatus,
      pdfUrl: statusResult.pdfUrl || deliveryNote.edoc.pdfUrl || undefined
    };
  });
}

/**
 * Delivery note PDF al
 */
export async function getDeliveryNotePdf(
  deliveryNoteId: string,
  userId: string,
  companyId: string
): Promise<{ pdfUrl: string }> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const deliveryNoteRef = db.collection('delivery_notes').doc(deliveryNoteId);

  // Delivery note'u al
  const deliveryNoteDoc = await deliveryNoteRef.get();
  if (!deliveryNoteDoc.exists) {
    throw new Error('İrsaliye bulunamadı');
  }

  const deliveryNote = deliveryNoteDoc.data() as DeliveryNote;

  // Company kontrolü
  if (deliveryNote.companyId !== companyId) {
    throw new Error('Yetkisiz erişim');
  }

  // Eğer zaten pdfUrl varsa dön
  if (deliveryNote.edoc.pdfUrl) {
    return { pdfUrl: deliveryNote.edoc.pdfUrl };
  }

  // ExternalId kontrolü
  if (!deliveryNote.edoc.externalId) {
    throw new Error('İrsaliye henüz gönderilmemiş (externalId yok)');
  }

  // Provider'ı al
  const { provider, credentials } = await getEdocProvider(companyId);

  // Provider'dan PDF al
  const pdfResult = await provider.getDespatchPdf(
    deliveryNote.edoc.externalId,
    credentials
  );

  // PDF URL'i kaydet
  await deliveryNoteRef.update({
    'edoc.pdfUrl': pdfResult.pdfUrl,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: userId
  });

  logger.info('Delivery note PDF alındı', {
    deliveryNoteId,
    deliveryNoteNumber: deliveryNote.number,
    pdfUrl: pdfResult.pdfUrl
  });

  return { pdfUrl: pdfResult.pdfUrl };
}

/**
 * Delivery note cancel
 */
export async function cancelDeliveryNote(
  deliveryNoteId: string,
  userId: string,
  companyId: string
): Promise<void> {
  const db = await getAdminDb();
  if (!db) {
    throw new Error('Firestore unavailable');
  }

  const deliveryNoteRef = db.collection('delivery_notes').doc(deliveryNoteId);

  return await db.runTransaction(async (transaction) => {
    const deliveryNoteDoc = await transaction.get(deliveryNoteRef);
    if (!deliveryNoteDoc.exists) {
      throw new Error('İrsaliye bulunamadı');
    }

    const deliveryNote = deliveryNoteDoc.data() as DeliveryNote;

    // Company kontrolü
    if (deliveryNote.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    // Status kontrolü
    if (deliveryNote.status !== 'sent' && deliveryNote.status !== 'accepted') {
      throw new Error(`İrsaliye durumu '${deliveryNote.status}' olduğu için iptal edilemez. Sadece gönderilmiş veya kabul edilmiş irsaliyeler iptal edilebilir.`);
    }

    // ExternalId kontrolü
    if (!deliveryNote.edoc.externalId) {
      throw new Error('İrsaliye henüz gönderilmemiş (externalId yok)');
    }

    // Provider'ı al
    const { provider, credentials } = await getEdocProvider(companyId);

    // Provider'a iptal isteği gönder
    const cancelResult = await provider.cancelDespatch(
      deliveryNote.edoc.externalId,
      credentials
    );

    if (!cancelResult.cancelled) {
      throw new Error('İrsaliye iptal edilemedi');
    }

    // Response'u sanitize et
    const sanitizedResponse = {
      cancelled: true,
      cancelledAt: cancelResult.cancelledAt?.toISOString(),
      cancellationReason: cancelResult.cancellationReason,
      timestamp: new Date().toISOString()
    };

    // Delivery note'u güncelle
    transaction.update(deliveryNoteRef, {
      status: 'cancelled',
      'edoc.responseLogs': FieldValue.arrayUnion(sanitizedResponse),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Audit log
    await logAuditEvent({
      companyId,
      entityType: 'delivery_note',
      entityId: deliveryNoteId,
      action: 'cancel',
      actorUserId: userId,
      result: 'success',
      metadata: {
        deliveryNoteNumber: deliveryNote.number,
        externalId: deliveryNote.edoc.externalId
      }
    });

    logger.info('Delivery note iptal edildi', {
      deliveryNoteId,
      deliveryNoteNumber: deliveryNote.number,
      externalId: deliveryNote.edoc.externalId
    });
  });
}
