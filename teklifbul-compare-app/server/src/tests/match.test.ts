import { MatchService } from '../services/matchService';
import { DataRepository } from '../data/repo';

describe('MatchService', () => {
  let matchService: MatchService;
  let mockDataRepo: DataRepository;

  beforeEach(() => {
    mockDataRepo = new DataRepository();
    matchService = new MatchService(mockDataRepo);
  });

  describe('getComparisonResults', () => {
    it('should return comparison results for all products', async () => {
      const results = await matchService.getComparisonResults();
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check structure of first result
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('urun_kodu');
      expect(firstResult).toHaveProperty('urun_adi');
      expect(firstResult).toHaveProperty('kaynak_fiyat');
      expect(firstResult).toHaveProperty('teklif_fiyati');
      expect(firstResult).toHaveProperty('fark');
      expect(firstResult).toHaveProperty('fark_yuzde');
      expect(firstResult).toHaveProperty('en_iyi_teklif');
    });

    it('should calculate correct price differences', async () => {
      const results = await matchService.getComparisonResults();
      
      for (const result of results) {
        if (result.teklif_fiyati > 0) {
          const expectedDiff = result.kaynak_fiyat - result.teklif_fiyati;
          const expectedDiffPercent = (expectedDiff / result.kaynak_fiyat) * 100;
          
          expect(result.fark).toBeCloseTo(expectedDiff, 2);
          expect(result.fark_yuzde).toBeCloseTo(expectedDiffPercent, 2);
        }
      }
    });

    it('should mark best offers correctly', async () => {
      const results = await matchService.getComparisonResults();
      
      // Group by product code
      const productGroups = results.reduce((acc, result) => {
        if (!acc[result.urun_kodu]) {
          acc[result.urun_kodu] = [];
        }
        acc[result.urun_kodu].push(result);
        return acc;
      }, {} as Record<string, typeof results>);
      
      // Check that only one offer per product is marked as best
      for (const [productCode, productResults] of Object.entries(productGroups)) {
        const offers = productResults.filter(r => r.teklif_fiyati > 0);
        if (offers.length > 0) {
          const bestOffers = offers.filter(r => r.en_iyi_teklif);
          expect(bestOffers.length).toBe(1);
          
          const bestOffer = bestOffers[0];
          const minPrice = Math.min(...offers.map(o => o.teklif_fiyati));
          expect(bestOffer.teklif_fiyati).toBe(minPrice);
        }
      }
    });
  });

  describe('getBestOffers', () => {
    it('should return only best offers', async () => {
      const bestOffers = await matchService.getBestOffers();
      
      expect(Array.isArray(bestOffers)).toBe(true);
      expect(bestOffers.every(offer => offer.en_iyi_teklif)).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return valid statistics', async () => {
      const stats = await matchService.getStatistics();
      
      expect(stats).toHaveProperty('toplam_urun');
      expect(stats).toHaveProperty('toplam_teklif');
      expect(stats).toHaveProperty('en_iyi_teklif_sayisi');
      expect(stats).toHaveProperty('ortalama_fark_yuzde');
      expect(stats).toHaveProperty('en_yuksek_tasarruf');
      expect(stats).toHaveProperty('en_yuksek_tasarruf_urun');
      
      expect(typeof stats.toplam_urun).toBe('number');
      expect(typeof stats.toplam_teklif).toBe('number');
      expect(typeof stats.en_iyi_teklif_sayisi).toBe('number');
      expect(typeof stats.ortalama_fark_yuzde).toBe('number');
      expect(typeof stats.en_yuksek_tasarruf).toBe('number');
      expect(typeof stats.en_yuksek_tasarruf_urun).toBe('string');
    });
  });
});
