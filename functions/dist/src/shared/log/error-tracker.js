"use strict";
/**
 * Frontend Error Tracker Service
 * Teklifbul Rule v1.0 - Hata takip sistemi
 *
 * Frontend hatalarını yakalayıp Firestore'a kaydeder
 * - window.onerror ve window.onunhandledrejection yakalama
 * - Hata tekrarını tespit etme (hash-based errorId)
 * - Rate limiting (aynı hata 1 dakikada 1 kez kaydedilir)
 * - Kullanıcı bilgilerini ekleme
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeErrorTracker = initializeErrorTracker;
exports.logError = logError;
const firebase_js_1 = require("../../../firebase.js");
const firebase_js_2 = require("../../../firebase.js");
const firebase_firestore_js_1 = require("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
const logger_js_1 = require("./logger.js");
// Rate limiting için cache (aynı hata 1 dakikada 1 kez kaydedilir)
const errorCache = new Map();
const RATE_LIMIT_MS = 60 * 1000; // 1 dakika
/**
 * Hata mesajından hash-based errorId oluştur
 */
function generateErrorId(message, stack, code, url) {
    // Hata mesajı, stack trace, kod ve URL'den hash oluştur
    const hashInput = `${message}|${stack || ''}|${code || ''}|${url || ''}`;
    // Basit hash fonksiyonu (daha iyi bir hash kütüphanesi kullanılabilir)
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
function determineSeverity(error, code) {
    const message = typeof error === 'string' ? error : error.message;
    const lowerMessage = message.toLowerCase();
    // Kritik hatalar
    if (lowerMessage.includes('network') ||
        lowerMessage.includes('fetch failed') ||
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('permission denied') ||
        code === 'auth/unauthorized' ||
        code === 'permission-denied') {
        return 'critical';
    }
    // Yüksek önemli hatalar
    if (lowerMessage.includes('firebase') ||
        lowerMessage.includes('firestore') ||
        lowerMessage.includes('auth') ||
        code?.startsWith('auth/')) {
        return 'high';
    }
    // Orta önemli hatalar
    if (lowerMessage.includes('undefined') ||
        lowerMessage.includes('null') ||
        lowerMessage.includes('cannot read')) {
        return 'medium';
    }
    // Düşük önemli hatalar (varsayılan)
    return 'low';
}
/**
 * Hata bilgilerini Firestore'a kaydet
 */
async function saveErrorToFirestore(errorData) {
    try {
        // Rate limiting kontrolü
        const cacheKey = `${errorData.errorId}_${errorData.userId || 'anonymous'}`;
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
        // Teklifbul Rule v1.0 - userId zorunlu (Firestore kurali kullanici bazli okumaya izin verir)
        const currentUid = firebase_js_2.auth.currentUser?.uid || errorData.userId;
        if (!currentUid) {
            // Anonim kullanici icin Firestore'a yazma; sessizce vazgec
            return;
        }
        // Firestore'da ayni errorId + userId'ye sahip hata var mi kontrol et
        const errorsRef = (0, firebase_firestore_js_1.collection)(firebase_js_1.db, 'error_logs');
        const q = (0, firebase_firestore_js_1.query)(errorsRef, (0, firebase_firestore_js_1.where)('errorId', '==', errorData.errorId), (0, firebase_firestore_js_1.where)('userId', '==', currentUid));
        const snapshot = await (0, firebase_firestore_js_1.getDocs)(q);
        if (!snapshot.empty) {
            // Aynı hata daha önce kaydedilmiş, count'u artır
            const existingDoc = snapshot.docs[0];
            const existingData = existingDoc.data();
            await (0, firebase_firestore_js_1.updateDoc)((0, firebase_firestore_js_1.doc)(firebase_js_1.db, 'error_logs', existingDoc.id), {
                count: (existingData.count || 1) + 1,
                lastOccurred: (0, firebase_firestore_js_1.serverTimestamp)(),
                // Eğer çözülmüşse, tekrar oluştuğu için çözülmemiş yap
                resolved: false,
                resolvedAt: null,
                resolvedBy: null
            });
            logger_js_1.logger.info('Error count updated', { errorId: errorData.errorId, count: (existingData.count || 1) + 1 });
        }
        else {
            // Yeni hata, dokuman olustur
            // Teklifbul Rule v1.0 - undefined degerleri filtrele (Firestore hatasi onleme)
            const cleanErrorData = {
                errorId: errorData.errorId,
                message: errorData.message,
                type: errorData.type,
                severity: errorData.severity,
                count: 1,
                timestamp: (0, firebase_firestore_js_1.serverTimestamp)(),
                lastOccurred: (0, firebase_firestore_js_1.serverTimestamp)(),
                resolved: false,
                aiAnalyzed: false,
                userId: currentUid
            };
            // Optional fields - sadece tanimliysa ekle
            if (errorData.stack)
                cleanErrorData.stack = errorData.stack;
            if (errorData.code)
                cleanErrorData.code = errorData.code;
            if (errorData.userEmail)
                cleanErrorData.userEmail = errorData.userEmail;
            if (errorData.url)
                cleanErrorData.url = errorData.url;
            if (errorData.userAgent)
                cleanErrorData.userAgent = errorData.userAgent;
            if (errorData.metadata)
                cleanErrorData.metadata = errorData.metadata;
            await (0, firebase_firestore_js_1.addDoc)(errorsRef, cleanErrorData);
            logger_js_1.logger.info('New error logged', { errorId: errorData.errorId });
        }
    }
    catch (saveError) {
        // Firestore kaydetme hatası kritik değil, sessizce devam et
        logger_js_1.logger.warn('Failed to save error to Firestore', saveError);
    }
}
/**
 * Frontend hatalarını yakala ve kaydet
 */
function initializeErrorTracker() {
    if (typeof window === 'undefined') {
        return; // Sadece browser ortamında çalışır
    }
    // Global JavaScript error handler (Teklifbul Rule v1.0 - async handler void-wrapped)
    window.addEventListener('error', (event) => {
        void (async () => {
            try {
                const user = firebase_js_2.auth.currentUser;
                const errorId = generateErrorId(event.message, event.error?.stack, event.error?.code, event.filename);
                const severity = determineSeverity(event.error || event.message, event.error?.code);
                await saveErrorToFirestore({
                    errorId,
                    message: event.message,
                    stack: event.error?.stack,
                    code: event.error?.code,
                    type: 'frontend',
                    severity,
                    userId: user?.uid,
                    userEmail: user?.email || undefined,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    metadata: {
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno
                    }
                });
            }
            catch (err) {
                logger_js_1.logger.warn('Error tracker failed', err);
            }
        })();
    });
    // Unhandled promise rejection handler (Teklifbul Rule v1.0 - async handler void-wrapped)
    window.addEventListener('unhandledrejection', (event) => {
        void (async () => {
            try {
                const user = firebase_js_2.auth.currentUser;
                const reason = event.reason;
                const message = reason instanceof Error ? reason.message : String(reason);
                const stack = reason instanceof Error ? reason.stack : undefined;
                const code = reason instanceof Error ? reason.code : undefined;
                const errorId = generateErrorId(message, stack, code, window.location.href);
                const severity = determineSeverity(reason instanceof Error ? reason : message, code);
                await saveErrorToFirestore({
                    errorId,
                    message: `Unhandled promise rejection: ${message}`,
                    stack,
                    code,
                    type: 'frontend',
                    severity,
                    userId: user?.uid,
                    userEmail: user?.email || undefined,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    metadata: {
                        reason: reason instanceof Error ? {
                            message: reason.message,
                            stack: reason.stack
                        } : reason
                    }
                });
            }
            catch (err) {
                logger_js_1.logger.warn('Error tracker failed (unhandled rejection)', err);
            }
        })();
    });
    logger_js_1.logger.debug('Frontend error tracker initialized');
}
/**
 * Manuel hata kaydetme (try-catch bloklarından çağrılabilir)
 */
async function logError(error, context, metadata) {
    try {
        const user = firebase_js_2.auth.currentUser;
        const message = typeof error === 'string' ? error : error.message;
        const stack = typeof error === 'string' ? undefined : error.stack;
        const code = typeof error === 'string' ? undefined : error.code;
        const errorId = generateErrorId(message, stack, code, window.location.href);
        const severity = determineSeverity(error, code);
        await saveErrorToFirestore({
            errorId,
            message: context ? `${context}: ${message}` : message,
            stack,
            code,
            type: 'frontend',
            severity,
            userId: user?.uid,
            userEmail: user?.email || undefined,
            url: window.location.href,
            userAgent: navigator.userAgent,
            metadata
        });
    }
    catch (err) {
        logger_js_1.logger.warn('Manual error logging failed', err);
    }
}
