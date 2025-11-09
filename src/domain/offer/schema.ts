import { z } from 'zod';

/**
 * Teklif Modülü - Merkezi TypeScript Şeması
 * 
 * Bu şema, satın alma talebi ve tedarikçi tekliflerini tanımlar.
 * Excel şablonu ile birebir uyumlu olacak şekilde tasarlandı.
 */

// Öncelik değerleri ve Türkçe çevirileri
export const PriorityEnum = z.enum(['price', 'date', 'quality'], {
  errorMap: () => ({ message: 'Öncelik: Fiyat, Tarih veya Kalite olmalı' })
});

export type Priority = z.infer<typeof PriorityEnum>;

// Para birimi enum
export const CurrencyEnum = z.enum(['TRY', 'USD', 'EUR', 'GBP'], {
  errorMap: () => ({ message: 'Para birimi: TRY, USD, EUR veya GBP olmalı' })
});

export type Currency = z.infer<typeof CurrencyEnum>;

// Ödeme şartları tipleri
export const PaymentTypeEnum = z.enum([
  'pesin_escrow',
  'pesin_teslim_onay',
  'pesin_on_odeme',
  'kredi_karti',
  'acik_hesap',
  'evrak_cek'
]);

export type PaymentType = z.infer<typeof PaymentTypeEnum>;

/**
 * Ödeme Şartları Detay Şeması
 */
export const PaymentTermsSchema = z.object({
  type: PaymentTypeEnum,
  // Peşin Escrow
  escrowDays: z.number().optional(),
  // Peşin Teslim&Onay
  deliveryConfirmDays: z.number().optional(),
  // Peşin Ön Ödeme
  advancePercent: z.number().min(0).max(100).optional(),
  // Kredi Kartı
  installments: z.number().min(1).optional(),
  financeRate: z.number().min(0).optional(),
  // Açık Hesap
  invoiceDate: z.string().optional(), // ISO date string
  dueDays: z.number().min(0).optional(),
  // Evrak/Çek
  checkCount: z.number().min(1).optional(),
  checkAmount: z.number().optional(),
  checkDays: z.array(z.number()).optional(), // Her çek için vade günleri
});

export type PaymentTerms = z.infer<typeof PaymentTermsSchema>;

/**
 * Ekler (Attachments)
 */
export const AttachmentSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  type: z.enum(['image', 'document', 'other']).optional(),
  uploadedAt: z.string().datetime().optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Teklif Satırı (Line Item)
 */
export const OfferLineSchema = z.object({
  // Temel bilgiler
  category: z.string().optional(),
  itemName: z.string().min(1, 'Ürün adı zorunludur'),
  spec: z.string().optional(),
  uom: z.string().min(1, 'Birim zorunludur'), // Unit of Measure (Birim)
  
  // Miktar ve fiyat
  quantity: z.number().positive('Miktar 0\'dan büyük olmalı'),
  unitPrice: z.number().min(0, 'Birim fiyat 0 veya pozitif olmalı'), // KDV hariç
  vatRate: z.number().min(0).max(100).default(18), // KDV oranı (%)
  
  // Tarih
  deliveryDate: z.string().optional(), // ISO date string
  
  // Ek bilgiler
  brand: z.string().optional(),
  notes: z.string().optional(),
  
  // Hesaplanan alanlar (derived)
  netUnitWithVat: z.number().optional(), // unitPrice * (1 + vatRate/100)
  totalExVat: z.number().optional(), // quantity * unitPrice
  totalWithVat: z.number().optional(), // quantity * netUnitWithVat
  
  // Talep ile karşılaştırma için
  demandQuantity: z.number().optional(),
  demandUnitPrice: z.number().optional(),
  demandDeliveryDate: z.string().optional(),
  demandUom: z.string().optional(),
});

export type OfferLine = z.infer<typeof OfferLineSchema>;

/**
 * Kur Bilgileri (Currency Exchange)
 */
export const CurrencyInfoSchema = z.object({
  fxCurrency: CurrencyEnum,
  fxRate: z.number().positive('Kur pozitif olmalı'),
  fxDate: z.string().datetime('Geçerli bir tarih olmalı'),
  source: z.string().optional(), // Kur kaynağı (TCMB, XE, vb.)
});

export type CurrencyInfo = z.infer<typeof CurrencyInfoSchema>;

/**
 * Teklif Başlık Bilgileri (Header)
 */
export const OfferHeaderSchema = z.object({
  satfkCode: z.string().min(1, 'SATFK kodu zorunludur'),
  title: z.string().min(1, 'Başlık zorunludur'),
  site: z.string().optional(), // Şantiye adı
  purchaseCity: z.string().optional(), // Alım yeri (İl)
  priority: PriorityEnum.optional(),
  dueDate: z.string().datetime().optional(), // ISO date string
  currency: CurrencyEnum.default('TRY'),
  paymentTerms: PaymentTermsSchema.optional(),
  isSealedBid: z.boolean().default(false), // Gizli teklif (tek tur)
  
  // Ek bilgiler
  validUntil: z.string().datetime().optional(), // Teklif geçerlilik tarihi
});

export type OfferHeader = z.infer<typeof OfferHeaderSchema>;

/**
 * Tam Teklif Şeması
 */
export const OfferSchema = z.object({
  // Başlık
  header: OfferHeaderSchema,
  
  // Satırlar
  lines: z.array(OfferLineSchema).min(1, 'En az 1 satır zorunludur'),
  
  // Ekler
  attachments: z.array(AttachmentSchema).optional().default([]),
  
  // Kur bilgileri (TRY dışı para birimi için)
  currencyInfo: CurrencyInfoSchema.optional(),
  
  // Geçerlilik
  validUntil: z.string().datetime().optional(),
  
  // Meta
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  status: z.enum(['draft', 'submitted', 'accepted', 'rejected']).default('draft'),
});

export type Offer = z.infer<typeof OfferSchema>;

/**
 * Talep verilerinden teklif oluşturma için yardımcı tip
 */
export interface DemandData {
  satfk?: string;
  title?: string;
  siteName?: string;
  purchaseLocation?: string;
  priority?: 'price' | 'speed' | 'quality';
  dueDate?: string | Date;
  currency?: string;
  paymentTerms?: any;
  biddingMode?: 'secret' | 'open' | 'hybrid';
  items?: Array<{
    name?: string;
    spec?: string;
    qty?: number;
    unit?: string;
    brand?: string;
    deliveryDate?: string;
    targetUnitPrice?: number;
  }>;
}

