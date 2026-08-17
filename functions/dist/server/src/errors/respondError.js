/**
 * Error Response Helper
 * Teklifbul Rule v1.0 - Consistent Error Responses
 *
 * Standart HTTP status mapping ve error response formatı
 */
/**
 * HTTP status code mapping for error names
 */
const ERROR_STATUS_MAP = {
    VALIDATION_ERROR: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    PROVIDER_ERROR: 502, // Bad Gateway (external service error)
    INTERNAL_ERROR: 500
};
/**
 * Send error response with appropriate HTTP status
 *
 * @param res - Express response object
 * @param appError - AppError object
 * @param statusOverride - Optional status override
 *
 * @example
 * respondError(res, Errors.validation('Geçersiz istek', ['field: mesaj']));
 */
export function respondError(res, appError, statusOverride) {
    const status = statusOverride || ERROR_STATUS_MAP[appError.error] || 500;
    res.status(status).json(appError);
}
