/**
 * Entegratör stub provider — gerçek API bağlanana kadar mock davranışı
 * Teklifbul Rule v1.0
 */
import { MockEdocProvider } from './mock.js';
import { logger } from '../../../../src/shared/log/logger.js';

/**
 * Seçilen entegratör için geçici sağlayıcı (test / pilot).
 * Gerçek REST/SOAP adapter eklendiğinde bu sınıfın yerini alır.
 */
export class IntegratorStubProvider extends MockEdocProvider {
  constructor(private readonly integratorKey: string) {
    super();
  }

  private logStub(operation: string, detail?: Record<string, unknown>) {
    logger.warn(`[edoc:${this.integratorKey}] Stub modu — gerçek entegratör API henüz bağlı değil`, {
      operation,
      ...detail,
    });
  }

  override async queryTaxpayer(taxNumber: string, credentials?: Parameters<MockEdocProvider['queryTaxpayer']>[1]) {
    this.logStub('queryTaxpayer', { taxNumber, hasCredentials: !!credentials?.apiKey });
    return super.queryTaxpayer(taxNumber, credentials);
  }

  override async sendInvoice(
    invoiceSnapshot: Parameters<MockEdocProvider['sendInvoice']>[0],
    invoiceEdoc: Parameters<MockEdocProvider['sendInvoice']>[1],
    credentials?: Parameters<MockEdocProvider['sendInvoice']>[2]
  ) {
    this.logStub('sendInvoice', { hasCredentials: !!credentials?.baseUrl });
    return super.sendInvoice(invoiceSnapshot, invoiceEdoc, credentials);
  }

  override async sendDespatch(
    deliveryNoteSnapshot: Parameters<MockEdocProvider['sendDespatch']>[0],
    deliveryNoteEdoc: Parameters<MockEdocProvider['sendDespatch']>[1],
    credentials?: Parameters<MockEdocProvider['sendDespatch']>[2]
  ) {
    this.logStub('sendDespatch', { hasCredentials: !!credentials?.baseUrl });
    return super.sendDespatch(deliveryNoteSnapshot, deliveryNoteEdoc, credentials);
  }
}
