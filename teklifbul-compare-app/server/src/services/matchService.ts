import { Product, Offer, ComparisonResult, ComparisonRow, VendorOffer, MembershipConfig } from '../data/types';
import { DataRepository } from '../data/repo';
import { fxService } from './fx';

export class MatchService {
  constructor(private dataRepo: DataRepository) {}

  /**
   * Ürünler ve teklifleri eşleştirir, karşılaştırma sonuçlarını üretir
   */
  async getComparisonResults(): Promise<ComparisonResult[]> {
    const [products, offers] = await Promise.all([
      this.dataRepo.getProducts(),
      this.dataRepo.getOffers()
    ]);

    const results: ComparisonResult[] = [];

    for (const product of products) {
      const productOffers = offers.filter(offer => offer.urun_kodu === product.urun_kodu);
      
      if (productOffers.length === 0) {
        // Teklif olmayan ürünler için boş kayıt
        results.push({
          urun_kodu: product.urun_kodu,
          urun_adi: product.urun_adi,
          kategori: product.kategori,
          kaynak_fiyat: product.kaynak_fiyat,
          tedarikci: '-',
          teklif_fiyati: 0,
          fark: 0,
          fark_yuzde: 0,
          en_iyi_teklif: false,
          para_birimi: product.para_birimi,
          min_siparis: product.min_siparis,
          teslim_suresi_gun: 0,
          teklif_tarihi: '-',
          marka: '-',
          aciklama: 'Teklif bulunamadı',
          durum: 'tekliif_yok'
        });
        continue;
      }

      // En iyi teklifi bul (en düşük fiyat)
      const bestOffer = productOffers.reduce((best, current) => 
        current.teklif_fiyati < best.teklif_fiyati ? current : best
      );

      // Her teklif için karşılaştırma sonucu oluştur
      for (const offer of productOffers) {
        const fark = product.kaynak_fiyat - offer.teklif_fiyati;
        const fark_yuzde = product.kaynak_fiyat > 0 
          ? (fark / product.kaynak_fiyat) * 100 
          : 0;

        results.push({
          urun_kodu: product.urun_kodu,
          urun_adi: product.urun_adi,
          kategori: product.kategori,
          kaynak_fiyat: product.kaynak_fiyat,
          tedarikci: offer.tedarikci,
          teklif_fiyati: offer.teklif_fiyati,
          fark: fark,
          fark_yuzde: fark_yuzde,
          en_iyi_teklif: offer.id === bestOffer.id,
          para_birimi: offer.para_birimi,
          min_siparis: offer.min_siparis,
          teslim_suresi_gun: offer.teslim_suresi_gun,
          teklif_tarihi: offer.teklif_tarihi,
          marka: offer.marka,
          aciklama: offer.aciklama,
          durum: offer.durum
        });
      }
    }

    return results;
  }

  /**
   * Belirli bir ürün için karşılaştırma sonuçlarını getirir
   */
  async getComparisonByProduct(urun_kodu: string): Promise<ComparisonResult[]> {
    const allResults = await this.getComparisonResults();
    return allResults.filter(result => result.urun_kodu === urun_kodu);
  }

  /**
   * Belirli bir tedarikçi için karşılaştırma sonuçlarını getirir
   */
  async getComparisonBySupplier(tedarikci: string): Promise<ComparisonResult[]> {
    const allResults = await this.getComparisonResults();
    return allResults.filter(result => result.tedarikci === tedarikci);
  }

  /**
   * En iyi teklifleri getirir
   */
  async getBestOffers(): Promise<ComparisonResult[]> {
    const allResults = await this.getComparisonResults();
    return allResults.filter(result => result.en_iyi_teklif);
  }

  /**
   * İstatistikleri hesaplar
   */
  async getStatistics(): Promise<{
    toplam_urun: number;
    toplam_teklif: number;
    en_iyi_teklif_sayisi: number;
    ortalama_fark_yuzde: number;
    en_yuksek_tasarruf: number;
    en_yuksek_tasarruf_urun: string;
  }> {
    const results = await this.getComparisonResults();
    
    const urunler = [...new Set(results.map(r => r.urun_kodu))];
    const teklifler = results.filter(r => r.teklif_fiyati > 0);
    const enIyiTeklifler = results.filter(r => r.en_iyi_teklif);
    
    const ortalamaFarkYuzde = teklifler.length > 0 
      ? teklifler.reduce((sum, r) => sum + r.fark_yuzde, 0) / teklifler.length 
      : 0;
    
    const enYuksekTasarruf = Math.max(...teklifler.map(r => r.fark), 0);
    const enYuksekTasarrufUrun = teklifler.find(r => r.fark === enYuksekTasarruf)?.urun_adi || '-';

    return {
      toplam_urun: urunler.length,
      toplam_teklif: teklifler.length,
      en_iyi_teklif_sayisi: enIyiTeklifler.length,
      ortalama_fark_yuzde: Math.round(ortalamaFarkYuzde * 100) / 100,
      en_yuksek_tasarruf: enYuksekTasarruf,
      en_yuksek_tasarruf_urun: enYuksekTasarrufUrun
    };
  }

