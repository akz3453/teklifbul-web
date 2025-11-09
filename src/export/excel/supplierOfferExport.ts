/**
 * Tedarikçi Teklif Excel Export
 * 
 * assets/SATINALMAVETEKLİFFORMU.xlsx şablonunu kullanarak teklif Excel dosyası oluşturur.
 */

import ExcelJS from 'exceljs';
import type { Offer } from '../../domain/offer/schema';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../shared/log/logger.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'assets', 'SATINALMAVETEKLİFFORMU.xlsx');
const SHEET_NAME = 'SATIN ALMA VE TEKLIF FORMU';

/**
 * Excel export fonksiyonu
 */
export async function exportSupplierOffer(offer: Offer): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  
  // Şablon varsa yükle, yoksa yeni oluştur
  let templateExists = false;
  try {
    if (fs.existsSync(TEMPLATE_PATH)) {
      await workbook.xlsx.readFile(TEMPLATE_PATH);
      templateExists = true;
    }
  } catch (error) {
    logger.warn('Şablon yüklenemedi, yeni dosya oluşturuluyor:', error);
  }
  
  // Worksheet al veya oluştur
  let worksheet = workbook.getWorksheet(SHEET_NAME);
  if (!worksheet) {
    worksheet = workbook.addWorksheet(SHEET_NAME);
  }
  
  // Şablon yoksa başlık satırlarını oluştur
  if (!templateExists) {
    setupHeaders(worksheet);
  }
  
  // Başlık bilgilerini doldur (N1..P4 bölgesi)
  fillHeaderSection(worksheet, offer);
  
  // Satır bilgilerini doldur (satır 6 ve sonrası)
  const startRow = 6;
  offer.lines.forEach((line, index) => {
    const row = startRow + index;
    fillLineRow(worksheet, row, line, index + 1);
  });
  
  // Toplam satırı (satır 9 veya son satırdan sonra)
  const totalRow = startRow + offer.lines.length;
  fillTotalRow(worksheet, totalRow);
  
  // Buffer olarak döndür
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ExcelJS.Buffer;
}

/**
 * Ödeme şartları formatlama (utility)
 */
function formatPaymentTerms(terms: any): string {
  if (!terms || !terms.type) return '';
  
  switch (terms.type) {
    case 'pesin_escrow':
      return `Peşin (Escrow${terms.escrowDays ? ` / ${terms.escrowDays} gün` : ''})`;
    case 'pesin_teslim_onay':
      return `Peşin (Teslim&Onay${terms.deliveryConfirmDays ? ` / ${terms.deliveryConfirmDays} gün` : ''})`;
    case 'pesin_on_odeme':
      return `Peşin (Ön Ödeme %${terms.advancePercent || 0})`;
    case 'kredi_karti':
      return `Kredi Kartı (${terms.installments || 1} taksit${terms.financeRate ? ` / %${terms.financeRate} faiz` : ''})`;
    case 'acik_hesap':
      return `Açık Hesap (${terms.dueDays || 30} gün)`;
    case 'evrak_cek':
      return `Evrak/Çek (${terms.checkCount || 1} adet)`;
    default:
      return '';
  }
}

/**
 * Başlık satırlarını oluştur
 */
