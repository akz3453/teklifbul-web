/**
 * Tedarikçi Teklif Excel Import
 *
 * Tedarikçinin yüklediği Excel dosyasını parse eder ve şemaya dönüştürür.
 */
// Lazy loading - ExcelJS yüklenir sadece kullanıldığında
import { loadExcelJS } from '../../shared/utils/lazy-loaders.js';
import { mapCurrency, mapDate, mapPriority } from '../../domain/offer/mapping.js';
import { checkAborted, calculateBatchProgress } from '../../shared/utils/async-utils.js';
const SHEET_NAME = 'SATIN ALMA VE TEKLIF FORMU';
/**
 * Excel dosyasını parse et (progress ve cancel desteği ile)
 * Teklifbul Rule v1.0 - Uzun async işlemler için progress bar + cancel
 *
 * @param buffer - Excel dosyası buffer'ı
 * @param signal - AbortSignal (iptal için)
 * @param reportProgress - Progress callback (0-100)
 */
export async function importSupplierOffer(buffer, signal, reportProgress) {
    // Teklifbul Rule v1.0 - Yerel rapor + iptal yardimcisi
    const report = (p) => {
        if (reportProgress)
            reportProgress(p);
        if (signal)
            checkAborted(signal);
    };
    report(5);
    // ExcelJS lazy load + workbook olustur
    const ExcelJSLib = await loadExcelJS();
    const workbook = new ExcelJSLib.Workbook();
    // ArrayBuffer ile Buffer arasinda farkli API'ler
    const bufferAny = buffer;
    await workbook.xlsx.load(bufferAny);
    report(15);
    let worksheet = workbook.getWorksheet(SHEET_NAME);
    if (!worksheet) {
        // İlk worksheet'i kullan
        worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new Error('Excel dosyasında worksheet bulunamadı');
        }
    }
    report(20);
    // Başlık bilgilerini oku (N1..P4)
    const header = parseHeaderSection(worksheet);
    report(30);
    // Satır bilgilerini oku (6. satırdan itibaren)
    const lines = parseLineRows(worksheet, signal, (p) => {
        // Satır parse progress: 30% - 90%
        const totalProgress = 30 + (p * 0.6);
        report(totalProgress);
    });
    report(95);
    return {
        header,
        lines,
        attachments: [],
        status: 'draft',
    };
}
/**
 * Başlık bölümünü parse et
 */
function parseHeaderSection(worksheet) {
    // N1: SATFK
    const satfkCode = getCellValue(worksheet, 'N1') || '';
    // N2: Başlık
    const title = getCellValue(worksheet, 'N2') || '';
    // N3: Şantiye
    const site = getCellValue(worksheet, 'N3') || undefined;
    // N4: Alım Yeri
    const purchaseCity = getCellValue(worksheet, 'N4') || undefined;
    // P1: Para Birimi
    const currency = mapCurrency(getCellValue(worksheet, 'P1') || 'TRY');
    // P2: Öncelik
    const priorityRaw = getCellValue(worksheet, 'P2');
    const priority = mapPriority(priorityRaw);
    // P3: Termin Tarihi
    const dueDateRaw = worksheet.getCell('P3').value;
    const dueDate = dueDateRaw instanceof Date ? dueDateRaw.toISOString() : mapDate(dueDateRaw?.toString());
    // P4: Ödeme Şartları (basit parse, detaylı parsing gerekirse geliştirilebilir)
    // const paymentTermsRaw = getCellValue(worksheet, 'P4');
    return {
        satfkCode,
        title,
        site,
        purchaseCity,
        currency,
        priority,
        dueDate,
        isSealedBid: false, // Excel'den okunamazsa false
    };
}
/**
 * Satır bilgilerini parse et (progress desteği ile)
 *
 * @param worksheet - Excel worksheet
 * @param signal - AbortSignal (iptal için)
 * @param reportProgress - Progress callback (0-100)
 */
function parseLineRows(worksheet, signal, reportProgress) {
    const lines = [];
    let rowNum = 6; // Başlangıç satırı
    // Toplam satır sayısını tahmin et (worksheet.rowCount kullan)
    const maxRows = Math.min(worksheet.rowCount, 1000); // Maksimum 1000 satır
    let processedRows = 0;
    // Toplam satırına kadar oku (TOPLAM yazan satıra kadar veya boş satıra kadar)
    while (rowNum <= maxRows) {
        if (signal)
            checkAborted(signal);
        const row = worksheet.getRow(rowNum);
        // A sütununda "TOPLAM" yazıyorsa dur
        const firstCell = row.getCell(1).value;
        if (typeof firstCell === 'string' && firstCell.toUpperCase().includes('TOPLAM')) {
            break;
        }
        // Boş satır kontrolü
        const itemName = getCellValue(row, 2); // B sütunu
        if (!itemName || itemName.trim() === '') {
            rowNum++;
            processedRows++;
            continue;
        }
        // Satırı parse et
        const line = parseLineRow(row, rowNum);
        if (line) {
            lines.push(line);
        }
        rowNum++;
        processedRows++;
        // Her 10 satırda bir progress güncelle
        if (reportProgress && processedRows % 10 === 0) {
            const progress = calculateBatchProgress(processedRows, maxRows);
            reportProgress(progress);
        }
    }
    if (reportProgress) {
        reportProgress(100);
    }
    return lines;
}
/**
 * Tek satırı parse et
 */
