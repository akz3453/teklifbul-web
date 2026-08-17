/**
 * Lazy Loading Utility
 * Teklifbul Rule v1.0 - Performance Optimization
 *
 * Bu modul agir kutuphaneleri (Excel, PDF, Charts) lazy loading ile yukler.
 * Boylece ilk paint daha hizli olur, kullanici sadece ihtiyac duyunca cdn/dep cekilir.
 */
let excelJSModule = null;
/**
 * ExcelJS lazy loader (hem tarayici hem Node.js icin uyumludur)
 * @returns ExcelJS modul namespace'i (Workbook, Cell, Row vb.)
 */
export async function loadExcelJS() {
    if (!excelJSModule) {
        const mod = await import('exceljs');
        // ESM/CJS interop: bazi build target'larinda default uzerinden gelir
        excelJSModule = (mod.default ?? mod);
    }
    return excelJSModule;
}
let pdfKitModule = null;
/**
 * PDFKit lazy loader (Node.js / SSR icin)
 */
export async function loadPDFKit() {
    if (!pdfKitModule) {
        pdfKitModule = await import('pdfkit');
    }
    return pdfKitModule;
}
let chartJSModule = null;
/**
 * Chart.js lazy loader (sadece tarayici)
 * Not: Bu CDN kaynagi import.meta.url destekleyen modern tarayicilarda calisir.
 */
export async function loadChartJS() {
    if (!chartJSModule) {
        // @ts-expect-error - Chart.js external CDN module (browser-only)
        chartJSModule = await import('https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js');
    }
    return chartJSModule;
}
