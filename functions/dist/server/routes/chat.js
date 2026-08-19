/**
 * Chat endpoint'i
 * Teklifbul Rule v1.0 - Chat Route
 * Teklifbul Rule v3.10 - Stabilized: Uses resolver (no mutations), constants, error mapper
 *
 * POST /api/chat
 * Body: { message: "..." }
 * Response: { answer: "..." }
 *
 * Limit ve kullanÄ±m takibi entegre edildi
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAiAccess } from '../middleware/requireAiAccess.js';
import { getUserAIProvider } from '../services/userService.js';
import { getUserPlan } from '../services/userService.js';
import { logAiUsage, } from '../services/aiUsageService.js';
import { assertUserHasTokensOrThrow, consumeTokensTransactional, } from '../services/aiTokenPackService.js';
import { logger } from '../../src/shared/log/logger.js';
import { sendChat } from '../ai/index.js';
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
import { getAdminDb } from '../utils/firestore.js';
import { getCompanyAiWallet } from '../services/companyAiWalletService.js';
import { runCompanyPaidChatTurn } from '../services/companyPaidChatBilling.js';
import { estimatePaidChatTokens, paidChatCompletionCap } from '../services/aiTokenEstimate.js';
import { getCompanyPlanFlags } from '../services/purchaseAssistantAvailabilityService.js';
import { getAiMinTokens } from '../services/aiMinTokens.js';
import { resolveCompanyAiModelForRequest } from '../services/aiModelResolverService.js';
import { AI_ERROR_CODES } from '../constants/aiMeta.js'; // Teklifbul Rule v3.17
import { mapAiError, mapAiDisabledError } from '../utils/aiErrorMapper.js';
import { evaluateAiAvailability } from '../services/aiKillSwitchService.js';
import { DEFAULT_FREE_AI } from '../constants/aiFreeDefaults.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
import { resolveAiChatRequestId } from '../utils/aiChatRequestId.js';
const router = Router();
// Validation schemas
const chatMessageSchema = z.object({
    message: z.string().min(1).max(10000, 'Mesaj Ã§ok uzun (maksimum 10000 karakter)')
});
// System prompt - net ve kÄ±sa
const SYSTEM_PROMPT = `
### KÄ°MLÄ°K:
Sen Nefisoft isimli web uygulamasÄ±nÄ±n yapay zekÃ¢ asistanÄ±sÄ±n.

### KRÄ°TÄ°K KÄ°MLÄ°K KURALI (HAYATÄ° Ã–NEMDE):
- Sistemin adÄ± KESÄ°NLÄ°KLE "Nefisoft"tur.
- "Teklifbul" sadece bir modÃ¼l ismidir.
- Genel cevaplarda sistemden bahsederken ASLA ama ASLA "Teklifbul" kelimesini kullanma, daima "Nefisoft" ismini kullan.
- KullanÄ±cÄ±ya selam verirken veya kendini tanÄ±tÄ±rken daima "Merhaba, ben Nefisoft yapay zekÃ¢ asistanÄ±nÄ±zÄ±m" de.

### GÃ–REVLERÄ°N:
- KullanÄ±cÄ±ya Nefisoft (Teklifbul, SatÄ±ÅŸ, Stok, Fatura, HakediÅŸ modÃ¼lleri dahil) iÃ§inde kayÄ±t olma, talep/teklif sÃ¼reÃ§leri, satÄ±ÅŸ yÃ¶netimi ve operasyonel kararlar konularÄ±nda yardÄ±mcÄ± olmak.
- Gereksiz kurumsal pazarlama cÃ¼mleleri ve uzun Ã¼rÃ¼n listeleri Ã¼retmemek.
- "Ben sen yapay zekÃ¢ asistanÄ±nÄ±zÄ±m" gibi bozuk TÃ¼rkÃ§e cÃ¼mleler kurmamak.
- CevaplarÄ±nÄ± kÄ±sa, net ve sade tutmak. Gereksiz yere kendini tekrar tanÄ±tmamak.
- Sadece Nefisoft operasyonel sÃ¼reÃ§leri (Talep, Teklif, SatÄ±ÅŸ, Stok, Fatura, HakediÅŸ) ile ilgili sorularÄ± yanÄ±tlamaya Ã§alÄ±ÅŸ; konu Ã§ok alakasÄ±zsa kibarca "Bu konu Nefisoft UÃ§tan uca ticari operasyon yÃ¶netimi yazÄ±lÄ±mÄ± kapsamÄ± dÄ±ÅŸÄ±ndadÄ±r" de.

### Ã–RNEK DAVRANIÅ:
KullanÄ±cÄ±: "Selam"
Cevap: "Merhaba, ben Nefisoft yapay zekÃ¢ asistanÄ±nÄ±zÄ±m. Size nasÄ±l yardÄ±mcÄ± olabilirim?"

KullanÄ±cÄ±: "NasÄ±l kayÄ±t olurum?"
Cevap:
1) KÄ±sa bir selamlama (Nefisoft adÄ±yla),
2) 3-6 maddelik net kayÄ±t adÄ±mlarÄ±,
3) KayÄ±t iÅŸlemini sen yapmÄ±yorsun, sadece yol tarif ediyorsun.
`;
/** Ãœcretsiz (Groq) modelde zor isteklerde Ã¼cretli modele nazik yÃ¶nlendirme */
const FREE_TIER_UPSELL_PROMPT = `
### MODEL SEVÄ°YESÄ° (ÃœCRETSÄ°Z GROQ):
- Åu an Ã¼cretsiz asistan modelindesin; gÃ¼nlÃ¼k sorulara net ve yeterli cevap ver.
- AÅŸaÄŸÄ±daki tÃ¼r istekler iÃ§in cevabÄ±nÄ±n SONUNA, abartmadan bir satÄ±r ekle:
  "Bu tÃ¼r karmaÅŸÄ±k analiz iÃ§in Ayarlar â†’ SatÄ±n Alma AsistanÄ± Ã¼zerinden OpenAI veya Gemini token paketi Ã¶nerilir."
  - 10+ kalemli/uzun teklif karÅŸÄ±laÅŸtÄ±rma veya skorlama
  - Ã‡ok sayfalÄ± sÃ¶zleÅŸme/hukuki-risk incelemesi
  - BÃ¼yÃ¼k veri seti veya Ã§ok adÄ±mlÄ± matematiksel optimizasyon
  - Derin rapor, strateji veya yÃ¼ksek doÄŸruluk gerektiren teknik Ã§Ã¶zÃ¼m
- Basit "nasÄ±l yapÄ±lÄ±r", selam, kÄ±sa operasyon sorularÄ±nda paket yÃ¶nlendirmesi YAPMA.
`;
/**
 * POST /api/chat
 * Chat endpoint - kullanÄ±cÄ± mesajÄ±nÄ± alÄ±r ve AI ile yanÄ±t Ã¼retir
 * Token paketi kontrolÃ¼ ve kullanÄ±m takibi entegre edildi
 */
