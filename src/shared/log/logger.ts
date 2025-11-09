// Teklifbul Rule v1.0 - Structured Logging Sistemi
// console.log doğrudan kullanımı yasak
// Tüm log işlemleri logger modülü üzerinden yapılır

// Production kontrolü: Vite build sistemi varsa import.meta.env kontrolü
const isProd = (() => {
  // Vite build sistemi varsa import.meta.env kontrolü
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return true;
  }
  // Hostname kontrolü: localhost, 127.0.0.1 veya debug modu aktif değilse production
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
  const debugMode = typeof localStorage !== 'undefined' && localStorage.getItem('teklifbul:debug') === 'true';
  return !isLocalhost && !debugMode;
})();

// Teklifbul Rule v1.0 - Opsiyonel Sentry köprüsü
// TODO: Sentry SDK entegre ise burada çağır
function sendErrorToSentry(_message: string, _err?: unknown) {
  // Sentry DSN .env'den alınabilir: import.meta.env.VITE_SENTRY_DSN
  if (isProd && typeof window !== 'undefined') {
    // Sentry SDK entegrasyonu için hazır
    // Örnek: Sentry.captureException(err, { extra: { message } });
    // Şimdilik console'a yazıyoruz (production'da görünmez)
  }
}

// Production'da sessiz log fonksiyonu (sadece error görünür)
const safeLog = (fn: (...args: unknown[]) => void) => {
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
  
  warn: safeLog((msg: string, data?: unknown) => {
    console.warn('⚠️', msg, data ?? '');
  }),
  
  // Error logları production'da da görünür (kritik hatalar)
  error(msg: string, err?: unknown) {
    console.error('❌', msg, err ?? '');
    
    // Production'da hata izleme servisine gönder
    if (isProd) {
      sendErrorToSentry(msg, err);
    }
  },
  
  end: safeLog(() => {
    console.groupEnd();
  })
};

