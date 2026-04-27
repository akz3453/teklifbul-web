/**
 * E-Document Settings Route Validation Schemas
 * Teklifbul Rule v1.0 - Zod schemas for e-doc settings endpoints
 */

import { z } from 'zod';

/**
 * Provider key enum
 */
const providerKeySchema = z.enum(['mock', 'integrator_x', 'integrator_y']).nullable();

/**
 * GET /api/edoc/settings - Query schema
 */
export const getEdocSettingsQuerySchema = z.object({
  companyId: z.string().min(1, 'Company ID zorunludur')
});

/**
 * PUT /api/edoc/settings - Body schema
 */
export const updateEdocSettingsBodySchema = z.object({
  companyId: z.string().min(1, 'Company ID zorunludur'),
  edoc: z.object({
    providerKey: providerKeySchema,
    sender: z.object({
      vkn: z.string()
        .regex(/^\d{10,11}$/, 'VKN 10 veya 11 haneli olmalıdır')
        .min(10, 'VKN en az 10 haneli olmalıdır')
        .max(11, 'VKN en fazla 11 haneli olmalıdır'),
      title: z.string().min(2, 'Ünvan en az 2 karakter olmalıdır'),
      taxOffice: z.string().min(2, 'Vergi dairesi en az 2 karakter olmalıdır'),
      address: z.object({
        line1: z.string().min(2, 'Adres satırı 1 en az 2 karakter olmalıdır'),
        line2: z.string().optional(),
        city: z.string().min(2, 'Şehir en az 2 karakter olmalıdır'),
        district: z.string().min(2, 'İlçe en az 2 karakter olmalıdır'),
        postalCode: z.string().optional(),
        country: z.string().default('TR').optional()
      })
    }),
    defaults: z.object({
      invoiceTypeDefault: z.enum(['e_fatura', 'e_arsiv']).nullable(),
      scenarioDefault: z.enum(['TEMEL', 'TICARI']).nullable()
    })
  })
});

/**
 * PUT /api/edoc/credentials - Body schema
 */
export const updateEdocCredentialsBodySchema = z.object({
  companyId: z.string().min(1, 'Company ID zorunludur'),
  providerKey: z.enum(['mock', 'integrator_x', 'integrator_y'], {
    errorMap: () => ({ message: 'Provider key geçerli bir değer olmalıdır (mock, integrator_x, integrator_y)' })
  }),
  credentials: z.record(z.any())
    .refine(
      (val) => Object.keys(val).length > 0,
      { message: 'Credentials boş olamaz, en az bir alan içermelidir' }
    )
});

