// Teklifbul Rule v1.0 - Structured Logging Sistemi
// console.log doğrudan kullanımı yasak
// Tüm log işlemleri logger modülü üzerinden yapılır
// Production kontrolü: Vite build sistemi varsa import.meta.env kontrolü
const isProd = (() => {
    // Vite build sistemi varsa import.meta.env kontrolü
    // Teklifbul Rule v1.0 - Type-safe import.meta.env access with type assertion
    if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
        const env = import.meta.env;
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
let Sentry = null;
let sentryInitialized = false;
let sentryInitPromise = null;
function getBrowserSentryDsn() {
    try {
        if (typeof import.meta !== 'undefined' && 'env' in import.meta) {
            const env = import.meta.env;
            if (env?.VITE_SENTRY_DSN)
                return String(env.VITE_SENTRY_DSN);
        }
    }
    catch {
        // ignore
    }
    if (typeof window !== 'undefined') {
        const fromWindow = window.VITE_SENTRY_DSN;
        if (fromWindow)
            return String(fromWindow);
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
                        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
                        beforeSend(event) {
                            if (event.request?.headers) {
                                delete event.request.headers['authorization'];
                                delete event.request.headers['cookie'];
                            }
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
                }
                catch (error) {
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
        if (!dsn)
            return;
        sentryInitPromise = (async () => {
            try {
                const sentryModule = await import('@sentry/browser');
                Sentry = sentryModule;
                Sentry.init({
                    dsn,
                    environment: 'production',
                    tracesSampleRate: 0.1,
                    beforeSend(event) {
                        if (event.request?.headers) {
                            delete event.request.headers['authorization'];
                            delete event.request.headers['cookie'];
                        }
                        return event;
                    }
                });
                sentryInitialized = true;
            }
            catch (error) {
                console.warn('⚠️  Browser Sentry initialization failed', error);
                sentryInitPromise = null;
            }
        })();
        return sentryInitPromise;
    }
}
async function sendErrorToSentry(message, err) {
    if (!sentryInitialized) {
        await initializeSentry().catch(() => { });
    }
    if (Sentry && sentryInitialized) {
        try {
            if (err instanceof Error) {
                Sentry.captureException(err, {
                    tags: { context: message },
                    extra: { message }
                });
            }
            else if (err) {
                Sentry.captureMessage(`${message}: ${String(err)}`, {
                    level: 'error',
                    extra: { error: err, message }
                });
            }
            else {
                Sentry.captureMessage(message, { level: 'error' });
            }
        }
        catch (sentryError) {
            console.warn('Sentry capture failed', sentryError);
        }
    }
}
// Production'da sessiz log fonksiyonu (sadece error görünür)
const safeLog = (fn) => {
    return (...args) => {
        if (!isProd) {
            fn(...args);
        }
    };
};
export const logger = {
    group: safeLog((title) => {
        console.groupCollapsed(`🧭 ${title}`);
    }),
    info: safeLog((msg, data) => {
        console.info('ℹ️', msg, data ?? '');
    }),
    // Debug logları sadece development'ta görünür
    debug: safeLog((msg, data) => {
        console.debug('🔧', msg, data ?? '');
    }),
    warn: safeLog((msg, data) => {
        console.warn('⚠️', msg, data ?? '');
    }),
    // Error logları production'da da görünür (kritik hatalar)
    error(msg, err) {
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
