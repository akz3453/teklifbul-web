// Type declaration for pdf-parse/lib/pdf-parse.js
declare module 'pdf-parse/lib/pdf-parse.js' {
  export interface PdfMeta {
    text: string;
    numpages: number;
    info?: any;
  }
  
  export default function pdfParse(
    data: Buffer | Uint8Array
  ): Promise<PdfMeta>;
}