function parseLineRow(row, _rowNum) {
    // B: Ürün Adı
    const itemName = getCellValue(row, 2);
    if (!itemName || itemName.trim() === '') {
        return null;
    }
    // C: Spec
    const spec = getCellValue(row, 3) || undefined;
    // D: Marka
    const brand = getCellValue(row, 4) || undefined;
    // E: Birim
    const uom = getCellValue(row, 5) || '';
    // F: Miktar
    const quantity = parseNumber(row, 6) || 0;
    // H: Birim Fiyat (KDV Hariç)
    const unitPrice = parseNumber(row, 8) || 0;
    // N: KDV Oranı (%)
    const vatRate = parseNumber(row, 14) || 18;
    // J: Termin
    const deliveryDateRaw = row.getCell(10).value;
    const deliveryDate = deliveryDateRaw instanceof Date ? deliveryDateRaw.toISOString() : mapDate(deliveryDateRaw?.toString());
    // M: Ödeme Şartları / Notlar
    const notes = getCellValue(row, 13) || undefined;
    // P: KDV Dahil Birim Fiyat (hesaplanan veya formülden)
    const pCell = row.getCell(16);
    let netUnitWithVat;
    if (pCell.value && typeof pCell.value === 'number') {
        netUnitWithVat = pCell.value;
    }
    else {
        // Hesapla
        netUnitWithVat = unitPrice * (1 + vatRate / 100);
    }
    // O: KDV Dahil Toplam
    const oCell = row.getCell(15);
    let totalWithVat;
    if (oCell.value && typeof oCell.value === 'number') {
        totalWithVat = oCell.value;
    }
    else {
        // Hesapla
        totalWithVat = quantity * (netUnitWithVat || 0);
    }
    // K-L: KDV Hariç Toplam
    const kCell = row.getCell(11);
    let totalExVat;
    if (kCell.value && typeof kCell.value === 'number') {
        totalExVat = kCell.value;
    }
    else {
        // Hesapla
        totalExVat = quantity * unitPrice;
    }
    return {
        itemName: itemName.trim(),
        spec,
        uom,
        quantity,
        unitPrice,
        vatRate,
        deliveryDate,
        brand,
        notes,
        netUnitWithVat,
        totalExVat,
        totalWithVat,
    };
}
/**
 * Hücre değerini string olarak al
 */
function getCellValue(worksheet, col) {
    const cell = typeof col === 'string'
        ? worksheet.getCell(col)
        : worksheet.getCell(col);
    if (!cell || cell.value === null || cell.value === undefined) {
        return '';
    }
    // Formül sonucunu al
    if (cell.value && typeof cell.value === 'object' && 'result' in cell.value) {
        return String(cell.value.result || '');
    }
    // Tarih kontrolü
    if (cell.value instanceof Date) {
        return cell.value.toISOString();
    }
    return String(cell.value);
}
/**
 * Hücre değerini number olarak al
 */
function parseNumber(worksheet, col) {
    const cell = typeof col === 'string'
        ? worksheet.getCell(col)
        : worksheet.getCell(col);
    if (!cell || cell.value === null || cell.value === undefined) {
        return null;
    }
    // Formül sonucunu al
    if (cell.value && typeof cell.value === 'object' && 'result' in cell.value) {
        const result = cell.value.result;
        return typeof result === 'number' ? result : null;
    }
    if (typeof cell.value === 'number') {
        return cell.value;
    }
    if (typeof cell.value === 'string') {
        const parsed = parseFloat(cell.value.replace(/[^\d.,-]/g, '').replace(',', '.'));
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}
/**
 * Tarayıcıda çalışan versiyon (progress ve cancel desteği ile)
 * Teklifbul Rule v1.0
 *
 * @param file - Excel dosyası
 * @param signal - AbortSignal (iptal için)
 * @param reportProgress - Progress callback (0-100)
 */
export async function importSupplierOfferBrowser(file, signal, reportProgress) {
    const report = (p) => {
        if (reportProgress)
            reportProgress(p);
        if (signal)
            checkAborted(signal);
    };
    report(0);
    // Dosyayı oku
    const arrayBuffer = await file.arrayBuffer();
    report(5);
    // Parse et
    return importSupplierOffer(arrayBuffer, signal, (p) => {
        // Dosya okuma 5% aldı, parse 95% alacak
        const totalProgress = 5 + (p * 0.95);
        report(totalProgress);
    });
}
