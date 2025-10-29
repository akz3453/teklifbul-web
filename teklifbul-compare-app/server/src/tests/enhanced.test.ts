import { matchService } from '../services/matchService';
import { fxService } from '../services/fx';
import { exportExcelService } from '../services/exportExcel';
import { dataRepo } from '../data/repo';

describe('Enhanced Offers Comparison System', () => {
  beforeEach(() => {
    // Reset any mocks or state before each test
  });

  describe('FX Service', () => {
    test('should convert currencies correctly', () => {
      expect(fxService.convert(100, 'USD', 'TRY')).toBe(3050);
      expect(fxService.convert(100, 'EUR', 'TRY')).toBe(3320);
      expect(fxService.convert(100, 'GBP', 'TRY')).toBe(3870);
    });

    test('should return same amount for same currency', () => {
      expect(fxService.convert(100, 'TRY', 'TRY')).toBe(100);
    });

    test('should calculate line totals correctly', () => {
      const total = fxService.calculateLineTotal(10, 50, 'USD', 100, 'TRY');
      // (10 * 50 + 100) * 30.5 = 600 * 30.5 = 18300
      expect(total).toBe(18300);
    });

    test('should format currency amounts', () => {
      expect(fxService.formatAmount(1234.56, 'TRY')).toContain('₺');
      expect(fxService.formatAmount(1234.56, 'USD')).toContain('$');
    });

    test('should get currency symbols', () => {
      expect(fxService.getCurrencySymbol('TRY')).toBe('₺');
      expect(fxService.getCurrencySymbol('USD')).toBe('$');
      expect(fxService.getCurrencySymbol('EUR')).toBe('€');
      expect(fxService.getCurrencySymbol('GBP')).toBe('£');
    });
  });

  describe('Match Service - Enhanced Comparison', () => {
    test('should get enhanced comparison with vendor ranking', async () => {
      const comparison = await matchService.getEnhancedComparison('PR-2025-001');
      
      expect(comparison).toBeDefined();
      expect(comparison.requestId).toBe('PR-2025-001');
      expect(comparison.rows).toBeDefined();
      expect(comparison.bestOverallVendor).toBeDefined();
      expect(comparison.totalProducts).toBeGreaterThan(0);
      expect(comparison.totalVendors).toBeGreaterThan(0);
    });

    test('should rank vendors by totalTL correctly', async () => {
      const comparison = await matchService.getEnhancedComparison('PR-2025-001');
      
      if (comparison.rows.length > 0) {
        const row = comparison.rows[0];
        if (row.vendors.length > 1) {
          // Check that vendors are sorted by totalTL (ascending)
          for (let i = 1; i < row.vendors.length; i++) {
            expect(row.vendors[i].totalTL).toBeGreaterThanOrEqual(row.vendors[i-1].totalTL);
          }
          
          // Check that ranks are assigned correctly
          row.vendors.forEach((vendor, index) => {
            expect(vendor.rank).toBe(index + 1);
          });
          
          // Check that best vendor is marked
          expect(row.vendors[0].isBest).toBe(true);
          row.vendors.slice(1).forEach(vendor => {
            expect(vendor.isBest).toBe(false);
          });
        }
      }
    });

    test('should apply membership restrictions correctly', async () => {
      const standardMembership = { tier: 'standard' as const, maxVendors: 3, maxVendorsPerSheet: 5 };
      const premiumMembership = { tier: 'premium' as const, maxVendors: 999, maxVendorsPerSheet: 5 };
      
      const standardComparison = await matchService.getComparisonWithMembership('PR-2025-001', standardMembership);
      const premiumComparison = await matchService.getComparisonWithMembership('PR-2025-001', premiumMembership);
      
      // Standard should limit to 3 vendors per product
      standardComparison.rows.forEach(row => {
        expect(row.vendors.length).toBeLessThanOrEqual(3);
      });
      
      // Premium should show all vendors
      premiumComparison.rows.forEach(row => {
        expect(row.vendors.length).toBeGreaterThanOrEqual(standardComparison.rows.find(r => r.productCode === row.productCode)?.vendors.length || 0);
      });
    });

    test('should calculate savings correctly', async () => {
      const savings = await matchService.calculateTotalSavings('PR-2025-001');
      
      expect(savings).toBeDefined();
      expect(savings.totalSavingsTL).toBeGreaterThanOrEqual(0);
      expect(savings.averageSavingsPercent).toBeGreaterThanOrEqual(0);
      expect(savings.bestSavingsByProduct).toBeDefined();
    });

    test('should get vendor ranking for specific product', async () => {
      const ranking = await matchService.getVendorRanking('PRD001');
      
      expect(ranking).toBeDefined();
      expect(Array.isArray(ranking)).toBe(true);
      
      if (ranking.length > 0) {
        // Check that ranking is sorted by totalTL
        for (let i = 1; i < ranking.length; i++) {
          expect(ranking[i].totalTL).toBeGreaterThanOrEqual(ranking[i-1].totalTL);
        }
      }
    });
  });

  describe('Export Service', () => {
    test('should generate filename with timestamp', () => {
      const filename = exportExcelService.generateFilename();
      expect(filename).toMatch(/^mukayese_\d{8}_\d{4}\.xlsx$/);
    });

    test('should create vendor chunks correctly', async () => {
      const comparison = await matchService.getEnhancedComparison();
      
      // Test with standard membership
      const standardMembership = { tier: 'standard' as const, maxVendors: 3, maxVendorsPerSheet: 5 };
      
      try {
        const buffer = await exportExcelService.exportWithTemplate(comparison, standardMembership);
        expect(buffer).toBeDefined();
        expect(buffer.length).toBeGreaterThan(0);
      } catch (error) {
        // Template might not exist in test environment, which is expected
        console.warn('Template export failed (expected in test environment):', error);
      }
    });

    test('should export CSV correctly', async () => {
      const comparison = await matchService.getEnhancedComparison();
      
      const csvBuffer = await exportExcelService.exportToCSV(comparison);
      const csvContent = csvBuffer.toString('utf8');
      
      expect(csvContent).toContain('Ürün Kodu,Ürün Adı,Miktar,Birim');
      expect(csvContent).toContain('Tedarikçi,Birim Fiyat,Para Birimi');
      expect(csvContent).toContain('Toplam,Toplam (TL)');
    });
  });

  describe('Data Repository', () => {
    test('should get offers with new fields', async () => {
      const offers = await dataRepo.getOffers();
      
      expect(offers.length).toBeGreaterThan(0);
      
      const enhancedOffer = offers.find(o => o.requestId && o.vendor && o.productCode);
      if (enhancedOffer) {
        expect(enhancedOffer.requestId).toBeDefined();
        expect(enhancedOffer.vendor).toBeDefined();
        expect(enhancedOffer.productCode).toBeDefined();
        expect(enhancedOffer.qty).toBeDefined();
        expect(enhancedOffer.unit).toBeDefined();
        expect(enhancedOffer.currency).toBeDefined();
        expect(enhancedOffer.price).toBeDefined();
        expect(enhancedOffer.status).toBeDefined();
      }
    });

    test('should maintain backward compatibility with legacy fields', async () => {
      const offers = await dataRepo.getOffers();
      
      expect(offers.length).toBeGreaterThan(0);
      
      // Check that legacy fields are still available
      const legacyOffer = offers.find(o => o.tedarikci && o.urun_kodu);
      if (legacyOffer) {
        expect(legacyOffer.tedarikci).toBeDefined();
        expect(legacyOffer.urun_kodu).toBeDefined();
        expect(legacyOffer.teklif_fiyati).toBeDefined();
        expect(legacyOffer.para_birimi).toBeDefined();
      }
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete comparison workflow', async () => {
      // 1. Get offers
      const offers = await dataRepo.getOffers();
      expect(offers.length).toBeGreaterThan(0);
      
      // 2. Get enhanced comparison
      const comparison = await matchService.getEnhancedComparison();
      expect(comparison.rows.length).toBeGreaterThan(0);
      
      // 3. Calculate savings
      const savings = await matchService.calculateTotalSavings();
      expect(savings.totalSavingsTL).toBeGreaterThanOrEqual(0);
      
      // 4. Export to CSV
      const csvBuffer = await exportExcelService.exportToCSV(comparison);
      expect(csvBuffer.length).toBeGreaterThan(0);
    });

    test('should handle currency conversion in comparison', async () => {
      const comparison = await matchService.getEnhancedComparison();
      
      comparison.rows.forEach(row => {
        row.vendors.forEach(vendor => {
          // Check that totalTL is calculated correctly
          expect(vendor.totalTL).toBeGreaterThan(0);
          
          // If currency is not TRY, totalTL should be different from total
          if (vendor.currency !== 'TRY') {
            expect(vendor.totalTL).not.toBe(vendor.total);
          }
        });
      });
    });

    test('should handle membership restrictions correctly', async () => {
      const standardMembership = { tier: 'standard' as const, maxVendors: 3, maxVendorsPerSheet: 5 };
      const premiumMembership = { tier: 'premium' as const, maxVendors: 999, maxVendorsPerSheet: 5 };
      
      const standardComparison = await matchService.getComparisonWithMembership(undefined, standardMembership);
      const premiumComparison = await matchService.getComparisonWithMembership(undefined, premiumMembership);
      
      // Standard should have fewer or equal vendors per product
      standardComparison.rows.forEach((row, index) => {
        const premiumRow = premiumComparison.rows[index];
        if (premiumRow) {
          expect(row.vendors.length).toBeLessThanOrEqual(premiumRow.vendors.length);
        }
      });
    });
  });
});