  /**
   * Enhanced comparison with new offer fields and ranking
   */
  async getEnhancedComparison(requestId?: string): Promise<ComparisonResult> {
    const offers = await this.dataRepo.getOffers();
    const products = await this.dataRepo.getProducts();
    
    // Filter offers by request ID if provided
    const filteredOffers = requestId 
      ? offers.filter(offer => offer.requestId === requestId)
      : offers;

    // Group offers by product code
    const productGroups = new Map<string, Offer[]>();
    filteredOffers.forEach(offer => {
      const productCode = offer.productCode || offer.urun_kodu;
      if (productCode) {
        if (!productGroups.has(productCode)) {
          productGroups.set(productCode, []);
        }
        productGroups.get(productCode)!.push(offer);
      }
    });

    const rows: ComparisonRow[] = [];
    let bestOverallVendor = '';
    let bestOverallTotal = Infinity;
    let allVendors = new Set<string>();

    // Process each product group
    for (const [productCode, productOffers] of productGroups) {
      const product = products.find(p => p.urun_kodu === productCode);
      if (!product) continue;

      // Calculate totals and rankings for each vendor offer
      const vendorOffers: VendorOffer[] = productOffers.map(offer => {
        const qty = offer.qty || 1;
        const unitPrice = offer.price || offer.teklif_fiyati || 0;
        const currency = offer.currency || offer.para_birimi || 'TRY';
        const shippingCost = offer.shipping_cost || 0;
        
        // Calculate total in TL
        const lineTotal = fxService.calculateLineTotal(qty, unitPrice, currency, shippingCost, 'TRY');
        
        return {
          vendor: offer.vendor || offer.tedarikci || 'Unknown',
          unitPrice: unitPrice,
          currency: currency,
          total: qty * unitPrice,
          totalTL: lineTotal,
          brand: offer.brand || offer.marka,
          leadTimeDays: offer.lead_time_days || offer.teslim_suresi_gun,
          deliveryDate: offer.delivery_date,
          paymentTerms: offer.payment_terms,
          shippingType: offer.shipping_type,
          shippingCost: shippingCost,
          deliveryMethod: offer.delivery_method,
          minOrderQty: offer.min_order_qty || offer.min_siparis,
          vatRate: offer.vat_rate || 20,
          notes: offer.notes || offer.aciklama,
          rank: 0, // Will be set after sorting
          isBest: false // Will be set after sorting
        };
      });

      // Sort by totalTL (ascending) and assign ranks
      vendorOffers.sort((a, b) => a.totalTL - b.totalTL);
      vendorOffers.forEach((vendor, index) => {
        vendor.rank = index + 1;
        vendor.isBest = index === 0;
        allVendors.add(vendor.vendor);
      });

      // Find best vendor for this product
      const bestVendor = vendorOffers[0];
      const bestTotalTL = bestVendor ? bestVendor.totalTL : 0;

      // Update overall best vendor
      if (bestTotalTL < bestOverallTotal) {
        bestOverallTotal = bestTotalTL;
        bestOverallVendor = bestVendor ? bestVendor.vendor : '';
      }

      rows.push({
        productCode: productCode,
        productName: product.urun_adi,
        qty: productOffers[0]?.qty || 1,
        unit: productOffers[0]?.unit || 'adet',
        vendors: vendorOffers,
        bestVendor: bestVendor ? bestVendor.vendor : '',
        bestTotalTL: bestTotalTL
      });
    }

    return {
      requestId: requestId || 'ALL',
      rows: rows,
      bestOverallVendor: bestOverallVendor,
      bestOverallTotal: bestOverallTotal,
      totalProducts: rows.length,
      totalVendors: allVendors.size,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get comparison with membership restrictions
   */
  async getComparisonWithMembership(
    requestId?: string, 
    membership?: MembershipConfig
  ): Promise<ComparisonResult> {
    const result = await this.getEnhancedComparison(requestId);
    
    if (!membership) {
      return result;
    }

    // Apply membership restrictions
    const restrictedRows = result.rows.map(row => {
      let restrictedVendors = row.vendors;
      
      if (membership.tier === 'standard') {
        // Standard: limit to first 3 vendors
        restrictedVendors = row.vendors.slice(0, 3);
      }
      
      return {
        ...row,
        vendors: restrictedVendors
      };
    });

    return {
      ...result,
      rows: restrictedRows
    };
  }

  /**
   * Get offers by request ID
   */
  async getOffersByRequestId(requestId: string): Promise<Offer[]> {
    const offers = await this.dataRepo.getOffers();
    return offers.filter(offer => offer.requestId === requestId);
  }

  /**
   * Get comparison by product code
   */
  async getComparisonByProductCode(productCode: string): Promise<ComparisonRow[]> {
    const result = await this.getEnhancedComparison();
    return result.rows.filter(row => row.productCode === productCode);
  }

  /**
   * Get vendor ranking for a specific product
   */
  async getVendorRanking(productCode: string): Promise<VendorOffer[]> {
    const rows = await this.getComparisonByProductCode(productCode);
    if (rows.length === 0) return [];
    
    return rows[0].vendors;
  }

  /**
   * Calculate total savings
   */
  async calculateTotalSavings(requestId?: string): Promise<{
    totalSavingsTL: number;
    averageSavingsPercent: number;
    bestSavingsByProduct: Array<{
      productCode: string;
      productName: string;
      savingsTL: number;
      savingsPercent: number;
      bestVendor: string;
    }>;
  }> {
    const result = await this.getEnhancedComparison(requestId);
    
    let totalSavingsTL = 0;
    let totalSavingsPercent = 0;
    let productCount = 0;
    
    const bestSavingsByProduct = result.rows.map(row => {
      if (row.vendors.length === 0) return null;
      
      const bestOffer = row.vendors[0]; // Already sorted by totalTL
      const worstOffer = row.vendors[row.vendors.length - 1];
      
      const savingsTL = worstOffer.totalTL - bestOffer.totalTL;
      const savingsPercent = worstOffer.totalTL > 0 
        ? (savingsTL / worstOffer.totalTL) * 100 
        : 0;
      
      totalSavingsTL += savingsTL;
      totalSavingsPercent += savingsPercent;
      productCount++;
      
      return {
        productCode: row.productCode,
        productName: row.productName,
        savingsTL: savingsTL,
        savingsPercent: savingsPercent,
        bestVendor: bestOffer.vendor
      };
    }).filter(Boolean);

    const averageSavingsPercent = productCount > 0 ? totalSavingsPercent / productCount : 0;

    return {
      totalSavingsTL,
      averageSavingsPercent,
      bestSavingsByProduct
    };
  }

  /**
   * Get payload for Excel export template
   */
  async getComparePayload(requestId?: string, membership: "standard" | "premium" = "standard"): Promise<{
    items: Array<{ no: number; name: string; qty: number; unit: string;
                   vendors: Array<{ name:string; unitPrice:number; total:number; totalTL:number }> }>;
    footer: { odeme?: string; teslim?: string; not?: string; bestVendor?: string };
    membership: "standard" | "premium";
  }> {
    const result = await this.getComparisonWithMembership(requestId, {
      tier: membership,
      maxVendors: membership === "standard" ? 3 : undefined,
      maxVendorsPerSheet: 5
    });

    // Transform to Excel template format
    const items = result.rows.map((row, index) => ({
      no: index + 1,
      name: row.productName,
      qty: row.qty,
      unit: row.unit,
      vendors: row.vendors.map(vendor => ({
        name: vendor.vendor,
        unitPrice: vendor.unitPrice,
        total: vendor.total,
        totalTL: vendor.totalTL
      }))
    }));

    const footer = {
      odeme: "ÖDEME ŞARTLARI: Peşin veya 30 gün vadeli",
      teslim: "TESLİM SÜRESİ: 15-30 gün",
      not: "NOTLAR: Tüm fiyatlar KDV dahil, teslim şartları sözleşmede belirtilecektir",
      bestVendor: `${result.bestOverallVendor} (${result.bestOverallTotal.toFixed(2)} TL)`
    };

    return {
      items,
      footer,
      membership
    };
  }
}

export const matchService = new MatchService(new DataRepository());

// Export the function for use in routes
export const getComparePayload = matchService.getComparePayload.bind(matchService);
