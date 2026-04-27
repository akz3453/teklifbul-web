/**
 * Excel Template Generator Service
 * Teklifbul Rule v1.0 - DRY, Production Hardening
 * 
 * Standart talep şablonu oluşturur (Excel formatında)
 */

import ExcelJS from 'exceljs';
import { logger } from '../../src/shared/log/logger.js';

// Teklifbul Rule v1.0 - Şablon imzası ve versiyon
const TEMPLATE_SIGNATURE = 'TEKLIFBUL_TEMPLATE_V1';
const TEMPLATE_VERSION = '1.2.2'; // v1.2.2: Talep Kodu kaldırıldı, Süre eklendi, Kategoriler dropdown oldu, Teklif sayfası kaldırıldı

/**
 * Talep şablonu oluştur
 * Teklifbul Rule v1.0 - ExcelJS ile workbook oluşturma
 * 
 * @returns ExcelJS Workbook buffer
 */
export async function generateDemandTemplate(): Promise<Buffer> {
  logger.group('Excel Şablon Oluşturma');
  
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Teklifbul';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Teklifbul Rule v1.0 - Şablon imzası ve versiyon ekle
    // Type assertion: ExcelJS TypeScript tiplerinde customProperties tanımlı değil ama runtime'da çalışıyor
    (workbook.properties as any).customProperties = [
        { name: 'TemplateSignature', value: TEMPLATE_SIGNATURE },
        { name: 'TemplateVersion', value: TEMPLATE_VERSION },
        { name: 'TemplateType', value: 'Demand' }
    ];
    
  // Sayfa 1: Talep Bilgileri (Talep Detayı Excel formatında)
    const infoSheet = workbook.addWorksheet('Talep Bilgileri');
    setupInfoSheet(infoSheet);
    
    // Sayfa 2: Kalemler
    const itemsSheet = workbook.addWorksheet('Kalemler');
    setupItemsSheet(itemsSheet);
  
  // Teklifbul Rule v1.2.2 - Teklif sayfası kaldırıldı (sadece talep oluşturma şablonu)
    
    // Hidden sheet: Şablon metadata (opsiyonel - ExcelJS custom properties yeterli)
    // Not: Custom properties daha güvenli ve gizli
    
    // Buffer'a yaz
    const buffer = await workbook.xlsx.writeBuffer();
    logger.info('Şablon oluşturuldu', { 
      size: buffer.byteLength,
      signature: TEMPLATE_SIGNATURE,
      version: TEMPLATE_VERSION
    });
    logger.end();
    
    return Buffer.from(buffer);
  } catch (error: any) {
    logger.error('Şablon oluşturma hatası', error);
    logger.end();
    throw error;
  }
}

/**
 * Özelleştirilmiş talep şablonu oluştur
 * Teklifbul Rule v1.0 - Kullanıcı seçimine göre alanları içeren şablon
 * 
 * @param demandFields - Seçilen talep bilgileri alanları
 * @param itemFields - Seçilen kalem alanları
 * @returns ExcelJS Workbook buffer
 */
export async function generateCustomDemandTemplate(
  demandFields: Array<{ key: string; label: string; required: boolean }>,
  itemFields: Array<{ key: string; label: string; required: boolean }>
): Promise<Buffer> {
  logger.group('Özelleştirilmiş Excel Şablon Oluşturma');
  
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Teklifbul';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Teklifbul Rule v1.0 - Şablon imzası ve versiyon ekle
    (workbook.properties as any).customProperties = [
        { name: 'TemplateSignature', value: TEMPLATE_SIGNATURE },
        { name: 'TemplateVersion', value: TEMPLATE_VERSION },
        { name: 'TemplateType', value: 'DemandCustom' }
    ];
    
    // Sayfa 1: Talep Bilgileri (Özelleştirilmiş)
    const infoSheet = workbook.addWorksheet('Talep Bilgileri');
    setupCustomInfoSheet(infoSheet, demandFields);
    
    // Sayfa 2: Kalemler (Özelleştirilmiş)
    const itemsSheet = workbook.addWorksheet('Kalemler');
    setupCustomItemsSheet(itemsSheet, itemFields);
    
    // Buffer'a yaz
    const buffer = await workbook.xlsx.writeBuffer();
    logger.info('Özelleştirilmiş şablon oluşturuldu', { 
      size: buffer.byteLength,
      signature: TEMPLATE_SIGNATURE,
      version: TEMPLATE_VERSION,
      demandFieldsCount: demandFields.length,
      itemFieldsCount: itemFields.length
    });
    logger.end();
    
    return Buffer.from(buffer);
  } catch (error: any) {
    logger.error('Özelleştirilmiş şablon oluşturma hatası', error);
    logger.end();
    throw error;
  }
}

/**
 * Talep Bilgileri sayfasını yapılandır
 * Teklifbul Rule v1.2.1 - A-D sütunları, dropdown'lar, layout düzenlemesi
 */
