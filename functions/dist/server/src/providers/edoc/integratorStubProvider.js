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
    constructor(integratorKey) {
        super();
        this.integratorKey = integratorKey;
    }
    logStub(operation, detail) {
        logger.warn(`[edoc:${this.integratorKey}] Stub modu — gerçek entegratör API henüz bağlı değil`, {
            operation,
            ...detail,
        });
    }
    async queryTaxpayer(taxNumber, credentials) {
        this.logStub('queryTaxpayer', { taxNumber, hasCredentials: !!credentials?.apiKey });
        return super.queryTaxpayer(taxNumber, credentials);
    }
    async sendInvoice(invoiceSnapshot, invoiceEdoc, credentials) {
        this.logStub('sendInvoice', { hasCredentials: !!credentials?.baseUrl });
        return super.sendInvoice(invoiceSnapshot, invoiceEdoc, credentials);
    }
    async sendDespatch(deliveryNoteSnapshot, deliveryNoteEdoc, credentials) {
        this.logStub('sendDespatch', { hasCredentials: !!credentials?.baseUrl });
        return super.sendDespatch(deliveryNoteSnapshot, deliveryNoteEdoc, credentials);
    }
}
