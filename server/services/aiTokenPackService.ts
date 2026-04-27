/**
 * AI Token Pack Service
 * Teklifbul Rule v1.0 - Token Pack Management for AI Usage
 * 
 * Token paketi yönetimi: satın alınan tokenlar, kullanım takibi, limit kontrolü
 */

import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import type { AIProvider } from './userService.js';

export interface AiTokenPack {
  userId: string;
  provider: 'openai' | 'gemini';
  totalTokens: number;      // Satın alınan toplam token
  usedTokens: number;       // Kullanılmış token
  remainingTokens: number;  // Kalan token
  currency?: string;        // Opsiyonel: paket para birimi (örn. TRY)
  createdAt: Date;
  updatedAt: Date;
}

const AI_TOKEN_PACKS_COLLECTION = 'ai_token_packs';

/**
 * Kullanıcının belirli bir provider için token paketini alır
 * 
 * @param userId - Kullanıcı ID
 * @param provider - AI provider ('openai' veya 'gemini')
 * @returns Token paketi veya null (paket yoksa)
 */
export async function getUserTokenPack(
  userId: string,
  provider: AIProvider
): Promise<AiTokenPack | null> {
  try {
    logger.group('Get User Token Pack');
    logger.info('Fetching token pack', { userId, provider });

    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore unavailable');
      logger.end();
      return null;
    }

    const docId = `${userId}_${provider}`;
    const docRef = db.collection(AI_TOKEN_PACKS_COLLECTION).doc(docId);
    const snap = await docRef.get();

    if (!snap.exists) {
      logger.info('Token pack not found', { userId, provider });
      logger.end();
      return null;
    }

    const data = snap.data() || {};
    const tokenPack: AiTokenPack = {
      userId: data.userId,
      provider: data.provider,
      totalTokens: data.totalTokens || 0,
      usedTokens: data.usedTokens || 0,
      remainingTokens: data.remainingTokens || 0,
      currency: data.currency || 'TRY',
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt) || new Date()
    };

    logger.info('Token pack retrieved', {
      userId,
      provider,
      remainingTokens: tokenPack.remainingTokens,
      totalTokens: tokenPack.totalTokens
    });
    logger.end();
    return tokenPack;
  } catch (error: any) {
    logger.error('Error fetching token pack', error);
    logger.end();
    return null;
  }
}

/**
 * Kullanıcının token paketi olup olmadığını ve yeterli token olup olmadığını kontrol eder
 * Token paketi yoksa veya token yoksa exception throw eder
 * 
 * @param userId - Kullanıcı ID
 * @param provider - AI provider
 * @param estimatedTokens - Tahmini token miktarı (opsiyonel)
 * @returns Token paketi
 * @throws Error - Token paketi yoksa veya yeterli token yoksa
 */
export async function assertUserHasTokensOrThrow(
  userId: string,
  provider: AIProvider,
  estimatedTokens?: number
): Promise<AiTokenPack> {
  try {
    logger.group('Assert User Has Tokens');
    logger.info('Checking token availability', { userId, provider, estimatedTokens });

    const tokenPack = await getUserTokenPack(userId, provider);

    if (!tokenPack) {
      logger.warn('Token pack not found', { userId, provider });
      logger.end();
      throw new Error('Bu sağlayıcı için AI token paketi bulunamadı. Lütfen paket satın alın.');
    }

    if (tokenPack.remainingTokens <= 0) {
      logger.warn('Tokens exhausted', {
        userId,
        provider,
        remainingTokens: tokenPack.remainingTokens
      });
      logger.end();
      throw new Error('Bu sağlayıcı için AI tokenlarınız tükenmiştir. Lütfen yeni bir paket satın alın.');
    }

    if (estimatedTokens && tokenPack.remainingTokens < estimatedTokens) {
      logger.warn('Insufficient tokens', {
        userId,
        provider,
        remainingTokens: tokenPack.remainingTokens,
        estimatedTokens
      });
      logger.end();
      throw new Error('Bu sağlayıcı için AI tokenlarınız tükenmiştir. Lütfen yeni bir paket satın alın.');
    }

    logger.info('Token check passed', {
      userId,
      provider,
      remainingTokens: tokenPack.remainingTokens
    });
    logger.end();
    return tokenPack;
  } catch (error: any) {
    logger.error('Token assertion failed', error);
    logger.end();
    // Re-throw if it's already our custom error, otherwise wrap it
    if (error.message?.includes('token paketi') || error.message?.includes('tokenlarınız')) {
      throw error;
    }
    throw new Error('Token kontrolü sırasında hata oluştu: ' + error.message);
  }
}

/**
 * Token kullanımını transaction içinde günceller
 * Kalan token yetersizse exception throw eder
 * 
 * @param userId - Kullanıcı ID
 * @param provider - AI provider
 * @param usedTokens - Kullanılan token miktarı
 * @returns Güncellenmiş token paketi
 * @throws Error - Yeterli token yoksa
 */
