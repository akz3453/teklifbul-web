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

import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { logger } from './logger.js';

type FirebaseAuthLike = { currentUser?: { uid?: string; email?: string } | null };
type FirebaseDbLike = Parameters<typeof collection>[0];

let cachedAuth: FirebaseAuthLike | null = null;
let cachedDb: FirebaseDbLike | null = null;

async function getFirebase() {
  if (cachedAuth && cachedDb) {
    return { auth: cachedAuth, db: cachedDb };
  }
  const mod = await import('../../../firebase.js');
  cachedAuth = mod.auth;
  cachedDb = mod.db;
  return { auth: cachedAuth, db: cachedDb };
}

// Rate limiting için cache (aynı hata 1 dakikada 1 kez kaydedilir)
const errorCache = new Map<string, number>();
const RATE_LIMIT_MS = 60 * 1000; // 1 dakika

/**
 * Hata mesajından hash-based errorId oluştur
 */
function generateErrorId(message: string, stack?: string, code?: string, url?: string): string {
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
function determineSeverity(error: Error | string, code?: string): 'low' | 'medium' | 'high' | 'critical' {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();
  
  // Kritik hatalar
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('permission denied') ||
    code === 'auth/unauthorized' ||
    code === 'permission-denied'
  ) {
    return 'critical';
  }
  
  // Yüksek önemli hatalar
  if (
    lowerMessage.includes('firebase') ||
    lowerMessage.includes('firestore') ||
    lowerMessage.includes('auth') ||
    code?.startsWith('auth/')
  ) {
    return 'high';
  }
  
  // Orta önemli hatalar
  if (
    lowerMessage.includes('undefined') ||
    lowerMessage.includes('null') ||
    lowerMessage.includes('cannot read')
  ) {
    return 'medium';
  }
  
  // Düşük önemli hatalar (varsayılan)
  return 'low';
}

/**
 * Hata bilgilerini Firestore'a kaydet
 */
async function saveErrorToFirestore(errorData: {
  errorId: string;
  message: string;
  stack?: string;
  code?: string;
  type: 'frontend';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  userEmail?: string;
  url?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}) {
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
    
    const { auth, db } = await getFirebase();

    // Teklifbul Rule v1.0 - userId zorunlu (Firestore kurali kullanici bazli okumaya izin verir)
    const currentUid = auth.currentUser?.uid || errorData.userId;
    if (!currentUid) {
      // Anonim kullanici icin Firestore'a yazma; sessizce vazgec
      return;
    }

    // Firestore'da ayni errorId + userId'ye sahip hata var mi kontrol et
    const errorsRef = collection(db, 'error_logs');
    const q = query(
      errorsRef,
      where('errorId', '==', errorData.errorId),
      where('userId', '==', currentUid)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // Aynı hata daha önce kaydedilmiş, count'u artır
      const existingDoc = snapshot.docs[0];
      const existingData = existingDoc.data();
      await updateDoc(doc(db, 'error_logs', existingDoc.id), {
        count: (existingData.count || 1) + 1,
        lastOccurred: serverTimestamp(),
        // Eğer çözülmüşse, tekrar oluştuğu için çözülmemiş yap
        resolved: false,
        resolvedAt: null,
        resolvedBy: null
      });
      logger.info('Error count updated', { errorId: errorData.errorId, count: (existingData.count || 1) + 1 });
    } else {
      // Yeni hata, dokuman olustur
      // Teklifbul Rule v1.0 - undefined degerleri filtrele (Firestore hatasi onleme)
      const cleanErrorData: Record<string, any> = {
        errorId: errorData.errorId,
        message: errorData.message,
        type: errorData.type,
        severity: errorData.severity,
        count: 1,
        timestamp: serverTimestamp(),
        lastOccurred: serverTimestamp(),
        resolved: false,
        aiAnalyzed: false,
        userId: currentUid
      };

      // Optional fields - sadece tanimliysa ekle
      if (errorData.stack) cleanErrorData.stack = errorData.stack;
      if (errorData.code) cleanErrorData.code = errorData.code;
      if (errorData.userEmail) cleanErrorData.userEmail = errorData.userEmail;
      if (errorData.url) cleanErrorData.url = errorData.url;
      if (errorData.userAgent) cleanErrorData.userAgent = errorData.userAgent;
      if (errorData.metadata) cleanErrorData.metadata = errorData.metadata;

      await addDoc(errorsRef, cleanErrorData);
      logger.info('New error logged', { errorId: errorData.errorId });
    }
  } catch (saveError) {
    // Firestore kaydetme hatası kritik değil, sessizce devam et
    logger.warn('Failed to save error to Firestore', saveError);
  }
}

/**
 * Frontend hatalarını yakala ve kaydet
 */
export function initializeErrorTracker() {
  if (typeof window === 'undefined') {
    return; // Sadece browser ortamında çalışır
  }
  
  // Global JavaScript error handler (Teklifbul Rule v1.0 - async handler void-wrapped)
  window.addEventListener('error', (event) => {
    void (async () => {
      try {
        const { auth } = await getFirebase();
        const user = auth.currentUser;
        const errorId = generateErrorId(
          event.message,
          event.error?.stack,
          event.error?.code,
          event.filename
        );

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
      } catch (err) {
        logger.warn('Error tracker failed', err);
      }
    })();
  });
  
  // Unhandled promise rejection handler (Teklifbul Rule v1.0 - async handler void-wrapped)
  window.addEventListener('unhandledrejection', (event) => {
    void (async () => {
      try {
        const { auth } = await getFirebase();
        const user = auth.currentUser;
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;
        const code = reason instanceof Error ? (reason as any).code : undefined;

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
      } catch (err) {
        logger.warn('Error tracker failed (unhandled rejection)', err);
      }
    })();
  });
  
  logger.debug('Frontend error tracker initialized');
}

/**
 * Manuel hata kaydetme (try-catch bloklarından çağrılabilir)
 */
export async function logError(
  error: Error | string,
  context?: string,
  metadata?: Record<string, any>
) {
  try {
    const { auth } = await getFirebase();
    const user = auth.currentUser;
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;
    const code = typeof error === 'string' ? undefined : (error as any).code;
    
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
  } catch (err) {
    logger.warn('Manual error logging failed', err);
  }
}

