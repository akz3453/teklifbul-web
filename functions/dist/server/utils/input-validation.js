/**
 * Input Validation Utilities
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * Zod-based input validation helpers
 */
import { z } from 'zod';
import { logger } from '../../src/shared/log/logger.js';
/**
 * Common validation schemas
 */
export const commonSchemas = {
    // UUID/ID validation
    id: z.string().min(1).max(100),
    // Email validation
    email: z.string().email().max(255),
    // Status validation
    status: z.enum(['active', 'inactive', 'pending', 'completed', 'failed', 'cancelled', 'running']).optional(),
    // Pagination
    pagination: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(25),
        offset: z.coerce.number().int().min(0).optional().default(0),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional()
    }),
    // Date range
    dateRange: z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional()
    })
};
/**
 * Validation middleware factory
 * Creates a middleware that validates request data against a Zod schema
 */
export function validateRequest(schema) {
    return async (req, res, next) => {
        try {
            // Validate body — strip unknown keys (mass-assignment engeli)
            if (schema.body) {
                const currentBody = (req.body && typeof req.body === 'object') ? req.body : {};
                const parsedBody = await schema.body.parseAsync(currentBody);
                req.body = parsedBody;
            }
            // Validate query (Express 5: req.query getter read-only; mutate existing object)
            if (schema.query) {
                const currentQuery = (req.query && typeof req.query === 'object') ? req.query : {};
                const parsedQuery = await schema.query.parseAsync(currentQuery);
                Object.assign(currentQuery, parsedQuery);
            }
            // Validate params (Express 5: mutate instead of replace)
            if (schema.params) {
                const currentParams = (req.params && typeof req.params === 'object') ? req.params : {};
                const parsedParams = await schema.params.parseAsync(currentParams);
                Object.assign(currentParams, parsedParams);
            }
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                logger.warn('Input validation failed', {
                    path: req.path,
                    errors: error.errors
                });
                res.status(400).json({
                    error: 'VALIDATION_ERROR',
                    message: 'Geçersiz giriş verileri',
                    details: error.errors.map(e => ({
                        path: e.path.join('.'),
                        message: e.message
                    }))
                });
                return;
            }
            // Unexpected error
            logger.error('Validation middleware error', error);
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Doğrulama sırasında hata oluştu'
            });
        }
    };
}
/**
 * Sanitize string input (XSS prevention)
 */
export function sanitizeString(input) {
    if (typeof input !== 'string') {
        return '';
    }
    // Remove potentially dangerous characters
    return input
        .replace(/[<>]/g, '') // Remove < and >
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers (onclick=, etc.)
        .trim();
}
/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj) {
    const sanitized = { ...obj };
    for (const key in sanitized) {
        if (typeof sanitized[key] === 'string') {
            sanitized[key] = sanitizeString(sanitized[key]);
        }
        else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeObject(sanitized[key]);
        }
    }
    return sanitized;
}
