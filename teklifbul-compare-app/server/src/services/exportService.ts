import * as XLSX from 'xlsx';
import { stringify } from 'csv-stringify/sync';
import { format } from 'date-fns';
import { Product, Offer, ComparisonResult, ExportOptions } from '../data/types';
import { DataRepository } from '../data/repo';
import { MatchService } from './matchService';

export class ExportService {
  constructor(
    private dataRepo: DataRepository,
    private matchService: MatchService
  ) {}

  /**
   * Excel dosyası oluşturur (çok sayfalı)
   */
  async exportToExcel(): Promise<Buffer> {
    const [products, offers, comparisonResults] = await Promise.all([
      this.dataRepo.getProducts(),
      this.dataRepo.getOffers(),
      this.matchService.getComparisonResults()
    ]);

    const workbook = XLSX.utils.book_new();

    // Sayfa 1: Okunan Veri (Ürünler)
    const productsSheet = XLSX.utils.json_to_sheet(products.map(p => ({
      'Ürün Kodu': p.urun_kodu,
      'Ürün Adı': p.urun_adi,
      'Kategori': p.kategori,
      'Kaynak Fiyat': p.kaynak_fiyat,
      'Para Birimi': p.para_birimi,
      'Min Sipariş': p.min_siparis,
      'Açıklama': p.aciklama || '',
      'Güncelleme Tarihi': p.guncelleme_tarihi
    })));
    XLSX.utils.book_append_sheet(workbook, productsSheet, 'okunan_veri');

    // Sayfa 2: Gelen Teklifler Şablon
    const offersSheet = XLSX.utils.json_to_sheet(offers.map(o => ({
      'ID': o.id,
      'Tedarikçi': o.tedarikci,
      'Ürün Kodu': o.urun_kodu,
      'Teklif Fiyatı': o.teklif_fiyati,
      'Para Birimi': o.para_birimi,
      'Min Sipariş': o.min_siparis,
      'Teslim Süresi (Gün)': o.teslim_suresi_gun,
      'Teklif Tarihi': o.teklif_tarihi,
      'Marka': o.marka || '',
      'Açıklama': o.aciklama || '',
      'Durum': o.durum
    })));
    XLSX.utils.book_append_sheet(workbook, offersSheet, 'gelen_teklifler_sablon');

    // Sayfa 3: Mukayese - Format B: Detaylı Karşılaştırma
    const comparisonSheet = XLSX.utils.json_to_sheet(comparisonResults.map(c => ({
      'Ürün Kodu': c.urun_kodu,
      'Ürün Adı': c.urun_adi,
      'Kategori': c.kategori,
      'Tedarikçi': c.tedarikci,
      'Teklif Fiyatı': c.teklif_fiyati,
      'Kaynak Fiyat': c.kaynak_fiyat,
      'Fark': c.fark,
      'Fark %': `${c.fark_yuzde.toFixed(2)}%`,
      'Teslim Süresi (Gün)': c.teslim_suresi_gun,
      'Teklif Tarihi': c.teklif_tarihi,
      'En İyi Teklif': c.en_iyi_teklif ? 'EVET' : 'HAYIR',
      'Para Birimi': c.para_birimi,
      'Min Sipariş': c.min_siparis,
      'Marka': c.marka || '',
      'Açıklama': c.aciklama || '',
      'Durum': c.durum
    })));
    XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'mukayese');

    // Excel dosyasını buffer'a çevir
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    return excelBuffer;
  }

  /**
   * CSV dosyası oluşturur
   */
  async exportToCSV(): Promise<string> {
    const comparisonResults = await this.matchService.getComparisonResults();
    
    const csvData = comparisonResults.map(c => ({
      'Ürün Kodu': c.urun_kodu,
      'Ürün Adı': c.urun_adi,
      'Kategori': c.kategori,
      'Tedarikçi': c.tedarikci,
      'Teklif Fiyatı': c.teklif_fiyati,
      'Kaynak Fiyat': c.kaynak_fiyat,
      'Fark': c.fark,
      'Fark %': `${c.fark_yuzde.toFixed(2)}%`,
      'Teslim Süresi (Gün)': c.teslim_suresi_gun,
      'Teklif Tarihi': c.teklif_tarihi,
      'En İyi Teklif': c.en_iyi_teklif ? 'EVET' : 'HAYIR',
      'Para Birimi': c.para_birimi,
      'Min Sipariş': c.min_siparis,
      'Marka': c.marka || '',
      'Açıklama': c.aciklama || '',
      'Durum': c.durum
    }));

    return stringify(csvData, {
      header: true,
      delimiter: ';',
      bom: true // UTF-8 BOM for Turkish characters
    });
  }

  /**
   * Dosya adı oluşturur
   */
  generateFileName(type: 'xlsx' | 'csv'): string {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
    return `mukayese_${timestamp}.${type}`;
  }

  /**
   * Export işlemini gerçekleştirir
   */
  async export(options: ExportOptions): Promise<{ 
    data: Buffer | string; 
    filename: string; 
    mimeType: string 
  }> {
    const filename = this.generateFileName(options.type);
    
    if (options.type === 'xlsx') {
      const data = await this.exportToExcel();
      return {
        data,
        filename,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
    } else {
      const data = await this.exportToCSV();
      return {
        data: Buffer.from(data, 'utf-8'),
        filename,
        mimeType: 'text/csv; charset=utf-8'
      };
    }
  }
}

export const exportService = new ExportService(
  new DataRepository(),
  new MatchService(new DataRepository())
);
