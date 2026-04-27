/**
 * Delivery Note Route Validation Schemas
 * Teklifbul Rule v1.0 - Zod schemas for delivery note endpoints
 */

import { z } from 'zod';

/**
 * Delivery Note ID parameter schema
 */
export const deliveryNoteIdParamsSchema = z.object({
  id: z.string().min(1, 'Delivery Note ID zorunludur')
});

/**
 * Company ID body schema (optional, used in multiple endpoints)
 */
export const companyIdBodySchema = z.object({
  companyId: z.string().min(1).optional()
});

