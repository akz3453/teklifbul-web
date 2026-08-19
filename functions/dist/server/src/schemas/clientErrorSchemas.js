/**
 * Client Error Reporting Validation Schemas
 * Teklifbul Rule v1.0 - Client Error Reporting v1
 *
 * Zod schemas for client error endpoints
 */
import { z } from 'zod';
/**
 * POST /api/client-errors body schema
 */
export const clientErrorPostSchema = z.object({
    sessionId: z.string().min(1, 'Session ID zorunludur').max(200),
    severity: z.enum(['error', 'warn'], {
        errorMap: () => ({ message: 'Severity "error" veya "warn" olmalıdır' })
    }),
    message: z.string().min(1, 'Message zorunludur').max(500),
    stack: z.string().max(4000).optional(),
    pageUrl: z.string().max(800).optional(),
    route: z.string().max(200).optional(),
    userAgent: z.string().max(400).optional(),
    release: z.string().max(50).optional(),
    meta: z.record(z.any()).optional(),
    fingerprint: z.string().min(1).max(200).optional(),
    companyId: z.string().min(1).optional()
});
/**
 * GET /api/client-errors query schema
 */
export const clientErrorGetSchema = z.object({
    companyId: z.string().min(1, 'Company ID zorunludur'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    severity: z.enum(['error', 'warn', 'all']).default('all')
});
