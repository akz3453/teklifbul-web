"use strict";
/**
 * Chunked Upload Utility
 * Teklifbul Rule v1.0 - Büyük veri yükleme için chunked upload + progress + cancel
 *
 * Büyük dosyaları parçalara bölerek yükler ve progress tracking sağlar.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUploadFile = validateUploadFile;
exports.processChunkedCSV = processChunkedCSV;
exports.processChunkedExcel = processChunkedExcel;
const async_utils_js_1 = require("./async-utils.js");
const logger_js_1 = require("../log/logger.js");
/**
 * Dosya validasyonu
 *
 * @param file - Dosya
 * @param options - Upload seçenekleri
 * @throws Error - Validasyon hatası
 */
function validateUploadFile(file, options = {}) {
    const { maxFileSize = 50 * 1024 * 1024, // 50MB
    allowedTypes = ['.csv', '.xlsx', '.xls'], } = options;
    // Dosya tipi kontrolü
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
        throw new Error(`Geçersiz dosya tipi. İzin verilen tipler: ${allowedTypes.join(', ')}`);
    }
    // Dosya boyutu kontrolü
    if (file.size > maxFileSize) {
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        throw new Error(`Dosya boyutu çok büyük. Maksimum boyut: ${maxSizeMB}MB`);
    }
}
/**
 * CSV dosyasını chunk'lara böl ve işle
 *
 * @param file - CSV dosyası
 * @param processor - Her chunk için işlem fonksiyonu
 * @param options - Upload seçenekleri
 * @returns ChunkedUploadResult
 */
async function processChunkedCSV(file, processor, options = {}) {
    const { chunkSize = 1000, signal, reportProgress, } = options;
    const startTime = Date.now();
    logger_js_1.logger.group('Chunked CSV Upload');
    logger_js_1.logger.info('Dosya yükleniyor', { fileName: file.name, fileSize: file.size });
    const report = (p) => {
        if (reportProgress)
            reportProgress(p);
        if (signal)
            (0, async_utils_js_1.checkAborted)(signal);
    };
    report(0);
    // Dosyayı oku
    const text = await file.text();
    report(5);
    // Satırlara böl
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const totalRows = lines.length;
    if (totalRows === 0) {
        throw new Error('Dosya boş veya geçersiz format');
    }
    logger_js_1.logger.info('Satırlar parse edildi', { totalRows });
    // Header'ı al (ilk satır)
    // const _header = lines[0].split(',').map(cell => cell.trim());
    const dataLines = lines.slice(1);
    report(10);
    // Chunk'lara böl
    const chunks = [];
    for (let i = 0; i < dataLines.length; i += chunkSize) {
        const chunk = dataLines.slice(i, i + chunkSize).map(line => {
            return line.split(',').map(cell => cell.trim());
        });
        chunks.push(chunk);
    }
    const totalChunks = chunks.length;
    logger_js_1.logger.info('Chunk\'lara bölündü', { totalChunks, chunkSize });
    report(15);
    // Her chunk'ı işle
    const results = [];
    let successfulChunks = 0;
    let failedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
        if (signal)
            (0, async_utils_js_1.checkAborted)(signal);
        try {
            const chunkResult = await processor(chunks[i], i, signal);
            results.push(chunkResult);
            successfulChunks++;
            // Progress: 15% - 90% (chunk işleme)
            const chunkProgress = 15 + (0, async_utils_js_1.calculateBatchProgress)(i + 1, totalChunks) * 0.75;
            report(chunkProgress);
        }
        catch (error) {
            failedChunks++;
            logger_js_1.logger.error(`Chunk ${i} işlenemedi`, error);
            // Hata durumunda devam et (kullanıcı iptal etmediyse)
            if (signal?.aborted) {
                throw new Error('İşlem iptal edildi');
            }
        }
    }
    report(95);
    const duration = Date.now() - startTime;
    logger_js_1.logger.info('Chunked upload tamamlandı', {
        totalRows,
        successfulChunks,
        failedChunks,
        duration: `${duration}ms`,
    });
    logger_js_1.logger.end();
    report(100);
    return {
        totalRows,
        successfulChunks,
        failedChunks,
        result: results,
    };
}
/**
 * Excel dosyasını chunk'lara böl ve işle
 *
 * @param file - Excel dosyası
 * @param processor - Her chunk için işlem fonksiyonu
 * @param options - Upload seçenekleri
 * @returns ChunkedUploadResult
 */
async function processChunkedExcel(file, processor, options = {}) {
    const { chunkSize = 1000, signal, reportProgress, } = options;
    const startTime = Date.now();
    logger_js_1.logger.group('Chunked Excel Upload');
    logger_js_1.logger.info('Dosya yükleniyor', { fileName: file.name, fileSize: file.size });
    const report = (p) => {
        if (reportProgress)
            reportProgress(p);
        if (signal)
            (0, async_utils_js_1.checkAborted)(signal);
    };
    report(0);
    // ExcelJS'i dinamik import et (tarayıcıda)
    const ExcelJS = (await Promise.resolve().then(() => __importStar(require('exceljs')))).default;
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);
    report(10);
    // İlk worksheet'i al
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('Excel dosyasında worksheet bulunamadı');
    }
    const totalRows = worksheet.rowCount;
    logger_js_1.logger.info('Excel satırları okundu', { totalRows });
    report(15);
    // Chunk'lara böl
    const chunks = [];
    const startRow = 2; // Header'ı atla (1. satır)
    for (let i = startRow; i <= totalRows; i += chunkSize) {
        const chunk = [];
        const endRow = Math.min(i + chunkSize - 1, totalRows);
        for (let rowNum = i; rowNum <= endRow; rowNum++) {
            if (signal)
                (0, async_utils_js_1.checkAborted)(signal);
            const row = worksheet.getRow(rowNum);
            const rowData = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
                rowData.push(cell.value);
            });
            if (rowData.some(cell => cell !== null && cell !== undefined && cell !== '')) {
                chunk.push(rowData);
            }
        }
        if (chunk.length > 0) {
            chunks.push(chunk);
        }
    }
    const totalChunks = chunks.length;
    logger_js_1.logger.info('Chunk\'lara bölündü', { totalChunks, chunkSize });
    report(20);
    // Her chunk'ı işle
    const results = [];
    let successfulChunks = 0;
    let failedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
        if (signal)
            (0, async_utils_js_1.checkAborted)(signal);
        try {
            const chunkResult = await processor(chunks[i], i, signal);
            results.push(chunkResult);
            successfulChunks++;
            // Progress: 20% - 90% (chunk işleme)
            const chunkProgress = 20 + (0, async_utils_js_1.calculateBatchProgress)(i + 1, totalChunks) * 0.70;
            report(chunkProgress);
        }
        catch (error) {
            failedChunks++;
            logger_js_1.logger.error(`Chunk ${i} işlenemedi`, error);
            // Hata durumunda devam et (kullanıcı iptal etmediyse)
            if (signal?.aborted) {
                throw new Error('İşlem iptal edildi');
            }
        }
    }
    report(95);
    const duration = Date.now() - startTime;
    logger_js_1.logger.info('Chunked upload tamamlandı', {
        totalRows,
        successfulChunks,
        failedChunks,
        duration: `${duration}ms`,
    });
    logger_js_1.logger.end();
    report(100);
    return {
        totalRows,
        successfulChunks,
        failedChunks,
        result: results,
    };
}