function setupHeaders(worksheet: ExcelJS.Worksheet) {
  // Satır 5: Sütun başlıkları
  
  // H5: BİRİM FİYAT (KDV Hariç)
  worksheet.getCell('H5').value = 'BİRİM FİYAT (KDV Hariç)';
  
  // K5-L5 (merge): KDV HARİÇ TOPLAM TL
  worksheet.mergeCells('K5:L5');
  worksheet.getCell('K5').value = 'KDV HARİÇ TOPLAM TL';
  worksheet.getCell('K5').alignment = { horizontal: 'center', vertical: 'middle' };
  
  // N5: KDV ORANI (%)
  worksheet.getCell('N5').value = 'KDV ORANI (%)';
  
  // P5: KDV DAHİL BİRİM FİYAT
  worksheet.getCell('P5').value = 'KDV DAHİL BİRİM FİYAT';
  
  // O5: KDV DAHİL TOPLAM TL
  worksheet.getCell('O5').value = 'KDV DAHİL TOPLAM TL';
  
  // M5: ÖDEME ŞARTLARI
  worksheet.getCell('M5').value = 'ÖDEME ŞARTLARI';
  
  // Başlık stilleri
  [5].forEach(rowNum => {
    const row = worksheet.getRow(rowNum);
    row.font = { bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
  });
}

/**
 * Başlık bölgesini doldur (N1..P4)
 */
function fillHeaderSection(worksheet: ExcelJS.Worksheet, offer: Offer) {
  const header = offer.header;
  
  // N1: SATFK
  worksheet.getCell('N1').value = header.satfkCode;
  
  // N2: Başlık
  worksheet.getCell('N2').value = header.title;
  
  // N3: Şantiye
  worksheet.getCell('N3').value = header.site || '';
  
  // N4: Alım Yeri
  worksheet.getCell('N4').value = header.purchaseCity || '';
  
  // P1: Para Birimi
  worksheet.getCell('P1').value = header.currency;
  
  // P2: Öncelik
  const priorityMap: Record<string, string> = {
    'price': 'Fiyat',
    'date': 'Tarih',
    'quality': 'Kalite',
  };
  worksheet.getCell('P2').value = priorityMap[header.priority || 'price'] || '';
  
  // P3: Termin Tarihi
  if (header.dueDate) {
    const date = new Date(header.dueDate);
    worksheet.getCell('P3').value = date;
    worksheet.getCell('P3').numFmt = 'dd.mm.yyyy';
  }
  
  // P4: Ödeme Şartları
  if (header.paymentTerms) {
    worksheet.getCell('P4').value = formatPaymentTerms(header.paymentTerms);
  }
}

/**
 * Satır bilgilerini doldur
 */
function fillLineRow(worksheet: ExcelJS.Worksheet, rowNum: number, line: Offer['lines'][0], lineNo: number) {
  const row = worksheet.getRow(rowNum);
  
  // A: No
  row.getCell(1).value = lineNo;
  
  // B: Ürün Adı (itemName)
  row.getCell(2).value = line.itemName;
  
  // C: Spec (varsa)
  row.getCell(3).value = line.spec || '';
  
  // D: Marka
  row.getCell(4).value = line.brand || '';
  
  // E: Birim
  row.getCell(5).value = line.uom;
  
  // F: Miktar
  row.getCell(6).value = line.quantity;
  row.getCell(6).numFmt = '#,##0.00';
  
  // G: (boş - Depodaki Miktar yazma)
  
  // H: Birim Fiyat (KDV Hariç)
  row.getCell(8).value = line.unitPrice;
  row.getCell(8).numFmt = '#,##0.00';
  
  // I: (görsel - boş)
  
  // J: Termin
  if (line.deliveryDate) {
    const date = new Date(line.deliveryDate);
    row.getCell(10).value = date;
    row.getCell(10).numFmt = 'dd.mm.yyyy';
  }
  
  // K-L: KDV Hariç Toplam (merge)
  worksheet.mergeCells(`K${rowNum}:L${rowNum}`);
  row.getCell(11).value = line.totalExVat || 0;
  row.getCell(11).numFmt = '#,##0.00';
  row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
  
  // M: Ödeme Şartları (satır bazlı)
  row.getCell(13).value = line.notes || '';
  
  // N: KDV Oranı (%)
  row.getCell(14).value = line.vatRate;
  row.getCell(14).numFmt = '0.00';
  
  // O: KDV Dahil Toplam
  row.getCell(15).value = line.totalWithVat || 0;
  row.getCell(15).numFmt = '#,##0.00';
  
  // P: KDV Dahil Birim Fiyat (formül)
  row.getCell(16).value = {
    formula: `H${rowNum}*(1+N${rowNum}/100)`,
  };
  row.getCell(16).numFmt = '#,##0.00';
  
  // O hücresini de formülle hesapla
  row.getCell(15).value = {
    formula: `F${rowNum}*P${rowNum}`,
  };
}

/**
 * Toplam satırını doldur
 */
function fillTotalRow(worksheet: ExcelJS.Worksheet, rowNum: number) {
  const row = worksheet.getRow(rowNum);
  
  // A: "TOPLAM" etiketi
  row.getCell(1).value = 'TOPLAM';
  row.getCell(1).font = { bold: true };
  
  // K-L: KDV Hariç Toplam (merge + formül)
  worksheet.mergeCells(`K${rowNum}:L${rowNum}`);
  row.getCell(11).value = {
    formula: `SUM(K6:L${rowNum - 1})`,
  };
  row.getCell(11).numFmt = '#,##0.00';
  row.getCell(11).font = { bold: true };
  row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
  
  // O: KDV Dahil Toplam (formül)
  row.getCell(15).value = {
    formula: `SUM(O6:O${rowNum - 1})`,
  };
  row.getCell(15).numFmt = '#,##0.00';
  row.getCell(15).font = { bold: true };
  
  // Stil
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' },
  };
}

/**
 * Tarayıcıda çalışan versiyon (browser)
 */
export async function exportSupplierOfferBrowser(offerData: Offer): Promise<Blob> {
  // Node.js ortamında çalıştırılacak, tarayıcı için API endpoint kullan
  const response = await fetch('/api/offers/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offer: offerData }),
  });
  
  if (!response.ok) {
    throw new Error('Excel export başarısız');
  }
  
  return await response.blob();
}

