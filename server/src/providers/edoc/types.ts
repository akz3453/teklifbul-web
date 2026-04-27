/**
 * E-Document Provider Types
 * Teklifbul Rule v1.0 - Provider-agnostic e-belge interface
 */

import type { InvoiceSnapshot, InvoiceEdoc } from '../../types/invoice.js';
import type { DeliveryNoteSnapshot, DeliveryNoteEdoc } from '../../types/deliveryNote.js';

/**
 * Taxpayer Query Result
 */
export interface TaxpayerQueryResult {
  isEFaturaUser: boolean;
  taxOffice?: string;
  title?: string;
}

/**
 * Invoice Send Result
 */
export interface InvoiceSendResult {
  externalId: string;
  uuid: string;
  ettn?: string;
  pdfUrl?: string;
}

/**
 * Invoice Status Result
 */
export interface InvoiceStatusResult {
  status: 'accepted' | 'rejected' | 'sent' | 'pending';
  ettn?: string;
  pdfUrl?: string;
  rejectionReason?: string;
}

/**
 * Invoice Cancel Result
 */
export interface InvoiceCancelResult {
  cancelled: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
}

/**
 * Invoice PDF Result
 */
export interface InvoicePdfResult {
  pdfUrl: string;
  pdfData?: Buffer; // Opsiyonel: binary data
}

/**
 * Despatch Send Result
 */
export interface DespatchSendResult {
  externalId: string;
  uuid: string;
  pdfUrl?: string;
}

/**
 * Despatch Status Result
 */
export interface DespatchStatusResult {
  status: 'accepted' | 'rejected' | 'sent' | 'pending';
  pdfUrl?: string;
  rejectionReason?: string;
}

/**
 * Despatch Cancel Result
 */
export interface DespatchCancelResult {
  cancelled: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
}

/**
 * Despatch PDF Result
 */
export interface DespatchPdfResult {
  pdfUrl: string;
  pdfData?: Buffer; // Opsiyonel: binary data
}

/**
 * Provider Credentials (generic)
 */
export interface EdocProviderCredentials {
  apiKey?: string;
  secret?: string;
  baseUrl?: string;
  [key: string]: any; // Provider'a göre değişebilir
}

/**
 * E-Document Provider Interface
 * Teklifbul Rule v1.0 - Tüm provider'lar bu interface'i implement eder
 */
export interface IEdocProvider {
  /**
   * Provider adı
   */
  readonly name: string;

  /**
   * Mükellef sorgulama (e-Fatura mükellefi mi?)
   */
  queryTaxpayer(taxNumber: string, credentials?: EdocProviderCredentials): Promise<TaxpayerQueryResult>;

  /**
   * Fatura gönder
   */
  sendInvoice(
    invoiceSnapshot: InvoiceSnapshot,
    invoiceEdoc: InvoiceEdoc,
    credentials?: EdocProviderCredentials
  ): Promise<InvoiceSendResult>;

  /**
   * Fatura durum sorgula
   */
  getInvoiceStatus(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<InvoiceStatusResult>;

  /**
   * Fatura iptal et
   */
  cancelInvoice(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<InvoiceCancelResult>;

  /**
   * Fatura PDF al
   */
  getInvoicePdf(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<InvoicePdfResult>;

  /**
   * İrsaliye gönder
   */
  sendDespatch(
    deliveryNoteSnapshot: DeliveryNoteSnapshot,
    deliveryNoteEdoc: DeliveryNoteEdoc,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchSendResult>;

  /**
   * İrsaliye durum sorgula
   */
  getDespatchStatus(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchStatusResult>;

  /**
   * İrsaliye iptal et
   */
  cancelDespatch(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchCancelResult>;

  /**
   * İrsaliye PDF al
   */
  getDespatchPdf(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchPdfResult>;

  /**
   * Gelen Faturaları Listele (Alım Faturaları)
   * Teklifbul Rule v1.0 - Stok entegrasyonu için
   */
  getIncomingInvoices(
    startDate: Date,
    endDate: Date,
    credentials?: EdocProviderCredentials
  ): Promise<IncomingInvoice[]>;
}

/**
 * Incoming Invoice (Alım Faturası)
 * Stok entegrasyonu için basitleştirilmiş yapı
 */
export interface IncomingInvoice {
  externalId: string; // Entegratör ID'si
  uuid: string; // GIB UUID
  ettn?: string;
  sender: {
    vkn: string;
    title: string;
  };
  issueDate: Date;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    vatRate: number;
    vatAmount: number;
    totalPrice: number;
  }>;
  totals: {
    subtotal: number;
    totalVat: number;
    totalAmount: number;
    currency: string;
  };
}