function setupInfoSheet(sheet: ExcelJS.Worksheet) {
  // Stil yardımcı fonksiyonları
  const applyCellStyle = (cell: ExcelJS.Cell, options: any) => {
    if (options.font) cell.font = options.font;
    if (options.fill) cell.fill = options.fill;
    if (options.border) cell.border = options.border;
    if (options.alignment) cell.alignment = options.alignment;
  };
  
  // Stil tanımları
  const styles = {
    mainHeader: {
      font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      border: {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'center' }
    },
    label: {
      font: { bold: true, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'medium' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    },
    data: {
      font: { size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    }
  };
  
  // Sütun genişlikleri ayarla - Teklifbul Rule v1.2.1 - Sadece A-D sütunları
  sheet.getColumn(1).width = 30;   // A: Etiketler (uzun başlıklar için)
  sheet.getColumn(2).width = 15;   // B: Değerler başlangıcı
  sheet.getColumn(3).width = 15;   // C: Değerler devamı
  sheet.getColumn(4).width = 15;   // D: Değerler sonu
  
  let currentRow = 1;
  
  // 1. Ana başlık: TALEP FORMU (A1:D1 birleştir ve ortala)
  sheet.getCell(currentRow, 1).value = 'TALEP FORMU';
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  applyCellStyle(sheet.getCell(currentRow, 1), styles.mainHeader);
  sheet.getRow(currentRow).height = 30;
  currentRow++;
  
  // 2. Bölüm başlığı: Satın Alma Talep Formu Bilgileri (A2:D2 birleştir ve ortala) - Boş satır yok
  sheet.getCell(currentRow, 1).value = 'Satın Alma Talep Formu Bilgileri';
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  applyCellStyle(sheet.getCell(currentRow, 1), styles.mainHeader);
  sheet.getRow(currentRow).height = 25;
  currentRow++;
  
  // 3. Talep detayları - A sütunu başlıklar, B-C-D birleştirilmiş değer alanı
  // Teklifbul Rule v1.2.2 - Talep Kodu kaldırıldı, Süre eklendi, Kategoriler dropdown oldu, Başlık eklendi
  const demandDetails = [
    { label: 'Satın Alma Talep Formu Kodu (SATFK):', value: '', validation: null, isLongText: false, customHeight: 30.75 },
    { label: 'Başlık *:', value: '', validation: null, isLongText: false },
    { label: 'Şantiye:', value: '', validation: null, isLongText: false },
    { label: 'Talep Oluşturma Tarihi:', value: '', validation: 'date', isLongText: false },
    { label: 'Termin:', value: '15.11.2025', validation: 'date', isLongText: false },
    { label: 'Talep Eden Şirket Adı:', value: '', validation: null, isLongText: false },
    { label: 'Teslimat Adresi:', value: '', validation: null, isLongText: true, customHeight: 49.5 },
    { label: 'Teslim Şekli *:', value: '', validation: 'deliveryMethod', isLongText: false },
    { label: 'Fatura Adresi:', value: '', validation: null, isLongText: true, customHeight: 60.75 },
    { label: 'Alım Yeri (İl):', value: '', validation: null, isLongText: false },
    { label: 'Para Birimi *:', value: 'TRY', validation: 'currency', isLongText: false },
    { label: 'Ödeme Şartları:', value: '', validation: 'paymentTerms', isLongText: false },
    { label: 'Talep Tipi:', value: '', validation: 'biddingMode', isLongText: false },
    { label: 'Süre:', value: '', validation: 'duration', isLongText: false },
    { label: 'Öncelik *:', value: '', validation: 'priority', isLongText: false },
    { label: 'Onaylayan:', value: '', validation: null, isLongText: false },
    { label: 'Satınalma Sorumlusu:', value: '', validation: null, isLongText: true },
    { label: 'Genel Müdür:', value: '', validation: null, isLongText: false },
    { label: 'Kategoriler:', value: '', validation: 'categories', isLongText: false }
  ];
  
  // Talep detaylarını yaz
  demandDetails.forEach((item, index) => {
    const row = currentRow + index;
    
    // A sütunu: Etiket
    sheet.getCell(row, 1).value = item.label;
    applyCellStyle(sheet.getCell(row, 1), styles.label);
    
    // B-C-D sütunları: Birleştirilmiş değer alanı
    sheet.mergeCells(row, 2, row, 4);
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = item.value;
    applyCellStyle(valueCell, styles.data);
    
    // Teklifbul Rule v1.2.1 - Tarih alanlarını metin formatına ayarla
    if (item.validation === 'date') {
      valueCell.numFmt = '@'; // Metin formatı
      if (item.value) {
        const currentFont = valueCell.font || {};
        valueCell.font = { ...currentFont, italic: true, color: { argb: 'FF808080' } };
      }
    }
    
    // Teklifbul Rule v1.2.1 - Dropdown validasyonları ekle
    if (item.validation) {
      addDataValidationToInfoSheet(sheet, `B${row}`, item.validation);
    }
    
    // Uzun metinler için satır yüksekliği ayarla
    if (item.customHeight) {
      sheet.getRow(row).height = item.customHeight; // Özel yükseklik (SATFK için 30.75, Teslimat Adresi için 49.5, Fatura Adresi için 60.75)
      if (item.isLongText) {
        valueCell.alignment = { ...valueCell.alignment, vertical: 'top' };
      }
    } else if (item.isLongText) {
      sheet.getRow(row).height = 40; // Uzun metinler için daha yüksek
      valueCell.alignment = { ...valueCell.alignment, vertical: 'top' };
    } else {
      sheet.getRow(row).height = 25;
    }
  });
  
  currentRow += demandDetails.length;
  
  // Not
  const noteRow = currentRow + 1;
  sheet.getCell(noteRow, 1).value = 'Not: * işaretli alanlar zorunludur. Lütfen tüm alanları doldurunuz. Satın Alma Talep Formu Kodu (SATFK) otomatik oluşturulacaktır.';
  sheet.mergeCells(noteRow, 1, noteRow, 4);
  sheet.getCell(noteRow, 1).font = { italic: true, size: 10, color: { argb: 'FF808080' } };
  sheet.getRow(noteRow).height = 20;
}

/**
 * Özelleştirilmiş Talep Bilgileri sayfasını yapılandır
 * Teklifbul Rule v1.0 - Seçilen alanlara göre şablon oluşturma
 */
function setupCustomInfoSheet(sheet: ExcelJS.Worksheet, enabledFields: Array<{ key: string; label: string; required: boolean }>) {
  // Stil yardımcı fonksiyonları
  const applyCellStyle = (cell: ExcelJS.Cell, options: any) => {
    if (options.font) cell.font = options.font;
    if (options.fill) cell.fill = options.fill;
    if (options.border) cell.border = options.border;
    if (options.alignment) cell.alignment = options.alignment;
  };
  
  // Stil tanımları
  const styles = {
    mainHeader: {
      font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      border: {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'center' }
    },
    label: {
      font: { bold: true, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'medium' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    },
    data: {
      font: { size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    }
  };
  
  // Sütun genişlikleri ayarla
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 15;
  
  let currentRow = 1;
  
  // Ana başlık
  sheet.getCell(currentRow, 1).value = 'TALEP FORMU';
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  applyCellStyle(sheet.getCell(currentRow, 1), styles.mainHeader);
  sheet.getRow(currentRow).height = 30;
  currentRow++;
  
  // Bölüm başlığı
  sheet.getCell(currentRow, 1).value = 'Satın Alma Talep Formu Bilgileri';
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  applyCellStyle(sheet.getCell(currentRow, 1), styles.mainHeader);
  sheet.getRow(currentRow).height = 25;
  currentRow++;
  
  // Alan mapping - key'den label ve validation'a dönüşüm
  const fieldMapping: Record<string, { label: string; validation: string | null; isLongText: boolean; customHeight?: number }> = {
    satfk: { label: 'Satın Alma Talep Formu Kodu (SATFK):', validation: null, isLongText: false, customHeight: 30.75 },
    title: { label: 'Başlık *:', validation: null, isLongText: false },
    siteName: { label: 'Şantiye:', validation: null, isLongText: false },
    demandDate: { label: 'Talep Oluşturma Tarihi:', validation: 'date', isLongText: false },
    dueDate: { label: 'Termin:', validation: 'date', isLongText: false },
    requester: { label: 'Talep Eden Şirket Adı:', validation: null, isLongText: false },
    deliveryAddress: { label: 'Teslimat Adresi:', validation: null, isLongText: true, customHeight: 49.5 },
    deliveryMethod: { label: 'Teslim Şekli *:', validation: 'deliveryMethod', isLongText: false },
    invoiceAddress: { label: 'Fatura Adresi:', validation: null, isLongText: true, customHeight: 60.75 },
    purchaseLocation: { label: 'Alım Yeri (İl):', validation: null, isLongText: false },
    currency: { label: 'Para Birimi *:', validation: 'currency', isLongText: false },
    paymentTerms: { label: 'Ödeme Şartları:', validation: 'paymentTerms', isLongText: false },
    biddingMode: { label: 'Talep Tipi:', validation: 'biddingMode', isLongText: false },
    duration: { label: 'Süre:', validation: 'duration', isLongText: false },
    priority: { label: 'Öncelik *:', validation: 'priority', isLongText: false },
    approver: { label: 'Onaylayan:', validation: null, isLongText: false },
    purchasingManager: { label: 'Satınalma Sorumlusu:', validation: null, isLongText: true },
    generalManager: { label: 'Genel Müdür:', validation: null, isLongText: false },
    categories: { label: 'Kategoriler:', validation: 'categories', isLongText: false }
  };
  
  // Seçilen alanları yaz
  enabledFields.forEach((field, index) => {
    const row = currentRow + index;
    const mapping = fieldMapping[field.key];
    
    if (!mapping) return; // Bilinmeyen alan, atla
    
    // A sütunu: Etiket
    sheet.getCell(row, 1).value = mapping.label;
    applyCellStyle(sheet.getCell(row, 1), styles.label);
    
    // B-C-D sütunları: Birleştirilmiş değer alanı
    sheet.mergeCells(row, 2, row, 4);
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = '';
    applyCellStyle(valueCell, styles.data);
    
    // Tarih alanları için metin formatı
    if (mapping.validation === 'date') {
      valueCell.numFmt = '@';
    }
    
    // Dropdown validasyonları
    if (mapping.validation) {
      addDataValidationToInfoSheet(sheet, `B${row}`, mapping.validation);
    }
    
    // Satır yüksekliği
    if (mapping.customHeight) {
      sheet.getRow(row).height = mapping.customHeight;
      if (mapping.isLongText) {
        valueCell.alignment = { ...valueCell.alignment, vertical: 'top' };
      }
    } else if (mapping.isLongText) {
      sheet.getRow(row).height = 40;
      valueCell.alignment = { ...valueCell.alignment, vertical: 'top' };
    } else {
      sheet.getRow(row).height = 25;
    }
  });
  
  currentRow += enabledFields.length;
  
  // Not
  const noteRow = currentRow + 1;
  sheet.getCell(noteRow, 1).value = 'Not: * işaretli alanlar zorunludur. Lütfen tüm alanları doldurunuz. Satın Alma Talep Formu Kodu (SATFK) otomatik oluşturulacaktır.';
  sheet.mergeCells(noteRow, 1, noteRow, 4);
  sheet.getCell(noteRow, 1).font = { italic: true, size: 10, color: { argb: 'FF808080' } };
  sheet.getRow(noteRow).height = 20;
}

/**
 * Talep Bilgileri sayfası için data validation ekle
 * Teklifbul Rule v1.2.1 - Dropdown'lar için
 */
function addDataValidationToInfoSheet(sheet: ExcelJS.Worksheet, cellAddress: string, validationType: string) {
  let validation: any = null;
  
  switch (validationType) {
    case 'deliveryMethod':
      // Teslim Şekli dropdown
      validation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"🚚 Nakliye Dahil,📦 Nakliye Hariç,✏️ Özel Teslimat"']
      };
      break;
      
    case 'biddingMode':
      // Talep Tipi dropdown
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Gizli Teklif (tek tur),Açık Teklif (tek tur),Hibrit (1. tur gizli, 2. tur açık)"']
      };
      break;
      
    case 'currency':
      // Para Birimi dropdown
      validation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"TRY,USD,EUR"']
      };
      break;
      
    case 'paymentTerms':
      // Ödeme Şartları dropdown
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Peşin (Escrow),Peşin (Teslim & Onay),Peşin (Ön Ödeme),Kredi Kartı,Açık Hesap,Evrak (çek/senet)"']
      };
      break;
      
    case 'priority':
      // Öncelik dropdown
      validation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Fiyat,Hız,Kalite"']
      };
      break;
      
    case 'duration':
      // Süre dropdown - Teklifbul Rule v1.2.2
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Süreli (Başlangıç ve Bitiş Tarihi Belirle)"']
      };
      break;
      
    case 'categories':
      // Kategoriler dropdown - Teklifbul Rule v1.2.2
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"İnşaat & Yapı (3),Elektrik & Elektronik (5),Makine & İmalat (5),Kimya & Plastik (3),Güvenlik & Sağlık (3),Temizlik & Bakım (1),Hizmetler & Diğer (5),Hepsi"']
      };
      break;
  }
  
  if (validation) {
    // Type assertion: ExcelJS TypeScript tiplerinde dataValidations tanımlı değil ama runtime'da çalışıyor
    (sheet as any).dataValidations.add(cellAddress, validation);
  }
}

