/**
 * Teklif Modülü - Alan Eşleme (Mapping)
 * 
 * Talep detay sayfasındaki DOM/JSON alanlarını şemaya eşleyen deterministik bağlantılar.
 */

import { DemandData, OfferHeader, OfferLine, Priority } from './schema';
import synonyms from './synonyms.tr.json';

/**
 * Sözlük tabanlı eşleme fonksiyonu
 */
function mapField(fieldKey: string, value: any, synonymsMap: Record<string, string[]>): any {
  const normalizedKey = fieldKey.toLowerCase().trim();
  
  // Direkt eşleşme kontrolü
  if (synonymsMap[normalizedKey]) {
    return value;
  }
  
  // Sözlük eşleşmesi
  for (const [key, aliases] of Object.entries(synonymsMap)) {
    if (aliases.includes(normalizedKey)) {
      return value;
    }
  }
  
  return value;
}

/**
 * Öncelik çevirisi (EN → TR)
 */
export function mapPriority(priority: string | undefined): Priority | undefined {
  if (!priority) return undefined;
  
  const priorityMap: Record<string, Priority> = {
    'price': 'price',
    'fiyat': 'price',
    'speed': 'date',
    'hız': 'date',
    'date': 'date',
    'tarih': 'date',
    'quality': 'quality',
    'kalite': 'quality',
  };
  
  const normalized = priority.toLowerCase().trim();
  return priorityMap[normalized];
}

/**
 * Para birimi normalize etme
 */
export function mapCurrency(currency: string | undefined): 'TRY' | 'USD' | 'EUR' | 'GBP' {
  if (!currency) return 'TRY';
  
  const currencyMap: Record<string, 'TRY' | 'USD' | 'EUR' | 'GBP'> = {
    'try': 'TRY',
    'tl': 'TRY',
    '₺': 'TRY',
    'türk lirası': 'TRY',
    'turkish lira': 'TRY',
    'usd': 'USD',
    '$': 'USD',
    'dolar': 'USD',
    'dollar': 'USD',
    'eur': 'EUR',
    '€': 'EUR',
    'euro': 'EUR',
    'gbp': 'GBP',
    '£': 'GBP',
    'sterlin': 'GBP',
    'pound': 'GBP',
  };
  
  const normalized = currency.toLowerCase().trim();
  return currencyMap[normalized] || 'TRY';
}

/**
 * Tarih normalize etme
 */
