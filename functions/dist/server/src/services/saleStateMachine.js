/**
 * Sale State Machine Service - Satış Modülü Faz 2
 * Satış durum geçişleri ve validasyon
 * Teklifbul Rule v1.0 - State machine validation, illegal transition blocking
 */
/**
 * Geçerli durum geçişleri
 */
export const VALID_TRANSITIONS = {
    draft: ['saved', 'pending_approval', 'cancelled'],
    saved: ['invoiced', 'cancelled', 'draft', 'archived'], // saved -> invoiced as main flow, saved -> archived via receipt
    pending_approval: ['approved', 'rejected', 'draft'], // rejected → draft (düzenleme için)
    approved: ['delivered', 'cancelled'],
    delivered: ['invoiced', 'cancelled'], // İrsaliye sonrası iptal (nadir)
    invoiced: ['cancelled'], // Fatura sonrası iptal (çok nadir, reversal gerekir)
    cancelled: [], // Terminal state
    archived: [], // Terminal state (soft delete)
    rejected: ['draft'] // rejected -> draft (for corrections)
};
/**
 * Durum geçişi validasyonu
 * @param currentStatus - Mevcut durum
 * @param newStatus - Yeni durum
 * @returns Geçiş geçerli mi?
 */
export function validateStatusTransition(currentStatus, newStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
}
/**
 * Durum geçişi validasyonu (hata fırlatır)
 * @param currentStatus - Mevcut durum
 * @param newStatus - Yeni durum
 * @throws Error if transition is invalid
 * @returns true if valid (for use in if statements)
 */
export function assertValidStatusTransition(currentStatus, newStatus) {
    if (!validateStatusTransition(currentStatus, newStatus)) {
        throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}. Allowed transitions: ${VALID_TRANSITIONS[currentStatus]?.join(', ') || 'none'}`);
    }
    return true;
}
/**
 * Durumun düzenlenebilir olup olmadığını kontrol et
 * @param status - Satış durumu
 * @returns Düzenlenebilir mi?
 */
export function isEditableStatus(status) {
    return status === 'draft' || status === 'saved';
}
/**
 * Durumun terminal (son) durum olup olmadığını kontrol et
 * @param status - Satış durumu
 * @returns Terminal durum mu?
 */
export function isTerminalStatus(status) {
    return status === 'cancelled' || status === 'archived';
}
/**
 * Durumun onay gerektirip gerektirmediğini kontrol et
 * @param status - Satış durumu
 * @returns Onay gerektirir mi?
 */
export function requiresApproval(status) {
    return status === 'pending_approval';
}
