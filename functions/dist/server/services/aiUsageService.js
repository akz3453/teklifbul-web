/**
 * AI Usage Service
 * Teklifbul Rule v1.0 - AI Usage Tracking (Logging Only)
 *
 * NOT: Mesaj limiti kontrolü kaldırıldı. Limit kontrolü artık aiTokenPackService üzerinden yapılıyor.
 * Bu servis sadece raporlama/log amaçlı kullanılıyor.
 */
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import dayjs from 'dayjs';
/**
 * GPT-4o-mini için yaklaşık fiyatlar (USD / 1M token)
 * Bu değerler tahmini; ileride kolayca güncellenebilir.
 */
const INPUT_PRICE_PER_MILLION = 0.15;
const OUTPUT_PRICE_PER_MILLION = 0.60;
/**
 * AI kullanımını log amaçlı Firestore'a yazar
 * Limit kontrolü YOK - sadece raporlama için
 *
 * @param params - Kullanıcı ID, plan, provider, token bilgileri
 */
export async function logAiUsage(params) {
    try {
        logger.group('Log AI Usage');
        const { userId, plan, provider, promptTokens, completionTokens } = params;
        logger.info('Logging AI usage', {
            userId,
            plan,
            provider,
            promptTokens,
            completionTokens
        });
        const db = await getAdminDb();
        if (!db) {
            logger.warn('Firestore unavailable, skipping log');
            logger.end();
            return;
        }
        // Period hesapla (aylık olarak log tutuyoruz)
        const now = dayjs();
        const period = now.format('YYYY-MM');
        const docId = `${userId}_month_${period}`;
        const docRef = db.collection('ai_usage').doc(docId);
        const totalTokens = promptTokens + completionTokens;
        // Maliyet hesabı (USD) - sadece log için
        const INPUT_PRICE_PER_MILLION = 0.15;
        const OUTPUT_PRICE_PER_MILLION = 0.60;
        const costForThisCall = (promptTokens / 1000000) * INPUT_PRICE_PER_MILLION +
            (completionTokens / 1000000) * OUTPUT_PRICE_PER_MILLION;
        // Firestore'a yaz (transaction ile, sadece log)
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            let existingPromptTokens = 0;
            let existingCompletionTokens = 0;
            let existingTotalTokens = 0;
            let existingCostUsd = 0;
            if (snap.exists) {
                const data = snap.data() || {};
                existingPromptTokens = data.promptTokens || 0;
                existingCompletionTokens = data.completionTokens || 0;
                existingTotalTokens = data.totalTokens || 0;
                existingCostUsd = data.costUsd || 0;
            }
            // Yeni değerleri hesapla
            const newPromptTokens = existingPromptTokens + promptTokens;
            const newCompletionTokens = existingCompletionTokens + completionTokens;
            const newTotalTokens = existingTotalTokens + totalTokens;
            const newCostUsd = existingCostUsd + costForThisCall;
            // Firestore'a yaz
            tx.set(docRef, {
                userId,
                plan,
                provider,
                periodType: 'month',
                period,
                promptTokens: newPromptTokens,
                completionTokens: newCompletionTokens,
                totalTokens: newTotalTokens,
                costUsd: newCostUsd,
                updatedAt: new Date(),
            }, { merge: true });
        });
        logger.info('AI usage logged successfully', {
            userId,
            plan,
            provider,
            totalTokens,
            costForThisCall
        });
        logger.end();
    }
    catch (error) {
        logger.error('Error logging AI usage', error);
        logger.end();
        // Log hatası kritik değil, devam et
    }
}