/**
 * Data validation ekle
 * Teklifbul Rule v1.0 - Dropdown listeleri için
 */
function addDataValidation(sheet: ExcelJS.Worksheet, cellAddress: string, validationType: string) {
  let validation: any = null;
  
  switch (validationType) {
    case 'priority':
      validation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Fiyat,Hız,Kalite"']
      };
      break;
      
    case 'currency':
      validation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"TRY,USD,EUR"']
      };
      break;
      
    case 'biddingMode':
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Gizli Teklif (tek tur),Açık Teklif (tek tur),Hibrit (1. tur gizli, 2. tur açık)"']
      };
      break;
      
    case 'deliveryMethod':
      validation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Nakliye Dahil,Nakliye Hariç,Özel Teslimat"']
      };
      break;
      
    case 'paymentTerms':
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Peşin (Escrow),Peşin (Teslim & Onay),Peşin (Ön Ödeme),Kredi Kartı,Açık Hesap,Evrak (çek/senet)"']
      };
      break;
      
    case 'categories':
      // Kategoriler için basit liste (gerçek kategoriler API'den alınabilir ama şablon için örnek)
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"İnşaat Malzemeleri,Elektrik,Elektronik,Sac/Metal,Makine-İmalat,Hırdavat,Ambalaj,Kimyasal,Mobilya,Boya,Plastik,Otomotiv Yan Sanayi,İş Güvenliği,Temizlik,Gıda,Hizmet,Lojistik"']
      };
      break;
  }
  
  if (validation) {
    // Type assertion: ExcelJS TypeScript tiplerinde dataValidations tanımlı değil ama runtime'da çalışıyor
    (sheet as any).dataValidations.add(cellAddress, validation);
  }
}

