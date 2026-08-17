/**
 * Template Detector Service
 * Teklifbul Rule v1.0 - Standart Şablon Tanıma
 *
 * Excel dosyasının standart şablon olup olmadığını kontrol eder
 */
import ExcelJS from 'exceljs';
import { logger } from '../../src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Şablon imzası ve versiyon
const TEMPLATE_SIGNATURE = 'TEKLIFBUL_TEMPLATE_V1';
const TEMPLATE_VERSION = '1.0.0';
const MIN_TEMPLATE_CONFIDENCE = 0.95; // %95+ güven skoru
/**
 * Excel dosyasının standart şablon olup olmadığını kontrol et
 * Teklifbul Rule v1.0 - Şablon imzası kontrolü
 */
export async function detectTemplate(buffer) {
    logger.group('Template Detection');
    try {
        const workbook = new ExcelJS.Workbook();
        // Teklifbul Rule v1.0 - Type-safe Excel binary loading
        // Ensure buffer is a proper Buffer instance for ExcelJS
        const excelBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
        // Type assertion for ExcelJS compatibility
        await workbook.xlsx.load(excelBuffer);
        // 1. Custom properties kontrolü
        const customProps = workbook.properties?.customProperties || [];
        const signatureProp = customProps.find((p) => p.name === 'TemplateSignature');
        const versionProp = customProps.find((p) => p.name === 'TemplateVersion');
        if (signatureProp && signatureProp.value === TEMPLATE_SIGNATURE) {
            const version = versionProp?.value || 'unknown';
            logger.info('Template detected via signature', { signature: TEMPLATE_SIGNATURE, version });
            logger.end();
            return {
                isTemplate: true,
                confidence: MIN_TEMPLATE_CONFIDENCE,
                version,
                signature: TEMPLATE_SIGNATURE,
                reason: 'Template signature found in custom properties'
            };
        }
        // 2. Fallback: Sayfa yapısı kontrolü (opsiyonel)
        // Eğer custom properties yoksa, sayfa yapısına bak
        const sheets = workbook.worksheets;
        const hasInfoSheet = sheets.some(s => s.name === 'Talep Bilgileri');
        const hasItemsSheet = sheets.some(s => s.name === 'Kalemler');
        if (hasInfoSheet && hasItemsSheet) {
            // Sayfa yapısı eşleşiyor ama imza yok - düşük güven
            logger.info('Template-like structure found but no signature', { hasInfoSheet, hasItemsSheet });
            logger.end();
            return {
                isTemplate: false,
                confidence: 0.6, // Düşük güven - imza yok
                reason: 'Template-like structure but no signature found'
            };
        }
        logger.info('Not a template', { sheets: sheets.map(s => s.name) });
        logger.end();
        return {
            isTemplate: false,
            confidence: 0.0,
            reason: 'No template signature or matching structure found'
        };
    }
    catch (error) {
        logger.error('Template detection error', error);
        logger.end();
        return {
            isTemplate: false,
            confidence: 0.0,
            reason: `Detection error: ${error.message}`
        };
    }
}
/**
 * Versiyon kontrolü
 * Teklifbul Rule v1.0 - Şablon versiyon uyumluluğu
 */
export function checkVersionCompatibility(templateVersion) {
    const current = TEMPLATE_VERSION;
    // Basit versiyon kontrolü: Major versiyon aynı olmalı
    const currentMajor = current.split('.')[0];
    const templateMajor = templateVersion.split('.')[0];
    if (currentMajor === templateMajor) {
        return {
            compatible: true,
            currentVersion: current,
            templateVersion,
            reason: 'Major version match'
        };
    }
    return {
        compatible: false,
        currentVersion: current,
        templateVersion,
        reason: `Version mismatch: current ${current}, template ${templateVersion}`
    };
}
