/**
 * Error Catalog
 * Teklifbul Rule v1.0 - Centralized Error Management
 * 
 * Standart error codes ve response formatları
 */

/**
 * Error name types
 */
export type ErrorName =
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

/**
 * Error code types
 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMIT_HIT'
  | 'EDOC_LOCKED_SALE'
  | 'PROVIDER_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'CONFLICT_STATE'
  | 'INTERNAL';

/**
 * Application Error Interface
 */
export interface AppError {
  ok: false;
  error: ErrorName;
  code: ErrorCode;
  message: string;
  details?: string[];
  retryAfterSec?: number;
}

/**
 * Success Response Interface
 */
export interface SuccessResponse<T = any> {
  ok: true;
  [key: string]: any;
}

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
export function makeError({
  error,
  code,
  message,
  details,
  retryAfterSec
}: {
  error: ErrorName;
  code: ErrorCode;
  message: string;
  details?: string[];
  retryAfterSec?: number;
}): AppError {
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
export function isAppError(obj: any): obj is AppError {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.ok === false &&
    typeof obj.error === 'string' &&
    typeof obj.code === 'string' &&
    typeof obj.message === 'string'
  );
}

/**
 * Predefined error creators
 */
export const Errors = {
  validation: (message: string, details?: string[]) =>
    makeError({
      error: 'VALIDATION_ERROR',
      code: 'VALIDATION_FAILED',
      message,
      details
    }),

  forbidden: (message: string = 'Bu işlem için yetkiniz yok', perm?: string) =>
    makeError({
      error: 'FORBIDDEN',
      code: 'PERMISSION_DENIED',
      message,
      details: perm ? [`perm: ${perm}`] : undefined
    }),

  rateLimited: (retryAfterSec: number) =>
    makeError({
      error: 'RATE_LIMITED',
      code: 'RATE_LIMIT_HIT',
      message: 'Çok fazla istek',
      retryAfterSec
    }),

  notFound: (message: string = 'Kaynak bulunamadı') =>
    makeError({
      error: 'NOT_FOUND',
      code: 'RESOURCE_NOT_FOUND',
      message
    }),

  conflict: (message: string = 'Çakışma durumu') =>
    makeError({
      error: 'CONFLICT',
      code: 'CONFLICT_STATE',
      message
    }),

  providerError: (message: string = 'E-belge sağlayıcı hatası', details?: string[]) =>
    makeError({
      error: 'PROVIDER_ERROR',
      code: 'PROVIDER_FAILED',
      message,
      details
    }),

  internal: (message: string = 'Beklenmeyen hata') =>
    makeError({
      error: 'INTERNAL_ERROR',
      code: 'INTERNAL',
      message
    }),

  edocLockedSale: (message: string = 'E-belge kilidi: kritik alanlar değiştirilemez', details?: string[]) =>
    makeError({
      error: 'VALIDATION_ERROR',
      code: 'EDOC_LOCKED_SALE',
      message,
      details
    })
};

