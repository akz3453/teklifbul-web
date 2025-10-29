// Talep durumları
export const DEMAND_STATUS = {
  DRAFT: 'draft',           // Taslak
  PENDING_APPROVAL: 'pending_approval', // Onay bekliyor
  APPROVED: 'approved',      // Onaylandı
  PUBLISHED: 'published',   // Yayınlandı
  WITHDRAWN: 'withdrawn',   // Geri çekildi
  REVISED: 'revised',       // Revize edildi
  COMPLETED: 'completed',   // Tamamlandı
  CANCELLED: 'cancelled'    // İptal edildi
};

// Talep durumu etiketleri
export const DEMAND_STATUS_LABELS = {
  [DEMAND_STATUS.DRAFT]: 'Taslak',
  [DEMAND_STATUS.PENDING_APPROVAL]: 'Onay Bekliyor',
  [DEMAND_STATUS.APPROVED]: 'Onaylandı',
  [DEMAND_STATUS.PUBLISHED]: 'Yayınlandı',
  [DEMAND_STATUS.WITHDRAWN]: 'Geri Çekildi',
  [DEMAND_STATUS.REVISED]: 'Revize Edildi',
  [DEMAND_STATUS.COMPLETED]: 'Tamamlandı',
  [DEMAND_STATUS.CANCELLED]: 'İptal Edildi'
};

// Talep durumu renkleri
export const DEMAND_STATUS_COLORS = {
  [DEMAND_STATUS.DRAFT]: '#6b7280',           // Gri
  [DEMAND_STATUS.PENDING_APPROVAL]: '#f59e0b', // Sarı
  [DEMAND_STATUS.APPROVED]: '#10b981',        // Yeşil
  [DEMAND_STATUS.PUBLISHED]: '#3b82f6',        // Mavi
  [DEMAND_STATUS.WITHDRAWN]: '#ef4444',        // Kırmızı
  [DEMAND_STATUS.REVISED]: '#8b5cf6',          // Mor
  [DEMAND_STATUS.COMPLETED]: '#059669',        // Koyu yeşil
  [DEMAND_STATUS.CANCELLED]: '#dc2626'         // Koyu kırmızı
};
