/**
 * Fiyat Karşılaştırma Sistemi
 * Excel şablonunu kullanarak teklifleri karşılaştırır
 * 
 * Teklifbul Rule v1.0 - Security: xlsx paketi güvenlik notu
 * xlsx paketinde bilinen bazı security advisory'ler mevcuttur (Prototype Pollution, ReDoS).
 * Risk azaltma önlemleri:
 * - Dosya boyutu limiti: 5 MB
 * - Satır/sütun limiti: 10.000 satır, 50 sütun
 * - Try/catch ile güvenli hata yönetimi
 * - Input validation ve sanitization
 * İleride alternatif kütüphaneye veya server-side işleme modeline geçiş değerlendirilebilir.
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from './shared/log/logger.js';

// Teklifbul Rule v1.0 - Bundle Size: Named imports for tree shaking
import { read, utils, writeFile } from 'xlsx';

// Teklifbul Rule v1.0 - Security: Excel işleme limitleri
const EXCEL_LIMITS = {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5 MB
    MAX_ROWS: 10000,
    MAX_COLUMNS: 50
};

export class PriceComparisonSystem {
    constructor() {
        this.templatePath = './assets/teklif mukayese formu.xlsx';
        this.templateData = null;
    }

    /**
     * Excel şablonunu yükler
     * Teklifbul Rule v1.0 - Security: Dosya boyutu ve içerik limitleri ile güvenli yükleme
     */
    async loadTemplate() {
        try {
            const response = await fetch(this.templatePath);
            
            // Teklifbul Rule v1.0 - Security: Dosya boyutu kontrolü
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > EXCEL_LIMITS.MAX_FILE_SIZE) {
                logger.error('Excel dosyası çok büyük', { size: contentLength, limit: EXCEL_LIMITS.MAX_FILE_SIZE });
                throw new Error(`Excel dosyası çok büyük. Maksimum boyut: ${EXCEL_LIMITS.MAX_FILE_SIZE / 1024 / 1024} MB`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            
            // Teklifbul Rule v1.0 - Security: ArrayBuffer boyutu kontrolü
            if (arrayBuffer.byteLength > EXCEL_LIMITS.MAX_FILE_SIZE) {
                logger.error('Excel dosyası çok büyük', { size: arrayBuffer.byteLength, limit: EXCEL_LIMITS.MAX_FILE_SIZE });
                throw new Error(`Excel dosyası çok büyük. Maksimum boyut: ${EXCEL_LIMITS.MAX_FILE_SIZE / 1024 / 1024} MB`);
            }
            
            // Teklifbul Rule v1.0 - Security: xlsx.read işlemini try/catch ile sar
            let workbook;
            try {
                workbook = read(arrayBuffer, { type: 'array' });
            } catch (parseError) {
                logger.error('Excel dosyası parse edilemedi', parseError);
                throw new Error('Yüklediğiniz Excel dosyası işlenemedi. Lütfen formatını veya boyutunu kontrol edin.');
            }
            
            // Teklifbul Rule v1.0 - Security: Sheet sayısı ve içerik kontrolü
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error('Excel dosyasında geçerli bir sayfa bulunamadı.');
            }
            
            // İlk sheet'i al
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            // Teklifbul Rule v1.0 - Security: Satır/sütun limiti kontrolü
            const range = utils.decode_range(sheet['!ref'] || 'A1');
            const rowCount = range.e.r - range.s.r + 1;
            const colCount = range.e.c - range.s.c + 1;
            
            if (rowCount > EXCEL_LIMITS.MAX_ROWS) {
                logger.error('Excel dosyası çok fazla satır içeriyor', { rows: rowCount, limit: EXCEL_LIMITS.MAX_ROWS });
                throw new Error(`Excel dosyası çok fazla satır içeriyor. Maksimum satır: ${EXCEL_LIMITS.MAX_ROWS}`);
            }
            
            if (colCount > EXCEL_LIMITS.MAX_COLUMNS) {
                logger.error('Excel dosyası çok fazla sütun içeriyor', { columns: colCount, limit: EXCEL_LIMITS.MAX_COLUMNS });
                throw new Error(`Excel dosyası çok fazla sütun içeriyor. Maksimum sütun: ${EXCEL_LIMITS.MAX_COLUMNS}`);
            }
            
            this.templateData = sheet;
            
            logger.info('Excel şablonu yüklendi', { rows: rowCount, columns: colCount });
            return true;
        } catch (error) {
            // Teklifbul Rule v1.0 - Security: Kullanıcıya teknik detay göstermeden güvenli hata mesajı
            const userMessage = error.message || 'Excel şablonu yüklenemedi. Lütfen dosya formatını kontrol edin.';
            logger.error('Excel şablonu yüklenemedi', { error: error.message, stack: error.stack });
            throw new Error(userMessage);
        }
    }

    /**
     * Talep ve teklif verilerini Excel formatına dönüştürür
     */
    generateComparisonExcel(demandData, bidsData) {
        if (!this.templateData) {
            throw new Error('Excel şablonu yüklenmemiş');
        }

        // Şablonu kopyala
        const worksheet = JSON.parse(JSON.stringify(this.templateData));
        
        // Talep bilgilerini doldur
        this.fillDemandData(worksheet, demandData);
        
        // Teklif bilgilerini doldur
        this.fillBidData(worksheet, bidsData);
        
        return worksheet;
    }

    /**
     * Talep bilgilerini Excel'e doldurur
     */
    fillDemandData(worksheet, demandData) {
        // A1: TALEP EDEN FİRMA İSMİ
        this.setCellValue(worksheet, 'A1', demandData.companyName || '');
        
        // B5: TALEP KONUSU
        this.setCellValue(worksheet, 'B5', demandData.title || '');
        
        // T1: TALEP KODU
        this.setCellValue(worksheet, 'T1', demandData.demandCode || '');
        
        // T2: STF NO
        this.setCellValue(worksheet, 'T2', demandData.stfNo || '');
        
        // T3: ŞANTİYE
        this.setCellValue(worksheet, 'T3', demandData.site || '');
        
        // T4: USD/TRY KURU (Dashboard'dan alınacak)
        this.setCellValue(worksheet, 'T4', demandData.usdTryRate || '');
        
        // Ürün listesini doldur
        if (demandData.items && Array.isArray(demandData.items)) {
            demandData.items.forEach((item, index) => {
                const row = 8 + index; // B8'den başla
                
                // C6: ÜRÜN İSMİ (C8, C9, C10...)
                this.setCellValue(worksheet, `C${row}`, item.description || '');
                
                // B6: NO (B8, B9, B10...)
                this.setCellValue(worksheet, `B${row}`, index + 1);
                
                // D6: MİKTAR (D8, D9, D10...)
                this.setCellValue(worksheet, `D${row}`, item.quantity || '');
                
                // E6: BİRİM (E8, E9, E10...)
                this.setCellValue(worksheet, `E${row}`, item.unit || '');
            });
        }
    }

    /**
     * Teklif bilgilerini Excel'e doldurur
     */
    fillBidData(worksheet, bidsData) {
        if (!bidsData || !Array.isArray(bidsData)) return;

        // Teklifleri fiyata göre sırala
        const sortedBids = bidsData.sort((a, b) => {
            const totalA = this.calculateTotalPrice(a);
            const totalB = this.calculateTotalPrice(b);
            return totalA - totalB;
        });

        // En ucuz 5 teklifi al (Premium üyeler için daha fazla)
        const topBids = sortedBids.slice(0, 5);

        topBids.forEach((bid, bidIndex) => {
            const columnMap = {
                0: 'F', // 1. firma
                1: 'I', // 2. firma  
                2: 'L', // 3. firma
                3: 'O', // 4. firma
                4: 'R'  // 5. firma
            };

            const column = columnMap[bidIndex];
            if (!column) return;

            // Firma bilgileri
            this.setCellValue(worksheet, `${column}6`, `${bid.supplierName || ''} - ${bid.supplierPhone || ''}`);
            
            // Ödeme şartları
            this.setCellValue(worksheet, `${column}22`, bid.paymentTerms || '');
            
            // Teslim süresi
            this.setCellValue(worksheet, `${column}23`, bid.deliveryDate || '');
            
            // Teslim şekli (Alım Yeri)
            this.setCellValue(worksheet, `${column}24`, bid.deliveryMethod || '');
            
            // Açıklama
            this.setCellValue(worksheet, `${column}25`, bid.notes || '');

            // Ürün fiyatları
            if (bid.items && Array.isArray(bid.items)) {
                let totalAmount = 0;
                
                bid.items.forEach((item, itemIndex) => {
                    const row = 8 + itemIndex;
                    const unitPrice = item.unitPrice || 0;
                    const quantity = item.quantity || 0;
                    const itemTotal = unitPrice * quantity;
                    
                    // Birim fiyat
                    this.setCellValue(worksheet, `${column}${row}`, unitPrice);
                    
                    // Toplam fiyat (G sütunu)
                    this.setCellValue(worksheet, `G${row}`, itemTotal);
                    
                    totalAmount += itemTotal;
                });
                
                // Toplam tutar (G21, I21, L21, O21, R21)
                this.setCellValue(worksheet, `${column}21`, totalAmount);
            }
        });
    }

    /**
     * Teklifin toplam fiyatını hesaplar
     */
    calculateTotalPrice(bid) {
        if (!bid.items || !Array.isArray(bid.items)) return 0;
        
        return bid.items.reduce((total, item) => {
            const unitPrice = item.unitPrice || 0;
            const quantity = item.quantity || 0;
            return total + (unitPrice * quantity);
        }, 0);
    }

    /**
     * Excel hücresine değer atar
     * Teklifbul Rule v1.0 - Security: User input sanitization
     */
    setCellValue(worksheet, cellAddress, value) {
        if (!worksheet[cellAddress]) {
            worksheet[cellAddress] = {};
        }
        // Teklifbul Rule v1.0 - Security: Değeri string'e çevir ve güvenli hale getir
        // XSS riskini azaltmak için HTML tag'lerini temizle
        let safeValue = value;
        if (typeof value === 'string') {
            // Basit HTML tag temizleme (DOMPurify client-side'da kullanılabilir ama burada basit regex yeterli)
            safeValue = value.replace(/<[^>]*>/g, '').trim();
        }
        worksheet[cellAddress].v = safeValue;
        worksheet[cellAddress].t = typeof safeValue === 'number' ? 'n' : 's';
    }

    /**
     * Excel dosyasını indirir
     * Teklifbul Rule v1.0 - Security: Güvenli dosya adı ve try/catch
     */
    downloadExcel(worksheet, filename = 'fiyat-karsilastirma.xlsx') {
        try {
            // Teklifbul Rule v1.0 - Security: Dosya adı sanitization
            const safeFilename = filename
                .replace(/[<>:"/\\|?*]/g, '') // Tehlikeli karakterleri temizle
                .replace(/\.\./g, '') // Path traversal önleme
                .substring(0, 255); // Maksimum dosya adı uzunluğu
            
            const workbook = utils.book_new();
            utils.book_append_sheet(workbook, worksheet, 'Fiyat Karşılaştırma');
            
            // Teklifbul Rule v1.0 - Security: writeFile işlemini try/catch ile sar
            writeFile(workbook, safeFilename);
            logger.info('Excel dosyası indirildi', { filename: safeFilename });
        } catch (error) {
            logger.error('Excel dosyası indirilemedi', error);
            throw new Error('Excel dosyası oluşturulamadı. Lütfen tekrar deneyin.');
        }
    }

    /**
     * Talep detayından fiyat karşılaştırması oluşturur
     */
    async createComparisonFromDemand(demandId) {
        try {
            // Talep verilerini al
            const demandDoc = await getDoc(doc(db, 'demands', demandId));
            if (!demandDoc.exists()) {
                throw new Error('Talep bulunamadı');
            }
            
            const demandData = demandDoc.data();
            
            // Teklifleri al
            const bidsQuery = query(
                collection(db, 'bids'),
                where('demandId', '==', demandId),
                where('status', '==', 'sent'),
                orderBy('createdAt', 'desc')
            );
            
            const bidsSnap = await getDocs(bidsQuery);
            const bidsData = [];
            
            for (const bidDoc of bidsSnap.docs) {
                const bidData = bidDoc.data();
                
                // Tedarikçi bilgilerini al
                const supplierDoc = await getDoc(doc(db, 'users', bidData.supplierId));
                if (supplierDoc.exists()) {
                    const supplierData = supplierDoc.data();
                    bidData.supplierName = supplierData.companyName || supplierData.displayName;
                    bidData.supplierPhone = supplierData.phone || '';
                }
                
                bidsData.push(bidData);
            }
            
            // Excel oluştur
            const worksheet = this.generateComparisonExcel(demandData, bidsData);
            
            // Dosyayı indir
            const filename = `fiyat-karsilastirma-${demandData.demandCode || demandId}.xlsx`;
            this.downloadExcel(worksheet, filename);
            
            return true;
            
        } catch (error) {
            logger.error('Fiyat karşılaştırması oluşturulurken hata', error);
            throw error;
        }
    }
}

// Global olarak kullanılabilir hale getir
window.PriceComparisonSystem = PriceComparisonSystem;
