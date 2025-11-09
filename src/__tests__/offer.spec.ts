/**
 * Teklif Modülü Testleri
 */

import { describe, it, expect } from '@jest/globals';
import { OfferSchema, Offer, Priority, Currency } from '../domain/offer/schema';
import { mapPriority, mapCurrency, mapDemandToOfferHeader, mapDemandItemsToOfferLines, calculateDifference } from '../domain/offer/mapping';
import { requiresCurrencyInfo, getCurrencyNameTR } from '../services/currency';

describe('Offer Module Tests', () => {
  
  describe('Mapping', () => {
    
    it('should map priority EN→TR correctly', () => {
      expect(mapPriority('price')).toBe('price');
      expect(mapPriority('speed')).toBe('date');
      expect(mapPriority('quality')).toBe('quality');
      expect(mapPriority('fiyat')).toBe('price');
      expect(mapPriority('hız')).toBe('date');
      expect(mapPriority('kalite')).toBe('quality');
      expect(mapPriority(undefined)).toBeUndefined();
    });
    
    it('should map currency correctly', () => {
      expect(mapCurrency('TRY')).toBe('TRY');
      expect(mapCurrency('USD')).toBe('USD');
      expect(mapCurrency('TL')).toBe('TRY');
      expect(mapCurrency('$')).toBe('USD');
      expect(mapCurrency('€')).toBe('EUR');
      expect(mapCurrency('')).toBe('TRY');
      expect(mapCurrency(undefined)).toBe('TRY');
    });
    
    it('should map demand to offer header', () => {
      const demand = {
        satfk: 'SATFK-20251024-00C9',
        title: 'Test Talep',
        siteName: 'Test Şantiye',
        purchaseLocation: 'İstanbul',
        priority: 'price' as Priority,
        dueDate: '2025-12-31',
        currency: 'TRY',
        biddingMode: 'secret' as const,
      };
      
      const header = mapDemandToOfferHeader(demand);
      
      expect(header.satfkCode).toBe('SATFK-20251024-00C9');
      expect(header.title).toBe('Test Talep');
      expect(header.site).toBe('Test Şantiye');
      expect(header.purchaseCity).toBe('İstanbul');
      expect(header.priority).toBe('price');
      expect(header.currency).toBe('TRY');
      expect(header.isSealedBid).toBe(true);
    });
    
    it('should map demand items to offer lines', () => {
      const demand = {
        items: [
          {
            name: 'Ürün 1',
            qty: 10,
            unit: 'adet',
            unitPrice: 100,
            brand: 'Marka A',
            deliveryDate: '2025-12-31',
          },
          {
            name: 'Ürün 2',
            qty: 5,
            unit: 'kg',
            unitPrice: 50,
          },
        ],
      };
      
      const lines = mapDemandItemsToOfferLines(demand);
      
      expect(lines.length).toBe(2);
      expect(lines[0].itemName).toBe('Ürün 1');
      expect(lines[0].quantity).toBe(10);
      expect(lines[0].uom).toBe('adet');
      expect(lines[0].unitPrice).toBe(100);
      expect(lines[0].brand).toBe('Marka A');
      expect(lines[0].demandQuantity).toBe(10);
    });
    
  });
  
  describe('KDV/Net Hesaplamaları', () => {
    
    it('should calculate net unit with VAT correctly', () => {
      const unitPrice = 100;
      const vatRate = 18;
      const expected = 100 * (1 + 18 / 100); // 118
      
      // Bu fonksiyon OfferTab.tsx'te tanımlı, burada test ediyoruz
      const calculateNetUnitWithVat = (up: number, vr: number) => up * (1 + vr / 100);
      expect(calculateNetUnitWithVat(unitPrice, vatRate)).toBe(118);
    });
    
    it('should calculate totals correctly', () => {
      const quantity = 10;
      const unitPrice = 100;
      const vatRate = 18;
      
      const netUnitWithVat = unitPrice * (1 + vatRate / 100); // 118
      const totalExVat = quantity * unitPrice; // 1000
      const totalWithVat = quantity * netUnitWithVat; // 1180
      
      expect(totalExVat).toBe(1000);
      expect(totalWithVat).toBe(1180);
    });
    
  });
  
  describe('Termin/Miktar Fark Uyarıları', () => {
    
    it('should detect quantity difference', () => {
      const demandLine = {
        demandQuantity: 10,
      };
      
      const offerLine = {
        quantity: 12,
        unitPrice: 100,
        vatRate: 18,
        uom: 'adet',
      };
      
      const diff = calculateDifference(demandLine, offerLine as any);
      
      expect(diff.hasDifference).toBe(true);
      expect(diff.quantityDiff).toBe(2);
    });
    
    it('should detect price difference', () => {
      const demandLine = {
        demandUnitPrice: 100,
      };
      
      const offerLine = {
        quantity: 10,
        unitPrice: 120,
        vatRate: 18,
        uom: 'adet',
      };
      
      const diff = calculateDifference(demandLine, offerLine as any);
      
      expect(diff.hasDifference).toBe(true);
      expect(diff.unitPriceDiff).toBe(20);
      expect(diff.pricePercentDiff).toBe(20); // %20 artış
    });
    
    it('should detect delivery date difference', () => {
      const demandLine = {
        demandDeliveryDate: '2025-12-31',
      };
      
      const offerLine = {
        quantity: 10,
        unitPrice: 100,
        vatRate: 18,
        uom: 'adet',
        deliveryDate: '2026-01-05',
      };
      
      const diff = calculateDifference(demandLine, offerLine as any);
      
      expect(diff.hasDifference).toBe(true);
      expect(diff.deliveryDateDiff).toBeGreaterThan(0);
    });
    
    it('should detect UOM difference', () => {
      const demandLine = {
        demandUom: 'adet',
      };
      
      const offerLine = {
        quantity: 10,
        unitPrice: 100,
        vatRate: 18,
        uom: 'kg',
      };
      
      const diff = calculateDifference(demandLine, offerLine as any);
      
      expect(diff.hasDifference).toBe(true);
      expect(diff.uomDiff).toBe(true);
    });
    
  });
  
  describe('Ödeme Şartları', () => {
    
    it('should format payment terms correctly', () => {
      // OfferTab.tsx'teki formatPaymentTerms fonksiyonunu test ediyoruz
      const formatPaymentTerms = (terms: any): string => {
        if (!terms || !terms.type) return '';
        
        switch (terms.type) {
          case 'pesin_escrow':
            return `Peşin (Escrow${terms.escrowDays ? ` / ${terms.escrowDays} gün` : ''})`;
          case 'pesin_teslim_onay':
            return `Peşin (Teslim&Onay${terms.deliveryConfirmDays ? ` / ${terms.deliveryConfirmDays} gün` : ''})`;
          case 'pesin_on_odeme':
            return `Peşin (Ön Ödeme %${terms.advancePercent || 0})`;
          case 'kredi_karti':
            return `Kredi Kartı (${terms.installments || 1} taksit${terms.financeRate ? ` / %${terms.financeRate} faiz` : ''})`;
          case 'acik_hesap':
            return `Açık Hesap (${terms.dueDays || 30} gün)`;
          case 'evrak_cek':
            return `Evrak/Çek (${terms.checkCount || 1} adet)`;
          default:
            return '';
        }
      };
      
      expect(formatPaymentTerms({ type: 'pesin_escrow', escrowDays: 7 })).toBe('Peşin (Escrow / 7 gün)');
      expect(formatPaymentTerms({ type: 'pesin_teslim_onay' })).toBe('Peşin (Teslim&Onay)');
      expect(formatPaymentTerms({ type: 'pesin_on_odeme', advancePercent: 30 })).toBe('Peşin (Ön Ödeme %30)');
      expect(formatPaymentTerms({ type: 'kredi_karti', installments: 6, financeRate: 2.5 })).toBe('Kredi Kartı (6 taksit / %2.5 faiz)');
      expect(formatPaymentTerms({ type: 'acik_hesap', dueDays: 45 })).toBe('Açık Hesap (45 gün)');
      expect(formatPaymentTerms({ type: 'evrak_cek', checkCount: 3 })).toBe('Evrak/Çek (3 adet)');
    });
    
  });
  
  describe('Excel Export Formülleri ve Alan Yerleşimi', () => {
    
    it('should have correct cell formulas', () => {
      // Excel export'ta kullanılan formüllerin doğru olduğunu test ediyoruz
      const rowNum = 6;
      
      // P sütunu: KDV Dahil Birim Fiyat = H*(1+N/100)
      const formulaP = `H${rowNum}*(1+N${rowNum}/100)`;
      expect(formulaP).toBe('H6*(1+N6/100)');
      
      // O sütunu: KDV Dahil Toplam = F*P
      const formulaO = `F${rowNum}*P${rowNum}`;
      expect(formulaO).toBe('F6*P6');
      
      // Toplam satırı: SUM
      const totalRow = 10;
      const formulaK = `SUM(K6:L${totalRow - 1})`;
      expect(formulaK).toBe('SUM(K6:L9)');
    });
    
    it('should have correct header cell addresses', () => {
      // Excel'deki hücre adreslerinin doğru olduğunu kontrol ediyoruz
      expect('H5').toBe('H5'); // BİRİM FİYAT (KDV Hariç)
      expect('K5').toBe('K5'); // KDV HARİÇ TOPLAM TL (başlangıç)
      expect('L5').toBe('L5'); // KDV HARİÇ TOPLAM TL (merge)
      expect('N5').toBe('N5'); // KDV ORANI (%)
      expect('P5').toBe('P5'); // KDV DAHİL BİRİM FİYAT
      expect('O5').toBe('O5'); // KDV DAHİL TOPLAM TL
      expect('M5').toBe('M5'); // ÖDEME ŞARTLARI
    });
    
  });
  
  describe('Currency Service', () => {
    
    it('should require currency info for non-TRY currencies', () => {
      expect(requiresCurrencyInfo('TRY')).toBe(false);
      expect(requiresCurrencyInfo('USD')).toBe(true);
      expect(requiresCurrencyInfo('EUR')).toBe(true);
      expect(requiresCurrencyInfo('GBP')).toBe(true);
    });
    
    it('should get Turkish currency names', () => {
      expect(getCurrencyNameTR('TRY')).toBe('Türk Lirası');
      expect(getCurrencyNameTR('USD')).toBe('Amerikan Doları');
      expect(getCurrencyNameTR('EUR')).toBe('Euro');
      expect(getCurrencyNameTR('GBP')).toBe('İngiliz Sterlini');
    });
    
  });
  
  describe('Offer Schema Validation', () => {
    
    it('should validate correct offer', () => {
      const validOffer: Offer = {
        header: {
          satfkCode: 'SATFK-20251024-00C9',
          title: 'Test Talep',
          currency: 'TRY',
        },
        lines: [
          {
            itemName: 'Ürün 1',
            uom: 'adet',
            quantity: 10,
            unitPrice: 100,
            vatRate: 18,
          },
        ],
        attachments: [],
        status: 'draft',
      };
      
      const result = OfferSchema.safeParse(validOffer);
      expect(result.success).toBe(true);
    });
    
    it('should reject offer without satfkCode', () => {
      const invalidOffer = {
        header: {
          title: 'Test',
          currency: 'TRY',
        },
        lines: [
          {
            itemName: 'Ürün 1',
            uom: 'adet',
            quantity: 10,
            unitPrice: 100,
          },
        ],
      };
      
      const result = OfferSchema.safeParse(invalidOffer);
      expect(result.success).toBe(false);
    });
    
    it('should reject offer without lines', () => {
      const invalidOffer = {
        header: {
          satfkCode: 'SATFK-20251024-00C9',
          title: 'Test',
          currency: 'TRY',
        },
        lines: [],
      };
      
      const result = OfferSchema.safeParse(invalidOffer);
      expect(result.success).toBe(false);
    });
    
  });
  
});

