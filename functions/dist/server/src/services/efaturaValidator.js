/**
 * E-Fatura Validator - Satış Modülü Faz 6
 * TR e-fatura zorunlu alanlar ve validasyon kuralları
 * Teklifbul Rule v1.0 - E-fatura standartları, VKN doğrulama, senaryo validasyonu
 */
import { logger } from '../../../src/shared/log/logger.js';
import { validateExchangeRate } from './exchangeRateService.js';
/**
 * E-Fatura verilerini doğrula
 * @param invoiceData - Fatura verisi
 * @returns Validasyon sonucu
 */
export function validateEInvoiceData(invoiceData) {
    const errors = [];
    const warnings = [];
    logger.group('E-Fatura Validasyonu');
    // 1. Zorunlu alanlar
    if (!invoiceData.invoiceNumber) {
        errors.push('Fatura numarası zorunludur');
    }
    if (!invoiceData.invoiceDate) {
        errors.push('Fatura tarihi zorunludur');
    }
    if (!invoiceData.customerName) {
        errors.push('Müşteri adı zorunludur');
    }
    // 2. VKN/TCKN doğrulama
    if (!invoiceData.customerVKN && !invoiceData.customerTCKN) {
        errors.push('Müşteri VKN veya TCKN zorunludur');
    }
    else {
        if (invoiceData.customerVKN && !validateVKN(invoiceData.customerVKN)) {
            errors.push('Geçersiz müşteri VKN');
        }
        if (invoiceData.customerTCKN && !validateTCKN(invoiceData.customerTCKN)) {
            errors.push('Geçersiz müşteri TCKN');
        }
    }
    // 3. Şirket VKN kontrolü
    if (!invoiceData.companyVKN) {
        warnings.push('Şirket VKN eksik (e-fatura gönderimi için gerekli olabilir)');
    }
    else if (!validateVKN(invoiceData.companyVKN)) {
        errors.push('Geçersiz şirket VKN');
    }
    // 4. Fatura kalemleri kontrolü
    if (!invoiceData.items || invoiceData.items.length === 0) {
        errors.push('En az 1 fatura kalemi zorunludur');
    }
    else {
        invoiceData.items.forEach((item, index) => {
            if (!item.name) {
                errors.push(`Kalem ${index + 1}: Ürün adı zorunludur`);
            }
            if (item.quantity <= 0) {
                errors.push(`Kalem ${index + 1}: Miktar 0'dan büyük olmalıdır`);
            }
            if (item.unitPrice < 0) {
                errors.push(`Kalem ${index + 1}: Birim fiyat negatif olamaz`);
            }
            if (item.vatRate < 0 || item.vatRate > 100) {
                errors.push(`Kalem ${index + 1}: KDV oranı 0-100 arasında olmalıdır`);
            }
        });
    }
    // 5. Döviz kuru kontrolü (TRY dışı para birimi için)
    if (invoiceData.currency !== 'TRY') {
        const rateValidation = validateExchangeRate(invoiceData.exchangeRate || null, invoiceData.currency, invoiceData.invoiceDate, invoiceData.exchangeRateDate);
        if (!rateValidation.valid) {
            errors.push(`Döviz kuru: ${rateValidation.error}`);
        }
    }
    // 6. Senaryo ve tip kontrolü
    if (invoiceData.scenario) {
        const validScenarios = [
            'BASIC',
            'RETURN',
            'EXPORT',
            'IMPORT',
            'SELF',
            'SAMPLE',
            'SALE',
            'PURCHASE'
        ];
        if (!validScenarios.includes(invoiceData.scenario)) {
            errors.push(`Geçersiz senaryo: ${invoiceData.scenario}`);
        }
    }
    if (invoiceData.type) {
        const validTypes = ['SATIS', 'IADE', 'ISTISNA', 'OZEL_MATRAH'];
        if (!validTypes.includes(invoiceData.type)) {
            errors.push(`Geçersiz tip: ${invoiceData.type}`);
        }
    }
    // 7. Adres kontrolü (uyarı)
    if (!invoiceData.customerAddress) {
        warnings.push('Müşteri adresi eksik (e-fatura için önerilir)');
    }
    logger.info('E-Fatura validasyon tamamlandı', {
        valid: errors.length === 0,
        errorCount: errors.length,
        warningCount: warnings.length
    });
    logger.end();
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * VKN doğrulama (10 haneli)
 * @param vkn - Vergi kimlik numarası
 * @returns Geçerli mi?
 */
export function validateVKN(vkn) {
    if (!vkn || typeof vkn !== 'string') {
        return false;
    }
    // 10 haneli olmalı
    if (vkn.length !== 10) {
        return false;
    }
    // Sadece rakam olmalı
    if (!/^\d+$/.test(vkn)) {
        return false;
    }
    // İlk hane 0 olamaz
    if (vkn[0] === '0') {
        return false;
    }
    // Checksum kontrolü (basit)
    // Not: Gerçek VKN algoritması daha karmaşık, burada basit kontrol yapıyoruz
    const digits = vkn.split('').map(Number);
    const sum = digits.slice(0, 9).reduce((acc, digit, index) => {
        const weight = (10 - index) % 10 || 10;
        return acc + digit * weight;
    }, 0);
    const checkDigit = (11 - (sum % 11)) % 10;
    return checkDigit === digits[9];
}
/**
 * TCKN doğrulama (11 haneli)
 * @param tckn - T.C. kimlik numarası
 * @returns Geçerli mi?
 */
export function validateTCKN(tckn) {
    if (!tckn || typeof tckn !== 'string') {
        return false;
    }
    // 11 haneli olmalı
    if (tckn.length !== 11) {
        return false;
    }
    // Sadece rakam olmalı
    if (!/^\d+$/.test(tckn)) {
        return false;
    }
    // İlk hane 0 olamaz
    if (tckn[0] === '0') {
        return false;
    }
    // Checksum kontrolü
    const digits = tckn.split('').map(Number);
    // 10. hane kontrolü
    const sum1 = digits.slice(0, 9).reduce((acc, digit, index) => {
        return acc + (index % 2 === 0 ? digit : 0);
    }, 0);
    const check1 = (sum1 * 7 - digits.slice(0, 9).reduce((acc, digit, index) => {
        return acc + (index % 2 === 1 ? digit : 0);
    }, 0)) % 10;
    if (check1 !== digits[9]) {
        return false;
    }
    // 11. hane kontrolü
    const sum2 = digits.slice(0, 10).reduce((acc, digit) => acc + digit, 0);
    const check2 = sum2 % 10;
    if (check2 !== digits[10]) {
        return false;
    }
    return true;
}
/**
 * Zorunlu alanları kontrol et
 * @param invoiceData - Fatura verisi
 * @returns Eksik alanlar listesi
 */
export function validateRequiredFields(invoiceData) {
    const missing = [];
    const requiredFields = [
        'invoiceNumber',
        'invoiceDate',
        'customerName',
        'items'
    ];
    requiredFields.forEach((field) => {
        if (!invoiceData[field]) {
            missing.push(field);
        }
    });
    // VKN veya TCKN zorunlu
    if (!invoiceData.customerVKN && !invoiceData.customerTCKN) {
        missing.push('customerVKN veya customerTCKN');
    }
    return missing;
}
