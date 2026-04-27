/**
 * User Service
 * Teklifbul Rule v1.0 - User Plan Management
 * 
 * Kullanıcı planı (free/premium) yönetimi
 */

import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getActiveSubscription } from './subscriptionService.js';

export type AiPlan = 'free' | 'premium' | 'premium_plus';
export type AIProvider = 'openai' | 'gemini' | 'groq';

/**
 * Kullanıcının planının AI erişimi olup olmadığını kontrol eder
 * Sadece Premium Plus planları AI erişimine sahiptir
 * 
 * @param planIdOrCode - Plan ID veya plan kodu
 * @returns AI erişimi varsa true, yoksa false
 */
export function userHasAiPlan(planIdOrCode: string): boolean {
  // Sadece premium plus plan(lar)ı true dönmeli
  const aiPlans = ['premium_plus', 'premium_plus_monthly', 'premium_plus_yearly'];
  return aiPlans.includes(planIdOrCode);
}

/**
 * Kullanıcının AI provider tercihini Firestore'dan alır
 * Provider tanımlı değilse varsayılan olarak "gemini" döner
 * 
 * @param userId - Kullanıcı ID (Firebase UID)
 * @returns Kullanıcının AI provider tercihi ("openai" veya "gemini")
 */
export async function getUserAIProvider(userId: string): Promise<AIProvider> {
  try {
    logger.group('Get User AI Provider');
    logger.info('Fetching user AI provider', { userId });

    // Teklifbul Rule v1.0 - Ortam konfigürasyonuna göre güvenli varsayılan provider seçimi
    // Default: ollama for premium_plus users
    const getSafeDefaultProvider = (): AIProvider => {
      if (process.env.GROQ_API_KEY) return 'groq';
      if (process.env.GEMINI_API_KEY) return 'gemini';
      if (process.env.OPENAI_API_KEY) return 'openai';
      return 'groq'; // Default to groq
    };

    const db = await getAdminDb();
    if (!db) {
      const fallback = getSafeDefaultProvider();
      logger.warn('Firestore unavailable, returning default provider', { fallback });
      logger.end();
      return fallback;
    }

    const docRef = db.collection('users').doc(userId);
    const snap = await docRef.get();

    if (!snap.exists) {
      const fallback = getSafeDefaultProvider();
      logger.warn('User not found, returning default provider', { userId, fallback });
      logger.end();
      return fallback;
    }

    const data = snap.data() || {};
    const aiProvider = (data.ai_provider as AIProvider | undefined) || getSafeDefaultProvider();

    logger.info('User AI provider retrieved', { userId, aiProvider });
    logger.end();
    return aiProvider;
  } catch (error: any) {
    logger.error('Error fetching user AI provider', error);
    logger.end();
    // Teklifbul Rule v1.0 - Hata durumunda ortam konfigürasyonuna göre güvenli varsayılan döndür
    if (process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) return 'openai';
    return 'gemini';
  }
}

/**
 * Kullanıcının AI planını Firestore'dan alır
 * Plan tanımlı değilse varsayılan olarak "free" döner
 * 
 * @param userId - Kullanıcı ID (Firebase UID)
 * @returns Kullanıcının planı ("free" veya "premium")
 */
export async function getUserPlan(userId: string): Promise<AiPlan> {
  try {
    logger.group('Get User Plan');
    logger.info('Fetching user plan', { userId });
    const subscription = await getActiveSubscription(userId);
    if (subscription && subscription.currentPeriodEnd > new Date()) {
      logger.info('Active subscription found, using premium plan', { userId, subscriptionId: subscription.id });
      logger.end();
      return 'premium';
    }

    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore unavailable, returning default plan (free)');
      logger.end();
      return 'free';
    }

    const docRef = db.collection('users').doc(userId);
    const snap = await docRef.get();

    if (!snap.exists) {
      logger.warn('User not found, returning default plan (free)', { userId });
      logger.end();
      return 'free';
    }

    const data = snap.data() || {};
    const planId = data.planId as string | undefined;
    const isPremium = data.isPremium === true && data.expiresAt && new Date(data.expiresAt) > new Date();
    const plan = planId === 'premium_monthly' || planId === 'premium_yearly' || isPremium ? 'premium' : 'free';

    logger.info('User plan retrieved', { userId, plan });
    logger.end();
    return plan;
  } catch (error: any) {
    logger.error('Error fetching user plan', error);
    logger.end();
    // Hata durumunda varsayılan olarak free döndür
    return 'free';
  }
}

