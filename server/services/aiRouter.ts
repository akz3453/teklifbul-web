/**
 * AI Router Service
 * Teklifbul Rule v1.0 - Centralized AI Request Routing
 * 
 * Handles:
 * - Plan gating (FREE/PREMIUM → 403)
 * - Provider routing (ollama/openai/gemini)
 * - Ollama quota enforcement
 * - OpenAI/Gemini token pack validation
 */

import { logger } from '../../src/shared/log/logger.js';
import { getAccountSubscriptionSummary } from './subscriptionService.js';
import { userHasAiPlan } from './userService.js';
import { getCompanyPlanFlags } from './purchaseAssistantAvailabilityService.js';
import { assertUserHasTokensOrThrow } from './aiTokenPackService.js';
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { resolveTrustedCompanyId } from '../utils/companyAccess.js';
import { getAdminDb } from '../utils/firestore.js';
import { sendChat, type ChatMessage, type ChatResult, type AIProvider } from '../ai/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export interface RunAIRequest {
  user: { uid: string };
  prompt: string;
  context?: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  req?: AuthenticatedRequest;
}

export interface RunAIResult {
  result: ChatResult;
  provider: AIProvider;
  quotaInfo?: {
    remaining: number;
    limit: number;
  };
}

export interface RunAIError {
  code: string;
  message: string;
  status: number;
  upsellCode?: string;
}

/**
 * Run AI request with plan gating and provider routing
 * 
 * @param request - AI request parameters
 * @returns AI result or throws RunAIError
 */
export async function runAI(request: RunAIRequest): Promise<RunAIResult> {
  logger.group('AI Router: Run AI');
  try {
    const { user, prompt, context = {}, req } = request;
    const userId = user.uid;

    // 1) Plan gating - Hard block for FREE/PREMIUM
    const planInfo = await getPlanInfo(userId, req);
    if (!planInfo.hasAiAccess) {
      logger.warn('AI access denied: Plan does not support AI', {
        userId,
        planId: planInfo.planId
      });
      logger.end();
      throw {
        code: 'ai_plan_required',
        message: 'Yapay zekâ kullanımı için Premium Plus aboneliği gereklidir.',
        status: 403
      } as RunAIError;
    }

    // 2) Get provider preference (default: ollama for premium_plus)
    const provider = await getProviderPreference(userId, planInfo.companyId);

    // 3) Provider-specific validation
    if (provider === 'groq') {
      // Execute Groq request
      const messages: ChatMessage[] = [
        { role: 'user', content: prompt }
      ];

      const result = await sendChat(messages, {
        provider: 'groq',
        systemPrompt: context.systemPrompt,
        model: context.model || 'llama-3.3-70b-versatile',
        temperature: context.temperature,
        maxTokens: context.maxTokens,
      });

      logger.info('Groq request completed', {
        userId,
        companyId: planInfo.companyId,
        tokens: result.totalTokens
      });
      logger.end();

      return {
        result,
        provider: 'groq'
      };
    }

    // OpenAI/Gemini require token packs — yoksa ücretsiz Groq
    if (provider === 'openai' || provider === 'gemini') {
      try {
        await assertUserHasTokensOrThrow(userId, provider);
      } catch (tokenError: any) {
        if (process.env.GROQ_API_KEY) {
          logger.warn('Token pack missing → free Groq', {
            userId,
            preferred: provider,
            error: tokenError.message,
          });
          const messages: ChatMessage[] = [
            { role: 'user', content: prompt }
          ];
          const result = await sendChat(messages, {
            provider: 'groq',
            systemPrompt: context.systemPrompt,
            model: context.model || 'llama-3.3-70b-versatile',
            temperature: context.temperature,
            maxTokens: context.maxTokens,
          });
          logger.end();
          return { result, provider: 'groq' };
        }
        logger.warn('Token pack check failed', {
          userId,
          provider,
          error: tokenError.message
        });
        logger.end();
        throw {
          code: 'token_pack_required',
          message: tokenError.message || `${provider === 'openai' ? 'OpenAI' : 'Gemini'} için AI token paketi bulunamadı. Lütfen paket satın alın.`,
          status: 402,
          upsellCode: 'UPSELL_PRO_AI'
        } as RunAIError;
      }

      // Execute OpenAI/Gemini request
      const messages: ChatMessage[] = [
        { role: 'user', content: prompt }
      ];

      const result = await sendChat(messages, {
        provider,
        systemPrompt: context.systemPrompt,
        model: context.model || (provider === 'openai' ? 'gpt-4o-mini' : undefined),
        temperature: context.temperature,
        maxTokens: context.maxTokens,
      });

      logger.info(`${provider.toUpperCase()} request completed`, {
        userId,
        tokens: result.totalTokens
      });
      logger.end();

      return {
        result,
        provider
      };
    }

    // Unknown provider
    logger.error('Unknown provider', { provider });
    logger.end();
    throw {
      code: 'unknown_provider',
      message: 'Bilinmeyen AI sağlayıcı.',
      status: 400
    } as RunAIError;
  } catch (error: any) {
    logger.error('AI Router error', error);
    logger.end();

    // Re-throw RunAIError as-is
    if (error.code && error.status) {
      throw error;
    }

    // Wrap other errors
    throw {
      code: 'ai_router_error',
      message: error.message || 'AI isteği işlenirken hata oluştu.',
      status: 500
    } as RunAIError;
  }
}

/**
 * Get plan info for user/company
 */
async function getPlanInfo(userId: string, req?: AuthenticatedRequest): Promise<{
  planId: string;
  hasAiAccess: boolean;
  companyId: string | null;
}> {
  let companyId: string | null = null;

  // Try to get company ID from request
  if (req) {
    try {
      companyId = await getCompanyIdFromRequest(req);
    } catch {
      // Ignore errors
    }
  }

  // req varsa trusted helper zaten denendi. req yoksa yalnız accepted üyelik.
  if (!companyId && !req) {
    const db = await getAdminDb();
    if (db) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        companyId = resolveTrustedCompanyId(userDoc.data() || {}, null, { userId });
      }
    }
  }

  // Check company plan first
  if (companyId) {
    const planFlags = await getCompanyPlanFlags(companyId);
    if (planFlags.isPremiumPlus) {
      return {
        planId: planFlags.planId,
        hasAiAccess: true,
        companyId
      };
    }
  }

  // Fallback to user plan
  const accountSummary = await getAccountSubscriptionSummary(userId);
  const planId = accountSummary.plan.planId;
  const hasAiAccess = userHasAiPlan(planId);

  return {
    planId,
    hasAiAccess,
    companyId
  };
}

/**
 * Get provider preference for user/company
 * Default: groq for premium_plus
 */
async function getProviderPreference(userId: string, companyId: string | null): Promise<AIProvider> {
  const db = await getAdminDb();
  if (!db) {
    return 'groq'; // Default
  }

  // Check company settings first
  if (companyId) {
    try {
      const settingsRef = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
      const settingsDoc = await settingsRef.get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data() || {};
        const provider = settings.provider;
        if (provider === 'groq' || provider === 'openai' || provider === 'gemini') {
          return provider as AIProvider;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Check user settings
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data() || {};
      const provider = userData.aiProvider || userData.ai_provider;
      if (provider === 'groq' || provider === 'openai' || provider === 'gemini') {
        return provider as AIProvider;
      }
    }
  } catch {
    // Ignore errors
  }

  // Default: groq for premium_plus
  return 'groq';
}

