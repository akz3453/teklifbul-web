// Teklifbul Rule v1.0 - Structured Logging Sistemi
// console.log doğrudan kullanımı yasak
// Tüm log işlemleri logger modülü üzerinden yapılır

// Production kontrolü: Vite build sistemi varsa import.meta.env kontrolü
const isProd = (() => {
  // Vite build sistemi varsa import.meta.env kontrolü
  // Teklifbul Rule v1.0 - Type-safe import.meta.env access with type assertion
  if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
    const env = (import.meta as { env?: { PROD?: boolean } }).env;
    if (env?.PROD) {
      return true;
    }
  }
  // Hostname kontrolü: localhost, 127.0.0.1 veya debug modu aktif değilse production
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
  const debugMode = typeof localStorage !== 'undefined' && localStorage.getItem('teklifbul:debug') === 'true';
  return !isLocalhost && !debugMode;
})();

// Sentry SDK entegrasyonu (Production'da aktif)
let Sentry: any = null;
let sentryInitialized = false;
let sentryInitPromise: Promise<void> | null = null;

// Sentry initialization (async, lazy load)
async function initializeSentry() {
  if (sentryInitialized) {
    return; // Zaten initialize edilmişse
  }
  
  // Eğer initialization devam ediyorsa, promise'i bekle
  if (sentryInitPromise) {
    return sentryInitPromise;
  }
  
  // Server-side Sentry (Node.js)
  if (typeof process !== 'undefined') {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      sentryInitPromise = (async () => {
        try {
          const sentryModule = await import('@sentry/node');
          Sentry = sentryModule;
          Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || 'production',
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1, // %10 sample
            beforeSend(event: any) {
              // Teklifbul Rule v1.0 - Hassas bilgileri filtrele
              if (event.request?.headers) {
                delete event.request.headers['authorization'];
                delete event.request.headers['cookie'];
              }
              // Request body'deki hassas bilgileri filtrele
              if (event.request?.data) {
                const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
                sensitiveFields.forEach(field => {
                  if (event.request.data[field]) {
                    event.request.data[field] = '[FILTERED]';
                  }
                });
              }
              return event;
            }
          });
          sentryInitialized = true;
          console.info('✅ Sentry initialized (server-side)');
        } catch (error) {
          console.warn('⚠️  Sentry initialization failed', error);
          sentryInitPromise = null;
        }
      })();
      return sentryInitPromise;
    }
  }
  
  // Browser-side Sentry (Frontend)
  if (typeof window !== 'undefined' && isProd) {
    // Frontend Sentry entegrasyonu için hazır
    // Not: Frontend Sentry için ayrı bir init gerekebilir (@sentry/browser)
    // Şimdilik server-side Sentry kullanılıyor
  }
}

// Lazy initialization (ilk error'da çağrılır)
async function sendErrorToSentry(message: string, err?: unknown) {
  // Server-side: Sentry'yi lazy initialize et
  if (typeof process !== 'undefined' && !sentryInitialized) {
    await initializeSentry().catch(() => {
      // Silent fail
    });
  }
  
  // Sentry capture (server-side)
  if (Sentry && typeof process !== 'undefined' && sentryInitialized) {
    try {
      if (err instanceof Error) {
        Sentry.captureException(err, {
          tags: { context: message },
          extra: { message }
        });
      } else if (err) {
        Sentry.captureMessage(`${message}: ${String(err)}`, {
          level: 'error',
          extra: { error: err, message }
        });
      } else {
        Sentry.captureMessage(message, { level: 'error' });
      }
    } catch (sentryError) {
      // Sentry capture hatası kritik değil, sessizce devam et
      console.warn('Sentry capture failed', sentryError);
    }
  }
  
  // Browser-side: Frontend Sentry kullanılabilir (gelecekte eklenebilir)
  if (typeof window !== 'undefined' && isProd) {
    // Frontend Sentry entegrasyonu için hazır
    // Örnek: window.Sentry?.captureException(err, { extra: { message } });
  }
}

// Production'da sessiz log fonksiyonu (sadece error görünür)
const safeLog = (fn: (...args: any[]) => void) => {
  return (...args: unknown[]) => {
    if (!isProd) {
      fn(...args);
    }
  };
};

export const logger = {
  group: safeLog((title: string) => {
    console.groupCollapsed(`🧭 ${title}`);
  }),
  
  info: safeLog((msg: string, data?: unknown) => {
    console.info('ℹ️', msg, data ?? '');
  }),

  // Debug logları sadece development'ta görünür
  debug: safeLog((msg: string, data?: unknown) => {
    console.debug('🔧', msg, data ?? '');
  }),
  
  warn: safeLog((msg: string, data?: unknown) => {
    console.warn('⚠️', msg, data ?? '');
  }),
  
  // Error logları production'da da görünür (kritik hatalar)
  error(msg: string, err?: unknown) {
    console.error('❌', msg, err ?? '');
    
    // Production'da hata izleme servisine gönder
    if (isProd || (typeof process !== 'undefined' && process.env.SENTRY_DSN)) {
      // Async Sentry capture (non-blocking)
      sendErrorToSentry(msg, err).catch(() => {
        // Silent fail - Sentry hatası kritik değil
      });
    }
  },
  
  end: safeLog(() => {
    console.groupEnd();
  })
};

