/**
 * Chat endpoint'i
 * Teklifbul Rule v1.0 - Chat Route
 * Teklifbul Rule v3.10 - Stabilized: Uses resolver (no mutations), constants, error mapper
 * 
 * POST /api/chat
 * Body: { message: "..." }
 * Response: { answer: "..." }
 * 
 * Limit ve kullanım takibi entegre edildi
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { requireAiAccess } from '../middleware/requireAiAccess.js';
import { getUserAIProvider, type AIProvider } from '../services/userService.js';
import { getUserPlan } from '../services/userService.js';
import {
  logAiUsage,
} from '../services/aiUsageService.js';
import {
  assertUserHasTokensOrThrow,
  consumeTokensTransactional,
} from '../services/aiTokenPackService.js';
import { logger } from '../../src/shared/log/logger.js';
import { sendChat, type ChatMessage } from '../ai/index.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { getAdminDb } from '../utils/firestore.js';
import { consumeCompanyTokensTransactional, getCompanyAiWallet } from '../services/companyAiWalletService.js';
import { getCompanyPlanFlags } from '../services/purchaseAssistantAvailabilityService.js';
import { getAiMinTokens } from '../services/aiMinTokens.js';
import { resolveCompanyAiModelForRequest } from '../services/aiModelResolverService.js';
import { AI_ERROR_CODES, AI_META_KEYS } from '../constants/aiMeta.js'; // Teklifbul Rule v3.17
import { mapAiError, mapAiDisabledError } from '../utils/aiErrorMapper.js';
import { evaluateAiAvailability } from '../services/aiKillSwitchService.js';

const router = Router();

// Validation schemas
const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000, 'Mesaj çok uzun (maksimum 10000 karakter)')
});

// System prompt - net ve kısa
const SYSTEM_PROMPT = `
### KİMLİK:
Sen Nefisoft isimli web uygulamasının yapay zekâ asistanısın.

### KRİTİK KİMLİK KURALI (HAYATİ ÖNEMDE):
- Sistemin adı KESİNLİKLE "Nefisoft"tur.
- "Teklifbul" sadece bir modül ismidir.
- Genel cevaplarda sistemden bahsederken ASLA ama ASLA "Teklifbul" kelimesini kullanma, daima "Nefisoft" ismini kullan.
- Kullanıcıya selam verirken veya kendini tanıtırken daima "Merhaba, ben Nefisoft yapay zekâ asistanınızım" de.

### GÖREVLERİN:
- Kullanıcıya Nefisoft (Teklifbul, Satış, Stok, Fatura, Hakediş modülleri dahil) içinde kayıt olma, talep/teklif süreçleri, satış yönetimi ve operasyonel kararlar konularında yardımcı olmak.
- Gereksiz kurumsal pazarlama cümleleri ve uzun ürün listeleri üretmemek.
- "Ben sen yapay zekâ asistanınızım" gibi bozuk Türkçe cümleler kurmamak.
- Cevaplarını kısa, net ve sade tutmak. Gereksiz yere kendini tekrar tanıtmamak.
- Sadece Nefisoft operasyonel süreçleri (Talep, Teklif, Satış, Stok, Fatura, Hakediş) ile ilgili soruları yanıtlamaya çalış; konu çok alakasızsa kibarca "Bu konu Nefisoft Uçtan uca ticari operasyon yönetimi yazılımı kapsamı dışındadır" de.

### ÖRNEK DAVRANIŞ:
Kullanıcı: "Selam"
Cevap: "Merhaba, ben Nefisoft yapay zekâ asistanınızım. Size nasıl yardımcı olabilirim?"

Kullanıcı: "Nasıl kayıt olurum?"
Cevap:
1) Kısa bir selamlama (Nefisoft adıyla),
2) 3-6 maddelik net kayıt adımları,
3) Kayıt işlemini sen yapmıyorsun, sadece yol tarif ediyorsun.
`;

/**
 * POST /api/chat
 * Chat endpoint - kullanıcı mesajını alır ve AI ile yanıt üretir
 * Token paketi kontrolü ve kullanım takibi entegre edildi
 */