/**
 * Kalemler sayfasını yapılandır
 * Teklifbul Rule v1.2.0 - Yeni sütun başlıkları ve format
 */
function setupItemsSheet(sheet: ExcelJS.Worksheet) {
  // Başlık
  sheet.getCell('A1').value = 'KALEMLER';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1E3A8A' } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells('A1:I1'); // 9 sütun: Sıra No, Stok Kodu, Malzeme Tanımı, Marka/Model, Miktar, Birim, Depodaki Miktar, Hedef Fiyat, İstenilen Teslim Tarihi
  sheet.getRow(1).height = 30;
  // Başlık hücresine kenarlık ekle
  sheet.getCell('A1').border = {
    top: { style: 'medium' },
    bottom: { style: 'medium' },
    left: { style: 'medium' },
    right: { style: 'medium' }
  };
  
  // Başlık satırı - Teklifbul Rule v1.2.1 - Boş satır kaldırıldı, direkt A2'de başlıklar
  const headers = [
    'Sıra No',
    'Stok Kodu',
    'Malzeme Tanımı *',
    'Marka/Model',
    'Miktar *',
    'Birim *',
    'Depodaki Miktar',
    'Hedef Fiyat (TL)',
    'İstenilen Teslim Tarihi'
  ];
  
  headers.forEach((header, index) => {
    const cell = sheet.getCell(2, index + 1); // A2'den başlıyor (boş satır yok)
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // Örnek satırlar (3 satır) - Teklifbul Rule v1.2.0 - Yeni format
  const exampleRows = [
    {
      sku: 'CIMENTO-001',
      itemName: 'Çimento 32.5',
      brandModel: 'Örnek Marka / CEM I 32.5 R',
      qty: 100,
      unit: 'KG',
      stockQty: 50,
      targetPrice: 15.50,
      deliveryDate: '15.11.2025'
    },
    {
      sku: 'DEMIR-001',
      itemName: 'Demir 8mm',
      brandModel: 'Örnek Marka 2 / D8',
      qty: 500,
      unit: 'ADET',
      stockQty: 200,
      targetPrice: 25.00,
      deliveryDate: '20.11.2025'
    },
    {
      sku: 'KUM-001',
      itemName: 'Kum 0-5mm',
      brandModel: '',
      qty: 10,
      unit: 'M3',
      stockQty: 0,
      targetPrice: 120.00,
      deliveryDate: '25.11.2025'
    }
  ];
  
  exampleRows.forEach((example, rowIndex) => {
    const row = 3 + rowIndex; // A3'ten başlıyor (A1 başlık, A2 header satırı)
    
    // Sıra No
    const cell1 = sheet.getCell(row, 1);
    cell1.value = rowIndex + 1;
    cell1.alignment = { horizontal: 'center' };
    cell1.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Stok Kodu
    const cell2 = sheet.getCell(row, 2);
    cell2.value = example.sku;
    cell2.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Malzeme Tanımı *
    const cell3 = sheet.getCell(row, 3);
    cell3.value = example.itemName;
    cell3.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Marka/Model (birleştirilmiş)
    const cell4 = sheet.getCell(row, 4);
    cell4.value = example.brandModel;
    cell4.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Miktar *
    const cell5 = sheet.getCell(row, 5);
    cell5.value = example.qty;
    cell5.numFmt = '#,##0';
    cell5.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Birim *
    const cell6 = sheet.getCell(row, 6);
    cell6.value = example.unit;
    cell6.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Depodaki Miktar
    const cell7 = sheet.getCell(row, 7);
    cell7.value = example.stockQty;
    cell7.numFmt = '#,##0';
    cell7.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Hedef Fiyat (TL)
    const cell8 = sheet.getCell(row, 8);
    cell8.value = example.targetPrice;
    cell8.numFmt = '#,##0.00';
    cell8.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // İstenilen Teslim Tarihi (metin formatı - Excel'in otomatik dönüştürmesini engelle)
    const dateCell = sheet.getCell(row, 9);
    dateCell.value = example.deliveryDate;
    dateCell.numFmt = '@'; // Metin formatı
    dateCell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Zorunlu alanlar için arka plan rengi (Malzeme Tanımı, Miktar, Birim)
    [3, 5, 6].forEach(col => {
      sheet.getCell(row, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF9E6' }
      };
    });
  });
  
  // Data validation: Birim - Teklifbul Rule v1.2.1 - Sütun 6 (Birim), A3'ten başlıyor
  const unitValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"ADET,KG,M3,M2,LT,MT,PAKET"']
    };
  sheet.getColumn(6).eachCell((cell, rowNumber) => {
    if (rowNumber >= 3) { // A3'ten başlıyor (A1 başlık, A2 header)
      // Type assertion: ExcelJS TypeScript tiplerinde dataValidations tanımlı değil ama runtime'da çalışıyor
      (sheet as any).dataValidations.add(cell.address, unitValidation);
    }
  });
  
  // Sütun genişlikleri - Teklifbul Rule v1.2.0 - Yeni sütun yapısı
  sheet.getColumn(1).width = 10;  // Sıra No
  sheet.getColumn(2).width = 15; // Stok Kodu
  sheet.getColumn(3).width = 35; // Malzeme Tanımı
  sheet.getColumn(4).width = 25; // Marka/Model
  sheet.getColumn(5).width = 12; // Miktar
  sheet.getColumn(6).width = 12; // Birim
  sheet.getColumn(7).width = 15; // Depodaki Miktar
  sheet.getColumn(8).width = 18; // Hedef Fiyat (TL)
  sheet.getColumn(9).width = 20; // İstenilen Teslim Tarihi
  
  // Başlık satırı yüksekliği
  sheet.getRow(3).height = 40;
  
  // Not
  const noteRow = 3 + exampleRows.length + 1; // A3'ten başladığı için +1
  sheet.getCell(`A${noteRow}`).value = 'Not: * işaretli sütunlar zorunludur. Örnek satırları silip kendi kalemlerinizi ekleyebilirsiniz. Ürün görsellerini siteden yükleyebilirsiniz.';
  sheet.getCell(`A${noteRow}`).font = { italic: true, size: 10, color: { argb: 'FF808080' } };
  sheet.mergeCells(`A${noteRow}:I${noteRow}`); // Teklifbul Rule v1.2.1 - 9 sütun
  // Not satırına kenarlık ekle
  for (let col = 1; col <= 9; col++) {
    sheet.getCell(noteRow, col).border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  }
}

/**
 * Özelleştirilmiş Kalemler sayfasını yapılandır
 * Teklifbul Rule v1.0 - Seçilen alanlara göre şablon oluşturma
 */
function setupCustomItemsSheet(sheet: ExcelJS.Worksheet, enabledFields: Array<{ key: string; label: string; required: boolean }>) {
  // Başlık
  sheet.getCell('A1').value = 'KALEMLER';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1E3A8A' } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  const lastCol = enabledFields.length;
  sheet.mergeCells(1, 1, 1, lastCol);
  sheet.getRow(1).height = 30;
  sheet.getCell('A1').border = {
    top: { style: 'medium' },
    bottom: { style: 'medium' },
    left: { style: 'medium' },
    right: { style: 'medium' }
  };
  
  // Başlık satırı
  const headerMapping: Record<string, string> = {
    rowNo: 'Sıra No',
    sku: 'Stok Kodu',
    itemName: 'Malzeme Tanımı *',
    brandModel: 'Marka/Model',
    qty: 'Miktar *',
    unit: 'Birim *',
    stockQty: 'Depodaki Miktar',
    targetPrice: 'Hedef Fiyat (TL)',
    itemDueDate: 'İstenilen Teslim Tarihi'
  };
  
  enabledFields.forEach((field, index) => {
    const cell = sheet.getCell(2, index + 1);
    const headerText = headerMapping[field.key] || field.label;
    cell.value = headerText;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // Örnek satırlar (3 satır)
  const exampleData: Record<string, any> = {
    rowNo: [1, 2, 3],
    sku: ['CIMENTO-001', 'DEMIR-001', 'KUM-001'],
    itemName: ['Çimento 32.5', 'Demir 8mm', 'Kum 0-5mm'],
    brandModel: ['Örnek Marka / CEM I 32.5 R', 'Örnek Marka 2 / D8', ''],
    qty: [100, 500, 10],
    unit: ['KG', 'ADET', 'M3'],
    stockQty: [50, 200, 0],
    targetPrice: [15.50, 25.00, 120.00],
    itemDueDate: ['15.11.2025', '20.11.2025', '25.11.2025']
  };
  
  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    const row = 3 + rowIndex;
    
    enabledFields.forEach((field, colIndex) => {
      const cell = sheet.getCell(row, colIndex + 1);
      const value = exampleData[field.key]?.[rowIndex] ?? '';
      
      // Değer atama
      if (field.key === 'rowNo') {
        cell.value = rowIndex + 1;
        cell.alignment = { horizontal: 'center' };
      } else if (field.key === 'qty' || field.key === 'stockQty') {
        cell.value = value;
        cell.numFmt = '#,##0';
      } else if (field.key === 'targetPrice') {
        cell.value = value;
        cell.numFmt = '#,##0.00';
      } else if (field.key === 'itemDueDate') {
        cell.value = value;
        cell.numFmt = '@'; // Metin formatı
      } else {
        cell.value = value;
      }
      
      // Stil
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      // Zorunlu alanlar için arka plan rengi
      if (field.required) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF9E6' }
        };
      }
    });
  }
  
  // Data validation: Birim
  const unitColIndex = enabledFields.findIndex(f => f.key === 'unit');
  if (unitColIndex >= 0) {
    const unitValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"ADET,KG,M3,M2,LT,MT,PAKET"']
    };
    sheet.getColumn(unitColIndex + 1).eachCell((cell, rowNumber) => {
      if (rowNumber >= 3) {
        (sheet as any).dataValidations.add(cell.address, unitValidation);
      }
    });
  }
  
  // Sütun genişlikleri
  const widthMapping: Record<string, number> = {
    rowNo: 10,
    sku: 15,
    itemName: 35,
    brandModel: 25,
    qty: 12,
    unit: 12,
    stockQty: 15,
    targetPrice: 18,
    itemDueDate: 20
  };
  
  enabledFields.forEach((field, index) => {
    const width = widthMapping[field.key] || 15;
    sheet.getColumn(index + 1).width = width;
  });
  
  // Başlık satırı yüksekliği
  sheet.getRow(2).height = 40;
  
  // Not
  const noteRow = 6;
  const noteText = 'Not: * işaretli sütunlar zorunludur. Örnek satırları silip kendi kalemlerinizi ekleyebilirsiniz. Ürün görsellerini siteden yükleyebilirsiniz.';
  sheet.getCell(`A${noteRow}`).value = noteText;
  sheet.getCell(`A${noteRow}`).font = { italic: true, size: 10, color: { argb: 'FF808080' } };
  sheet.mergeCells(noteRow, 1, noteRow, lastCol);
  
  // Not satırına kenarlık ekle
  for (let col = 1; col <= lastCol; col++) {
    sheet.getCell(noteRow, col).border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  }
}

