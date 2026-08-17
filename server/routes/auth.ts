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
      emailVerified: decodedToken.email_verified || false
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

      const claims = (req.user.customClaims || {}) as Record<string, unknown>;
      res.json({
        uid: req.user.uid,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        customClaims: {
          superAdmin: claims.superAdmin === true,
          admin: claims.admin === true
        },
        profile: userData || null
      });
    } catch (firestoreError) {
      // Firestore hatası olsa bile temel bilgileri döndür
      logger.warn('Firestore user data fetch failed, returning basic info', firestoreError);
      const claims = (req.user.customClaims || {}) as Record<string, unknown>;
      res.json({
        uid: req.user.uid,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        customClaims: {
          superAdmin: claims.superAdmin === true,
          admin: claims.admin === true
        },
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

/**
 * POST /api/auth/send-verification-email
 * Markalı doğrulama maili (Resend/Brevo/Mailjet + SENDER_EMAIL)
 */
router.post('/send-verification-email', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const authUser = await admin.auth().getUser(uid);
    if (!authUser.email) {
      return res.status(400).json({ ok: false, error: 'E-posta adresi bulunamadı' });
    }
    if (authUser.emailVerified) {
      return res.json({ ok: true, alreadyVerified: true });
    }

    const { sendBrandedEmail, isBrandedEmailReady } = await import('../services/emailService.js');
    if (!isBrandedEmailReady()) {
      logger.warn('Branded verification unavailable; client Firebase fallback required', { uid });
      return res.status(503).json({
        ok: false,
        fallback: true,
        error: 'email_provider_unavailable',
      });
    }

    const continueUrl =
      (typeof req.body?.continueUrl === 'string' && req.body.continueUrl.startsWith('https://')
        ? req.body.continueUrl
        : null) ||
      process.env.APP_PUBLIC_URL ||
      'https://nefisoft.com/login.html';

    const actionCodeSettings = {
      url: continueUrl.includes('login') ? continueUrl : `${continueUrl.replace(/\/$/, '')}/login.html`,
      handleCodeInApp: false,
    };

    const link = await admin.auth().generateEmailVerificationLink(authUser.email, actionCodeSettings);
    const displayName = authUser.displayName || authUser.email.split('@')[0];
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;">
        <h2 style="color:#1d4ed8;margin:0 0 12px;">NEFISOFT e-posta doğrulama</h2>
        <p>Merhaba ${displayName},</p>
        <p>Hesabınızı tamamlamak için e-posta adresinizi doğrulayın:</p>
        <p style="margin:24px 0;">
          <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
            E-postamı Doğrula
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280;">Buton çalışmazsa bu bağlantıyı tarayıcıya yapıştırın:<br/>${link}</p>
        <p style="font-size:12px;color:#9ca3af;">Bu mesajı siz talep etmediyseniz yok sayabilirsiniz.</p>
      </div>
    `;

    const sent = await sendBrandedEmail({
      to: authUser.email,
      subject: 'NEFISOFT — E-posta adresinizi doğrulayın',
      html,
    });

    if (!sent.success) {
      logger.error('Verification email send failed', sent.error);
      return res.status(502).json({
        ok: false,
        fallback: true,
        error: sent.error || 'E-posta gönderilemedi',
      });
    }

    return res.json({ ok: true, provider: sent.provider });
  } catch (error: any) {
    logger.error('send-verification-email failed', error);
    return res.status(500).json({
      ok: false,
      fallback: true,
      error: error?.message || 'Doğrulama e-postası gönderilemedi',
    });
  }
});

export default router;