router.post('/', verifyToken, requireAiAccess, validateRequest({ body: chatMessageSchema }), async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Chat API Request');
    const { message } = req.body;

    if (!req.user) {
      logger.warn('User not authenticated');
      logger.end();
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.uid;

    logger.info('Processing chat request', {
      userId,
      messageLength: message.length
    });

    // Teklifbul Rule v1.2 - Token pre-check (hard limit) via env (AI_MIN_TOKENS, default 200)
    const MIN_TOKENS = getAiMinTokens();

    // Teklifbul Rule v1.0 - Kırmadan geçiş: company settings + wallet varsa onları kullan
    // Yoksa legacy (user token pack) akışına düş.
    function resolveSharedCompanyId(userData: any): string | null {
      const cid = userData?.companyId;
      const aid = userData?.activeCompanyId;
      const arr0 = Array.isArray(userData?.companies) && userData.companies.length ? userData.companies[0] : null;
      if (cid && typeof cid === 'string' && !cid.startsWith('solo-') && !cid.startsWith('tax-')) return cid;
      if (aid && typeof aid === 'string' && aid.startsWith('solo-') && cid) return cid;
      return aid || cid || arr0;
    }

    async function tryGetCompanyPurchaseAssistantSettings() {
      const db = await getAdminDb();
      if (!db) return null;
      const headerCompanyId = req.headers['x-company-id'] as string | undefined;
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.exists ? (userDoc.data() || {}) : {};
      const companyId = headerCompanyId || resolveSharedCompanyId(userData);
      if (!companyId) return null;
      const ref = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
      const snap = await ref.get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      if (!data.provider || !data.model) return null;
      return {
        companyId,
        provider: String(data.provider),
        model: String(data.model),
        enabled: data.enabled !== false,
        forcedFreeMode: data.forcedFreeMode === true, // Teklifbul Rule v2.7.1
        customInstructions: data.customInstructions || '', // Teklifbul Rule v1.0
      };
    }

    const companySettings = await tryGetCompanyPurchaseAssistantSettings();
    const companyId = companySettings?.companyId || null;

    // Teklifbul Rule v3.11 - Kill-switch enforcement (BEFORE resolver/token checks)
    const availability = await evaluateAiAvailability(companyId);
    if (!availability.enabled) {
      logger.warn('[KillSwitch] AI disabled', { companyId, reason: availability.disabledReason });
      logger.end();
      const errorMap = mapAiDisabledError(availability.disabledReason || 'GLOBAL');
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        meta: errorMap.meta, // Teklifbul Rule v3.17 - Includes requiredProviderKey if applicable
      });
    }

    const companyWallet = companySettings?.companyId ? await getCompanyAiWallet(companySettings.companyId) : null;
    const useCompanyFlow = !!companySettings?.companyId && companySettings.enabled !== false && companyWallet !== null;

    if (useCompanyFlow) {
      logger.info('[AI] company settings used', {
        companyId: companySettings!.companyId,
        provider: companySettings!.provider,
        model: companySettings!.model,
      });

      // Teklifbul Rule v3.9 - Runtime Model Resolver (NO MUTATION)
      const planFlags = await getCompanyPlanFlags(companySettings!.companyId);
      const resolved = await resolveCompanyAiModelForRequest({
        companyId: companySettings!.companyId,
        settings: companySettings!,
        planFlags,
      });

      // Log auto-resolution if occurred
      if (resolved.modelAutoResolved === true) {
        logger.warn('[AI] model auto-resolved', {
          companyId: companySettings!.companyId,
          from: { provider: companySettings!.provider, model: companySettings!.model },
          to: { provider: resolved.provider, model: resolved.model },
          reason: resolved.reason,
        });
      }

      const companyProvider = resolved.provider as any;
      const model = resolved.model;
      const isFreeEligible = resolved.isFreeEligible;

      // Future free provider placeholder
      if (companyProvider === 'free_local') {
        const answer =
          'Merhaba! Şu an ücretsiz asistan modundasınız. Nefisoft modülleri (Talep, Teklif, Satış, Stok, Fatura, Hakediş) ile ilgili bir sorunuz varsa yazın; örn: \"Talep nasıl oluştururum?\"';
        logger.end();
        return res.json({
          answer,
          provider: 'free_local',
          meta: {
            modelAutoDowngraded: resolved.modelAutoResolved ?? false,
            modelAutoResolved: resolved.modelAutoResolved ?? false,
            modelResolvedBy: resolved.resolvedBy,
            modelResolveReason: resolved.reason || null,
            resolvedProvider: resolved.provider,
            resolvedModel: resolved.model,
            requiredProviderKey: resolved.requiredProviderKey, // Teklifbul Rule v3.17
            suggestedPaid: resolved.suggestedPaid, // Teklifbul Rule v3.17
          },
          remainingTokens: Number(companyWallet?.balanceTokens || 0),
          totalTokens: Number(companyWallet?.balanceTokens || 0),
          usedTokens: 0,
        });
      }


      // Teklifbul Rule v3.12 - Check provider-specific wallet (skip for Groq)
      const providerKey = companyProvider === 'openai' || companyProvider.startsWith('openai') ? 'openai' :
        companyProvider === 'gemini' || companyProvider.startsWith('gemini') ? 'gemini' :
          companyProvider === 'groq' ? companyProvider : // Groq doesn't use wallet
            companyProvider.toLowerCase();

      // Skip wallet check for Groq
      if (companyProvider !== 'groq') {
        const providerWallet = await getCompanyAiWallet(companySettings!.companyId, providerKey);
        if ((providerWallet?.balanceTokens || 0) < MIN_TOKENS) {
          logger.warn('Company provider wallet has insufficient tokens (min check)', {
            companyId: companySettings!.companyId,
            providerKey,
            balanceTokens: providerWallet?.balanceTokens,
            min: MIN_TOKENS
          });
          logger.end();
          const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS, {
            providerKey,
            resolvedProvider: companyProvider,
            resolvedModel: model,
            requiredProviderKey: providerKey, // Teklifbul Rule v3.17
          });
          return res.status(errorMap.status).json({
            code: errorMap.code,
            message: errorMap.userMessage,
            provider: companyProvider,
            meta: errorMap.meta, // Teklifbul Rule v3.17 - Includes requiredProviderKey
          });
        }
      }
      const chatMessages: ChatMessage[] = [{ role: 'user', content: message }];

      const result = await sendChat(chatMessages, {
        provider: companyProvider,
        systemPrompt: companySettings?.customInstructions 
          ? `${SYSTEM_PROMPT}\n\nKULLANICI ÖZEL TALİMATLARI:\n${companySettings.customInstructions}`
          : SYSTEM_PROMPT,
        model,
        temperature: 0.2,
      });

      const answer = result.text;
      const usedTokens = result.totalTokens;
      const promptTokens = result.promptTokens || Math.floor(usedTokens * 0.7);
      const completionTokens = result.completionTokens || Math.floor(usedTokens * 0.3);

      // Teklifbul Rule v1.2 - Consume race guard: consume+ledger atomik, yetersizse 402 dön
      // Teklifbul Rule v1.3 - Enriched ledger meta
      // Teklifbul Rule v1.4.2 - FreeEligible zero-consume (from resolver)
      // Teklifbul Rule v1.0 - Ollama quota increment (no wallet consumption)
      let walletAfter;
      try {
        // Groq doesn't consume wallet tokens
        if (companyProvider === 'groq') {
          // Groq doesn't have a specific quota service yet, just free
          walletAfter = companyWallet || { balanceTokens: 0 };
        } else {
          walletAfter = await consumeCompanyTokensTransactional({
            companyId: companySettings!.companyId,
            usedTokens,
            provider: companyProvider,
            model,
            userId,
            reason: 'chat',
            freeEligible: isFreeEligible, // Teklifbul Rule v1.4.2 (from resolver)
            meta: {
              promptTokens,
              completionTokens,
              totalTokens: usedTokens,
              route: '/api/chat',
              requestId: req.headers['x-request-id'] as string | undefined,
              resolvedProvider: companyProvider, // Teklifbul Rule v3.12 - Provider for wallet lookup
              resolvedModel: model, // Teklifbul Rule v3.12
            },
          });
        }
      } catch (consumeErr: any) {
        const msg = String(consumeErr?.message || consumeErr || '');
        // Teklifbul Rule v2.7.2 + v3.0 + v3.10 - Handle DAILY_CAP_REACHED and DAILY_CAP_CHECK_FAILED
        if (consumeErr?.code === AI_ERROR_CODES.DAILY_CAP_REACHED) {
          logger.warn('Company token consume failed (daily cap reached)', { companyId: companySettings!.companyId, cap: consumeErr.cap, used: consumeErr.used });
          logger.end();
          const errorMap = mapAiError(AI_ERROR_CODES.DAILY_CAP_REACHED);
          return res.status(errorMap.status).json({
            code: errorMap.code,
            message: errorMap.userMessage,
            cap: consumeErr.cap,
            used: consumeErr.used,
          });
        }
        if (consumeErr?.code === AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED) {
          logger.warn('Company token consume failed (daily cap check failed)', { companyId: companySettings!.companyId });
          logger.end();
          const errorMap = mapAiError(AI_ERROR_CODES.DAILY_CAP_CHECK_FAILED);
          return res.status(errorMap.status).json({
            code: errorMap.code,
            message: errorMap.userMessage,
          });
        }
        if (msg.toLowerCase().includes('yeterli token')) {
          logger.warn('Company token consume failed (insufficient)', { companyId: companySettings!.companyId, usedTokens, balanceTokens: companyWallet?.balanceTokens });
          logger.end();
          const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS);
          return res.status(errorMap.status).json({
            code: errorMap.code,
            message: errorMap.userMessage,
            provider: companyProvider,
          });
        }
        throw consumeErr;
      }

      logger.end();
      return res.json({
        answer,
        provider: companyProvider,
        meta: {
          modelAutoDowngraded: resolved.modelAutoResolved ?? false, // Backward compatibility
          modelAutoResolved: resolved.modelAutoResolved ?? false, // Teklifbul Rule v3.9
          modelResolvedBy: resolved.resolvedBy, // Teklifbul Rule v3.9
          modelResolveReason: resolved.reason || null, // Teklifbul Rule v3.9
          resolvedProvider: resolved.provider, // Teklifbul Rule v3.9
          resolvedModel: resolved.model, // Teklifbul Rule v3.9
          requiredProviderKey: resolved.requiredProviderKey, // Teklifbul Rule v3.17
          suggestedPaid: resolved.suggestedPaid, // Teklifbul Rule v3.17
        },
        remainingTokens: walletAfter.balanceTokens,
        totalTokens: walletAfter.balanceTokens + usedTokens,
        usedTokens,
      });
    }

    logger.info('[AI] legacy fallback used', { reason: 'company settings/wallet not available' });

    // 1) Kullanıcının AI provider tercihini al
    // Teklifbul Rule v1.0 - Provider seçimini kullanıcı tercihine saygılı tut (maliyet optimizasyonu ile ezme yok)
    const preferredProvider: AIProvider = await getUserAIProvider(userId);

    // Teklifbul Rule v1.0 - Token yoksa yalnızca fallback yap (kullanıcı tercihine rağmen otomatik "ucuz" seçme yok)
    const { getUserAllTokenPacks } = await import('../services/aiTokenPackService.js');
    const allPacks = await getUserAllTokenPacks(userId);
    const hasTokens = (p: AIProvider) => allPacks.some(pack => pack.provider === p && pack.remainingTokens > 0);

    const fallbackProvider: AIProvider = preferredProvider === 'openai' ? 'gemini' : 'openai';
    let provider: AIProvider = preferredProvider;

    if (!hasTokens(provider) && hasTokens(fallbackProvider)) {
      provider = fallbackProvider;
      logger.info('Selected provider based on available tokens (fallback)', {
        userId,
        preferredProvider,
        provider,
        reason: 'preferred_has_no_tokens'
      });
    }

    logger.info('User AI provider determined', { userId, provider, preferredProvider });

    // 2) Token paketi kontrolü (AI çağrısından önce)
    try {
      await assertUserHasTokensOrThrow(userId, provider);
      logger.info('Token pack check passed', { userId, provider });
    } catch (tokenError: any) {
      logger.warn('Token pack check failed', { userId, provider, error: tokenError.message });
      logger.end();
      const errorMap = mapAiError(AI_ERROR_CODES.TOKEN_PACK_REQUIRED);
      return res.status(errorMap.status).json({
        error: errorMap.code,
        message: tokenError.message || errorMap.userMessage,
        provider
      });
    }

    // Teklifbul Rule v1.1 - Token pre-check (hard limit) for legacy packs
    const legacyPack = allPacks.find(p => p.provider === provider);
    const legacyRemaining = legacyPack?.remainingTokens ?? 0;
    if (legacyRemaining < MIN_TOKENS) {
      logger.warn('Legacy token pack insufficient tokens (min check)', { userId, provider, remainingTokens: legacyRemaining, min: MIN_TOKENS });
      logger.end();
      const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS);
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        provider,
      });
    }

    // 3) Provider'a göre API key kontrolü
    // Teklifbul Rule v1.0 - Konfig eksikliğinde (özellikle local dev) mümkünse diğer provider'a güvenli fallback
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not configured, attempting Gemini fallback', { userId });

      if (process.env.GEMINI_API_KEY && hasTokens('gemini')) {
        try {
          await assertUserHasTokensOrThrow(userId, 'gemini');
          provider = 'gemini';
          logger.info('Switched provider due to missing OpenAI key', { userId, provider });
        } catch (tokenError: any) {
          logger.warn('Gemini fallback blocked by token pack requirement', { userId, error: tokenError?.message });
          logger.end();
          return res.status(402).json({
            error: 'token_pack_required',
            message:
              tokenError?.message ||
              'Gemini için AI token paketi bulunamadı. Lütfen paket satın alın.',
            provider: 'gemini',
          });
        }
      } else {
        logger.end();
        const errorMap = mapAiError(AI_ERROR_CODES.AI_PROVIDER_CONFIG_ERROR);
        return res.status(errorMap.status).json({
          error: errorMap.code,
          message: errorMap.userMessage,
        });
      }
    }

    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY not configured, attempting OpenAI fallback', { userId });

      if (process.env.OPENAI_API_KEY && hasTokens('openai')) {
        try {
          await assertUserHasTokensOrThrow(userId, 'openai');
          provider = 'openai';
          logger.info('Switched provider due to missing Gemini key', { userId, provider });
        } catch (tokenError: any) {
          logger.warn('OpenAI fallback blocked by token pack requirement', { userId, error: tokenError?.message });
          logger.end();
          return res.status(402).json({
            error: 'token_pack_required',
            message:
              tokenError?.message ||
              'OpenAI için AI token paketi bulunamadı. Lütfen paket satın alın.',
            provider: 'openai',
          });
        }
      } else {
        logger.end();
        return res.status(503).json({
          error: 'ai_provider_config_error',
          message:
            'AI servisi yapılandırması eksik. Gemini anahtarı tanımlı değil ve OpenAI fallback kullanılamıyor.',
        });
      }
    }

    // 4) AI çağrısını yap (token usage bilgisi lazım)
    logger.info(`Calling ${provider.toUpperCase()} API`);
    const chatMessages: ChatMessage[] = [
      { role: 'user', content: message }
    ];

    // 4) AI çağrısını yap (token usage bilgisi lazım)
    // Teklifbul Rule v1.0 - OpenAI key hatasında (invalid_api_key) güvenli fallback dene
    const isOpenAiInvalidKey = (e: any) => {
      const msg = String(e?.message || '');
      const code = String(e?.code || e?.error?.code || '');
      return (
        msg.includes('Incorrect API key') ||
        msg.includes('invalid_api_key') ||
        code === 'invalid_api_key'
      );
    };

    let result;
    try {
      result = await sendChat(chatMessages, {
        provider,
        systemPrompt: SYSTEM_PROMPT,
        model: 'gpt-4o-mini',
        temperature: 0.2,
      });
    } catch (e: any) {
      if (provider === 'openai' && isOpenAiInvalidKey(e)) {
        logger.warn('OpenAI invalid API key detected, attempting Gemini fallback', { userId });

        // Gemini fallback yalnızca server konfig + token varsa denenir
        if (!process.env.GEMINI_API_KEY) {
          logger.error('Gemini fallback not possible: GEMINI_API_KEY not configured');
          logger.end();
          return res.status(500).json({
            error: 'ai_provider_config_error',
            message: 'AI servisi yapılandırması hatalı. OpenAI anahtarı geçersiz ve Gemini anahtarı tanımlı değil.',
          });
        }

        try {
          await assertUserHasTokensOrThrow(userId, 'gemini');
        } catch (tokenError: any) {
          logger.warn('Gemini fallback blocked by token pack requirement', { userId, error: tokenError?.message });
          logger.end();
          return res.status(402).json({
            error: 'token_pack_required',
            message:
              tokenError?.message ||
              'Gemini için AI token paketi bulunamadı. Lütfen paket satın alın.',
            provider: 'gemini',
          });
        }

        provider = 'gemini';
        result = await sendChat(chatMessages, {
          provider,
          systemPrompt: SYSTEM_PROMPT,
          // model opsiyonu Gemini tarafında kullanılmıyor
          model: 'gpt-4o-mini',
          temperature: 0.2,
        });
      } else {
        throw e;
      }
    }

    const answer = result.text;
    const totalTokens = result.totalTokens;
    const promptTokens = result.promptTokens ?? 0;
    const completionTokens = result.completionTokens ?? 0;

    logger.info(`${provider.toUpperCase()} response received`, {
      promptTokens,
      completionTokens,
      totalTokens
    });

    // 5) Token kullanımını kaydet (transaction içinde)
    let tokenPack;
    try {
      tokenPack = await consumeTokensTransactional(userId, provider, totalTokens);
      logger.info('Tokens consumed successfully', {
        userId,
        provider,
        usedTokens: totalTokens,
        remainingTokens: tokenPack.remainingTokens
      });
    } catch (tokenError: any) {
      const msg = String(tokenError?.message || tokenError || '');
      logger.error('Token consumption failed', { userId, provider, error: msg });
      logger.end();
      const errorCode = msg.toLowerCase().includes('yeterli token') ? AI_ERROR_CODES.INSUFFICIENT_TOKENS : 'token_consumption_failed';
      const errorMap = errorCode === AI_ERROR_CODES.INSUFFICIENT_TOKENS ? mapAiError(errorCode) : { status: 402, userMessage: msg || 'Token kullanımı sırasında hata oluştu.', code: errorCode };
      return res.status(errorMap.status).json({
        code: errorMap.code,
        message: errorMap.userMessage,
        provider
      });
    }

    // 6) Kullanım logunu kaydet (raporlama için)
    const plan = await getUserPlan(userId);
    await logAiUsage({
      userId,
      plan,
      provider,
      promptTokens,
      completionTokens
    }).catch(err => {
      // Log hatası kritik değil
      logger.warn('Failed to log AI usage', err);
    });

    // 7) Her şey yolundaysa cevabı ve kalan token'ı dön
    logger.info('Chat request completed successfully', {
      userId,
      provider,
      remainingTokens: tokenPack.remainingTokens
    });
    logger.end();

    return res.json({
      answer,
      provider,
      remainingTokens: tokenPack.remainingTokens,
      totalTokens: tokenPack.totalTokens,
      usedTokens: totalTokens,
    });
  } catch (err: any) {
    // Teklifbul Rule v1.0 - Structured logging for errors
    logger.error('Chat API error', {
      error: err?.response?.data || err.message || err,
      stack: err?.stack,
      responseData: err?.response?.data ? JSON.stringify(err.response.data, null, 2) : undefined
    });
    logger.end();

    // HTTP 500 yanıtı
    return res.status(500).json({
      error: 'Sunucu tarafında bir hata oluştu.',
      // Teklifbul Rule v1.0 - Hassas upstream detaylarını client'a sızdırma
      message: err?.message || 'Bilinmeyen hata'
    });
  }
});

export default router;
