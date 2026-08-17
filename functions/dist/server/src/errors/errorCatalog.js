/**
 * Error Catalog
 * Teklifbul Rule v1.0 - Centralized Error Management
 *
 * Standart error codes ve response formatları
 */
/**
 * Create error response object
 *
 * @param params - Error parameters
 * @returns AppError object
 *
 * @example
 * makeError({
 *   error: 'VALIDATION_ERROR',
 *   code: 'VALIDATION_FAILED',
 *   message: 'Geçersiz istek',
 *   details: ['field: mesaj']
 * })
 */
export function makeError({ error, code, message, details, retryAfterSec }) {
    return {
        ok: false,
        error,
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
        ...(retryAfterSec !== undefined ? { retryAfterSec } : {})
    };
}
/**
 * Type guard: Check if object is AppError
 */
export function isAppError(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.ok === false &&
        typeof obj.error === 'string' &&
        typeof obj.code === 'string' &&
        typeof obj.message === 'string');
}
/**
 * Predefined error creators
 */
export const Errors = {
    validation: (message, details) => makeError({
        error: 'VALIDATION_ERROR',
        code: 'VALIDATION_FAILED',
        message,
        details
    }),
    forbidden: (message = 'Bu işlem için yetkiniz yok', perm) => makeError({
        error: 'FORBIDDEN',
        code: 'PERMISSION_DENIED',
        message,
        details: perm ? [`perm: ${perm}`] : undefined
    }),
    rateLimited: (retryAfterSec) => makeError({
        error: 'RATE_LIMITED',
        code: 'RATE_LIMIT_HIT',
        message: 'Çok fazla istek',
        retryAfterSec
    }),
    notFound: (message = 'Kaynak bulunamadı') => makeError({
        error: 'NOT_FOUND',
        code: 'RESOURCE_NOT_FOUND',
        message
    }),
    conflict: (message = 'Çakışma durumu') => makeError({
        error: 'CONFLICT',
        code: 'CONFLICT_STATE',
        message
    }),
    providerError: (message = 'E-belge sağlayıcı hatası', details) => makeError({
        error: 'PROVIDER_ERROR',
        code: 'PROVIDER_FAILED',
        message,
        details
    }),
    internal: (message = 'Beklenmeyen hata') => makeError({
        error: 'INTERNAL_ERROR',
        code: 'INTERNAL',
        message
    }),
    edocLockedSale: (message = 'E-belge kilidi: kritik alanlar değiştirilemez', details) => makeError({
        error: 'VALIDATION_ERROR',
        code: 'EDOC_LOCKED_SALE',
        message,
        details
    })
};
