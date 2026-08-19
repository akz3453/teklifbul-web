/**
 * Backend Error Tracker Service
 * Teklifbul Rule v1.0 - Hata takip sistemi
 *
 * Backend hatalarını yakalayıp Firestore'a kaydeder
 * - Express error handler entegrasyonu
 * - Request bilgilerini ekleme (path, method, IP)
 * - Hata tekrarını tespit etme
 */
import { getAdminDb } from './firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
// Rate limiting için cache (aynı hata 1 dakikada 1 kez kaydedilir)
const errorCache = new Map();
const RATE_LIMIT_MS = 60 * 1000; // 1 dakika
/**
 * Hata mesajından hash-based errorId oluştur
 */
function generateErrorId(message, stack, code, path, method) {
    // Hata mesajı, stack trace, kod, path ve method'dan hash oluştur
    const hashInput = `${message}|${stack || ''}|${code || ''}|${path || ''}|${method || ''}`;
    // Basit hash fonksiyonu
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
        const char = hashInput.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `error_${Math.abs(hash).toString(36)}`;
}
/**
 * Önem seviyesini belirle
 */
function determineSeverity(error, code, statusCode) {
    const message = typeof error === 'string' ? error : error.message;
    const lowerMessage = message.toLowerCase();
    // Kritik hatalar
    if (statusCode === 500 ||
        lowerMessage.includes('database') ||
        lowerMessage.includes('firestore') ||
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('permission denied') ||
        code === 'auth/unauthorized' ||
        code === 'permission-denied') {
        return 'critical';
    }
    // Yüksek önemli hatalar
    if (statusCode === 400 ||
        statusCode === 401 ||
        statusCode === 403 ||
        lowerMessage.includes('firebase') ||
        lowerMessage.includes('auth') ||
        code?.startsWith('auth/')) {
        return 'high';
    }
    // Orta önemli hatalar
    if (statusCode === 404 ||
        statusCode === 422 ||
        lowerMessage.includes('validation') ||
        lowerMessage.includes('invalid')) {
        return 'medium';
    }
    // Düşük önemli hatalar (varsayılan)
    return 'low';
}
/**
 * Hata bilgilerini Firestore'a kaydet
 */
export async function saveErrorToFirestore(errorData) {
    try {
        const db = await getAdminDb();
        if (!db) {
            logger.warn('Firestore unavailable, cannot save error');
            return;
        }
        // Rate limiting kontrolü
        const cacheKey = `${errorData.errorId}_${errorData.userId || 'anonymous'}_${errorData.ip || ''}`;
        const lastLogged = errorCache.get(cacheKey);
        const now = Date.now();
        if (lastLogged && (now - lastLogged) < RATE_LIMIT_MS) {
            // Aynı hata çok yakın zamanda kaydedilmiş, atla
            return;
        }
        // Cache'i güncelle
        errorCache.set(cacheKey, now);
        // Eski cache girdilerini temizle (1 saat sonra)
        setTimeout(() => {
            errorCache.delete(cacheKey);
        }, 60 * 60 * 1000);
        // Firestore'da aynı errorId'ye sahip hata var mı kontrol et
        const errorsRef = db.collection('error_logs');
        const q = errorsRef.where('errorId', '==', errorData.errorId);
        const snapshot = await q.get();
        if (!snapshot.empty) {
            // Aynı hata daha önce kaydedilmiş, count'u artır
            const existingDoc = snapshot.docs[0];
            await existingDoc.ref.update({
                count: FieldValue.increment(1),
                lastOccurred: FieldValue.serverTimestamp(),
                // Eğer çözülmüşse, tekrar oluştuğu için çözülmemiş yap
                resolved: false,
                resolvedAt: null,
                resolvedBy: null
            });
            logger.info('Error count updated', { errorId: errorData.errorId });
        }
        else {
            // Yeni hata, doküman oluştur
            await errorsRef.add({
                ...errorData,
                count: 1,
                timestamp: FieldValue.serverTimestamp(),
                lastOccurred: FieldValue.serverTimestamp(),
                resolved: false,
                aiAnalyzed: false
            });
            logger.info('New error logged', { errorId: errorData.errorId });
        }
    }
    catch (saveError) {
        // Firestore kaydetme hatası kritik değil, sessizce devam et
        logger.warn('Failed to save error to Firestore', saveError);
    }
}
/**
 * Express error handler'dan çağrılacak fonksiyon
 */
export async function trackBackendError(error, req, statusCode) {
    try {
        const message = typeof error === 'string' ? error : error.message;
        const stack = typeof error === 'string' ? undefined : error.stack;
        const code = typeof error === 'string' ? undefined : error.code;
        const errorId = generateErrorId(message, stack, code, req.path, req.method);
        const severity = determineSeverity(error, code, statusCode);
        await saveErrorToFirestore({
            errorId,
            message,
            stack,
            code,
            type: 'backend',
            severity,
            userId: req.user?.uid,
            userEmail: req.user?.email,
            path: req.path,
            method: req.method,
            ip: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
            userAgent: req.get('user-agent'),
            statusCode,
            metadata: {
                query: req.query,
                body: req.body ? Object.keys(req.body).length > 0 : undefined,
                headers: {
                    'content-type': req.get('content-type'),
                    'accept': req.get('accept')
                }
            }
        });
    }
    catch (err) {
        logger.warn('Error tracker failed', err);
    }
}
