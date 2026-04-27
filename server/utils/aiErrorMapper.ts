/**
 * AI Error Mapper (v3.10)
 * Teklifbul Rule v3.10 - Centralized error mapping for consistent responses
 * 
 * Purpose: Single source of truth for error codes to HTTP status and user messages.
 */

import { AI_ERROR_CODES, AI_DISABLED_REASONS, AI_META_KEYS } from '../constants/aiMeta.js'; // Teklifbul Rule v3.17

export type AiErrorMapping = {
  status: number;
  userMessage: string;
  code?: string;
  meta?: {
    aiDisabled?: boolean;
    aiDisabledReason?: string;
    [key: string]: any;
  };
};

/**
 * Attach requiredProviderKey to error mapping if available
 * Teklifbul Rule v3.17 - Standardize requiredProviderKey in meta
 */
function attachRequiredProviderKey(mapping: AiErrorMapping, existingMeta?: any): AiErrorMapping {
  if (!mapping.meta) {
    mapping.meta = {};
  }
  
  // Check if requiredProviderKey already exists
  if (mapping.meta[AI_META_KEYS.REQUIRED_PROVIDER_KEY]) {
    return mapping;
  }
  
  // Try to extract from existing meta
  const providerKey = existingMeta?.[AI_META_KEYS.PROVIDER_KEY] || 
                     existingMeta?.[AI_META_KEYS.REQUIRED_PROVIDER_KEY] ||
                     existingMeta?.suggestedPaid?.providerKey ||
                     existingMeta?.resolvedProvider ? 
                       (existingMeta.resolvedProvider === 'openai' || existingMeta.resolvedProvider?.startsWith('openai') ? 'openai' :
                        existingMeta.resolvedProvider === 'gemini' || existingMeta.resolvedProvider?.startsWith('gemini') ? 'gemini' :
                        existingMeta.resolvedProvider?.toLowerCase()) : undefined;
  
  if (providerKey) {
    mapping.meta[AI_META_KEYS.REQUIRED_PROVIDER_KEY] = providerKey;
  }
  
  return mapping;
}

/**
 * Map AI error code to HTTP status and user-friendly message
 * Teklifbul Rule v3.10 + v3.17 - Centralized error mapping with requiredProviderKey
 */
export function mapAiError(code: string, existingMeta?: any): AiErrorMapping {
  switch (code) {
    case AI_ERROR_CODES.INSUFFICIENT_TOKENS:
      return attachRequiredProviderKey(
        { status: 402, userMessage: 'Yetersiz token. Lütfen yeni bir paket satın alın.', code },
        existingMeta
      );
    case AI_ERROR_CODES.DAILY_CAP_REACHED:
      return { status: 402, userMessage: 'Günlük ücretli token kotası doldu.', code };
    case AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED:
      return { status: 402, userMessage: 'Günlük kota kontrolü yapılamadı, daha sonra tekrar deneyin.', code };
    case AI_ERROR_CODES.FORCED_FREE_MODE_ACTIVE:
      return { status: 400, userMessage: 'Admin ücretsiz modu zorunlu kıldı.', code };
    case AI_ERROR_CODES.NO_PAID_MODEL_AVAILABLE:
      return { status: 409, userMessage: 'Uygun ücretli model bulunamadı.', code };
    case AI_ERROR_CODES.TOKEN_PACK_REQUIRED:
      return { status: 402, userMessage: 'Bu sağlayıcı için AI token paketi bulunamadı. Lütfen paket satın alın.', code };
    case AI_ERROR_CODES.AI_PROVIDER_CONFIG_ERROR:
      return { status: 503, userMessage: 'AI servisi yapılandırması eksik. Lütfen daha sonra tekrar deneyin.', code };
    case AI_ERROR_CODES.AI_DISABLED:
      // Teklifbul Rule v3.11 - Kill-switch error mapping
      // Default message (will be overridden by caller with specific reason)
      return { 
        status: 503, 
        userMessage: 'AI geçici olarak kapalı. Lütfen daha sonra tekrar deneyin.', 
        code,
        meta: {
          aiDisabled: true,
          aiDisabledReason: AI_DISABLED_REASONS.GLOBAL,
        }
      };
    case AI_ERROR_CODES.INVALID_PROVIDER:
      // Teklifbul Rule v3.12 + v3.17 - Provider key required
      return attachRequiredProviderKey(
        { status: 400, userMessage: 'Geçersiz provider. Paket providerKey içermelidir.', code },
        existingMeta
      );
    default:
      return { status: 500, userMessage: 'Bilinmeyen AI hatası.', code };
  }
}

/**
 * Map AI_DISABLED error with specific reason
 * Teklifbul Rule v3.11 + v3.17 - Kill-switch error mapping with reason
 */
export function mapAiDisabledError(reason: string, existingMeta?: any): AiErrorMapping {
  const base = mapAiError(AI_ERROR_CODES.AI_DISABLED);
  
  let status = 503; // Default: Service Unavailable
  let userMessage = 'AI geçici olarak kapalı. Lütfen daha sonra tekrar deneyin.';
  
  if (reason === AI_DISABLED_REASONS.PANIC || reason === AI_DISABLED_REASONS.GLOBAL) {
    status = 503; // Service Unavailable for global/panic
    userMessage = 'AI geçici olarak kapalı (sistem bakımı).';
  } else if (reason === AI_DISABLED_REASONS.COMPANY) {
    status = 403; // Forbidden for company-level restriction
    userMessage = 'Bu firma için AI erişimi admin tarafından kapatıldı.';
  }
  
  const result = {
    ...base,
    status,
    userMessage,
    meta: {
      aiDisabled: true,
      aiDisabledReason: reason,
    },
  };
  
  return attachRequiredProviderKey(result, existingMeta);
}

