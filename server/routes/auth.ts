/**
 * Authentication Routes
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * Firebase Auth token verification ve user bilgisi endpoint'leri
 */

import express, { Request, Response } from 'express';
import admin from 'firebase-admin';
import { verifyToken, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../../src/shared/log/logger.js';

const router = express.Router();

// Firebase Admin initialize (eğer yoksa)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'teklifbul'
    });
  } catch (err) {
    logger.warn('Firebase Admin initialization failed', err);
  }
}

/**
 * POST /api/auth/verify
 * Frontend'den gelen Firebase token'ı verify eder
 * 
 * Request body:
 * {
 *   "idToken": "firebase-id-token-string"
 * }
 * 
 * Response:
 * {
 *   "valid": true,
 *   "uid": "user-uid",
 *   "email": "user@example.com",
 *   "emailVerified": true
 * }
 */
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({
        error: 'Token eksik',
        message: 'idToken gereklidir'
      });
      return;
    }

    // Token verify et
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    logger.info('Token verified successfully', {
      uid: decodedToken.uid,
      email: decodedToken.email
    });

    res.json({
      valid: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified || false,
      customClaims: decodedToken
    });
  } catch (error: any) {
    logger.error('Token verification failed', error);

    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({
        valid: false,
        error: 'Token süresi dolmuş',
        message: 'Lütfen tekrar giriş yapın'
      });
    } else if (error.code === 'auth/argument-error') {
      res.status(400).json({
        valid: false,
        error: 'Geçersiz token',
        message: 'Token formatı hatalı'
      });
    } else {
      res.status(401).json({
        valid: false,
        error: 'Kimlik doğrulama hatası',
        message: error.message || 'Token doğrulanamadı'
      });
    }
  }
});

/**
 * GET /api/auth/me
 * Authorization header'dan token alır ve user bilgilerini döndürür
 * 
 * Headers:
 * Authorization: Bearer <firebase-id-token>
 * 
 * Response:
 * {
 *   "uid": "user-uid",
 *   "email": "user@example.com",
 *   "emailVerified": true,
 *   "customClaims": {...}
 * }
 */
router.get('/me', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Kullanıcı bilgisi bulunamadı',
        message: 'Token verify edilemedi'
      });
      return;
    }

    // Firestore'dan ek kullanıcı bilgilerini al (opsiyonel)
    try {
      const userDoc = await admin.firestore().collection('users').doc(req.user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      res.json({
        uid: req.user.uid,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        customClaims: req.user.customClaims,
        profile: userData || null
      });
    } catch (firestoreError) {
      // Firestore hatası olsa bile temel bilgileri döndür
      logger.warn('Firestore user data fetch failed, returning basic info', firestoreError);
      res.json({
        uid: req.user.uid,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        customClaims: req.user.customClaims,
        profile: null
      });
    }
  } catch (error: any) {
    logger.error('Get user info failed', error);
    res.status(500).json({
      error: 'Sunucu hatası',
      message: 'Kullanıcı bilgileri alınamadı'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Token refresh (Firebase Auth otomatik refresh yapar, bu endpoint opsiyonel)
 * 
 * Request body:
 * {
 *   "refreshToken": "firebase-refresh-token"
 * }
 * 
 * Not: Firebase Auth client-side'da otomatik refresh yapar.
 * Bu endpoint sadece manuel refresh gerektiğinde kullanılabilir.
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({
        error: 'Refresh token eksik',
        message: 'refreshToken gereklidir'
      });
      return;
    }

    // Firebase Admin ile refresh token verify et
    // Not: Firebase Admin SDK refresh token'ı direkt verify etmez
    // Bu endpoint genellikle client-side'da Firebase Auth SDK ile yapılır
    // Burada sadece token'ın geçerliliğini kontrol edebiliriz

    res.status(501).json({
      error: 'Not implemented',
      message: 'Token refresh client-side Firebase Auth SDK ile yapılmalıdır'
    });
  } catch (error: any) {
    logger.error('Token refresh failed', error);
    res.status(500).json({
      error: 'Sunucu hatası',
      message: error.message || 'Token refresh edilemedi'
    });
  }
});

export default router;

