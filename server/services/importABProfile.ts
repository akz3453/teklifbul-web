/**
 * ImportABProfile v1
 * Deterministik "A→B iki sütun" Excel okuyucu
 * Teklifbul Rule v1.0 - Talep formu içe aktarma için
 */

import ExcelJS from 'exceljs';

// Teklifbul Rule v1.0 - Type alias for Excel binary operations
type ExcelBinary = Buffer | ArrayBuffer | Uint8Array;

/**
 * parseTwoSheetProfile - İki sayfalı Excel şablonunu oku
 * Teklifbul Rule v1.0 - "Talep Bilgileri" ve "Kalemler" sayfalarını oku
 */
export async function parseTwoSheetProfile(
  fileOrArrayBuffer: File | ArrayBuffer | Buffer
): Promise<any> {
  try {
    // Buffer'a dönüştür
    let buffer: Buffer;
    if (fileOrArrayBuffer instanceof File) {
      const arrayBuffer = await fileOrArrayBuffer.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (fileOrArrayBuffer instanceof ArrayBuffer) {
      buffer = Buffer.from(fileOrArrayBuffer);
    } else {
      buffer = fileOrArrayBuffer;
    }
    
    if (!buffer || buffer.length === 0) {
      throw new Error('empty_file');
    }
    
    // Excel'i yükle
    const workbook = new ExcelJS.Workbook();
    // Teklifbul Rule v1.0 - Type-safe Excel binary loading
    // Ensure buffer is a proper Buffer instance for ExcelJS
    const excelBuffer: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    // Type assertion for ExcelJS compatibility
    await workbook.xlsx.load(excelBuffer as any);
    
    // Talep Bilgileri sayfasını bul
    const demandSheet = workbook.worksheets.find(s => 
      (s.name || '').toLowerCase().includes('talep bilgileri') ||
      (s.name || '').toLowerCase().includes('talep')
    ) || workbook.worksheets[0];
    
    if (!demandSheet) {
      throw new Error('parse_error: Talep Bilgileri sayfası bulunamadı');
    }
    
    // Kalemler sayfasını bul
    const itemsSheet = workbook.worksheets.find(s => 
      (s.name || '').toLowerCase() === 'kalemler' ||
      (s.name || '').toLowerCase().includes('kalem')
    ) || workbook.worksheets[1];
    
    // --- Talep Bilgileri ---
    const demandMapping: Record<string, string> = {
      'başlık': 'title',
      'şantiye': 'siteName',
      'talep oluşturma tarihi': 'demandDate',
      'termin': 'dueDate',
      'teslimat adresi': 'deliveryAddress',
      'teslim şekli': 'deliveryType',
      'para birimi': 'currency',
      'ödeme şartları': 'paymentTerms',
      'talep eden şirket adı': 'requesterCompany',
      'onaylayan': 'approver',
      'öncelik': 'priority',
      'alım yeri': 'purchaseLocation',
      'alım yeri (il)': 'purchaseLocation',
      'talep tipi': 'biddingMode',
      'kategoriler': 'categories',
    };
    
    const demand: Record<string, any> = {};
    
    // A→B formatını oku (ilk 50 satır)
    for (let row = 1; row <= Math.min(50, demandSheet.rowCount); row++) {
      const rowObj = demandSheet.getRow(row);
      const cellA = rowObj.getCell(1); // A sütunu
      const cellB = rowObj.getCell(2); // B sütunu
      
      const headerRaw = String(cellA?.value || '').trim();
      const valueRaw = String(cellB?.value || '').trim();
      
      if (!headerRaw || !valueRaw) continue;
      
      // Başlığı normalize et
      const normalizedKey = normalizeTr(headerRaw);
      
      // Eşleştirme ara
      const match = Object.keys(demandMapping).find(k => 
        normalizedKey.startsWith(k) || normalizedKey.includes(k)
      );
      
      if (match) {
        const fieldName = demandMapping[match];
        let processedValue: any = valueRaw;
        
        // Tarih alanları için normalize
        if (fieldName === 'demandDate' || fieldName === 'dueDate') {
          processedValue = normalizeDate(valueRaw);
        }
        // Para birimi için normalize
        else if (fieldName === 'currency') {
          processedValue = normalizeCurrency(valueRaw);
        }
        
        if (processedValue) {
          demand[fieldName] = processedValue;
        }
      }
    }
    
    // --- Kalemler ---
    const items: any[] = [];
    
    if (itemsSheet) {
      // Header satırını bul (genellikle 2. satır)
      let headerRow = 2;
      const headerRow2 = itemsSheet.getRow(2);
      const headerRow1 = itemsSheet.getRow(1);
      
      // 2. satırda başlık var mı kontrol et
      const hasHeadersRow2 = headerRow2.getCell(3)?.value && 
                            (String(headerRow2.getCell(3).value || '').toLowerCase().includes('malzeme') ||
                             String(headerRow2.getCell(3).value || '').toLowerCase().includes('tanım'));
      
      if (!hasHeadersRow2 && headerRow1.getCell(3)?.value) {
        headerRow = 1;
      }
      
      // Başlıkları oku ve sütun indekslerini bul
      const headerRowObj = itemsSheet.getRow(headerRow);
      const headers: string[] = [];
      for (let col = 1; col <= 20; col++) {
        const header = String(headerRowObj.getCell(col)?.value || '').trim();
        headers.push(header);
      }
      
      // Sütun indekslerini bul
      const findCol = (searchTerms: string[]): number => {
        for (let i = 0; i < headers.length; i++) {
          const h = normalizeTr(headers[i]);
          if (searchTerms.some(term => h.includes(term) || term.includes(h))) {
            return i; // 0-based index
          }
        }
        return -1;
      };
      
      const colStockCode = findCol(['stok kodu']);
      const colItemName = findCol(['malzeme tanımı', 'malzeme', 'tanım']);
      const colBrand = findCol(['marka/model', 'marka']);
      const colQty = findCol(['miktar']);
      const colUnit = findCol(['birim']);
      const colStockQty = findCol(['depodaki miktar', 'depo']);
      const colPrice = findCol(['hedef fiyat', 'fiyat']);
      const colRequestedDate = findCol(['istenen teslim tarihi', 'teslim tarihi', 'istenilen teslim']);
      
      // Veri satırlarını oku
      for (let row = headerRow + 1; row <= Math.min(itemsSheet.rowCount, headerRow + 200); row++) {
        const rowObj = itemsSheet.getRow(row);
        
        const getCellValue = (colIndex: number): string => {
          if (colIndex === -1) return '';
          const cell = rowObj.getCell(colIndex + 1); // ExcelJS 1-based
          return String(cell?.value || '').trim();
        };
        
        const itemName = getCellValue(colItemName);
        
        // "Not:" satırını atla
        if (!itemName || normalizeTr(itemName).startsWith('not')) continue;
        
        const stockCode = getCellValue(colStockCode);
        const brandModel = getCellValue(colBrand);
        const qtyStr = getCellValue(colQty);
        const unit = getCellValue(colUnit);
        const stockQtyStr = getCellValue(colStockQty);
        const priceStr = getCellValue(colPrice);
        const requestedDateStr = getCellValue(colRequestedDate);
        
        // Zorunlu alanlar: itemName
        if (!itemName) continue;
        
        // Marka/Model'i ayır
        let brand = '';
        if (brandModel) {
          const parts = brandModel.split(/[\/\s]+/).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 1) {
            brand = parts[0];
          }
        }
        
        // Sayısal değerleri parse et
        const qty = qtyStr ? parseFloat(qtyStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0;
        const stockQty = stockQtyStr ? parseFloat(stockQtyStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0;
        const unitPriceExcl = priceStr ? parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0;
        
        // Tarihi normalize et
        const requestedDate = requestedDateStr ? normalizeDate(requestedDateStr) || '' : '';
        
        items.push({
          stockCode: stockCode || '',
          itemName,
          brand: brand || '',
          qty,
          unit: unit || '',
          stockQty,
          unitPriceExcl,
          requestedDate
        });
      }
    }
    
    // Çıktı oluştur
    return {
      isTemplate: true,
      templateConfidence: 1,
      confidence: 1,
      demand,
      items
    };
    
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    // Bilinen hatalar
    if (errorMessage === 'empty_file') {
      throw new Error('empty_file');
    }
    
    // ExcelJS yükleme hatası
    if (errorMessage.includes('ExcelJS') || errorMessage.includes('exceljs')) {
      throw new Error('parse_error: ExcelJS kütüphanesi yüklenemedi. Lütfen server.cjs dosyasını kontrol edin.');
    }
    
    // Diğer hatalar - daha detaylı mesaj
    const detailedError = error.stack ? `${errorMessage}\nStack: ${error.stack}` : errorMessage;
    throw new Error(`parse_error: ${detailedError}`);
  }
}

// Çıktı şeması
export interface PreviewJson {
  isTemplate: boolean;
  templateConfidence: number;
  demand: {
    title?: string;
    requester?: string;
    demandDate?: string;
    dueDate?: string;
    currency?: string;
    siteName?: string;
    deliveryAddress?: string;
    note?: string;
  };
  columnMappings: Array<{
    from: string;
    to: string;
    score: number;
  }>;
  items: any[];
}

// Sözlük: A sütunu başlıkları → site field'ları
// Normalize edilmiş başlıklar (normalizeHeader fonksiyonundan sonra)
const HEADER_MAP: Record<string, string> = {
  // Başlık
  'başlık': 'title',
  'talep başlığı': 'title',
  
  // Talep Eden
  'talep eden': 'requester',
  'isteyen': 'requester',
  'requester': 'requester',
  'talep eden şirket adı': 'requester',
  
  // Talep Tarihi
  'talep tarihi': 'demandDate',
  'talep oluşturma tarihi': 'demandDate',
  'demand date': 'demandDate',
  
  // Termin / Teslim Tarihi
  'istenilen teslim tarihi': 'dueDate',
  'termin': 'dueDate',
  'due date': 'dueDate',
  'teslim tarihi': 'dueDate',
  
  // Para Birimi
  'para birimi': 'currency',
  'pb': 'currency',
  'currency': 'currency',
  
  // Şantiye
  'şantiye': 'siteName',
  'proje adı': 'siteName',
  'site': 'siteName',
  'saha': 'siteName',
  
  // Teslimat Adresi
  'teslimat adresi': 'deliveryAddress',
  'adres': 'deliveryAddress',
  'delivery address': 'deliveryAddress',
  'teslim adresi': 'deliveryAddress',
  
  // Açıklama
  'açıklama': 'note',
  'not': 'note',
  'notes': 'note',
  'notlar': 'note',
};

/**
 * Türkçe karakterleri normalize et
 * Teklifbul Rule v1.0 - Gereksiz karakterleri de temizle
 */
function normalizeTr(text: string): string {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/\*/g, '') // Yıldız işaretini kaldır
    .replace(/:/g, '') // İki nokta üst üsteyi kaldır
    .replace(/\s+/g, ' ') // Art arda boşlukları tek boşluk yap
    .trim();
}

/**
 * Başlığı normalize et: trim, lowercase, özel karakterleri kaldır
 */
function normalizeHeader(header: string): string {
  let normalized = String(header || '').trim();
  
  // Türkçe normalize
  normalized = normalizeTr(normalized);
  
  // Özel karakterleri kaldır: *, :, (zorunlu), vb.
  normalized = normalized
    .replace(/\s*\*\s*/g, ' ')
    .replace(/\s*:\s*/g, ' ')
    .replace(/\s*\(zorunlu\)\s*/gi, ' ')
    .replace(/\s*\(required\)\s*/gi, ' ');
  
  // Art arda boşlukları tek boşluk yap
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Tarihi YYYY-MM-DD formatına normalize et
 */
function normalizeDate(dateStr: string): string | null {
  if (!dateStr || !String(dateStr).trim()) return null;
  
  const str = String(dateStr).trim();
  
  // Zaten YYYY-MM-DD formatında mı?
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // Gün.ay.yıl veya gün/ay/yıl formatı
  const match = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    let year = match[3];
    
    // 2 haneli yıl ise 20xx yap
    if (year.length === 2) {
      year = '20' + year;
    }
    
    return `${year}-${month}-${day}`;
  }
  
  // Parse edilemedi
  return null;
}

/**
 * Para birimini normalize et
 */
function normalizeCurrency(currencyStr: string): string | null {
  if (!currencyStr || !String(currencyStr).trim()) return null;
  
  const str = String(currencyStr).trim().toUpperCase();
  
  // TRY, USD, EUR, GBP
  if (['TRY', 'USD', 'EUR', 'GBP'].includes(str)) {
    return str;
  }
  
  // Türk Lirası, TL, vb.
  if (str.includes('TRY') || str.includes('TL') || str.includes('TÜRK') || str.includes('TURK')) {
    return 'TRY';
  }
  if (str.includes('USD') || str.includes('DOLAR') || str.includes('DOLLAR')) {
    return 'USD';
  }
  if (str.includes('EUR') || str.includes('EURO')) {
    return 'EUR';
  }
  if (str.includes('GBP') || str.includes('STERLIN') || str.includes('POUND')) {
    return 'GBP';
  }
  
  return null;
}

/**
 * Excel dosyasından A→B iki sütun formatını oku
 */
export async function parseTwoColumnProfile(
  fileOrArrayBuffer: File | ArrayBuffer | Buffer
): Promise<PreviewJson> {
  try {
    // Buffer'a dönüştür
    let buffer: Buffer;
    if (fileOrArrayBuffer instanceof File) {
      const arrayBuffer = await fileOrArrayBuffer.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (fileOrArrayBuffer instanceof ArrayBuffer) {
      buffer = Buffer.from(fileOrArrayBuffer);
    } else {
      buffer = fileOrArrayBuffer;
    }
    
    if (!buffer || buffer.length === 0) {
      throw new Error('empty_file');
    }
    
    // Excel'i yükle
    const workbook = new ExcelJS.Workbook();
    // Teklifbul Rule v1.0 - Type-safe Excel binary loading
    // Ensure buffer is a proper Buffer instance for ExcelJS
    const excelBuffer: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    // Type assertion for ExcelJS compatibility
    await workbook.xlsx.load(excelBuffer as any);
    
    const firstSheet = workbook.worksheets[0];
    if (!firstSheet) {
      throw new Error('parse_error: İlk sayfa bulunamadı');
    }
    
    // A ve B sütunlarını oku (ilk 50 satır)
    const demand: PreviewJson['demand'] = {};
    const columnMappings: PreviewJson['columnMappings'] = [];
    
    for (let row = 1; row <= Math.min(50, firstSheet.rowCount); row++) {
      const rowObj = firstSheet.getRow(row);
      const cellA = rowObj.getCell(1); // A sütunu
      const cellB = rowObj.getCell(2); // B sütunu
      
      const headerRaw = String(cellA?.value || '').trim();
      const valueRaw = String(cellB?.value || '').trim();
      
      // Boş satırları atla
      if (!headerRaw) continue;
      
      // Başlığı normalize et
      const normalizedHeader = normalizeHeader(headerRaw);
      
      // Sözlükte ara (tam eşleşme)
      const fieldName = HEADER_MAP[normalizedHeader];
      
      if (fieldName && valueRaw) {
        // Eşleşme bulundu, değeri işle
        let processedValue: string | null = valueRaw;
        
        // Tarih alanları için normalize
        if (fieldName === 'demandDate' || fieldName === 'dueDate') {
          processedValue = normalizeDate(valueRaw);
        }
        // Para birimi için normalize
        else if (fieldName === 'currency') {
          processedValue = normalizeCurrency(valueRaw);
        }
        
        // Değer varsa ekle
        if (processedValue) {
          (demand as any)[fieldName] = processedValue;
          columnMappings.push({
            from: headerRaw,
            to: fieldName,
            score: 1.0
          });
        }
      }
    }
    
    // Kalemler sayfasını oku (ikinci sayfa veya "Kalemler" adlı sayfa)
    const itemsSheet = workbook.worksheets.find(s => {
      const name = (s.name || '').toLowerCase();
      return name === 'kalemler' || name.includes('kalem') || name.includes('item');
    }) || workbook.worksheets[1] || null;
    
    const items: any[] = [];
    
    if (itemsSheet) {
      // Header satırını bul (genellikle 2. satır)
      let headerRow = 2;
      const headerRow2 = itemsSheet.getRow(2);
      const headerRow1 = itemsSheet.getRow(1);
      
      // 2. satırda başlık var mı kontrol et
      const hasHeadersRow2 = headerRow2.getCell(3)?.value && 
                            (String(headerRow2.getCell(3).value || '').toLowerCase().includes('malzeme') ||
                             String(headerRow2.getCell(3).value || '').toLowerCase().includes('tanım'));
      
      if (!hasHeadersRow2 && headerRow1.getCell(3)?.value) {
        headerRow = 1;
      }
      
      // Başlıkları oku
      const headerRowObj = itemsSheet.getRow(headerRow);
      const headers: string[] = [];
      for (let col = 1; col <= 20; col++) {
        const header = String(headerRowObj.getCell(col)?.value || '').trim();
        headers.push(header);
      }
      
      // Sütun indekslerini bul
      const findCol = (searchTerms: string[]): number => {
        for (let i = 0; i < headers.length; i++) {
          const h = normalizeHeader(headers[i]);
          if (searchTerms.some(term => h.includes(term) || term.includes(h))) {
            return i; // 0-based index
          }
        }
        return -1;
      };
      
      const colItemName = findCol(['malzeme tanımı', 'malzeme', 'tanım', 'ürün']);
      const colBrand = findCol(['marka/model', 'marka', 'model']);
      const colQty = findCol(['miktar']);
      const colUnit = findCol(['birim']);
      const colPrice = findCol(['hedef fiyat', 'fiyat', 'birim fiyat']);
      const colDeliveryDate = findCol(['teslim tarihi', 'istenilen teslim tarihi']);
      
      // Veri satırlarını oku (headerRow + 1'den başla)
      for (let row = headerRow + 1; row <= Math.min(itemsSheet.rowCount, headerRow + 100); row++) {
        const rowObj = itemsSheet.getRow(row);
        
        const getCellValue = (colIndex: number): string => {
          if (colIndex === -1) return '';
          const cell = rowObj.getCell(colIndex + 1); // ExcelJS 1-based
          return String(cell?.value || '').trim();
        };
        
        const itemName = getCellValue(colItemName);
        const brandModel = getCellValue(colBrand);
        const qtyStr = getCellValue(colQty);
        const unit = getCellValue(colUnit);
        const priceStr = getCellValue(colPrice);
        const deliveryDateStr = getCellValue(colDeliveryDate);
        
        // Zorunlu alanlar: itemName, qty, unit
        if (!itemName || (!qtyStr && !unit)) continue;
        
        // Miktarı parse et
        const qty = parseFloat(qtyStr.replace(/[^\d.,]/g, '').replace(',', '.')) || null;
        
        // Fiyatı parse et
        const unitPriceExcl = priceStr ? 
          parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.')) || null : null;
        
        // Marka/Model'i ayır
        let brand = '';
        let model = '';
        if (brandModel) {
          const parts = brandModel.split(/[\/\s]+/).map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            brand = parts[0];
            model = parts.slice(1).join(' ');
          } else if (parts.length === 1) {
            brand = parts[0];
          }
        }
        
        // Tarihi normalize et
        const deliveryDate = deliveryDateStr ? normalizeDate(deliveryDateStr) : null;
        
        items.push({
          itemName,
          brand: brand || null,
          model: model || null,
          qty: qty,
          unit: unit || null,
          unitPriceExcl: unitPriceExcl,
          deliveryDate: deliveryDate
        });
      }
    }
    
    // Çıktı oluştur
    const result: PreviewJson = {
      isTemplate: true,
      templateConfidence: 1.0,
      demand,
      columnMappings,
      items
    };
    
    return result;
    
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    // Bilinen hatalar
    if (errorMessage === 'empty_file') {
      throw new Error('empty_file');
    }
    
    // Diğer hatalar
    throw new Error(`parse_error: ${errorMessage}`);
  }
}

