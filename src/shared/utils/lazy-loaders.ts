/**
 * Lazy Loading Utility
 * Teklifbul Rule v1.0 - Performance Optimization
 *
 * Bu modul agir kutuphaneleri (Excel, PDF, Charts) lazy loading ile yukler.
 * Boylece ilk paint daha hizli olur, kullanici sadece ihtiyac duyunca cdn/dep cekilir.
 */

import type ExcelJSType from 'exceljs';

let excelJSModule: typeof ExcelJSType | null = null;

/**
 * ExcelJS lazy loader (hem tarayici hem Node.js icin uyumludur)
 * @returns ExcelJS modul namespace'i (Workbook, Cell, Row vb.)
 */
export async function loadExcelJS(): Promise<typeof ExcelJSType> {
  if (!excelJSModule) {
    const mod = await import('exceljs');
    // ESM/CJS interop: bazi build target'larinda default uzerinden gelir
    excelJSModule = ((mod as unknown as { default?: typeof ExcelJSType }).default ?? mod) as typeof ExcelJSType;
  }
  return excelJSModule;
}

let pdfKitModule: unknown = null;

/**
 * PDFKit lazy loader (Node.js / SSR icin)
 */
export async function loadPDFKit(): Promise<unknown> {
  if (!pdfKitModule) {
    pdfKitModule = await import('pdfkit');
  }
  return pdfKitModule;
}

let chartJSModule: unknown = null;

/**
 * Chart.js lazy loader (sadece tarayici)
 * Not: Bu CDN kaynagi import.meta.url destekleyen modern tarayicilarda calisir.
 */
export async function loadChartJS(): Promise<unknown> {
  if (!chartJSModule) {
    // @ts-expect-error - Chart.js external CDN module (browser-only)
    chartJSModule = await import('https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js');
  }
  return chartJSModule;
}
