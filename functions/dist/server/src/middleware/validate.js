/**
 * Validation Middleware
 * Teklifbul Rule v1.0 - Zod-based request validation
 *
 * Standart error format:
 * {
 *   ok: false,
 *   error: 'VALIDATION_ERROR',
 *   details: ['field.path: message', ...],
 *   code: 'VALIDATION_FAILED'
 * }
 */
import { logger } from '../../../src/shared/log/logger.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';
/**
 * Format Zod error to human-readable message
 */
function formatZodError(error) {
    return error.errors.map((err) => {
        const path = err.path.length > 0 ? err.path.join('.') : 'root';
        return `${path}: ${err.message}`;
    });
}
/**
 * Validation middleware factory
 *
 * @param schemas - Validation schemas for body, query, params
 * @returns Express middleware
 *
 * @example
 * router.post('/sales/:id',
 *   validate({
 *     params: z.object({ id: z.string().min(1) }),
 *     body: z.object({ companyId: z.string().optional() })
 *   }),
 *   handler
 * )
 */
export function validate(schemas) {
    return async (req, res, next) => {
        try {
            // Validate params
            if (schemas.params) {
                const paramsResult = schemas.params.safeParse(req.params);
                if (!paramsResult.success) {
                    const details = formatZodError(paramsResult.error);
                    logger.warn('Validation error (params)', { path: req.path, details });
                    return respondError(res, Errors.validation('Geçersiz istek parametreleri', details));
                }
                // Replace req.params with validated data (sanitized)
                req.params = paramsResult.data;
            }
            // Validate query
            if (schemas.query) {
                const queryResult = schemas.query.safeParse(req.query);
                if (!queryResult.success) {
                    const details = formatZodError(queryResult.error);
                    logger.warn('Validation error (query)', { path: req.path, details });
                    return respondError(res, Errors.validation('Geçersiz sorgu parametreleri', details));
                }
                // Teklifbul Rule v1.0 - Bazı runtime'larda req.query setter-only olabilir.
                // Bu yüzden req.query'yi overwrite etmek yerine, mevcut object'e merge ediyoruz.
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    Object.assign(req.query, queryResult.data);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    req.validatedQuery = queryResult.data;
                }
                catch (e) {
                    // Fallback: req.query dokunulamazsa validatedQuery'e koy
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    req.validatedQuery = queryResult.data;
                    logger.warn('Validation middleware: req.query merge failed, validatedQuery kullanılıyor', {
                        path: req.path
                    });
                }
            }
            // Validate body
            if (schemas.body) {
                const bodyResult = schemas.body.safeParse(req.body);
                if (!bodyResult.success) {
                    const details = formatZodError(bodyResult.error);
                    logger.warn('Validation error (body)', { path: req.path, details });
                    return respondError(res, Errors.validation('Geçersiz istek gövdesi', details));
                }
                // Replace req.body with validated data (sanitized)
                req.body = bodyResult.data;
            }
            next();
        }
        catch (error) {
            logger.error('Validation middleware error', error);
            return respondError(res, Errors.internal('Validation middleware hatası'));
        }
    };
}
