/**
 * Full Excel Bid Form Generator
 * This is a direct port of the frontend exportSatfkBtn Excel generation logic
 * Matches demand-detail.html exportSatfkExcel exactly
 */
import ExcelJS from 'exceljs';
import { DocumentData } from 'firebase-admin/firestore';

// Style definitions (matching frontend exactly)
const styles = {
    mainHeader: {
        font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
        border: {
            top: { style: 'medium' as const },
            left: { style: 'medium' as const },
            bottom: { style: 'medium' as const },
            right: { style: 'medium' as const }
        },
        alignment: { vertical: 'middle' as const, horizontal: 'center' as const }
    },
    sectionHeader: {
        font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
        border: {
            top: { style: 'medium' as const },
            left: { style: 'medium' as const },
            bottom: { style: 'medium' as const },
            right: { style: 'medium' as const }
        },
        alignment: { vertical: 'middle' as const, horizontal: 'center' as const }
    },
    tableHeader: {
        font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } },
        border: {
            top: { style: 'medium' as const },
            left: { style: 'medium' as const },
            bottom: { style: 'medium' as const },
            right: { style: 'medium' as const }
        },
        alignment: { vertical: 'middle' as const, horizontal: 'center' as const, wrapText: true }
    },
    label: {
        font: { bold: true, size: 11 },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD3D3D3' } },
        border: {
            top: { style: 'thin' as const },
            left: { style: 'medium' as const },
            bottom: { style: 'thin' as const },
            right: { style: 'thin' as const }
        },
        alignment: { vertical: 'middle' as const, horizontal: 'left' as const, wrapText: true }
    },
    data: {
        font: { size: 11 },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } },
        border: {
            top: { style: 'thin' as const },
            left: { style: 'thin' as const },
            bottom: { style: 'thin' as const },
            right: { style: 'thin' as const }
        },
        alignment: { vertical: 'middle' as const, horizontal: 'left' as const, wrapText: true }
    },
    productRow: {
        font: { size: 10 },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } },
        border: {
            top: { style: 'thin' as const },
            left: { style: 'thin' as const },
            bottom: { style: 'thin' as const },
            right: { style: 'thin' as const }
        },
        alignment: { vertical: 'middle' as const }
    },
    totalRow: {
        font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF059669' } },
        border: {
            top: { style: 'medium' as const },
            left: { style: 'medium' as const },
            bottom: { style: 'medium' as const },
            right: { style: 'medium' as const }
        },
        alignment: { vertical: 'middle' as const }
    }
};

// Apply cell style helper
function applyCellStyle(cell: ExcelJS.Cell, options: Record<string, unknown>): void {
    if (!cell || !options) return;
    if (options.font) cell.font = options.font as Partial<ExcelJS.Font>;
    if (options.fill) cell.fill = options.fill as ExcelJS.Fill;
    if (options.border) cell.border = options.border as Partial<ExcelJS.Borders>;
    if (options.alignment) cell.alignment = options.alignment as Partial<ExcelJS.Alignment>;
}

// Format date helper
function fmtDate(date: unknown): string {
    if (!date) return '';
    try {
        // Firestore Timestamp
        if (date && typeof date === 'object' && 'toDate' in date && typeof (date as { toDate: () => Date }).toDate === 'function') {
            return (date as { toDate: () => Date }).toDate().toLocaleDateString('tr-TR');
        }
        // Date object
        if (date instanceof Date) {
            return date.toLocaleDateString('tr-TR');
        }
        // String
        if (typeof date === 'string') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed.toLocaleDateString('tr-TR');
            }
            return date;
        }
        // Timestamp with seconds
        if (typeof date === 'object' && 'seconds' in date) {
            const ts = date as { seconds: number; nanoseconds?: number };
            const dateObj = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000);
            return dateObj.toLocaleDateString('tr-TR');
        }
    } catch {
        return '';
    }
    return '';
}

