// RFQ Bidding System Service
import { db } from '../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Create a new RFQ bid with commercial terms and item matrix
 */
export async function createRFQBid(bidData) {
  try {
    const bidRef = await addDoc(collection(db, 'bids'), {
      ...bidData,
      status: 'draft',
      statusHistory: [{
        status: 'draft',
        timestamp: Date.now(),
        note: 'Teklif oluşturuldu'
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

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
    const bidRef = doc(db, 'bids', bidId);
    
    // Update main bid document
    await updateDoc(bidRef, {
      ...bidData,
      updatedAt: serverTimestamp()
    });

    // Update items if provided
    if (bidData.items) {
      // Delete existing items
      const itemsSnapshot = await getDocs(collection(db, 'bids', bidId, 'items'));
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
    const itemsSnapshot = await getDocs(collection(db, 'bids', bidId, 'items'));
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
    const bidsQuery = query(
      collection(db, 'bids'),
      where('demandId', '==', demandId),
      orderBy('createdAt', 'desc')
    );
    
    const bidsSnapshot = await getDocs(bidsQuery);
    const bids = [];

    for (const bidDoc of bidsSnapshot.docs) {
      const bidData = bidDoc.data();
      
      // Get items for this bid
      const itemsSnapshot = await getDocs(collection(db, 'bids', bidDoc.id, 'items'));
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
