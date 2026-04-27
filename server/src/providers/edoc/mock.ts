/**
 * Mock E-Document Provider
 * Teklifbul Rule v1.0 - Test için mock provider implementasyonu
 */

import type {
  IEdocProvider,
  TaxpayerQueryResult,
  InvoiceSendResult,
  InvoiceStatusResult,
  InvoiceCancelResult,
  InvoicePdfResult,
  DespatchSendResult,
  DespatchStatusResult,
  DespatchCancelResult,
  DespatchPdfResult,
  EdocProviderCredentials,
  IncomingInvoice
} from './types.js';
import type { InvoiceSnapshot, InvoiceEdoc } from '../../types/invoice.js';
import type { DeliveryNoteSnapshot, DeliveryNoteEdoc } from '../../types/deliveryNote.js';
import { logger } from '../../../../src/shared/log/logger.js';

/**
 * Mock Provider Implementation
 * Test ve geliştirme için basit mock provider
 */
export class MockEdocProvider implements IEdocProvider {
  readonly name = 'mock';

  /**
   * Mükellef sorgulama (mock: her zaman true döner)
   */
  async queryTaxpayer(taxNumber: string, credentials?: EdocProviderCredentials): Promise<TaxpayerQueryResult> {
    logger.info('Mock: queryTaxpayer', { taxNumber });

    // Mock: VKN/TCKN'a göre rastgele sonuç
    const isEFaturaUser = taxNumber.length === 10; // VKN ise true

    return {
      isEFaturaUser,
      taxOffice: isEFaturaUser ? 'Test Vergi Dairesi' : undefined,
      title: isEFaturaUser ? 'Test Firma Ünvanı' : undefined
    };
  }

  /**
   * Fatura gönder (mock: her zaman başarılı)
   */
  async sendInvoice(
    invoiceSnapshot: InvoiceSnapshot,
    invoiceEdoc: InvoiceEdoc,
    credentials?: EdocProviderCredentials
  ): Promise<InvoiceSendResult> {
    logger.info('Mock: sendInvoice', {
      invoiceNumber: invoiceSnapshot.dates.issueDate,
      buyerTaxNumber: invoiceSnapshot.buyer.taxNumber
    });

    // Mock: UUID ve externalId üret
    const uuid = `mock-uuid-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const externalId = `mock-ext-${Date.now()}`;
    const ettn = `mock-ettn-${Date.now()}`;

    // Mock: PDF URL (test için)
    const pdfUrl = `https://mock-provider.example.com/invoices/${externalId}/pdf`;

    return {
      externalId,
      uuid,
      ettn,
      pdfUrl
    };
  }

  /**
   * Fatura durum sorgula (mock: her zaman accepted)
   */
  async getInvoiceStatus(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<InvoiceStatusResult> {
    logger.info('Mock: getInvoiceStatus', { externalId });

    // Mock: Her zaman accepted döner
    return {
      status: 'accepted',
      ettn: `mock-ettn-${externalId}`,
      pdfUrl: `https://mock-provider.example.com/invoices/${externalId}/pdf`
    };
  }

  /**
   * Fatura iptal et (mock: her zaman başarılı)
   */
  async cancelInvoice(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<InvoiceCancelResult> {
    logger.info('Mock: cancelInvoice', { externalId });

    return {
      cancelled: true,
      cancelledAt: new Date(),
      cancellationReason: 'Mock iptal işlemi'
    };
  }

  /**
   * Fatura PDF al (mock: test PDF URL döner)
   */
  async getInvoicePdf(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<InvoicePdfResult> {
    logger.info('Mock: getInvoicePdf', { externalId });

    return {
      pdfUrl: `https://mock-provider.example.com/invoices/${externalId}/pdf`
    };
  }

  /**
   * İrsaliye gönder (mock: her zaman başarılı)
   */
  async sendDespatch(
    deliveryNoteSnapshot: DeliveryNoteSnapshot,
    deliveryNoteEdoc: DeliveryNoteEdoc,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchSendResult> {
    logger.info('Mock: sendDespatch', {
      shipDate: deliveryNoteSnapshot.shipment.shipDate,
      buyerTaxNumber: deliveryNoteSnapshot.buyer.taxNumber
    });

    // Mock: UUID ve externalId üret
    const uuid = `mock-despatch-uuid-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const externalId = `mock-despatch-ext-${Date.now()}`;

    // Mock: PDF URL (test için)
    const pdfUrl = `https://mock-provider.example.com/despatches/${externalId}/pdf`;

    return {
      externalId,
      uuid,
      pdfUrl
    };
  }

  /**
   * İrsaliye durum sorgula (mock: her zaman accepted)
   */
  async getDespatchStatus(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchStatusResult> {
    logger.info('Mock: getDespatchStatus', { externalId });

    // Mock: Her zaman accepted döner
    return {
      status: 'accepted',
      pdfUrl: `https://mock-provider.example.com/despatches/${externalId}/pdf`
    };
  }

  /**
   * İrsaliye iptal et (mock: her zaman başarılı)
   */
  async cancelDespatch(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchCancelResult> {
    logger.info('Mock: cancelDespatch', { externalId });

    return {
      cancelled: true,
      cancelledAt: new Date(),
      cancellationReason: 'Mock iptal işlemi'
    };
  }

  /**
   * İrsaliye PDF al (mock: test PDF URL döner)
   */
  async getDespatchPdf(
    externalId: string,
    credentials?: EdocProviderCredentials
  ): Promise<DespatchPdfResult> {
    logger.info('Mock: getDespatchPdf', { externalId });

    return {
      pdfUrl: `https://mock-provider.example.com/despatches/${externalId}/pdf`
    };
  }

  /**
   * Gelen Faturaları Listele (Mock)
   */
  async getIncomingInvoices(
    startDate: Date,
    endDate: Date,
    credentials?: EdocProviderCredentials
  ): Promise<IncomingInvoice[]> {
    logger.info('Mock: getIncomingInvoices', { startDate, endDate });

    // Mock veri üret
    const mockInvoices: IncomingInvoice[] = [
      {
        externalId: `mock-incoming-${Date.now()}-1`,
        uuid: `mock-uuid-${Date.now()}-1`,
        sender: {
          vkn: '1111111111',
          title: 'Mock Tedarikçi A.Ş.'
        },
        issueDate: new Date(), // Bugün
        items: [
          {
            name: 'Mock Ürün A (Otomatik Stok)',
            quantity: 10,
            unit: 'ADET',
            unitPrice: 100,
            vatRate: 18,
            vatAmount: 180,
            totalPrice: 1000
          },
          {
            name: 'Mock Ürün B (Otomatik Stok)',
            quantity: 5,
            unit: 'ADET',
            unitPrice: 200,
            vatRate: 18,
            vatAmount: 180,
            totalPrice: 1000
          }
        ],
        totals: {
          subtotal: 2000,
          totalVat: 360,
          totalAmount: 2360,
          currency: 'TRY'
        }
      }
    ];

    return mockInvoices;
  }
}

