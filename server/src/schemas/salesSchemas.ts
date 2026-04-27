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

