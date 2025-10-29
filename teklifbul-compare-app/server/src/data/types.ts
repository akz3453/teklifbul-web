export interface Product {
  urun_kodu: string;
  urun_adi: string;
  kategori: string;
  kaynak_fiyat: number;
  para_birimi: string;
  min_siparis: number;
  aciklama?: string;
  guncelleme_tarihi: string;
}

export interface Offer {
  id: string;
  requestId: string;
  vendor: string;
  productCode: string;
  qty: number;
  unit: string;
  currency: string;
  price: number;
  brand?: string;
  lead_time_days?: number;
  delivery_date?: string;
  payment_terms?: string;
  shipping_type?: string;
  shipping_cost?: number;
  delivery_method?: string;
  min_order_qty?: number;
  vat_rate?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'inactive' | 'pending';
  
  // Legacy fields for backward compatibility
  tedarikci?: string;
  urun_kodu?: string;
  teklif_fiyati?: number;
  para_birimi?: string;
  min_siparis?: number;
  teslim_suresi_gun?: number;
  teklif_tarihi?: string;
  marka?: string;
  aciklama?: string;
  durum?: 'aktif' | 'pasif' | 'beklemede';
}

export interface ComparisonResult {
  urun_kodu: string;
  urun_adi: string;
  kategori: string;
  kaynak_fiyat: number;
  tedarikci: string;
  teklif_fiyati: number;
  fark: number;
  fark_yuzde: number;
  en_iyi_teklif: boolean;
  para_birimi: string;
  min_siparis: number;
  teslim_suresi_gun: number;
  teklif_tarihi: string;
  marka?: string;
  aciklama?: string;
  durum: string;
}

export interface ComparisonRow {
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
  vendors: VendorOffer[];
  bestVendor: string;
  bestTotalTL: number;
}

export interface VendorOffer {
  vendor: string;
  unitPrice: number;
  currency: string;
  total: number;
  totalTL: number;
  brand?: string;
  leadTimeDays?: number;
  deliveryDate?: string;
  paymentTerms?: string;
  shippingType?: string;
  shippingCost?: number;
  deliveryMethod?: string;
  minOrderQty?: number;
  vatRate?: number;
  notes?: string;
  rank: number;
  isBest: boolean;
}

export interface ComparisonResult {
  requestId: string;
  rows: ComparisonRow[];
  bestOverallVendor: string;
  bestOverallTotal: number;
  totalProducts: number;
  totalVendors: number;
  generatedAt: string;
}

export interface MembershipConfig {
  tier: 'standard' | 'premium';
  maxVendors: number;
  maxVendorsPerSheet: number;
}

export interface ExportOptions {
  type: 'xlsx' | 'csv';
  mode: 'template' | 'programmatic';
  membership?: MembershipConfig;
  includeProducts?: boolean;
  includeOffers?: boolean;
  includeComparison?: boolean;
}

export interface TemplateMap {
  headerRow: number;
  dataStartRow: number;
  cols: {
    no: string;
    urun: string;
    qty: string;
    unit: string;
    vendors: Array<{
      unitPrice: string;
      total: string;
      totalTL: string;
    }>;
  };
  footer: {
    odeme: number;
    teslim: number;
    not: number;
    bestVendor: number;
  };
}
