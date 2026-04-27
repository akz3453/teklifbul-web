/**
 * Invoice Types - E-Belge Modülü
 * Teklifbul Rule v1.0 - Snapshot bazlı invoice type tanımları
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Invoice Status
 */
export type InvoiceStatus = 'draft' | 'ready' | 'sent' | 'accepted' | 'rejected' | 'cancelled';

/**
 * Invoice Type
 */
export type InvoiceType = 'e_fatura' | 'e_arsiv' | 'paper';

/**
 * Scenario Type
 */
export type ScenarioType = 'TEMEL' | 'TICARI';

/**
 * Seller Snapshot
 */
export interface SellerSnapshot {
  vkn: string;
  title: string;
  taxOffice?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    country: string; // default 'TR'
  };
}

/**
 * Buyer Snapshot
 */
export interface BuyerSnapshot {
  taxNumber?: string; // VKN/TCKN
  name?: string;
  title?: string;
  taxOffice?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    country: string; // default 'TR'
  };
  email?: string;
}

/**
 * Item Snapshot
 */
export interface ItemSnapshot {
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount?: number;
  discountAmount?: number;
  vatRate: number;
  vatAmount: number;
  totalPrice: number;
  totalWithVat: number;
  saleItemId?: string; // Sale item referansı
}

/**
 * Totals Snapshot
 */
export interface TotalsSnapshot {
  subtotal: number;
  totalDiscount?: number;
  totalVat: number;
  totalAmount: number;
  currency: string;
  exchangeRate?: number;
}

/**
 * Dates Snapshot
 */
export interface DatesSnapshot {
  issueDate: Timestamp;
  dueDate?: Timestamp;
  createdFromSaleAt: Timestamp | null;
}

/**
 * Invoice Snapshot
 */
export interface InvoiceSnapshot {
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  items: ItemSnapshot[];
  totals: TotalsSnapshot;
  dates: DatesSnapshot;
}

/**
 * E-Document Metadata
 */
export interface InvoiceEdoc {
  providerKey: string | null;
  externalId: string | null;
  uuid: string | null;
  ettn: string | null;
  sentAt: Timestamp | null;
  responseLogs?: any[];
  pdfUrl?: string | null;
}

/**
 * Invoice Document (Firestore)
 */
export interface Invoice {
  id: string;
  companyId: string;
  saleId: string | null; // direct fatura için null olabilir
  number: string; // INV-YYYY-XXX format
  status: InvoiceStatus;
  invoiceType: InvoiceType | null;
  scenario: ScenarioType | null;
  snapshot: InvoiceSnapshot;
  edoc: InvoiceEdoc;
  requestId: string | null; // Idempotency için
  origin?: 'sale' | 'direct';
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

