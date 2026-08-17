/**
 * Invoice Route Validation Schemas
 * Teklifbul Rule v1.0 - Zod schemas for invoice endpoints
 */
import { z } from 'zod';
/**
 * Invoice ID parameter schema
 */
export const invoiceIdParamsSchema = z.object({
    id: z.string().min(1, 'Invoice ID zorunludur')
});
/**
 * Company ID body schema (optional, used in multiple endpoints)
 */
export const companyIdBodySchema = z.object({
    companyId: z.string().min(1).optional()
});