export async function consumeTokensTransactional(
  userId: string,
  provider: AIProvider,
  usedTokens: number
): Promise<AiTokenPack> {
  try {
    logger.group('Consume Tokens Transactional');
    logger.info('Consuming tokens', { userId, provider, usedTokens });

    if (usedTokens <= 0) {
      logger.warn('Invalid token amount', { usedTokens });
      logger.end();
      throw new Error('Geçersiz token miktarı');
    }

    const db = await getAdminDb();
    if (!db) {
      logger.error('Firestore unavailable');
      logger.end();
      throw new Error('Veritabanı bağlantısı kurulamadı');
    }

    const docId = `${userId}_${provider}`;
    const docRef = db.collection(AI_TOKEN_PACKS_COLLECTION).doc(docId);

    // Transaction içinde güncelleme
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);

      if (!snap.exists) {
        throw new Error('Token paketi bulunamadı');
      }

      const data = snap.data() || {};
      const currentUsedTokens = data.usedTokens || 0;
      const currentTotalTokens = data.totalTokens || 0;
      const currentRemainingTokens = data.remainingTokens || 0;

      // Kalan token kontrolü
      if (currentRemainingTokens < usedTokens) {
        throw new Error('Yeterli token bulunmamaktadır');
      }

      // Yeni değerleri hesapla
      const newUsedTokens = currentUsedTokens + usedTokens;
      const newRemainingTokens = currentRemainingTokens - usedTokens;
      const now = new Date();

      // Firestore'a yaz
      tx.update(docRef, {
        usedTokens: newUsedTokens,
        remainingTokens: newRemainingTokens,
        updatedAt: now
      });

      logger.info('Tokens consumed successfully', {
        userId,
        provider,
        usedTokens,
        newRemainingTokens
      });

      return {
        userId: data.userId,
        provider: data.provider,
        totalTokens: currentTotalTokens,
        usedTokens: newUsedTokens,
        remainingTokens: newRemainingTokens,
        currency: data.currency || 'TRY',
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(),
        updatedAt: now
      } as AiTokenPack;
    });

    logger.end();
    return result;
  } catch (error: any) {
    logger.error('Error consuming tokens', error);
    logger.end();
    // Re-throw if it's already our custom error
    if (
      error.message?.includes('token paketi') ||
      error.message?.includes('token bulunmamaktadır') ||
      error.message?.includes('Geçersiz token')
    ) {
      throw error;
    }
    throw new Error('Token kullanımı sırasında hata oluştu: ' + error.message);
  }
}

/**
 * Admin: Kullanıcıya token paketi ekle veya güncelle
 * Teklifbul Rule v1.0 - Admin token yönetimi
 * 
 * @param userId - Kullanıcı ID
 * @param provider - AI provider
 * @param tokenAmount - Eklenecek token miktarı
 * @param currency - Para birimi (varsayılan: TRY)
 * @returns Güncellenmiş token paketi
 */
export async function addTokensToUser(
  userId: string,
  provider: AIProvider,
  tokenAmount: number,
  currency: string = 'TRY'
): Promise<AiTokenPack> {
  try {
    logger.group('Admin Add Tokens');
    logger.info('Adding tokens to user', { userId, provider, tokenAmount, currency });

    if (tokenAmount <= 0) {
      logger.warn('Invalid token amount', { tokenAmount });
      logger.end();
      throw new Error('Geçersiz token miktarı');
    }

    const db = await getAdminDb();
    if (!db) {
      logger.error('Firestore unavailable');
      logger.end();
      throw new Error('Veritabanı bağlantısı kurulamadı');
    }

    const docId = `${userId}_${provider}`;
    const docRef = db.collection(AI_TOKEN_PACKS_COLLECTION).doc(docId);

    // Transaction içinde ekleme/güncelleme
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const now = new Date();

      if (!snap.exists) {
        // Yeni token paketi oluştur
        const newPack: AiTokenPack = {
          userId,
          provider,
          totalTokens: tokenAmount,
          usedTokens: 0,
          remainingTokens: tokenAmount,
          currency,
          createdAt: now,
          updatedAt: now
        };

        await tx.set(docRef, {
          ...newPack,
          createdAt: now,
          updatedAt: now
        });

        logger.info('New token pack created', { userId, provider, tokenAmount });
        return newPack;
      } else {
        // Mevcut paketi güncelle
        const data = snap.data() || {};
        const currentTotalTokens = data.totalTokens || 0;
        const currentUsedTokens = data.usedTokens || 0;
        const currentRemainingTokens = data.remainingTokens || 0;

        const newTotalTokens = currentTotalTokens + tokenAmount;
        const newRemainingTokens = currentRemainingTokens + tokenAmount;

        await tx.update(docRef, {
          totalTokens: newTotalTokens,
          remainingTokens: newRemainingTokens,
          updatedAt: now
        });

        logger.info('Token pack updated', {
          userId,
          provider,
          addedTokens: tokenAmount,
          newTotalTokens,
          newRemainingTokens
        });

        return {
          userId: data.userId || userId,
          provider: data.provider || provider,
          totalTokens: newTotalTokens,
          usedTokens: currentUsedTokens,
          remainingTokens: newRemainingTokens,
          currency: data.currency || currency,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || now,
          updatedAt: now
        } as AiTokenPack;
      }
    });

    logger.end();
    return result;
  } catch (error: any) {
    logger.error('Error adding tokens', error);
    logger.end();
    throw new Error('Token ekleme sırasında hata oluştu: ' + error.message);
  }
}

/**
 * Kullanıcının tüm token paketlerini getir
 */
export async function getUserAllTokenPacks(userId: string): Promise<AiTokenPack[]> {
  try {
    logger.group('Get User All Token Packs');
    logger.info('Fetching all token packs', { userId });

    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore unavailable');
      logger.end();
      return [];
    }

    const snapshot = await db.collection(AI_TOKEN_PACKS_COLLECTION)
      .where('userId', '==', userId)
      .get();

    const packs: AiTokenPack[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      packs.push({
        userId: data.userId,
        provider: data.provider,
        totalTokens: data.totalTokens || 0,
        usedTokens: data.usedTokens || 0,
        remainingTokens: data.remainingTokens || 0,
        currency: data.currency || 'TRY',
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt) || new Date()
      });
    });

    logger.info('Token packs retrieved', { userId, count: packs.length });
    logger.end();
    return packs;
  } catch (error: any) {
    logger.error('Error fetching token packs', error);
    logger.end();
    return [];
  }
}

