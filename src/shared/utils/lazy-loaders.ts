/**
 * Lazy Loading Utility
 * Teklifbul Rule v1.0 - Performance Optimization
 * 
 * Bu modül ağır kütüphaneleri (Excel, PDF, Charts) lazy loading ile yükler.
    if (!pdfKitModule) {
        pdfKitModule = await import('pdfkit');
    }
    return pdfKitModule;
}

// Chart.js lazy loader (frontend)
let chartJSModule: any = null;

export async function loadChartJS() {
    if (!chartJSModule) {
        // @ts-ignore - Chart.js browser module
        chartJSModule = await import('https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js');
    }
    return chartJSModule;
}

// Example usage:
/*
// ❌ Old way (synchronous import)
import ExcelJS from 'exceljs';

async function exportToExcel() {
  const workbook = new ExcelJS.Workbook();
  // ...
}

// ✅ New way (lazy loading)
import { loadExcelJS } from './utils/lazy-loaders';

async function exportToExcel() {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.default.Workbook();
  // ...
}
*/

/**
 * Kullanım Örnekleri:
 * 
 * 1. Excel Export:
 * ```typescript
 * button.addEventListener('click', async () => {
 *   const ExcelJS = await loadExcelJS();
 *   const workbook = new ExcelJS.default.Workbook();
 *   // Excel işlemleri...
 * });
 * ```
 * 
 * 2. PDF Generation:
 * ```typescript
 * async function generatePDF() {
 *   const PDFDocument = await loadPDFKit();
 *   const doc = new PDFDocument.default();
 *   // PDF işlemleri...
 * }
 * ```
 * 
 * 3. Chart Rendering:
 * ```typescript
 * async function renderChart() {
 *   const Chart = await loadChartJS();
 *   new Chart.default(ctx, config);
 * }
 * ```
 */
