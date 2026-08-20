// RFQ Bidding System Service
import { db, auth } from '../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
import { toast } from '../../../src/shared/ui/toast.js';
import { initPermissions, requirePerm, getBidPerms } from '../state/permissions.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, serverTimestamp, arrayUnion, limit
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { BID_ITEMS_QUERY_LIMIT, BIDS_PER_DEMAND_QUERY_LIMIT } from '../../../src/shared/constants/timing.js';

const BID_PERMS = getBidPerms();

/**
 * Create a new RFQ bid with commercial terms and item matrix
 */
export async function createRFQBid(bidData) {
  try {
    // Teklifbul Rule v1.0 - Permission Write Guard: Teklif Oluşturma
    if (BID_PERMS.create) {
      await initPermissions({ redirectOnPending: true });
      const ok = await requirePerm(BID_PERMS.create, {
        toastMessage:
          MESSAGES.ERROR_PERMISSION_BIDS_CREATE ||
          'Teklif oluşturma yetkiniz yok.'
      });
      if (!ok) {
        logger.warn('createRFQBid: permissions denied (bids.create)', { permKey: BID_PERMS.create });
        throw new Error(MESSAGES.ERROR_PERMISSION_BIDS_CREATE || 'Teklif oluşturma yetkiniz yok.');
      }
    }

    // Calculate total price for server-side sorting
    const total = calculateBidTotal(bidData.items || [], bidData.currency || 'TRY');

    // Enrich with company IDs if missing - Teklifbul Rule v1.3
    if (!bidData.supplierCompanyId && auth.currentUser) {
      const uDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (uDoc.exists()) {
        const u = uDoc.data();
        bidData.supplierCompanyId = u.activeCompanyId || (u.companies && u.companies[0]) || null;
        if (!bidData.supplierId) bidData.supplierId = auth.currentUser.uid;
      }
    }

    if (!bidData.buyerCompanyId && bidData.demandId) {
      const dDoc = await getDoc(doc(db, 'demands', bidData.demandId));
      if (dDoc.exists()) {
        const d = dDoc.data();
        bidData.buyerCompanyId = d.creatorCompanyId || d.companyId || null;
        if (!bidData.buyerId) bidData.buyerId = d.createdBy || d.creatorId || null;
      }
    }

    const bidRef = await addDoc(collection(db, 'bids'), {
      ...bidData,
      supplierVisibility: bidData.supplierVisibility === 'anonymous' ? 'anonymous' : 'named',
      totalPrice: total.amount, // Save total for sorting
      involvedCompanyIds: [bidData.buyerCompanyId, bidData.supplierCompanyId].filter(Boolean), // For approved view
      status: 'draft',
      statusHistory: [{
        status: 'draft',
        timestamp: Date.now(),
        note: 'Teklif oluşturuldu'
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    import('../analytics.js').then(({ track, ANALYTICS_EVENTS }) => {
      track(ANALYTICS_EVENTS.BID_CREATED, { status: 'draft' });
    }).catch(() => {});

    // Teklifbul Rule v1.3 - Update demand metadata for better sorting and metrics
    if (bidData.demandId) {
      try {
        const { increment } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
        const demandRef = doc(db, 'demands', bidData.demandId);
        await updateDoc(demandRef, {
          bidCount: increment(1),
          lastBidAt: serverTimestamp(),
          updatedAt: serverTimestamp() // Ensure it bubbles up in "most recent" queries
        });
        logger.info('Demand metadata updated after bid creation', { demandId: bidData.demandId });
      } catch (updateErr) {
        logger.warn('Failed to update demand metadata (non-critical)', updateErr);
      }
    }

    // Create bid items subcollection
    if (bidData.items && bidData.items.length > 0) {
      const itemsRef = collection(db, 'bids', bidRef.id, 'items');
      
      for (const item of bidData.items) {
        await addDoc(itemsRef, {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    return bidRef.id;
  } catch (error) {
    logger.error('Error creating RFQ bid', error);
    throw error;
  }
}

/**
 * Update an existing RFQ bid
 */
export async function updateRFQBid(bidId, bidData) {
  try {
    // Teklifbul Rule v1.0 - Permission Write Guard: Teklif Düzenleme
    if (BID_PERMS.edit) {
      await initPermissions({ redirectOnPending: true });
      const ok = await requirePerm(BID_PERMS.edit, {
        toastMessage:
          MESSAGES.ERROR_PERMISSION_BIDS_EDIT ||
          'Teklif düzenleme yetkiniz yok.'
      });
      if (!ok) {
        logger.warn('updateRFQBid: permissions denied (bids.edit)', { permKey: BID_PERMS.edit, bidId });
        throw new Error(MESSAGES.ERROR_PERMISSION_BIDS_EDIT || 'Teklif düzenleme yetkiniz yok.');
      }
    }

    const bidRef = doc(db, 'bids', bidId);
    
    // Calculate total price if items are updated
    let totalPrice = bidData.totalPrice;
    if (bidData.items) {
      const total = calculateBidTotal(bidData.items, bidData.currency || 'TRY');
      totalPrice = total.amount;
    }

    // Update main bid document
    await updateDoc(bidRef, {
      ...bidData,
      ...(totalPrice !== undefined ? { totalPrice } : {}),
      updatedAt: serverTimestamp()
    });

    // Update items if provided
    if (bidData.items) {
      // Delete existing items
      const itemsSnapshot = await getDocs(query(collection(db, 'bids', bidId, 'items'), limit(BID_ITEMS_QUERY_LIMIT)));
      for (const itemDoc of itemsSnapshot.docs) {
        await deleteDoc(doc(db, 'bids', bidId, 'items', itemDoc.id));
      }

      // Add new items
      const itemsRef = collection(db, 'bids', bidId, 'items');
      for (const item of bidData.items) {
        await addDoc(itemsRef, {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    return bidId;
  } catch (error) {
    logger.error('Error updating RFQ bid', error);
    throw error;
  }
}

/**
 * Get bid with items
 */
export async function getRFQBidWithItems(bidId) {
  try {
    const bidDoc = await getDoc(doc(db, 'bids', bidId));
    if (!bidDoc.exists()) {
      throw new Error('Bid not found');
    }

    const bidData = bidDoc.data();
    
    // Get items
    const itemsSnapshot = await getDocs(query(collection(db, 'bids', bidId, 'items'), limit(BID_ITEMS_QUERY_LIMIT)));
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      id: bidDoc.id,
      ...bidData,
      items
    };
  } catch (error) {
    logger.error('Error getting RFQ bid', error);
    throw error;
  }
}

/**
 * Get all bids for a demand with items
 */
export async function getDemandBidsWithItems(demandId) {
  try {
    // Teklifbul Rule v1.0 - Permission Guard: Teklifleri Görüntüleme
    if (BID_PERMS.view) {
      await initPermissions({ redirectOnPending: true });
      const ok = await requirePerm(BID_PERMS.view, {
        toastMessage:
          MESSAGES.ERROR_PERMISSION_BIDS_VIEW ||
          'Teklifleri görüntüleme yetkiniz yok.'
      });
      if (!ok) {
        logger.warn('getDemandBidsWithItems: permissions denied (bids.view)', {
          permKey: BID_PERMS.view,
          demandId
        });
        return [];
      }
    }

    const bidsQuery = query(
      collection(db, 'bids'),
      where('demandId', '==', demandId),
      orderBy('createdAt', 'desc'),
      limit(BIDS_PER_DEMAND_QUERY_LIMIT)
    );
    
    const bidsSnapshot = await getDocs(bidsQuery);
    const bids = [];

    for (const bidDoc of bidsSnapshot.docs) {
      const bidData = bidDoc.data();
      
      const itemsSnapshot = await getDocs(query(collection(db, 'bids', bidDoc.id, 'items'), limit(BID_ITEMS_QUERY_LIMIT)));
      const items = itemsSnapshot.docs.map(itemDoc => ({
        id: itemDoc.id,
        ...itemDoc.data()
      }));

      bids.push({
        id: bidDoc.id,
        ...bidData,
        items
      });
    }

    return bids;
  } catch (error) {
    logger.error('Error getting demand bids', error);
    throw error;
  }
}

/**
 * Update bid status with history tracking
 */
export async function updateBidStatus(bidId, newStatus, note = '') {
  try {
    // Teklifbul Rule v1.0 - Permission Write Guard: Teklif Onay / Durum Değiştirme
    if (BID_PERMS.approve) {
      await initPermissions({ redirectOnPending: true });
      const ok = await requirePerm(BID_PERMS.approve, {
        toastMessage:
          MESSAGES.ERROR_PERMISSION_BIDS_APPROVE ||
          'Teklif onaylama yetkiniz yok.'
      });
      if (!ok) {
        logger.warn('updateBidStatus: permissions denied (bids.approve)', {
          permKey: BID_PERMS.approve,
          bidId,
          newStatus
        });
        throw new Error(MESSAGES.ERROR_PERMISSION_BIDS_APPROVE || 'Teklif onaylama yetkiniz yok.');
      }
    }

    const bidRef = doc(db, 'bids', bidId);
    
    await updateDoc(bidRef, {
      status: newStatus,
      statusHistory: arrayUnion({
        status: newStatus,
        timestamp: Date.now(),
        note: note
      }),
      updatedAt: serverTimestamp()
    });

    return bidId;
  } catch (error) {
    logger.error('Error updating bid status', error);
    throw error;
  }
}

/**
 * Shortlist a bid
 */
export async function shortlistBid(bidId) {
  return updateBidStatus(bidId, 'shortlisted', 'Teklif kısa listeye alındı');
}

/**
 * Accept a bid
 */
export async function acceptBid(bidId) {
  return updateBidStatus(bidId, 'accepted', 'Teklif kabul edildi');
}

/**
 * Reject a bid
 */
export async function rejectBid(bidId) {
  return updateBidStatus(bidId, 'rejected', 'Teklif reddedildi');
}

/**
 * Set bid as completed
 */
export async function setBidCompleted(bidId) {
  return updateBidStatus(bidId, 'completed', 'Teklif tamamlandı');
}

/**
 * Calculate total bid amount
 */
export function calculateBidTotal(items, currency = 'TRY') {
  let total = 0;
  
  for (const item of items) {
    if (item.compliance === 'match' && item.netPrice && item.quantity) {
      total += parseFloat(item.netPrice) * parseFloat(item.quantity);
    }
  }
  
  return {
    amount: total,
    currency: currency,
    formatted: `${total.toLocaleString('tr-TR')} ${currency}`
  };
}

/**
 * Validate bid data
 */
export function validateBidData(bidData) {
  const errors = [];
  
  // Required commercial terms
  if (!bidData.currency) errors.push('Para birimi seçilmelidir');
  if (!bidData.validityDays) errors.push('Geçerlilik süresi belirtilmelidir');
  if (!bidData.incoterm) errors.push('Teslim şekli seçilmelidir');
  if (!bidData.deliveryAddress) errors.push('Teslimat adresi belirtilmelidir');
  
  // Items validation
  if (!bidData.items || bidData.items.length === 0) {
    errors.push('En az bir ürün kalemi teklif edilmelidir');
  } else {
    bidData.items.forEach((item, index) => {
      if (item.compliance === 'match') {
        if (!item.netPrice) errors.push(`Ürün ${index + 1}: Fiyat belirtilmelidir`);
        if (!item.brand) errors.push(`Ürün ${index + 1}: Marka belirtilmelidir`);
        if (!item.leadTimeDays) errors.push(`Ürün ${index + 1}: Teslim süresi belirtilmelidir`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
