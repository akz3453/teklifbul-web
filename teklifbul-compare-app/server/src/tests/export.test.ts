import { ExportService } from '../services/exportService';
import { DataRepository } from '../data/repo';
import { MatchService } from '../services/matchService';

describe('ExportService', () => {
  let exportService: ExportService;
  let mockDataRepo: DataRepository;
  let mockMatchService: MatchService;

  beforeEach(() => {
    mockDataRepo = new DataRepository();
    mockMatchService = new MatchService(mockDataRepo);
    exportService = new ExportService(mockDataRepo, mockMatchService);
  });

  describe('exportToExcel', () => {
    it('should generate Excel buffer', async () => {
      const buffer = await exportService.exportToExcel();
      
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
      
      // Check Excel file signature
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4B); // 'K'
    });
  });

  describe('exportToCSV', () => {
    it('should generate CSV string', async () => {
      const csvString = await exportService.exportToCSV();
      
      expect(csvString).toBeDefined();
      expect(typeof csvString).toBe('string');
      expect(csvString.length).toBeGreaterThan(0);
      
      // Check CSV structure
      const lines = csvString.split('\n');
      expect(lines.length).toBeGreaterThan(1); // Header + data
      
      // Check header
      const header = lines[0];
      expect(header).toContain('Ürün Kodu');
      expect(header).toContain('Tedarikçi');
      expect(header).toContain('Teklif Fiyatı');
    });
  });

  describe('generateFileName', () => {
    it('should generate valid Excel filename', () => {
      const filename = exportService.generateFileName('xlsx');
      
      expect(filename).toMatch(/^mukayese_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/);
    });

    it('should generate valid CSV filename', () => {
      const filename = exportService.generateFileName('csv');
      
      expect(filename).toMatch(/^mukayese_\d{4}-\d{2}-\d{2}_\d{4}\.csv$/);
    });
  });

  describe('export', () => {
    it('should export Excel with correct properties', async () => {
      const result = await exportService.export({ type: 'xlsx' });
      
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('mimeType');
      
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.filename).toMatch(/\.xlsx$/);
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should export CSV with correct properties', async () => {
      const result = await exportService.export({ type: 'csv' });
      
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('mimeType');
      
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.filename).toMatch(/\.csv$/);
      expect(result.mimeType).toBe('text/csv; charset=utf-8');
    });
  });
});