/**
 * Teklif sayfasını yapılandır
 * Teklifbul Rule v1.2.0 - Teklif veren tedarikçinin gireceği başlıklar
 */
function setupBidSheet(sheet: ExcelJS.Worksheet) {
  // Stil yardımcı fonksiyonları
  const applyCellStyle = (cell: ExcelJS.Cell, options: any) => {
    if (options.font) cell.font = options.font;
    if (options.fill) cell.fill = options.fill;
    if (options.border) cell.border = options.border;
    if (options.alignment) cell.alignment = options.alignment;
  };
  
  // Stil tanımları
  const styles = {
    mainHeader: {
      font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      border: {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'center' }
    },
    sectionHeader: {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      border: {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'center' }
    },
    tableHeader: {
      font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      border: {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
    },
    label: {
      font: { bold: true, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'medium' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    },
    data: {
      font: { size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    },
    productRow: {
      font: { size: 10 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      },
      alignment: { vertical: 'middle' }
    },
    totalRow: {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } },
      border: {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      },
      alignment: { vertical: 'middle' }
    }
  };
  
  // Sütun genişlikleri ayarla (A-N arası) - demand-detail.html ile uyumlu (14 sütun)
  sheet.getColumn(1).width = 25;   // A: SATFK
  sheet.getColumn(2).width = 20;    // B: Talep Oluşturma Tarihi
  sheet.getColumn(3).width = 30;    // C: Talep Eden Şirket Adı
  sheet.getColumn(4).width = 15;    // D: Para Birimi
  sheet.getColumn(5).width = 18;    // E: Geçerlilik Süresi
  sheet.getColumn(6).width = 20;    // F: Teslim Şekli/Modu
  sheet.getColumn(7).width = 25;    // G: Teslimat Adresi (birleştirilmiş)
  sheet.getColumn(8).width = 25;    // H: Teslimat Adresi (birleştirilmiş)
  sheet.getColumn(9).width = 25;    // I: Fatura Adresi (birleştirilmiş)
  sheet.getColumn(10).width = 25;   // J: Fatura Adresi (birleştirilmiş)
  sheet.getColumn(11).width = 18;   // K: Şantiye
  sheet.getColumn(12).width = 18;   // L: Garanti Süresi
  sheet.getColumn(13).width = 18;   // M: Ödeme Planı
  sheet.getColumn(14).width = 30;   // N: Ödeme Planı Detayı
  
  let currentRow = 1;
  
  // 1. Ana başlık: TEKLİF FORMU (A1:N1 birleştir) - demand-detail.html ile uyumlu
  sheet.getCell(currentRow, 1).value = 'TEKLİF FORMU';
  sheet.mergeCells(currentRow, 1, currentRow, 14); // 14 sütun (demand-detail.html ile uyumlu)
  applyCellStyle(sheet.getCell(currentRow, 1), styles.mainHeader);
  sheet.getRow(currentRow).height = 30;
  currentRow++;
  
  // 2. Satır 2: Label'lar (demand-detail.html ile uyumlu)
  // Teklifbul Rule v1.2.5 - A4 yatay yazdırma için kompakt bilgi alanı: Satır 2-3
  sheet.getCell(2, 1).value = 'Satın Alma Talep Formu Kodu (SATFK):';
  applyCellStyle(sheet.getCell(2, 1), styles.label);
  sheet.getCell(2, 2).value = 'Talep Oluşturma Tarihi:';
  applyCellStyle(sheet.getCell(2, 2), styles.label);
  sheet.getCell(2, 3).value = 'Talep Eden Şirket Adı:';
  applyCellStyle(sheet.getCell(2, 3), styles.label);
  sheet.getCell(2, 4).value = 'Para Birimi:';
  applyCellStyle(sheet.getCell(2, 4), styles.label);
  sheet.getCell(2, 5).value = 'Geçerlilik Süresi:';
  applyCellStyle(sheet.getCell(2, 5), styles.label);
  sheet.getCell(2, 6).value = 'Teslim Şekli/Modu:';
  applyCellStyle(sheet.getCell(2, 6), styles.label);
  
  // Teslimat Adresi: G2-H2 birleştir
  sheet.mergeCells(2, 7, 2, 8);
  sheet.getCell(2, 7).value = 'Teslimat Adresi:';
  applyCellStyle(sheet.getCell(2, 7), styles.label);
  sheet.getCell(2, 7).alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Fatura Adresi: I2-J2 birleştir
  sheet.mergeCells(2, 9, 2, 10);
  sheet.getCell(2, 9).value = 'Fatura Adresi:';
  applyCellStyle(sheet.getCell(2, 9), styles.label);
  sheet.getCell(2, 9).alignment = { vertical: 'middle', horizontal: 'center' };
  
  sheet.getCell(2, 11).value = 'Şantiye:';
  applyCellStyle(sheet.getCell(2, 11), styles.label);
  sheet.getCell(2, 12).value = 'Garanti Süresi:';
  applyCellStyle(sheet.getCell(2, 12), styles.label);
  sheet.getCell(2, 13).value = 'Ödeme Planı:';
  applyCellStyle(sheet.getCell(2, 13), styles.label);
  
  // N2: Ödeme Planı Detayı label'ı
  sheet.getCell(2, 14).value = 'Ödeme Planı Detayı:';
  applyCellStyle(sheet.getCell(2, 14), styles.label);
  
  sheet.getRow(2).height = 54.75; // Başlıklar için yüksek satır
  
  // 3. Satır 3: Değerler (demand-detail.html ile uyumlu)
  sheet.getCell(3, 1).value = ''; // SATFK (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 1), styles.data);
  sheet.getCell(3, 2).value = ''; // Talep Oluşturma Tarihi (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 2), styles.data);
  sheet.getCell(3, 3).value = ''; // Talep Eden Şirket Adı (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 3), styles.data);
  sheet.getCell(3, 4).value = ''; // Para Birimi (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 4), styles.data);
  sheet.getCell(3, 5).value = ''; // Geçerlilik Süresi (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 5), styles.data);
  sheet.getCell(3, 6).value = ''; // Teslim Şekli/Modu (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 6), styles.data);
  
  // Teslimat Adresi değeri: G-H sütunları birleştir
  sheet.mergeCells(3, 7, 3, 8);
  sheet.getCell(3, 7).value = '';
  applyCellStyle(sheet.getCell(3, 7), styles.data);
  sheet.getCell(3, 7).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
  
  // Fatura Adresi değeri: I-J sütunları birleştir
  sheet.mergeCells(3, 9, 3, 10);
  sheet.getCell(3, 9).value = '';
  applyCellStyle(sheet.getCell(3, 9), styles.data);
  sheet.getCell(3, 9).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
  
  sheet.getCell(3, 11).value = ''; // Şantiye (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 11), styles.data);
  sheet.getCell(3, 12).value = ''; // Garanti Süresi (kullanıcı dolduracak)
  applyCellStyle(sheet.getCell(3, 12), styles.data);
  
  // M3: Ödeme Planı dropdown (13. sütun, 3. satır) - boş başlangıç
  sheet.getCell(3, 13).value = ''; // Ödeme Planı (kullanıcı seçecek)
  applyCellStyle(sheet.getCell(3, 13), styles.data);
  
  // N3: Ödeme planı detayları (14. sütun, 3. satır) - formül ile dinamik
  const paymentDetailFormula = `IF(M3="Peşin","Peşin Alt Model"&CHAR(10)&"(a) Escrow"&CHAR(10)&"(b) Teslim & Onay"&CHAR(10)&"(c) Ön Ödeme",IF(M3="Kredi Kartı","Taksit Sayısı: [Doldurun]"&CHAR(10)&"Vade Farkı: [Doldurun]",IF(M3="Açık Hesap","Fatura Tarihi: [Doldurun]"&CHAR(10)&"Vade: [Doldurun] gün",IF(M3="Evrak (çek/senet)","Tutar: [Doldurun] ₺"&CHAR(10)&"Vade: [Doldurun] gün"&CHAR(10)&"Tarih: [Doldurun]",""))))`;
  sheet.getCell(3, 14).value = { formula: paymentDetailFormula };
  applyCellStyle(sheet.getCell(3, 14), styles.data);
  sheet.getCell(3, 14).alignment = { 
    vertical: 'top', 
    horizontal: 'left', 
    wrapText: true 
  };
  
  sheet.getRow(3).height = 81; // 3. satır yüksekliği 81
  
  currentRow = 4;
  
  // Boş satır
  currentRow++;
  
  // 4. Ürün kalemleri başlığı: ÜRÜN KALEMLERİ TEKLİFİ
  sheet.getCell(currentRow, 1).value = 'ÜRÜN KALEMLERİ TEKLİFİ';
  sheet.mergeCells(currentRow, 1, currentRow, 14); // 14 sütun (demand-detail.html ile uyumlu)
  applyCellStyle(sheet.getCell(currentRow, 1), styles.sectionHeader);
  sheet.getRow(currentRow).height = 25;
  currentRow++;
  
  // Boş satır
  currentRow++;
  
  // 5. Ürün tablosu başlık satırı
  const productTableHeaderRow = currentRow;
  const headerLabels = [
    'Sıra No', 'Ürün Kodu', 'Ürün Adı/Tanım', 'Teklif Tanımı', 'Miktar', 'Birim',
    'Birim Fiyat (KDV Hariç)', 'İskonto %1', 'İskonto %2', 'İskonto %3', 'İskonto %4', 'İskonto %5',
    'KDV (%)', 'Teslim Tarihi', 'Para Birimi', 'Kalite/Sertifika', 'Görsel URL', 'Ek Açıklama',
    'KDV Hariç Toplam', 'KDV Dahil Toplam'
  ];
  headerLabels.forEach((label, idx) => {
    sheet.getCell(currentRow, idx + 1).value = label;
    applyCellStyle(sheet.getCell(currentRow, idx + 1), styles.tableHeader);
  });
  sheet.getRow(currentRow).height = 40;
  currentRow++;
  
  // 6. Örnek ürün satırları (3 satır - boş, kullanıcı dolduracak)
  const firstProductRow = currentRow;
  for (let idx = 0; idx < 3; idx++) {
    const row = currentRow;
    
    // Ürün verilerini yaz (boş - kullanıcı dolduracak)
    sheet.getCell(row, 1).value = idx + 1;              // A: Sıra No
    sheet.getCell(row, 2).value = '';                    // B: Ürün Kodu
    sheet.getCell(row, 3).value = '';                    // C: Ürün Adı/Tanım
    sheet.getCell(row, 4).value = '';                    // D: Teklif Tanımı
    sheet.getCell(row, 5).value = '';                   // E: Miktar
    sheet.getCell(row, 6).value = '';                    // F: Birim
    sheet.getCell(row, 7).value = '';                    // G: Birim Fiyat (KDV Hariç)
    sheet.getCell(row, 8).value = '';                    // H: İskonto %1
    sheet.getCell(row, 9).value = '';                   // I: İskonto %2
    sheet.getCell(row, 10).value = '';                   // J: İskonto %3
    sheet.getCell(row, 11).value = '';                   // K: İskonto %4
    sheet.getCell(row, 12).value = '';                   // L: İskonto %5
    sheet.getCell(row, 13).value = '';                   // M: KDV (%)
    sheet.getCell(row, 14).value = '';                   // N: Teslim Tarihi
    sheet.getCell(row, 15).value = '';                   // O: Para Birimi
    sheet.getCell(row, 16).value = '';                   // P: Kalite/Sertifika
    sheet.getCell(row, 17).value = '';                   // Q: Görsel URL
    sheet.getCell(row, 18).value = '';                   // R: Ek Açıklama
    
    // S: KDV Hariç Toplam (OTOMATIK HESAPLANIR)
    const iskontoFormula = `IF(AND(E${row}<>"",G${row}<>""),E${row}*G${row}*IF(H${row}<>"",1-H${row}/100,1)*IF(I${row}<>"",1-I${row}/100,1)*IF(J${row}<>"",1-J${row}/100,1)*IF(K${row}<>"",1-K${row}/100,1)*IF(L${row}<>"",1-L${row}/100,1),"")`;
    sheet.getCell(row, 19).value = { formula: iskontoFormula };
    
    // T: KDV Dahil Toplam (OTOMATIK HESAPLANIR)
    const kdvFormula = `IF(AND(S${row}<>"",M${row}<>""),S${row}*(1+M${row}/100),"")`;
    sheet.getCell(row, 20).value = { formula: kdvFormula };
    
    // Stil uygula
    for (let col = 1; col <= 20; col++) {
      const cell = sheet.getCell(row, col);
      const alignment: any = { vertical: 'middle', wrapText: true };
      if ([1, 5, 6, 8, 9, 10, 11, 12, 13].includes(col)) {
        alignment.horizontal = 'center';
      } else if ([19, 20].includes(col)) {
        alignment.horizontal = 'right';
      } else {
        alignment.horizontal = 'left';
      }
      applyCellStyle(cell, { ...styles.productRow, alignment });
    }
    
    sheet.getRow(row).height = 20;
    currentRow++;
  }
  
  const lastProductRow = currentRow - 1;
  
  // 7. KDV TOPLAM SATIRLARI
  // Boş satır
  currentRow++;
  
  // KDV Hariç Toplam satırı
  const totalExclVatRow = currentRow;
  sheet.getCell(currentRow, 18).value = 'KDV Hariç Toplam:';
  sheet.getCell(currentRow, 19).value = { formula: `SUM(S${firstProductRow}:S${lastProductRow})` };
  applyCellStyle(sheet.getCell(currentRow, 18), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
  applyCellStyle(sheet.getCell(currentRow, 19), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
  sheet.getRow(currentRow).height = 30;
  currentRow++;
  
  // KDV Dahil Toplam satırı
  const totalInclVatRow = currentRow;
  sheet.getCell(currentRow, 18).value = 'KDV Dahil Toplam:';
  sheet.getCell(currentRow, 20).value = { formula: `SUM(T${firstProductRow}:T${lastProductRow})` };
  applyCellStyle(sheet.getCell(currentRow, 18), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
  applyCellStyle(sheet.getCell(currentRow, 20), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
  for (let col = 1; col <= 20; col++) {
    if (![18, 19, 20].includes(col)) {
      applyCellStyle(sheet.getCell(currentRow, col), styles.totalRow);
    }
  }
  sheet.getRow(currentRow).height = 30;
  currentRow++;
  
  // Not
  const noteRow = currentRow + 1;
  sheet.getCell(noteRow, 1).value = 'Not: Lütfen tüm alanları doldurunuz. KDV Hariç Toplam ve KDV Dahil Toplam otomatik hesaplanacaktır.';
  sheet.mergeCells(noteRow, 1, noteRow, 20);
  sheet.getCell(noteRow, 1).font = { italic: true, size: 10, color: { argb: 'FF808080' } };
  sheet.getRow(noteRow).height = 20;
  
  // Data validation: Para Birimi (D3 - 4. sütun, 3. satır)
  const currencyValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"TRY,USD,EUR"']
  };
  (sheet as any).dataValidations.add('D3', currencyValidation);
  
  // Data validation: Teslim Şekli/Modu (F3 - 6. sütun, 3. satır)
  const shippingValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"Nakliye Hariç,Nakliye Dahil,Özel/Anlaşmaya Göre"']
  };
  (sheet as any).dataValidations.add('F3', shippingValidation);
  
  // Ödeme Planı alanları - Teklifbul Rule v1.2.8
  // Şablon dosyasında M3, N2, N3 formatı kullanılıyor (demand-detail.html ile uyumlu)
  // M3: Ödeme Planı dropdown (13. sütun, 3. satır)
  // N2: Ödeme planı başlığı label (14. sütun, 2. satır) - zaten yukarıda eklendi
  // N3: Ödeme planı detayları (14. sütun, 3. satır) - zaten yukarıda formül ile eklendi
  
  // M3: Ödeme Planı dropdown (13. sütun, 3. satır) - demand-detail.html ile uyumlu
  const paymentOptions = ['Peşin', 'Kredi Kartı', 'Açık Hesap', 'Evrak (çek/senet)'];
  const paymentValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`"${paymentOptions.join(',')}"`],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Geçersiz Seçim',
    error: 'Lütfen geçerli bir ödeme planı seçin'
  };
  // M3'e dropdown ekle (13. sütun, 3. satır)
  (sheet as any).dataValidations.add('M3', paymentValidation);
  
  // C sütunundaki eski Ödeme Planı dropdown'ını kaldır (artık M3'te)
  // C8'deki dropdown'ı kaldırmak için dataValidation'ı temizle
  try {
    const oldValidation = (sheet as any).dataValidations.get('C8');
    if (oldValidation) {
      (sheet as any).dataValidations.remove('C8');
    }
  } catch (e) {
    // Validation yoksa hata verme
  }
  
  // Data validation: KDV % (M sütunu - tüm ürün satırları)
  const vatValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"0,1,8,10,18,20"']
  };
  for (let row = firstProductRow; row <= lastProductRow; row++) {
    (sheet as any).dataValidations.add(`M${row}`, vatValidation);
  }
}

