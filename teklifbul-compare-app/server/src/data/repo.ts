import { Product, Offer } from './types';

// Mock data - gerçek uygulamada bu veriler veritabanından gelecek
const mockProducts: Product[] = [
  {
    urun_kodu: 'PRD001',
    urun_adi: 'Çelik Profil 50x50x3mm',
    kategori: 'Metal Profil',
    kaynak_fiyat: 150.00,
    para_birimi: 'TRY',
    min_siparis: 100,
    aciklama: 'Sıcak haddelenmiş çelik profil',
    guncelleme_tarihi: '2025-01-21'
  },
  {
    urun_kodu: 'PRD002',
    urun_adi: 'Alüminyum Levha 2mm',
    kategori: 'Metal Levha',
    kaynak_fiyat: 85.50,
    para_birimi: 'TRY',
    min_siparis: 50,
    aciklama: 'Anodize alüminyum levha',
    guncelleme_tarihi: '2025-01-21'
  },
  {
    urun_kodu: 'PRD003',
    urun_adi: 'Paslanmaz Çelik Boru Ø25mm',
    kategori: 'Paslanmaz Boru',
    kaynak_fiyat: 320.00,
    para_birimi: 'TRY',
    min_siparis: 25,
    aciklama: '316L kalite paslanmaz çelik boru',
    guncelleme_tarihi: '2025-01-21'
  },
  {
    urun_kodu: 'PRD004',
    urun_adi: 'Bakır Tel 2.5mm²',
    kategori: 'Elektrik Malzemesi',
    kaynak_fiyat: 45.00,
    para_birimi: 'TRY',
    min_siparis: 500,
    aciklama: 'Tek damarlı bakır tel',
    guncelleme_tarihi: '2025-01-21'
  },
  {
    urun_kodu: 'PRD005',
    urun_adi: 'PVC Boru Ø110mm',
    kategori: 'Plastik Boru',
    kaynak_fiyat: 28.50,
    para_birimi: 'TRY',
    min_siparis: 100,
    aciklama: 'Atık su PVC boru',
    guncelleme_tarihi: '2025-01-21'
  }
];