export function mapDate(date: string | Date | undefined): string | undefined {
  if (!date) return undefined;
  
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  if (typeof date === 'string') {
    // ISO format zaten ise
    if (date.includes('T') || date.includes('Z')) {
      return date;
    }
    
    // Türkçe tarih formatları
    const turkishFormats = [
      /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    ];
    
    for (const format of turkishFormats) {
      const match = date.match(format);
      if (match) {
        if (format === turkishFormats[0] || format === turkishFormats[1]) {
          // DD.MM.YYYY veya DD/MM/YYYY
          const [, day, month, year] = match;
          return new Date(`${year}-${month}-${day}`).toISOString();
        } else {
          // YYYY-MM-DD
          return new Date(date).toISOString();
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Talep verilerinden Teklif Başlığı oluşturma
 */
export function mapDemandToOfferHeader(demand: DemandData): OfferHeader {
  return {
    satfkCode: demand.satfk || '',
    title: demand.title || '',
    site: demand.siteName,
    purchaseCity: demand.purchaseLocation,
    priority: mapPriority(demand.priority),
    dueDate: mapDate(demand.dueDate),
    currency: mapCurrency(demand.currency),
    paymentTerms: demand.paymentTerms ? {
      type: 'pesin_teslim_onay' as const,
      ...demand.paymentTerms,
    } : undefined,
    isSealedBid: demand.biddingMode === 'secret',
  };
}

/**
 * Talep kalemlerinden Teklif Satırları oluşturma
 */
export function mapDemandItemsToOfferLines(demand: DemandData): OfferLine[] {
  if (!demand.items || demand.items.length === 0) {
    return [];
  }
  
  return demand.items.map((item) => ({
    itemName: item.name || '',
    spec: item.spec,
    uom: item.unit || '',
    quantity: item.qty || 0,
    unitPrice: item.targetUnitPrice || 0,
    vatRate: 18, // Default KDV
    deliveryDate: mapDate(item.deliveryDate),
    brand: item.brand,
    notes: '',
    // Hesaplanan alanlar başlangıçta boş
    netUnitWithVat: undefined,
    totalExVat: undefined,
    totalWithVat: undefined,
    // Talep referansları
    demandQuantity: item.qty,
    demandUnitPrice: item.targetUnitPrice,
    demandDeliveryDate: item.deliveryDate ? mapDate(item.deliveryDate) : undefined,
    demandUom: item.unit,
  }));
}

/**
 * DOM'dan değer çekme yardımcıları
 */
export function extractFromDOM(selector: string): string | undefined {
  const element = document.querySelector(selector);
  if (!element) return undefined;
  
  // Input, select, textarea
  if (element instanceof HTMLInputElement || 
      element instanceof HTMLSelectElement || 
      element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  
  // Text içerik
  return element.textContent?.trim() || undefined;
}

/**
 * Talep detay sayfasından veri çekme
 */
export function extractDemandFromPage(): DemandData {
  return {
    satfk: extractFromDOM('#d-satfk'),
    title: extractFromDOM('#d-title'),
    siteName: extractFromDOM('#d-site'),
    purchaseLocation: extractFromDOM('#d-purchase-location'),
    priority: extractFromDOM('#d-priority') as any,
    dueDate: extractFromDOM('#d-duedate'),
    currency: extractFromDOM('#d-currency'),
    biddingMode: extractFromDOM('[data-bidding-mode]') as any,
  };
}

/**
 * Fark hesaplama (Talep vs Teklif)
 */
export interface DifferenceResult {
  quantityDiff?: number;
  unitPriceDiff?: number;
  pricePercentDiff?: number;
  deliveryDateDiff?: number; // gün cinsinden
  uomDiff?: boolean;
  hasDifference: boolean;
}

export function calculateDifference(
  demandLine: Partial<OfferLine>,
  offerLine: OfferLine
): DifferenceResult {
  const result: DifferenceResult = {
    hasDifference: false,
  };
  
  // Miktar farkı
  if (demandLine.demandQuantity !== undefined && offerLine.quantity !== undefined) {
    result.quantityDiff = offerLine.quantity - demandLine.demandQuantity;
    if (result.quantityDiff !== 0) result.hasDifference = true;
  }
  
  // Birim fiyat farkı
  if (demandLine.demandUnitPrice !== undefined && offerLine.unitPrice !== undefined) {
    result.unitPriceDiff = offerLine.unitPrice - demandLine.demandUnitPrice;
    if (demandLine.demandUnitPrice > 0) {
      result.pricePercentDiff = (result.unitPriceDiff / demandLine.demandUnitPrice) * 100;
    }
    if (result.unitPriceDiff !== 0) result.hasDifference = true;
  }
  
  // Termin farkı
  if (demandLine.demandDeliveryDate && offerLine.deliveryDate) {
    const demandDate = new Date(demandLine.demandDeliveryDate);
    const offerDate = new Date(offerLine.deliveryDate);
    result.deliveryDateDiff = Math.floor((offerDate.getTime() - demandDate.getTime()) / (1000 * 60 * 60 * 24));
    if (result.deliveryDateDiff !== 0) result.hasDifference = true;
  }
  
  // Birim farkı
  if (demandLine.demandUom && offerLine.uom) {
    result.uomDiff = demandLine.demandUom.toLowerCase() !== offerLine.uom.toLowerCase();
    if (result.uomDiff) result.hasDifference = true;
  }
  
  return result;
}

