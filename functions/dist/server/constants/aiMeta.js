/**
 * AI System Constants (v3.10)
 * Teklifbul Rule v3.10 - Global contract for AI meta fields, resolve reasons, and error codes
 *
 * Purpose: Eliminate magic strings and ensure consistency across all AI-related code.
 */
export const AI_RESOLVE_BY = {
    FORCED_FREE: 'FORCED_FREE',
    EXACT: 'EXACT',
    FALLBACK_PAID: 'FALLBACK_PAID',
    FALLBACK_FREE: 'FALLBACK_FREE',
};
export const AI_RESOLVE_REASON = {
    FORCED_FREE_MODE: 'FORCED_FREE_MODE',
    MODEL_NOT_AVAILABLE: 'MODEL_NOT_AVAILABLE',
    SELECTED_MODEL_NOT_AVAILABLE: 'SELECTED_MODEL_NOT_AVAILABLE',
    NO_PAID_MODEL_AVAILABLE: 'NO_PAID_MODEL_AVAILABLE',
    NO_PAID_PACKAGE: 'NO_PAID_PACKAGE',
    CATALOG_DISABLED: 'CATALOG_DISABLED',
    DB_UNAVAILABLE: 'DB_UNAVAILABLE',
    RESOLVER_ERROR: 'RESOLVER_ERROR',
    NO_AVAILABLE_MODELS: 'NO_AVAILABLE_MODELS',
    NORMAL: 'NORMAL',
    NO_FUNDS_FOR_PAID: 'NO_FUNDS_FOR_PAID', // Teklifbul Rule v3.12 - Provider wallet insufficient
    NOT_ENTITLED: 'NOT_ENTITLED', // Teklifbul Rule v3.13 - Model not allowed by package entitlements
};
export const AI_ERROR_CODES = {
    INSUFFICIENT_TOKENS: 'INSUFFICIENT_TOKENS',
    DAILY_CAP_REACHED: 'DAILY_CAP_REACHED',
    DAILY_CAP_CHECK_FAILED: 'DAILY_CAP_CHECK_FAILED',
    FORCED_FREE_MODE_ACTIVE: 'FORCED_FREE_MODE_ACTIVE',
    NO_PAID_MODEL_AVAILABLE: 'NO_PAID_MODEL_AVAILABLE',
    TOKEN_PACK_REQUIRED: 'token_pack_required',
    AI_PROVIDER_CONFIG_ERROR: 'ai_provider_config_error',
    AI_DISABLED: 'AI_DISABLED', // Teklifbul Rule v3.11 - Kill-switch
    INVALID_PROVIDER: 'INVALID_PROVIDER', // Teklifbul Rule v3.12 - Provider key required
    AI_REQUEST_IN_PROGRESS: 'AI_REQUEST_IN_PROGRESS', // H-007 idempotent replay
    AI_REQUEST_ALREADY_PROCESSED: 'AI_REQUEST_ALREADY_PROCESSED', // H-007 idempotent replay
};
// Teklifbul Rule v3.11 - AI Kill-Switch Reasons
export const AI_DISABLED_REASONS = {
    GLOBAL: 'GLOBAL',
    COMPANY: 'COMPANY',
    PANIC: 'PANIC',
};
// Teklifbul Rule v3.17 - Standardized meta field keys
export const AI_META_KEYS = {
    REQUIRED_PROVIDER_KEY: 'requiredProviderKey',
    PROVIDER_KEY: 'providerKey',
    SUGGESTED_PAID: 'suggestedPaid',
    RESOLVED_PROVIDER: 'resolvedProvider',
    RESOLVED_MODEL: 'resolvedModel',
    MODEL_AUTO_RESOLVED: 'modelAutoResolved',
    REASON: 'reason',
};
