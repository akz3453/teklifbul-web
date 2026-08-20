// Teklifbul Rule v1.0 - Structured Logging Sistemi
// console.log doğrudan kullanımı yasak
// Tüm log işlemleri logger modülü üzerinden yapılır

import { scrubSentryEvent } from './sentry-scrub.js';

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

function getBrowserSentryDsn(): string {
  try {
    if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
      const env = (import.meta as { env?: { VITE_SENTRY_DSN?: string } }).env;
      if (env?.VITE_SENTRY_DSN) return String(env.VITE_SENTRY_DSN);
    }
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    const fromWindow = (window as { VITE_SENTRY_DSN?: string }).VITE_SENTRY_DSN;
    if (fromWindow) return String(fromWindow);
  }
  return '';
}

// Sentry initialization (async, lazy load)
async function initializeSentry() {
  if (sentryInitialized) {
    return;
  }

  if (sentryInitPromise) {
    return sentryInitPromise;
  }

  // Server-side Sentry (Node.js)
  if (typeof process !== 'undefined' && process.env?.SENTRY_DSN) {
    if (process.env.NODE_ENV === 'production') {
      sentryInitPromise = (async () => {
        try {
          const sentryModule = await import('@sentry/node');
          Sentry = sentryModule;
          Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || 'production',
            sendDefaultPii: false,
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
            beforeSend(event: any) {
              return scrubSentryEvent(event);
            }
          });
          sentryInitialized = true;
        } catch (error) {
          console.warn('⚠️  Sentry initialization failed', error);
          sentryInitPromise = null;
        }
      })();
      return sentryInitPromise;
    }
  }

  // Teklifbul Rule v1.0 — Browser Sentry (VITE_SENTRY_DSN varsa)
  if (typeof window !== 'undefined' && isProd) {
    const dsn = getBrowserSentryDsn();
    if (!dsn) return;
    sentryInitPromise = (async () => {
      try {
        const sentryModule = await import('@sentry/browser');
        Sentry = sentryModule;
        Sentry.init({
          dsn,
          environment: 'production',
          sendDefaultPii: false,
          tracesSampleRate: 0.1,
          beforeSend(event: any) {
            return scrubSentryEvent(event);
          }
        });
        sentryInitialized = true;
      } catch (error) {
        console.warn('⚠️  Browser Sentry initialization failed', error);
        sentryInitPromise = null;
      }
    })();
    return sentryInitPromise;
  }
}

async function sendErrorToSentry(message: string, err?: unknown) {
  if (!sentryInitialized) {
    await initializeSentry().catch(() => {});
  }

  if (Sentry && sentryInitialized) {
    try {
      if (err instanceof Error) {
        Sentry.captureException(err, {
          tags: { context: message },
          extra: scrubSentryEvent({ extra: { message } })?.extra,
        });
      } else if (err) {
        Sentry.captureMessage(`${message}: ${String(err)}`, {
          level: 'error',
          extra: scrubSentryEvent({ extra: { message } })?.extra,
        });
      } else {
        Sentry.captureMessage(message, { level: 'error' });
      }
    } catch (sentryError) {
      console.warn('Sentry capture failed', sentryError);
    }
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

let browserErrorGuardsBound = false;

function bindBrowserErrorGuards() {
  if (typeof window === 'undefined' || browserErrorGuardsBound) return;
  browserErrorGuardsBound = true;
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection', event.reason);
  });
  window.addEventListener('error', (event) => {
    logger.error('Window error', event.error || event.message);
  });
}

export function initErrorTracking() {
  bindBrowserErrorGuards();
  return initializeSentry();
}

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

