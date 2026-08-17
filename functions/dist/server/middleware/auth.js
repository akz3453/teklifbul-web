/**
 * Authentication Middleware
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * Firebase Admin SDK ile token verification
 */
import admin from 'firebase-admin';
import { logger } from '../../src/shared/log/logger.js';
import { serverLogger } from '../utils/logger.js';
import { isAdminUser } from '../auth/admin-check.js';
export { requireAdmin } from './requireAdmin.js';
// Firebase Admin initialize (eğer yoksa)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: 'teklifbul'
        });
    }
    catch (err) {
        logger.warn('Firebase Admin initialization failed, using fallback', err);
    }
}
/**
 * Teklifbul Rule v1.0 - verifyToken sonrasi req.user her zaman doludur.
 * Bu helper, TS18048 hatalarini onlemek icin guvenli erisim saglar.
 *
 * @throws AuthAssertionError - middleware bypass edilirse
 */
export function requireUser(req) {
    if (!req.user) {
        // verifyToken middleware'i her zaman calismis olmali; bu durum sadece
        // misconfig (unutulmus middleware) durumunda olusur.
        throw new AuthAssertionError('Authenticated user required but req.user is undefined');
    }
    return req.user;
}
/** Teklifbul Rule v1.0 - middleware misconfig'i tespit etmek icin tipli hata */
export class AuthAssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthAssertionError';
    }
}
/**
 * Token verify middleware
 * Authorization header'dan token alır ve verify eder
 */
export async function verifyToken(req, res, next) {
    try {
        // Authorization header kontrolü
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Authorization header eksik veya geçersiz',
                message: 'Bearer token gereklidir'
            });
            return;
        }
        // Token'ı al
        const token = authHeader.split('Bearer ')[1];
        if (!token) {
            res.status(401).json({
                error: 'Token eksik',
                message: 'Bearer token gereklidir'
            });
            return;
        }
        // Firebase Admin ile token verify et
        const decodedToken = await admin.auth().verifyIdToken(token);
        const baseUser = {
            uid: decodedToken.uid,
            email: decodedToken.email ?? null,
            displayName: decodedToken.name ?? null,
            emailVerified: decodedToken.email_verified || false,
            role: decodedToken.role ?? null,
            isAdmin: decodedToken.isAdmin ?? false,
            isPremium: decodedToken.isPremium ?? false,
            plan: decodedToken.plan ?? null,
            customClaims: decodedToken
        };
        let mergedUser = baseUser;
        try {
            const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data() || {};
                mergedUser = {
                    ...baseUser,
                    companyName: data.companyName ?? undefined,
                    activeCompanyId: data.activeCompanyId ?? undefined,
                    roles: Array.isArray(data.roles) ? data.roles : undefined
                };
            }
        }
        catch (firestoreError) {
            logger.warn('Auth middleware Firestore user fetch error', firestoreError);
        }
        // Request'e user bilgilerini ekle
        req.user = mergedUser;
        // Sonraki middleware'e geç
        next();
    }
    catch (error) {
        // Teklifbul Rule v1.0 - Security: 401 hatalarını logla
        const reason = error.code === 'auth/id-token-expired'
            ? 'Token expired'
            : error.code === 'auth/argument-error'
                ? 'Invalid token format'
                : error.message || 'Token verification failed';
        serverLogger.security.authFailure(req, reason);
        // Teklifbul Rule v1.0 - Production Hardening: Sensitive bilgi sızıntısını önle
        const isProduction = process.env.NODE_ENV === 'production';
        // Hata tipine göre mesaj döndür
        if (error.code === 'auth/id-token-expired') {
            // Token expire hatası - client-side'da otomatik refresh yapılmalı
            res.status(401).json({
                error: 'TOKEN_EXPIRED',
                message: 'Token süresi dolmuş. Lütfen sayfayı yenileyin veya tekrar giriş yapın.'
            });
        }
        else if (error.code === 'auth/argument-error') {
            res.status(401).json({
                error: 'INVALID_TOKEN',
                message: 'Geçersiz token formatı'
            });
        }
        else {
            // Production'da generic mesaj, development'da detaylı
            res.status(401).json({
                error: 'AUTH_ERROR',
                message: isProduction
                    ? 'Kimlik doğrulama başarısız'
                    : (error.message || 'Token doğrulanamadı')
            });
        }
    }
}
/**
 * Teklifbul Rule v1.0 - Admin kimlik tespiti: Merkezi helper fonksiyon
 * Kullanıcının admin/ops olup olmadığını kontrol eder
 */
export async function isAdmin(user) {
    return isAdminUser(user);
}
/**
 * Opsiyonel token verify (hata durumunda 401 döndürmez, sadece req.user'ı set eder)
 * Public endpoint'lerde kullanıcı bilgisi varsa kullan, yoksa devam et
 */
export async function optionalVerifyToken(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // Token yok, devam et (public endpoint)
            next();
            return;
        }
        const token = authHeader.split('Bearer ')[1];
        if (!token) {
            next();
            return;
        }
        const decodedToken = await admin.auth().verifyIdToken(token);
        const baseUser = {
            uid: decodedToken.uid,
            email: decodedToken.email ?? null,
            displayName: decodedToken.name ?? null,
            emailVerified: decodedToken.email_verified || false,
            role: decodedToken.role ?? null,
            isAdmin: decodedToken.isAdmin ?? false,
            isPremium: decodedToken.isPremium ?? false,
            plan: decodedToken.plan ?? null,
            customClaims: decodedToken
        };
        let mergedUser = baseUser;
        try {
            const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data() || {};
                mergedUser = {
                    ...baseUser,
                    companyName: data.companyName ?? undefined,
                    activeCompanyId: data.activeCompanyId ?? undefined,
                    roles: Array.isArray(data.roles) ? data.roles : undefined
                };
            }
        }
        catch (firestoreError) {
            logger.warn('Auth middleware Firestore user fetch error (optional)', firestoreError);
        }
        req.user = mergedUser;
        next();
    }
    catch (error) {
        // Token geçersiz ama hata döndürme, sadece devam et
        logger.warn('Optional token verification failed, continuing without auth', error);
        next();
    }
}