router.post('/', verifyToken, requireAiAccess, validateRequest({ body: chatMessageSchema }), async (req, res) => {
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
        // Teklifbul Rule v1.0 - KÄ±rmadan geÃ§iÅŸ: company settings + wallet varsa onlarÄ± kullan
        // Yoksa legacy (user token pack) akÄ±ÅŸÄ±na dÃ¼ÅŸ.
        // Teklifbul Rule v1.0 - company settings (trusted company id)
        async function tryGetCompanyPurchaseAssistantSettings() {
            const db = await getAdminDb();
            if (!db)
                return null;
            const headerCompanyId = req.headers['x-company-id'];
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.exists ? (userDoc.data() || {}) : {};
            const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
                userId,
                path: '/api/chat',
            });
            if (!companyId)
                return null;
            const ref = db.collection('companies').doc(companyId).collection('settings').doc('purchaseAssistant');
            const snap = await ref.get();
            const data = snap.exists ? (snap.data() || {}) : {};
            return {
                companyId,
                provider: String(data.provider || DEFAULT_FREE_AI.provider),
                model: String(data.model || DEFAULT_FREE_AI.model),
                enabled: data.enabled !== false,
                forcedFreeMode: data.forcedFreeMode === true,
                customInstructions: data.customInstructions || '',
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
        // Ãœcretsiz Groq cÃ¼zdan istemez; companyId yeterli
        const useCompanyFlow = !!companySettings?.companyId && companySettings.enabled !== false;
        const companyWallet = companySettings?.companyId
            ? await getCompanyAiWallet(companySettings.companyId)
            : { balanceTokens: 0 };
        if (useCompanyFlow) {
            logger.info('[AI] company settings used', {
                companyId: companySettings.companyId,
                provider: companySettings.provider,
                model: companySettings.model,
            });
            // Teklifbul Rule v3.9 - Runtime Model Resolver (NO MUTATION)
            const planFlags = await getCompanyPlanFlags(companySettings.companyId);
            const resolved = await resolveCompanyAiModelForRequest({
                companyId: companySettings.companyId,
                settings: companySettings,
                planFlags,
            });
            // Log auto-resolution if occurred
            if (resolved.modelAutoResolved === true) {
                logger.warn('[AI] model auto-resolved', {
                    companyId: companySettings.companyId,
                    from: { provider: companySettings.provider, model: companySettings.model },
                    to: { provider: resolved.provider, model: resolved.model },
                    reason: resolved.reason,
                });
            }
            const companyProvider = resolved.provider;
            const model = resolved.model;
            const isFreeEligible = resolved.isFreeEligible;
            // Future free provider placeholder â€” gerÃ§ek Ã¼cretsiz Groq'a yÃ¶nlendir
            if (companyProvider === 'free_local') {
                logger.info('[AI] free_local stub detected â†’ remapping to default free Groq');
            }
            const effectiveProvider = companyProvider === 'free_local' ? 'groq' : companyProvider;
            const effectiveModel = companyProvider === 'free_local' ? DEFAULT_FREE_AI.model : model;
            const effectiveFree = companyProvider === 'free_local'
                ? true
                : isFreeEligible || effectiveProvider === 'groq';
            // Teklifbul Rule v3.12 - Check provider-specific wallet (skip for freeEligible / Groq)
            // Resolver zaten token yoksa Ã¼cretsiz Modele dÃ¼ÅŸÃ¼rÃ¼r; ek gÃ¼venlik aÄŸÄ±:
            let runProvider = effectiveProvider;
            let runModel = effectiveModel;
            let runFree = effectiveFree;
            if (!runFree && runProvider !== 'groq') {
                const providerKey = runProvider === 'openai' || runProvider.startsWith('openai') ? 'openai' :
                    runProvider === 'gemini' || runProvider.startsWith('gemini') ? 'gemini' :
                        runProvider.toLowerCase();
                const providerWallet = await getCompanyAiWallet(companySettings.companyId, providerKey);
                const availableTokens = providerWallet?.availableTokens
                    ?? Math.max(0, (providerWallet?.balanceTokens || 0) - (providerWallet?.reservedTokens || 0));
                if (availableTokens < MIN_TOKENS) {
                    logger.warn('[AI] paid wallet low -> auto free Groq (no 402)', {
                        companyId: companySettings.companyId,
                        providerKey,
                        balanceTokens: providerWallet?.balanceTokens,
                        reservedTokens: providerWallet?.reservedTokens || 0,
                        availableTokens,
                        min: MIN_TOKENS,
                    });
                    runProvider = DEFAULT_FREE_AI.provider;
                    runModel = DEFAULT_FREE_AI.model;
                    runFree = true;
                }
            }
            const freePromptExtra = runFree ? FREE_TIER_UPSELL_PROMPT : '';
            const systemPromptBase = companySettings?.customInstructions
                ? `${SYSTEM_PROMPT}\n\nKULLANICI ÖZEL TALİMATLARI:\n${companySettings.customInstructions}${freePromptExtra}`
                : `${SYSTEM_PROMPT}${freePromptExtra}`;
            const chatMessages = [{ role: 'user', content: message }];
            const autoResolved = resolved.modelAutoResolved === true || (runFree && !isFreeEligible);
            const responseMeta = {
                modelAutoDowngraded: autoResolved,
                modelAutoResolved: autoResolved,
                modelResolvedBy: resolved.resolvedBy,
                modelResolveReason: resolved.reason || null,
                resolvedProvider: runProvider,
                resolvedModel: runModel,
                requiredProviderKey: resolved.requiredProviderKey,
                suggestedPaid: resolved.suggestedPaid,
            };
            if (runFree || runProvider === 'groq') {
                const result = await sendChat(chatMessages, {
                    provider: runProvider,
                    systemPrompt: systemPromptBase,
                    model: runModel,
                    temperature: 0.2,
                });
                const usedTokens = result.totalTokens;
                logger.end();
                return res.json({
                    answer: result.text,
                    provider: runProvider,
                    meta: responseMeta,
                    remainingTokens: companyWallet?.balanceTokens || 0,
                    totalTokens: (companyWallet?.balanceTokens || 0) + usedTokens,
                    usedTokens,
                });
            }
            const requestIdResult = resolveAiChatRequestId(req.headers['x-request-id']);
            if (!requestIdResult.ok) {
                logger.warn('Invalid x-request-id on paid company chat', { companyId: companySettings.companyId });
                logger.end();
                return res.status(400).json({
                    error: 'invalid_request_id',
                    message: 'Geçersiz x-request-id. 8-128 karakter; harf, rakam ve . _ : - kullanın.',
                });
            }
            const maxTokens = paidChatCompletionCap(runProvider);
            const estimatedTokens = estimatePaidChatTokens({
                provider: runProvider,
                message,
                systemPrompt: systemPromptBase,
                maxTokens,
            });
            const paidTurn = await runCompanyPaidChatTurn({
                companyId: companySettings.companyId,
                userId,
                provider: runProvider,
                model: runModel,
                requestId: requestIdResult.requestId,
                estimatedTokens,
                invokeProvider: () => sendChat(chatMessages, {
                    provider: runProvider,
                    systemPrompt: systemPromptBase,
                    model: runModel,
                    temperature: 0.2,
                    maxTokens,
                }),
                meta: {
                    route: '/api/chat',
                    resolvedProvider: runProvider,
                    resolvedModel: runModel,
                },
            });
            if (!paidTurn.ok) {
                if (paidTurn.code === 'AI_PROVIDER_ERROR') {
                    logger.end();
                    throw paidTurn.providerError || new Error('AI provider error');
                }
                const errorMap = mapAiError(paidTurn.code, {
                    resolvedProvider: runProvider,
                    requiredProviderKey: resolved.requiredProviderKey,
                });
                logger.end();
                return res.status(errorMap.status).json({
                    code: errorMap.code,
                    message: errorMap.userMessage,
                    provider: runProvider,
                    meta: errorMap.meta,
                });
            }
            logger.end();
            return res.json({
                answer: paidTurn.result.text,
                provider: runProvider,
                meta: responseMeta,
                remainingTokens: paidTurn.wallet.availableTokens,
                totalTokens: paidTurn.captureDeferred
                    ? paidTurn.wallet.balanceTokens
                    : paidTurn.wallet.balanceTokens + paidTurn.actualTokens,
                usedTokens: paidTurn.actualTokens,
            });
        }
        logger.info('[AI] legacy fallback used', { reason: 'company id not available' });
        // Teklifbul Rule v1.0 — Legacy: varsayılan ücretsiz Groq; token varsa ücretli tercih
        const preferredProvider = await getUserAIProvider(userId);
        const { getUserAllTokenPacks } = await import('../services/aiTokenPackService.js');
        const allPacks = await getUserAllTokenPacks(userId);
        const hasTokens = (p) => allPacks.some((pack) => pack.provider === p && pack.remainingTokens > 0);
        let provider = DEFAULT_FREE_AI.provider;
        let freeMode = true;
        let model = DEFAULT_FREE_AI.model;
        if (preferredProvider === 'openai' && hasTokens('openai') && process.env.OPENAI_API_KEY) {
            provider = 'openai';
            freeMode = false;
            model = 'gpt-4o-mini';
        }
        else if (preferredProvider === 'gemini' && hasTokens('gemini') && process.env.GEMINI_API_KEY) {
            provider = 'gemini';
            freeMode = false;
            model = 'gemini-pro';
        }
        else if (preferredProvider !== 'groq') {
            if (hasTokens('openai') && process.env.OPENAI_API_KEY) {
                provider = 'openai';
                freeMode = false;
                model = 'gpt-4o-mini';
            }
            else if (hasTokens('gemini') && process.env.GEMINI_API_KEY) {
                provider = 'gemini';
                freeMode = false;
                model = 'gemini-pro';
            }
            else {
                logger.info('[AI] free Groq (no paid token pack)', { userId, preferredProvider });
            }
        }
        // Ücretsiz Groq: token paketi aranmaz
        if (!freeMode) {
            try {
                await assertUserHasTokensOrThrow(userId, provider);
                logger.info('Token pack check passed', { userId, provider });
            }
            catch (tokenError) {
                if (process.env.GROQ_API_KEY) {
                    logger.warn('Token pack missing → free Groq', { userId, provider, error: tokenError.message });
                    provider = DEFAULT_FREE_AI.provider;
                    freeMode = true;
                    model = DEFAULT_FREE_AI.model;
                }
                else {
                    logger.warn('Token pack check failed', { userId, provider, error: tokenError.message });
                    logger.end();
                    const errorMap = mapAiError(AI_ERROR_CODES.TOKEN_PACK_REQUIRED);
                    return res.status(errorMap.status).json({
                        error: errorMap.code,
                        message: tokenError.message || errorMap.userMessage,
                        provider,
                    });
                }
            }
            if (!freeMode) {
                const legacyPack = allPacks.find((p) => p.provider === provider);
                const legacyRemaining = legacyPack?.remainingTokens ?? 0;
                if (legacyRemaining < MIN_TOKENS) {
                    if (process.env.GROQ_API_KEY) {
                        logger.warn('Legacy tokens low → free Groq', { userId, provider, legacyRemaining });
                        provider = DEFAULT_FREE_AI.provider;
                        freeMode = true;
                        model = DEFAULT_FREE_AI.model;
                    }
                    else {
                        logger.warn('Legacy token pack insufficient tokens (min check)', {
                            userId,
                            provider,
                            remainingTokens: legacyRemaining,
                            min: MIN_TOKENS,
                        });
                        logger.end();
                        const errorMap = mapAiError(AI_ERROR_CODES.INSUFFICIENT_TOKENS);
                        return res.status(errorMap.status).json({
                            code: errorMap.code,
                            message: errorMap.userMessage,
                            provider,
                        });
                    }
                }
            }
        }
        logger.info('User AI provider determined', { userId, provider, preferredProvider, freeMode });
        if (freeMode && !process.env.GROQ_API_KEY) {
            logger.end();
            const errorMap = mapAiError(AI_ERROR_CODES.AI_PROVIDER_CONFIG_ERROR);
            return res.status(errorMap.status).json({
                error: errorMap.code,
                message: errorMap.userMessage,
            });
        }
        logger.info(`Calling ${provider.toUpperCase()} API`, { freeMode });
        const chatMessages = [{ role: 'user', content: message }];
        let result;
        try {
            result = await sendChat(chatMessages, {
                provider,
                systemPrompt: freeMode ? `${SYSTEM_PROMPT}${FREE_TIER_UPSELL_PROMPT}` : SYSTEM_PROMPT,
                model,
                temperature: 0.2,
            });
        }
        catch (e) {
            if (!freeMode && process.env.GROQ_API_KEY) {
                logger.warn('Paid provider failed → free Groq', { userId, provider, error: e?.message });
                provider = DEFAULT_FREE_AI.provider;
                freeMode = true;
                model = DEFAULT_FREE_AI.model;
                result = await sendChat(chatMessages, {
                    provider,
                    systemPrompt: `${SYSTEM_PROMPT}${FREE_TIER_UPSELL_PROMPT}`,
                    model,
                    temperature: 0.2,
                });
            }
            else {
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
            totalTokens,
            freeMode,
        });
        if (freeMode) {
            const plan = await getUserPlan(userId);
            await logAiUsage({
                userId,
                plan,
                provider,
                promptTokens,
                completionTokens,
            }).catch((err) => {
                logger.warn('Failed to log AI usage', err);
            });
            logger.info('Chat request completed (free Groq)', { userId, provider, totalTokens });
            logger.end();
            return res.json({
                answer,
                provider,
                remainingTokens: null,
                totalTokens: null,
                usedTokens: totalTokens,
                meta: { freeEligible: true, resolvedProvider: provider, resolvedModel: model },
            });
        }
        let tokenPack;
        try {
            tokenPack = await consumeTokensTransactional(userId, provider, totalTokens);
            logger.info('Tokens consumed successfully', {
                userId,
                provider,
                usedTokens: totalTokens,
                remainingTokens: tokenPack.remainingTokens,
            });
        }
        catch (tokenError) {
            const msg = String(tokenError?.message || tokenError || '');
            logger.warn('Token consumption failed; still returning answer', { userId, msg });
            logger.end();
            return res.json({
                answer,
                provider,
                remainingTokens: 0,
                usedTokens: totalTokens,
                meta: { freeEligible: false, consumeFailed: true },
            });
        }
        const plan = await getUserPlan(userId);
        await logAiUsage({
            userId,
            plan,
            provider,
            promptTokens,
            completionTokens,
        }).catch((err) => {
            logger.warn('Failed to log AI usage', err);
        });
        logger.info('Chat request completed successfully', {
            userId,
            provider,
            remainingTokens: tokenPack.remainingTokens,
        });
        logger.end();
        return res.json({
            answer,
            provider,
            remainingTokens: tokenPack.remainingTokens,
            totalTokens: tokenPack.totalTokens,
            usedTokens: totalTokens,
        });
    }
    catch (err) {
        logger.error('Chat API error', {
            error: err?.response?.data || err.message || err,
            stack: err?.stack,
            responseData: err?.response?.data ? JSON.stringify(err.response.data, null, 2) : undefined
        });
        logger.end();
        return res.status(500).json({
            error: 'Sunucu tarafında bir hata oluştu.',
            message: err?.message || 'Bilinmeyen hata'
        });
    }
});
export default router;
