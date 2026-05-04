/**
 * Sales Route Validation Schemas
 * Teklifbul Rule v1.0 - Zod schemas for sales endpoints
 */

import { z } from 'zod';

/**
 * Sale ID parameter schema
 */
export const saleIdParamsSchema = z.object({
  saleId: z.string().min(1, 'Sale ID zorunludur')
});

/**
 * Sale ID parameter (alternative name: id)
 */
export const saleIdParamSchema = z.object({
  id: z.string().min(1, 'Sale ID zorunludur')
});

/**
 * Create invoice from sale - Body schema
 */
export const createInvoiceFromSaleBodySchema = z.object({
  companyId: z.string().min(1).optional(),
  requestId: z.string().optional()
});

/**
 * Create delivery note from sale - Body schema
 */
export const createDeliveryFromSaleBodySchema = z.object({
  companyId: z.string().min(1).optional(),
  requestId: z.string().optional(),
  shipDate: z.string().datetime().optional(), // ISO date string
  shipToAddress: z.object({
    line1: z.string().min(1, 'Adres satırı 1 zorunludur'),
    line2: z.string().optional(),
    city: z.string().min(1).optional(),
    district: z.string().min(1).optional(),
    postalCode: z.string().optional(),
    country: z.string().default('TR')
  }).optional()
});

/**
 * Delivery address schema
 */
const deliveryAddressSchema = z.object({
  city: z.string().min(1, 'İl zorunludur'),
  district: z.string().min(1, 'İlçe zorunludur'),
  neighborhood: z.string().optional().nullable(),
  avenue: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  doorNumber: z.string().optional().nullable(),
  apartment: z.string().optional().nullable(),
  country: z.string().default('TR')
});

/**
 * Delivery schema
 */
const deliverySchema = z.object({
  isOwnDelivery: z.boolean(),
  recipientName: z.string().optional().nullable(),
  recipientSurname: z.string().optional().nullable(),
  recipientPhone: z.string().optional().nullable(),
  deliveryAddress: deliveryAddressSchema.optional().nullable()
}).refine((data) => {
  // Teklifbul Rule v1.0 - Nakliye bize aitse teslim bilgileri zorunlu
  if (data.isOwnDelivery) {
    if (!data.recipientName || !data.recipientSurname || !data.recipientPhone) {
      return false;
    }
    if (!data.deliveryAddress || !data.deliveryAddress.city || !data.deliveryAddress.district) {
      return false;
    }
  }
  return true;
}, {
  message: 'Nakliye bize aitse teslim alacak kişi bilgileri (Ad, Soyad, Telefon) ve teslim adresi (İl, İlçe) zorunludur.'
});

/**
 * Update sale - Body schema (partial, editReason focus)
 * Note: Sale update payload çok geniş olduğu için partial schema kullanıyoruz
 */
export const updateSaleBodySchema = z.object({
  editReason: z.string().optional(), // Server-side'da min 10 char kontrolü var (draft değilse)
  notes: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  delivery: deliverySchema.optional().nullable()
}).passthrough(); // Diğer alanları da geçir (refine ile kontrol edilecek)

/**
 * Sales list query schema
 */
export const listSalesQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
  status: z.enum(['all', 'draft', 'saved', 'approved', 'rejected', 'cancelled', 'invoiced', 'archived']).optional(),
  q: z.string().trim().max(100).optional(),
  showArchived: z.union([z.literal('true'), z.literal('false')]).optional(),
  includeDeleted: z.union([z.literal('true'), z.literal('false')]).optional()
});

/**
 * Create sale body schema
 * Teklifbul Rule v1.0 - Minimum güvenlik validasyonu
 */
export const createSaleBodySchema = z.object({
  companyId: z.string().min(1, 'companyId zorunludur'),
  customerId: z.string().min(1, 'customerId zorunludur'),
  status: z.enum(['draft', 'saved']).optional(),
  currency: z.string().min(1).max(8).optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    sku: z.string().min(1, 'items[].sku zorunludur'),
    stockId: z.string().min(1).optional(),
    name: z.string().min(1, 'items[].name zorunludur'),
    quantity: z.coerce.number().positive('items[].quantity pozitif olmalıdır'),
    deliveredQuantity: z.coerce.number().min(0).optional(),
    remainingQuantity: z.coerce.number().min(0).optional(),
    unit: z.string().min(1, 'items[].unit zorunludur'),
    locationId: z.string().optional(),
    locationName: z.string().optional(),
    unitPrice: z.coerce.number().min(0, 'items[].unitPrice negatif olamaz'),
    vatRate: z.coerce.number().min(0).max(100).optional(),
    discount: z.coerce.number().min(0).optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    totalPrice: z.coerce.number().min(0),
    vatAmount: z.coerce.number().min(0),
    totalWithVat: z.coerce.number().min(0),
    currency: z.string().max(8).optional()
  })).min(1, 'En az bir kalem zorunludur'),
  subtotal: z.coerce.number().min(0).optional(),
  totalDiscount: z.coerce.number().min(0).optional(),
  totalVat: z.coerce.number().min(0).optional(),
  totalAmount: z.coerce.number().min(0).optional(),
  exchangeRate: z.coerce.number().positive().optional().nullable(),
  exchangeRateSource: z.string().max(64).optional().nullable(),
  notes: z.string().max(5000).optional().nullable()
}).passthrough();