const mockOffers: Offer[] = [
  {
    id: 'OFF001',
    requestId: 'PR-2025-001',
    vendor: 'Metal A.Ş.',
    productCode: 'PRD001',
    qty: 44,
    unit: 'adet',
    currency: 'TRY',
    price: 115906.03,
    brand: 'ADAS',
    lead_time_days: 123,
    delivery_date: '2025-05-25',
    payment_terms: '55',
    shipping_type: 'DAP Şantiye',
    shipping_cost: 0,
    delivery_method: 'Şantiye Teslim',
    min_order_qty: 1,
    vat_rate: 20,
    notes: 'Kaliteli çelik profil',
    created_at: '2025-01-20T10:00:00Z',
    updated_at: '2025-01-20T10:00:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Metal A.Ş.',
    urun_kodu: 'PRD001',
    teklif_fiyati: 145.00,
    para_birimi: 'TRY',
    min_siparis: 100,
    teslim_suresi_gun: 5,
    teklif_tarihi: '2025-01-20',
    marka: 'ArcelorMittal',
    aciklama: 'Kaliteli çelik profil',
    durum: 'aktif'
  },
  {
    id: 'OFF002',
    requestId: 'PR-2025-001',
    vendor: 'Çelik Ltd.',
    productCode: 'PRD001',
    qty: 44,
    unit: 'adet',
    currency: 'TRY',
    price: 148.50,
    brand: 'ThyssenKrupp',
    lead_time_days: 7,
    delivery_date: '2025-01-28',
    payment_terms: '30',
    shipping_type: 'EXW',
    shipping_cost: 2500,
    delivery_method: 'Depo Teslim',
    min_order_qty: 100,
    vat_rate: 20,
    notes: 'Premium kalite',
    created_at: '2025-01-19T14:30:00Z',
    updated_at: '2025-01-19T14:30:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Çelik Ltd.',
    urun_kodu: 'PRD001',
    teklif_fiyati: 148.50,
    para_birimi: 'TRY',
    min_siparis: 100,
    teslim_suresi_gun: 7,
    teklif_tarihi: '2025-01-19',
    marka: 'ThyssenKrupp',
    aciklama: 'Premium kalite',
    durum: 'aktif'
  },
  {
    id: 'OFF003',
    requestId: 'PR-2025-002',
    vendor: 'Alüminyum İş',
    productCode: 'PRD002',
    qty: 50,
    unit: 'adet',
    currency: 'USD',
    price: 2.85,
    brand: 'Hydro',
    lead_time_days: 3,
    delivery_date: '2025-01-24',
    payment_terms: 'Peşin',
    shipping_type: 'FOB',
    shipping_cost: 500,
    delivery_method: 'Liman Teslim',
    min_order_qty: 50,
    vat_rate: 20,
    notes: 'Anodize işlemli',
    created_at: '2025-01-21T09:15:00Z',
    updated_at: '2025-01-21T09:15:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Alüminyum İş',
    urun_kodu: 'PRD002',
    teklif_fiyati: 82.00,
    para_birimi: 'TRY',
    min_siparis: 50,
    teslim_suresi_gun: 3,
    teklif_tarihi: '2025-01-21',
    marka: 'Hydro',
    aciklama: 'Anodize işlemli',
    durum: 'aktif'
  },
  {
    id: 'OFF004',
    requestId: 'PR-2025-002',
    vendor: 'Metal A.Ş.',
    productCode: 'PRD002',
    qty: 50,
    unit: 'adet',
    currency: 'TRY',
    price: 87.50,
    brand: 'Novelis',
    lead_time_days: 5,
    delivery_date: '2025-01-26',
    payment_terms: '45',
    shipping_type: 'DAP Şantiye',
    shipping_cost: 0,
    delivery_method: 'Şantiye Teslim',
    min_order_qty: 50,
    vat_rate: 20,
    notes: 'Yüksek kalite',
    created_at: '2025-01-20T16:45:00Z',
    updated_at: '2025-01-20T16:45:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Metal A.Ş.',
    urun_kodu: 'PRD002',
    teklif_fiyati: 87.50,
    para_birimi: 'TRY',
    min_siparis: 50,
    teslim_suresi_gun: 5,
    teklif_tarihi: '2025-01-20',
    marka: 'Novelis',
    aciklama: 'Yüksek kalite',
    durum: 'aktif'
  },
  {
    id: 'OFF005',
    requestId: 'PR-2025-003',
    vendor: 'Paslanmaz Ltd.',
    productCode: 'PRD003',
    qty: 25,
    unit: 'adet',
    currency: 'EUR',
    price: 9.65,
    brand: 'Outokumpu',
    lead_time_days: 10,
    delivery_date: '2025-01-31',
    payment_terms: '60',
    shipping_type: 'CIF',
    shipping_cost: 750,
    delivery_method: 'Liman Teslim',
    min_order_qty: 25,
    vat_rate: 20,
    notes: '316L kalite',
    created_at: '2025-01-18T11:20:00Z',
    updated_at: '2025-01-18T11:20:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Paslanmaz Ltd.',
    urun_kodu: 'PRD003',
    teklif_fiyati: 315.00,
    para_birimi: 'TRY',
    min_siparis: 25,
    teslim_suresi_gun: 10,
    teklif_tarihi: '2025-01-18',
    marka: 'Outokumpu',
    aciklama: '316L kalite',
    durum: 'aktif'
  },
  {
    id: 'OFF006',
    requestId: 'PR-2025-004',
    vendor: 'Elektrik Malzeme',
    productCode: 'PRD004',
    qty: 500,
    unit: 'metre',
    currency: 'TRY',
    price: 43.50,
    brand: 'Nexans',
    lead_time_days: 2,
    delivery_date: '2025-01-23',
    payment_terms: '15',
    shipping_type: 'DAP Şantiye',
    shipping_cost: 0,
    delivery_method: 'Şantiye Teslim',
    min_order_qty: 500,
    vat_rate: 20,
    notes: 'TSE belgeli',
    created_at: '2025-01-21T08:00:00Z',
    updated_at: '2025-01-21T08:00:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Elektrik Malzeme',
    urun_kodu: 'PRD004',
    teklif_fiyati: 43.50,
    para_birimi: 'TRY',
    min_siparis: 500,
    teslim_suresi_gun: 2,
    teklif_tarihi: '2025-01-21',
    marka: 'Nexans',
    aciklama: 'TSE belgeli',
    durum: 'aktif'
  },
  {
    id: 'OFF007',
    requestId: 'PR-2025-005',
    vendor: 'Plastik Boru A.Ş.',
    productCode: 'PRD005',
    qty: 100,
    unit: 'adet',
    currency: 'TRY',
    price: 27.00,
    brand: 'Pilsa',
    lead_time_days: 4,
    delivery_date: '2025-01-25',
    payment_terms: '30',
    shipping_type: 'DAP Şantiye',
    shipping_cost: 0,
    delivery_method: 'Şantiye Teslim',
    min_order_qty: 100,
    vat_rate: 20,
    notes: 'Standart kalite',
    created_at: '2025-01-20T13:30:00Z',
    updated_at: '2025-01-20T13:30:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Plastik Boru A.Ş.',
    urun_kodu: 'PRD005',
    teklif_fiyati: 27.00,
    para_birimi: 'TRY',
    min_siparis: 100,
    teslim_suresi_gun: 4,
    teklif_tarihi: '2025-01-20',
    marka: 'Pilsa',
    aciklama: 'Standart kalite',
    durum: 'aktif'
  },
  {
    id: 'OFF008',
    requestId: 'PR-2025-005',
    vendor: 'Borular Ltd.',
    productCode: 'PRD005',
    qty: 100,
    unit: 'adet',
    currency: 'TRY',
    price: 29.00,
    brand: 'Kalis',
    lead_time_days: 6,
    delivery_date: '2025-01-27',
    payment_terms: '45',
    shipping_type: 'EXW',
    shipping_cost: 800,
    delivery_method: 'Depo Teslim',
    min_order_qty: 100,
    vat_rate: 20,
    notes: 'Premium kalite',
    created_at: '2025-01-19T15:45:00Z',
    updated_at: '2025-01-19T15:45:00Z',
    status: 'active',
    // Legacy fields
    tedarikci: 'Borular Ltd.',
    urun_kodu: 'PRD005',
    teklif_fiyati: 29.00,
    para_birimi: 'TRY',
    min_siparis: 100,
    teslim_suresi_gun: 6,
    teklif_tarihi: '2025-01-19',
    marka: 'Kalis',
    aciklama: 'Premium kalite',
    durum: 'aktif'
  }
];

export class DataRepository {
  async getProducts(): Promise<Product[]> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    return [...mockProducts];
  }

  async getOffers(): Promise<Offer[]> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 150));
    return [...mockOffers];
  }

  async getProductByCode(urun_kodu: string): Promise<Product | undefined> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return mockProducts.find(p => p.urun_kodu === urun_kodu);
  }

  async getOffersByProductCode(urun_kodu: string): Promise<Offer[]> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return mockOffers.filter(o => o.urun_kodu === urun_kodu);
  }

  async getOffersBySupplier(tedarikci: string): Promise<Offer[]> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return mockOffers.filter(o => o.tedarikci === tedarikci);
  }
}

export const dataRepo = new DataRepository();
