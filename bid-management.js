// Bid Management Functions
import { db } from "./firebase.js";
import { 
  doc, 
  updateDoc, 
  serverTimestamp, 
  addDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/**
 * Update bid status
 * @param {string} bidId - The ID of the bid to update
 * @param {string} newStatus - The new status to set
 * @param {string} userId - The ID of the user making the update
 * @param {string} notes - Optional notes for the status update
 */
export async function updateBidStatus(bidId, newStatus, userId, notes = "") {
  try {
    const bidRef = doc(db, "bids", bidId);
    
    // Get current bid data to preserve existing fields
    // In a real implementation, you would fetch the current bid data first
    
    const updateData = {
      status: newStatus,
      statusHistory: [{
        status: newStatus,
        timestamp: serverTimestamp(),
        userId: userId,
        notes: notes
      }]
    };
    
    await updateDoc(bidRef, updateData);
    console.log("Bid status updated successfully:", bidId, newStatus);
    return { success: true };
  } catch (error) {
    console.error("Error updating bid status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Request revision for a bid
 * @param {string} bidId - The ID of the bid to request revision for
 * @param {string} requesterId - The ID of the user requesting revision
 * @param {string} revisionNotes - Notes explaining the revision request
 */
export async function requestBidRevision(bidId, requesterId, revisionNotes) {
  try {
    // Create a revision request document
    const revisionRequest = {
      bidId: bidId,
      requesterId: requesterId,
      notes: revisionNotes,
      status: "pending", // pending, approved, rejected
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const revisionRef = await addDoc(collection(db, "bidRevisions"), revisionRequest);
    
    // Update bid status to "revision_requested"
    await updateBidStatus(bidId, "revision_requested", requesterId, revisionNotes);
    
    console.log("Revision requested successfully:", revisionRef.id);
    return { success: true, revisionId: revisionRef.id };
  } catch (error) {
    console.error("Error requesting bid revision:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Accept a bid
 * @param {string} bidId - The ID of the bid to accept
 * @param {string} userId - The ID of the user accepting the bid
 */
export async function acceptBid(bidId, userId) {
  try {
    // Update bid status to "accepted"
    await updateBidStatus(bidId, "accepted", userId, "Bid accepted by buyer");
    
    // In a real implementation, you might also:
    // 1. Update the demand status
    // 2. Notify the supplier
    // 3. Create a purchase order
    // 4. Handle contract generation
    
    console.log("Bid accepted successfully:", bidId);
    return { success: true };
  } catch (error) {
    console.error("Error accepting bid:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Reject a bid
 * @param {string} bidId - The ID of the bid to reject
 * @param {string} userId - The ID of the user rejecting the bid
 * @param {string} rejectionReason - Reason for rejection
 */
export async function rejectBid(bidId, userId, rejectionReason) {
  try {
    // Update bid status to "rejected"
    await updateBidStatus(bidId, "rejected", userId, rejectionReason);
    
    console.log("Bid rejected successfully:", bidId);
    return { success: true };
  } catch (error) {
    console.error("Error rejecting bid:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark bid as completed
 * @param {string} bidId - The ID of the bid to mark as completed
 * @param {string} userId - The ID of the user marking as completed
 */
export async function completeBid(bidId, userId) {
  try {
    // Update bid status to "completed"
    await updateBidStatus(bidId, "completed", userId, "Bid completed");
    
    console.log("Bid marked as completed:", bidId);
    return { success: true };
  } catch (error) {
    console.error("Error completing bid:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Load incoming bids for a user (where user is the buyer)
 * @param {string} userId - The ID of the user (buyer)
 * @returns {Promise<Array>} - Array of bid objects with supplier company names
 */
export async function loadIncomingBids(userId) {
  try {
    const incomingQuery = query(
      collection(db, "bids"), 
      where("buyerId", "==", userId),
      orderBy("createdAt", "desc")
    );
    
    const incomingSnap = await getDocs(incomingQuery);
    const bids = [];
    
    // Process incoming bids with supplier company names
    for (const docSnap of incomingSnap.docs) {
      const bid = { id: docSnap.id, ...docSnap.data() };
      
      // Get supplier company name
      try {
        const supplierRef = doc(db, "users", bid.supplierId);
        const supplierSnap = await getDoc(supplierRef);
        if (supplierSnap.exists()) {
          const supplierData = supplierSnap.data();
          bid.supplierName = supplierData.companyName || "Bilinmeyen Firma";
        } else {
          bid.supplierName = "Bilinmeyen Firma";
        }
      } catch (error) {
        console.warn("Error fetching supplier data:", error);
        bid.supplierName = "Bilinmeyen Firma";
      }
      
      bids.push(bid);
    }
    
    return bids;
  } catch (error) {
    console.error("Error loading incoming bids:", error);
    throw error;
  }
}

/**
 * Load outgoing bids for a user (where user is the supplier)
 * @param {string} userId - The ID of the user (supplier)
 * @returns {Promise<Array>} - Array of bid objects
 */
export async function loadOutgoingBids(userId) {
  try {
    const outgoingQuery = query(
      collection(db, "bids"), 
      where("supplierId", "==", userId),
      orderBy("createdAt", "desc")
    );
    
    const outgoingSnap = await getDocs(outgoingQuery);
    const bids = [];
    
    // Process outgoing bids
    for (const docSnap of outgoingSnap.docs) {
      const bid = { id: docSnap.id, ...docSnap.data() };
      // For sent bids, we don't need to fetch supplier name since it's the current user
      bid.supplierName = "Ben"; // Current user
      bids.push(bid);
    }
    
    return bids;
  } catch (error) {
    console.error("Error loading outgoing bids:", error);
    throw error;
  }
}

/**
 * Apply filters to bids
 * @param {Array} allBids - Array of all bids
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Filtered bids
 */
export function applyFilters(allBids, filters) {
  const { search, demandId, mode } = filters;
  
  return allBids.filter(b => {
    // Filter by supplier name search
    const matchSupplier = !search || b.supplierName?.toLowerCase().includes(search.toLowerCase());
    
    // Filter by demand ID
    const matchDemand = !demandId || b.demandId === demandId;
    
    // Filter by bidding mode
    const matchMode = !mode || b.biddingMode === mode;
    
    return matchSupplier && matchDemand && matchMode;
  });
}

/**
 * Get status label for display
 * @param {string} status - The status code
 * @returns {string} - The human-readable status label
 */
export function getStatusLabel(status) {
  const labels = {
    sent: "Gönderildi",
    viewed: "Görüldü",
    responded: "Yanıtlandı",
    accepted: "Kabul Edildi",
    rejected: "Reddedildi",
    completed: "Tamamlandı",
    revision_requested: "Revizyon Talep Edildi",
    pending: "Beklemede"
  };
  return labels[status] || status;
}

/**
 * Get payment method label for display
 * @param {string} paymentMethod - The payment method code
 * @returns {string} - The human-readable payment method label
 */
export function getPaymentMethodLabel(paymentMethod) {
  const labels = {
    cash: "Nakit",
    credit: "Kredi Kartı",
    bank_transfer: "Havale/EFT",
    check: "Çek",
    other: "Diğer",
    unknown: "Belirtilmemiş"
  };
  return labels[paymentMethod] || paymentMethod;
}