// Delivery method label helper
function getDeliveryMethodLabel(method: string): string {
    const labels: Record<string, string> = {
        'ex_works': 'EXW - Ex Works (Fabrikadan Teslim)',
        'fob': 'FOB - Free On Board',
        'cif': 'CIF - Cost Insurance Freight',
        'dap': 'DAP - Delivered At Place',
        'ddp': 'DDP - Delivered Duty Paid'
    };
    return labels[method] || method || '';
}

// Priority text helper
function getPriorityText(priority: string): string {
    const priorities: Record<string, string> = {
        'low': 'Düşük',
        'normal': 'Normal',
        'high': 'Yüksek',
        'urgent': 'Acil'
    };
    return priorities[priority] || priority || '';
}

// Bidding mode text helper
function getBiddingModeText(mode: string): string {
    const modes: Record<string, string> = {
        'open': 'Açık Teklif',
        'sealed': 'Kapalı Teklif',
        'reverse_auction': 'Ters Açık Artırma'
    };
    return modes[mode] || mode || '';
}

/**
 * Generate full Excel bid form matching frontend exportSatfkBtn exactly
 */
export async function generateFullBidFormExcel(
    demandData: DocumentData,
    items: DocumentData[],
    formattedInvoiceAddress?: string
): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nefisoft';
    workbook.created = new Date();

    // ====================
    // SHEET 1: Talep Bilgileri
    // ====================
    const worksheet1 = workbook.addWorksheet('Talep Bilgileri');

    // Column widths
    worksheet1.getColumn(1).width = 30;
    worksheet1.getColumn(2).width = 15;
    worksheet1.getColumn(3).width = 15;
    worksheet1.getColumn(4).width = 15;

    let currentRow = 1;

    // Main header
    worksheet1.getCell(currentRow, 1).value = 'TALEP FORMU';
    worksheet1.mergeCells(currentRow, 1, currentRow, 4);
    applyCellStyle(worksheet1.getCell(currentRow, 1), styles.mainHeader);
    worksheet1.getRow(currentRow).height = 30;
    currentRow++;

    // Section header
    worksheet1.getCell(currentRow, 1).value = 'Satın Alma Talep Formu Bilgileri';
    worksheet1.mergeCells(currentRow, 1, currentRow, 4);
    applyCellStyle(worksheet1.getCell(currentRow, 1), styles.mainHeader);
    worksheet1.getRow(currentRow).height = 25;
    currentRow++;

    // Demand details
    const demandDetails = [
        { label: 'Satın Alma Talep Formu Kodu (SATFK):', value: demandData.satfk || demandData.talep_kodu || demandData.demandCode || '', customHeight: 30.75 },
        { label: 'Başlık *:', value: demandData.title || '' },
        { label: 'Şantiye:', value: demandData.siteName || demandData.santiye || '' },
        { label: 'Talep Oluşturma Tarihi:', value: fmtDate(demandData.demandDate || demandData.createdAt) },
        { label: 'Termin:', value: fmtDate(demandData.dueDate || demandData.termin_tarihi) },
        { label: 'Talep Eden Şirket Adı:', value: demandData.creatorCompanyName || '' },
        { label: 'Teslimat Adresi:', value: demandData.deliveryAddress || demandData.deliveryLocation || '', isLongText: true, customHeight: 49.5 },
        { label: 'Teslim Şekli *:', value: getDeliveryMethodLabel(demandData.deliveryMethod || '') },
        { label: 'Fatura Adresi:', value: formattedInvoiceAddress || '', isLongText: true, customHeight: 60.75 },
        { label: 'Alım Yeri (İl):', value: demandData.purchaseLocation || '' },
        { label: 'Para Birimi *:', value: demandData.currency || 'TRY' },
        { label: 'Ödeme Şartları:', value: demandData.paymentTerms || '' },
        { label: 'Talep Tipi:', value: getBiddingModeText(demandData.biddingMode) || '' },
        { label: 'Süre:', value: demandData.duration || '' },
        { label: 'Öncelik *:', value: getPriorityText(demandData.priority) || '' },
        { label: 'Onaylayan:', value: demandData.approver || '' },
        { label: 'Satınalma Sorumlusu:', value: demandData.purchaseManager || '', isLongText: true },
        { label: 'Genel Müdür:', value: demandData.generalManager || '' },
        { label: 'Kategoriler:', value: (demandData.categoryTags || []).join(', ') || '' }
    ];

    demandDetails.forEach((item) => {
        worksheet1.getCell(currentRow, 1).value = item.label;
        applyCellStyle(worksheet1.getCell(currentRow, 1), styles.label);

        worksheet1.mergeCells(currentRow, 2, currentRow, 4);
        const valueCell = worksheet1.getCell(currentRow, 2);
        valueCell.value = item.value || '';
        applyCellStyle(valueCell, styles.data);

        if (item.customHeight) {
            worksheet1.getRow(currentRow).height = item.customHeight;
            if (item.isLongText) {
                valueCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
            }
        } else if (item.isLongText) {
            worksheet1.getRow(currentRow).height = 40;
            valueCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        } else {
            worksheet1.getRow(currentRow).height = 25;
        }
        currentRow++;
    });

    // Note row
    const noteRow = currentRow + 1;
    worksheet1.getCell(noteRow, 1).value = 'Not: * işaretli alanlar zorunludur. Lütfen tüm alanları doldurunuz.';
    worksheet1.mergeCells(noteRow, 1, noteRow, 4);
    worksheet1.getCell(noteRow, 1).font = { italic: true, size: 10, color: { argb: 'FF808080' } };
    worksheet1.getRow(noteRow).height = 20;

    // ====================
    // SHEET 2: Kalemler
    // ====================
    const worksheetItems = workbook.addWorksheet('Kalemler');

    // Column widths - 8 columns
    worksheetItems.getColumn(1).width = 10;  // Sıra No
    worksheetItems.getColumn(2).width = 15;  // Stok Kodu
    worksheetItems.getColumn(3).width = 35;  // Malzeme Tanımı
    worksheetItems.getColumn(4).width = 25;  // Marka/Model
    worksheetItems.getColumn(5).width = 12;  // Miktar
    worksheetItems.getColumn(6).width = 12;  // Birim
    worksheetItems.getColumn(7).width = 18;  // Hedef Fiyat
    worksheetItems.getColumn(8).width = 20;  // İstenilen Teslim Tarihi

    let currentRowItems = 1;

    // Header
    worksheetItems.getCell(currentRowItems, 1).value = 'KALEMLER';
    worksheetItems.mergeCells(currentRowItems, 1, currentRowItems, 8);
    applyCellStyle(worksheetItems.getCell(currentRowItems, 1), styles.mainHeader);
    worksheetItems.getRow(currentRowItems).height = 30;
    currentRowItems++;

    // Table headers
    const headerLabels = ['Sıra No', 'Stok Kodu', 'Malzeme Tanımı *', 'Marka/Model', 'Miktar *', 'Birim *', 'Hedef Fiyat (TL)', 'İstenilen Teslim Tarihi'];
    headerLabels.forEach((label, idx) => {
        const cell = worksheetItems.getCell(currentRowItems, idx + 1);
        cell.value = label;
        applyCellStyle(cell, styles.tableHeader);
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    worksheetItems.getRow(currentRowItems).height = 30;
    currentRowItems++;

    // Item rows
    items.forEach((item, idx) => {
        const lineNo = item.lineNo || item.no || (idx + 1);
        const qty = item.qty || item.quantity || item.amount || 0;
        const unit = item.unit || 'Adet';
        const name = item.name || item.description || '';
        const sku = item.sku || item.materialCode || item.stockCode || '';
        const brandModel = item.brandModel || item.brand || '';
        const targetPrice = item.targetPrice || item.hedefFiyat || '';
        const deliveryDate = fmtDate(item.itemDueDate || item.req_date || item.deliveryDate || demandData.dueDate);

        worksheetItems.getCell(currentRowItems, 1).value = lineNo;
        worksheetItems.getCell(currentRowItems, 2).value = sku;
        worksheetItems.getCell(currentRowItems, 3).value = name;
        worksheetItems.getCell(currentRowItems, 4).value = brandModel;
        worksheetItems.getCell(currentRowItems, 5).value = qty;
        worksheetItems.getCell(currentRowItems, 6).value = unit;
        worksheetItems.getCell(currentRowItems, 7).value = targetPrice;

        const dateCell = worksheetItems.getCell(currentRowItems, 8);
        dateCell.value = deliveryDate;
        dateCell.numFmt = '@'; // Text format

        // Apply styles
        for (let col = 1; col <= 8; col++) {
            const cell = worksheetItems.getCell(currentRowItems, col);
            const alignment: Partial<ExcelJS.Alignment> = { vertical: 'middle', wrapText: true };
            if ([1, 5, 6].includes(col)) {
                alignment.horizontal = 'center';
            } else if (col === 7) {
                alignment.horizontal = 'right';
            } else {
                alignment.horizontal = 'left';
            }
            applyCellStyle(cell, { ...styles.productRow, alignment });
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        }

        // Highlight mandatory fields
        [3, 5, 6].forEach(col => {
            worksheetItems.getCell(currentRowItems, col).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF9E6' }
            };
        });

        worksheetItems.getRow(currentRowItems).height = 20;
        currentRowItems++;
    });

    // ====================
    // SHEET 3: Teklif
    // ====================
    const worksheet2 = workbook.addWorksheet('Teklif');

    // Column widths - 14 columns
    worksheet2.getColumn(1).width = 8;    // Sıra No
    worksheet2.getColumn(2).width = 12;   // Stok Kodu
    worksheet2.getColumn(3).width = 25;   // Malzeme Tanımı
    worksheet2.getColumn(4).width = 18;   // Marka/Model
    worksheet2.getColumn(5).width = 20;   // Teklif Tanımı
    worksheet2.getColumn(6).width = 10;   // Miktar
    worksheet2.getColumn(7).width = 10;   // Birim
    worksheet2.getColumn(8).width = 15;   // Birim Fiyat (KDV Hariç)
    worksheet2.getColumn(9).width = 15.75;  // İskonto (%)
    worksheet2.getColumn(10).width = 15.75; // KDV (%)
    worksheet2.getColumn(11).width = 15;  // Teslim Tarihi
    worksheet2.getColumn(12).width = 25;  // Ek Açıklama
    worksheet2.getColumn(13).width = 18;  // KDV Hariç Toplam
    worksheet2.getColumn(14).width = 18;  // KDV Dahil Toplam

    let currentRow2 = 1;

    // Main header
    worksheet2.getCell(currentRow2, 1).value = 'TEKLİF FORMU';
    worksheet2.mergeCells(currentRow2, 1, currentRow2, 14);
    applyCellStyle(worksheet2.getCell(currentRow2, 1), styles.mainHeader);
    worksheet2.getRow(currentRow2).height = 30;
    currentRow2++;

    // Info row 2: Labels
    worksheet2.getCell(2, 1).value = 'Satın Alma Talep Formu Kodu (SATFK):';
    applyCellStyle(worksheet2.getCell(2, 1), styles.label);
    worksheet2.getCell(2, 2).value = 'Talep Oluşturma Tarihi:';
    applyCellStyle(worksheet2.getCell(2, 2), styles.label);
    worksheet2.getCell(2, 3).value = 'Talep Eden Şirket Adı:';
    applyCellStyle(worksheet2.getCell(2, 3), styles.label);
    worksheet2.getCell(2, 4).value = 'Para Birimi:';
    applyCellStyle(worksheet2.getCell(2, 4), styles.label);
    worksheet2.getCell(2, 5).value = 'Geçerlilik Süresi:';
    applyCellStyle(worksheet2.getCell(2, 5), styles.label);
    worksheet2.getCell(2, 6).value = 'Teslim Şekli/Modu:';
    applyCellStyle(worksheet2.getCell(2, 6), styles.label);

    // Teslimat Adresi: G2-H2 merge
    worksheet2.mergeCells(2, 7, 2, 8);
    worksheet2.getCell(2, 7).value = 'Teslimat Adresi:';
    applyCellStyle(worksheet2.getCell(2, 7), styles.label);
    worksheet2.getCell(2, 7).alignment = { vertical: 'middle', horizontal: 'center' };

    // Fatura Adresi: I2-J2 merge
    worksheet2.mergeCells(2, 9, 2, 10);
    worksheet2.getCell(2, 9).value = 'Fatura Adresi:';
    applyCellStyle(worksheet2.getCell(2, 9), styles.label);
    worksheet2.getCell(2, 9).alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet2.getCell(2, 11).value = 'Şantiye:';
    applyCellStyle(worksheet2.getCell(2, 11), styles.label);
    worksheet2.getCell(2, 12).value = 'Garanti Süresi:';
    applyCellStyle(worksheet2.getCell(2, 12), styles.label);
    worksheet2.getCell(2, 13).value = 'Ödeme Planı:';
    applyCellStyle(worksheet2.getCell(2, 13), styles.label);

    // Info row 3: Values
    worksheet2.getCell(3, 1).value = demandData.satfk || demandData.talep_kodu || demandData.demandCode || '';
    applyCellStyle(worksheet2.getCell(3, 1), styles.data);
    worksheet2.getCell(3, 2).value = fmtDate(demandData.demandDate || demandData.createdAt);
    applyCellStyle(worksheet2.getCell(3, 2), styles.data);
    worksheet2.getCell(3, 3).value = demandData.creatorCompanyName || '';
    applyCellStyle(worksheet2.getCell(3, 3), styles.data);
    worksheet2.getCell(3, 4).value = demandData.currency || 'TRY';
    applyCellStyle(worksheet2.getCell(3, 4), styles.data);
    worksheet2.getCell(3, 5).value = ''; // Geçerlilik Süresi - supplier fills
    applyCellStyle(worksheet2.getCell(3, 5), styles.data);
    worksheet2.getCell(3, 6).value = getDeliveryMethodLabel(demandData.deliveryMethod || '');
    applyCellStyle(worksheet2.getCell(3, 6), styles.data);

    // Teslimat Adresi value: G3-H3 merge
    worksheet2.mergeCells(3, 7, 3, 8);
    worksheet2.getCell(3, 7).value = demandData.deliveryAddress || demandData.deliveryLocation || '';
    applyCellStyle(worksheet2.getCell(3, 7), styles.data);
    worksheet2.getCell(3, 7).alignment = { wrapText: true, vertical: 'top' };

    // Fatura Adresi value: I3-J3 merge
    worksheet2.mergeCells(3, 9, 3, 10);
    worksheet2.getCell(3, 9).value = formattedInvoiceAddress || '';
    applyCellStyle(worksheet2.getCell(3, 9), styles.data);
    worksheet2.getCell(3, 9).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

    worksheet2.getCell(3, 11).value = demandData.siteName || demandData.santiye || '';
    applyCellStyle(worksheet2.getCell(3, 11), styles.data);
    worksheet2.getCell(3, 12).value = ''; // Garanti Süresi - supplier fills
    applyCellStyle(worksheet2.getCell(3, 12), styles.data);
    worksheet2.getCell(3, 13).value = ''; // Ödeme Planı - supplier fills
    applyCellStyle(worksheet2.getCell(3, 13), styles.data);

    worksheet2.getRow(2).height = 54.75;
    worksheet2.getRow(3).height = 81;

    currentRow2 = 4;

    // Section header
    worksheet2.getCell(currentRow2, 1).value = 'ÜRÜN KALEMLERİ TEKLİFİ';
    worksheet2.mergeCells(currentRow2, 1, currentRow2, 14);
    applyCellStyle(worksheet2.getCell(currentRow2, 1), styles.sectionHeader);
    worksheet2.getRow(currentRow2).height = 25;
    currentRow2++;

    // Product table header (row 5)
    const headerLabels2 = [
        'Sıra No', 'Stok Kodu', 'Malzeme Tanımı *', 'Marka/Model', 'Teklif Tanımı',
        'Miktar', 'Birim', 'Birim Fiyat (KDV Hariç)', 'İskonto (%)', 'KDV (%)',
        'Teslim Tarihi', 'Ek Açıklama', 'KDV Hariç Toplam', 'KDV Dahil Toplam'
    ];
    headerLabels2.forEach((label, idx) => {
        worksheet2.getCell(currentRow2, idx + 1).value = label;
        applyCellStyle(worksheet2.getCell(currentRow2, idx + 1), styles.tableHeader);
    });
    worksheet2.getRow(currentRow2).height = 40;
    currentRow2++;

    // Product rows
    const firstProductRow2 = currentRow2;
    let lastProductRow2 = firstProductRow2 - 1;

    items.forEach((item, idx) => {
        const lineNo = item.lineNo || item.no || (idx + 1);
        const qty = item.qty || item.quantity || item.amount || 0;
        const unit = item.unit || 'Adet';
        const name = item.name || item.description || '';
        const sku = item.sku || item.materialCode || item.stockCode || '';
        const brandModel = item.brandModel || item.brand || '';

        worksheet2.getCell(currentRow2, 1).value = lineNo;
        worksheet2.getCell(currentRow2, 2).value = sku;
        worksheet2.getCell(currentRow2, 3).value = name;
        worksheet2.getCell(currentRow2, 4).value = brandModel;
        worksheet2.getCell(currentRow2, 5).value = ''; // Teklif Tanımı - supplier fills
        worksheet2.getCell(currentRow2, 6).value = qty;
        worksheet2.getCell(currentRow2, 7).value = unit;
        worksheet2.getCell(currentRow2, 8).value = ''; // Birim Fiyat - supplier fills
        worksheet2.getCell(currentRow2, 9).value = ''; // İskonto - supplier fills
        worksheet2.getCell(currentRow2, 10).value = ''; // KDV - supplier fills

        const dateCell = worksheet2.getCell(currentRow2, 11);
        dateCell.value = fmtDate(item.itemDueDate || item.req_date || item.deliveryDate || demandData.dueDate);
        dateCell.numFmt = '@';

        worksheet2.getCell(currentRow2, 12).value = ''; // Ek Açıklama - supplier fills

        // Formulas
        const row = currentRow2;
        const iskontoFormula = `IF(AND(F${row}<>"",H${row}<>""),F${row}*H${row}*IF(I${row}<>"",1-I${row}/100,1),"")`;
        const kdvFormula = `IF(AND(M${row}<>"",J${row}<>""),M${row}*(1+J${row}/100),"")`;
        worksheet2.getCell(currentRow2, 13).value = { formula: iskontoFormula };
        worksheet2.getCell(currentRow2, 14).value = { formula: kdvFormula };

        // Apply styles
        for (let col = 1; col <= 14; col++) {
            const cell = worksheet2.getCell(currentRow2, col);
            // Create new style object with correct alignment
            let alignmentVal: Partial<ExcelJS.Alignment>;
            if ([1, 6, 7, 9, 10].includes(col)) {
                alignmentVal = { vertical: 'middle', horizontal: 'center', wrapText: true };
            } else if ([13, 14].includes(col)) {
                alignmentVal = { vertical: 'middle', horizontal: 'right', wrapText: true };
            } else {
                alignmentVal = { vertical: 'middle', horizontal: 'left', wrapText: true };
            }
            applyCellStyle(cell, { ...styles.productRow, alignment: alignmentVal });
        }

        // Highlight supplier-fillable cells (yellow)
        [3, 6, 7].forEach(col => {
            worksheet2.getCell(currentRow2, col).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF9E6' }
            };
        });

        // Add borders
        for (let col = 1; col <= 14; col++) {
            worksheet2.getCell(currentRow2, col).border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        }

        worksheet2.getRow(currentRow2).height = 20;
        lastProductRow2 = currentRow2;
        currentRow2++;
    });

    // Total rows
    // KDV Hariç Toplam
    worksheet2.getCell(currentRow2, 12).value = 'KDV Hariç Toplam:';
    if (items.length > 0 && lastProductRow2 >= firstProductRow2) {
        worksheet2.getCell(currentRow2, 13).value = { formula: `SUM(M${firstProductRow2}:M${lastProductRow2})` };
    } else {
        worksheet2.getCell(currentRow2, 13).value = 0;
    }
    applyCellStyle(worksheet2.getCell(currentRow2, 12), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
    applyCellStyle(worksheet2.getCell(currentRow2, 13), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
    for (let col = 1; col <= 14; col++) {
        if (![12, 13].includes(col)) {
            applyCellStyle(worksheet2.getCell(currentRow2, col), styles.totalRow);
        }
    }
    worksheet2.getRow(currentRow2).height = 30;
    currentRow2++;

    // KDV Dahil Toplam
    worksheet2.getCell(currentRow2, 12).value = 'KDV Dahil Toplam:';
    if (items.length > 0 && lastProductRow2 >= firstProductRow2) {
        worksheet2.getCell(currentRow2, 14).value = { formula: `SUM(N${firstProductRow2}:N${lastProductRow2})` };
    } else {
        worksheet2.getCell(currentRow2, 14).value = 0;
    }
    applyCellStyle(worksheet2.getCell(currentRow2, 12), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
    applyCellStyle(worksheet2.getCell(currentRow2, 14), { ...styles.totalRow, alignment: { vertical: 'middle', horizontal: 'right' } });
    for (let col = 1; col <= 14; col++) {
        if (![12, 14].includes(col)) {
            applyCellStyle(worksheet2.getCell(currentRow2, col), styles.totalRow);
        }
    }
    worksheet2.getRow(currentRow2).height = 30;

    // ====================
    // SHEET 4: Ayarlar (Hidden)
    // ====================
    const ayarlarSheet = workbook.addWorksheet('Ayarlar');
    ayarlarSheet.state = 'hidden';

    const vatRates = [0, 1, 8, 10, 18, 20];
    const currencies = ['TRY', 'USD', 'EUR'];
    const paymentOptions = ['Peşin', 'Kredi Kartı', 'Açık Hesap', 'Evrak (çek/senet)'];
    const shippingModes = ['Nakliye Hariç', 'Nakliye Dahil', 'Özel/Anlaşmaya Göre'];

    // Write lists
    ayarlarSheet.getCell(1, 1).value = 'VatRateOptions';
    vatRates.forEach((rate, idx) => {
        ayarlarSheet.getCell(idx + 2, 1).value = rate;
    });

    ayarlarSheet.getCell(1, 2).value = 'CurrencyOptions';
    currencies.forEach((curr, idx) => {
        ayarlarSheet.getCell(idx + 2, 2).value = curr;
    });

    ayarlarSheet.getCell(1, 3).value = 'PaymentOptions';
    paymentOptions.forEach((pay, idx) => {
        ayarlarSheet.getCell(idx + 2, 3).value = pay;
    });

    ayarlarSheet.getCell(1, 4).value = 'ShippingModeOptions';
    shippingModes.forEach((ship, idx) => {
        ayarlarSheet.getCell(idx + 2, 4).value = ship;
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}
