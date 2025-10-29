import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { dataRepo } from '../data/repo';
import { matchService } from '../services/matchService';
import { exportService } from '../services/exportService';
import { exportExcelService } from '../services/exportExcel';
import { MembershipConfig } from '../data/types';

const router = Router();

/**
 * GET /api/products - Tüm ürünleri getir
 */
router.get('/products', asyncHandler(async (req: Request, res: Response) => {
  const products = await dataRepo.getProducts();
  res.json({
    success: true,
    data: products,
    count: products.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/offers - Tüm teklifleri getir
 */
router.get('/offers', asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.query;
  
  let offers;
  if (requestId) {
    offers = await matchService.getOffersByRequestId(requestId as string);
  } else {
    offers = await dataRepo.getOffers();
  }
  
  res.json({
    success: true,
    data: offers,
    count: offers.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/comparison - Karşılaştırma sonuçlarını getir
 */
router.get('/comparison', asyncHandler(async (req: Request, res: Response) => {
  const { 
    urun_kodu, 
    tedarikci, 
    en_iyi_teklif,
    page = '1',
    limit = '100'
  } = req.query;

  let results = await matchService.getComparisonResults();

  // Filtreleme
  if (urun_kodu) {
    results = results.filter(r => r.urun_kodu.includes(urun_kodu as string));
  }
  if (tedarikci) {
    results = results.filter(r => r.tedarikci.toLowerCase().includes((tedarikci as string).toLowerCase()));
  }
  if (en_iyi_teklif === 'true') {
    results = results.filter(r => r.en_iyi_teklif);
  }

  // Sayfalama
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;
  const paginatedResults = results.slice(offset, offset + limitNum);

  res.json({
    success: true,
    data: paginatedResults,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: results.length,
      totalPages: Math.ceil(results.length / limitNum)
    },
    filters: {
      urun_kodu,
      tedarikci,
      en_iyi_teklif
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/statistics - İstatistikleri getir
 */
router.get('/statistics', asyncHandler(async (req: Request, res: Response) => {
  const statistics = await matchService.getStatistics();
  res.json({
    success: true,
    data: statistics,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/compare - Enhanced comparison results
 */
router.get('/compare', asyncHandler(async (req: Request, res: Response) => {
  const { requestId, membership } = req.query;
  
  let membershipConfig: MembershipConfig | undefined;
  if (membership) {
    try {
      membershipConfig = JSON.parse(membership as string);
    } catch (e) {
      // Default membership config
      membershipConfig = { tier: 'standard', maxVendors: 3, maxVendorsPerSheet: 5 };
    }
  }
  
  const comparison = await matchService.getComparisonWithMembership(
    requestId as string,
    membershipConfig
  );
  
  res.json({
    success: true,
    data: comparison,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/export/compare - Excel/CSV export with template injection
 */
router.get('/export/compare', asyncHandler(async (req: Request, res: Response) => {
  const { requestId, mode = 'template', membership } = req.query;
  
  let membershipConfig: MembershipConfig | undefined;
  if (membership) {
    try {
      membershipConfig = JSON.parse(membership as string);
    } catch (e) {
      membershipConfig = { tier: 'standard', maxVendors: 3, maxVendorsPerSheet: 5 };
    }
  }
  
  // Get comparison data
  const comparison = await matchService.getComparisonWithMembership(
    requestId as string,
    membershipConfig
  );
  
  let buffer: Buffer;
  let filename: string;
  let mimeType: string;
  
  if (mode === 'template') {
    // Template injection export
    buffer = await exportExcelService.exportWithTemplate(comparison, membershipConfig);
    filename = exportExcelService.generateFilename();
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (mode === 'csv') {
    // CSV export
    buffer = await exportExcelService.exportToCSV(comparison);
    filename = `mukayese_${new Date().toISOString().slice(0, 10)}.csv`;
    mimeType = 'text/csv';
  } else {
    // Fallback to original export service
    const exportResult = await exportService.export({
      type: 'xlsx',
      mode: mode as 'template' | 'programmatic',
      membership: membershipConfig,
      includeProducts: true,
      includeOffers: true,
      includeComparison: true
    });
    
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.setHeader('Content-Type', exportResult.mimeType);
    return res.send(exportResult.data);
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', mimeType);
  res.send(buffer);
}));

/**
 * GET /api/export - Legacy Excel/CSV export
 */
router.get('/export', asyncHandler(async (req: Request, res: Response) => {
  const { type = 'xlsx' } = req.query;
  
  if (!['xlsx', 'csv'].includes(type as string)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid export type. Must be xlsx or csv'
    });
  }

  const exportResult = await exportService.export({
    type: type as 'xlsx' | 'csv',
    includeProducts: true,
    includeOffers: true,
    includeComparison: true
  });

  res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
  res.setHeader('Content-Type', exportResult.mimeType);
  res.send(exportResult.data);
}));

/**
 * GET /api/offers/:id - Belirli bir teklifi getir
 */
router.get('/offers/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const offers = await dataRepo.getOffers();
  const offer = offers.find(o => o.id === id);
  
  if (!offer) {
    return res.status(404).json({
      success: false,
      error: 'Teklif bulunamadı'
    });
  }

  res.json({
    success: true,
    data: offer,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/products/:urun_kodu - Belirli bir ürünü getir
 */
router.get('/products/:urun_kodu', asyncHandler(async (req: Request, res: Response) => {
  const { urun_kodu } = req.params;
  const product = await dataRepo.getProductByCode(urun_kodu);
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Ürün bulunamadı'
    });
  }

  const offers = await dataRepo.getOffersByProductCode(urun_kodu);
  
  res.json({
    success: true,
    data: {
      product,
      offers,
      offerCount: offers.length
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/ranking/:productCode - Vendor ranking for specific product
 */
router.get('/ranking/:productCode', asyncHandler(async (req: Request, res: Response) => {
  const { productCode } = req.params;
  
  const ranking = await matchService.getVendorRanking(productCode);
  
  res.json({
    success: true,
    data: {
      productCode,
      ranking,
      count: ranking.length
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/savings - Calculate total savings
 */
router.get('/savings', asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = req.query;
  
  const savings = await matchService.calculateTotalSavings(requestId as string);
  
  res.json({
    success: true,
    data: savings,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/offers - Create new offer
 */
router.post('/offers', asyncHandler(async (req: Request, res: Response) => {
  const offerData = req.body;
  
  // Validate required fields
  const requiredFields = ['requestId', 'vendor', 'productCode', 'qty', 'unit', 'currency', 'price'];
  const missingFields = requiredFields.filter(field => !offerData[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    });
  }
  
  // Validate currency
  if (!['TRY', 'USD', 'EUR', 'GBP'].includes(offerData.currency)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid currency. Must be TRY, USD, EUR, or GBP'
    });
  }
  
  // Validate price and qty
  if (offerData.price <= 0 || offerData.qty <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Price and quantity must be positive numbers'
    });
  }
  
  // Create offer
  const newOffer = {
    id: `OFFER-${Date.now()}`,
    requestId: offerData.requestId,
    vendor: offerData.vendor,
    productCode: offerData.productCode,
    qty: offerData.qty,
    unit: offerData.unit,
    currency: offerData.currency,
    price: offerData.price,
    brand: offerData.brand,
    lead_time_days: offerData.lead_time_days,
    delivery_date: offerData.delivery_date,
    payment_terms: offerData.payment_terms,
    shipping_type: offerData.shipping_type,
    shipping_cost: offerData.shipping_cost || 0,
    delivery_method: offerData.delivery_method,
    min_order_qty: offerData.min_order_qty,
    vat_rate: offerData.vat_rate || 20,
    notes: offerData.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active'
  };
  
  // In a real implementation, this would save to database
  // For now, we'll just return the created offer
  res.status(201).json({
    success: true,
    data: newOffer,
    message: 'Offer created successfully',
    timestamp: new Date().toISOString()
  });
}));

export { router as offersRouter };
