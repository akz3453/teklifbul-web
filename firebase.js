// firebase.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger, initErrorTracking } from './src/shared/log/logger.js';
import { MESSAGES } from './src/shared/constants/messages.js';
import { isNativePlatform } from './assets/js/utils/is-native-platform.js';

initErrorTracking();

// Teklifbul Rule v1.0 — authDomain, uygulama origin'i ile AYNI olmalı.
// Farklı domain (firebaseapp.com vs web.app) Android WebView'da
// third-party storage yüzünden getRedirectResult → null bırakır.
const getAuthDomain = () => {
  if (typeof window === 'undefined') return 'teklifbul.web.app';
  const host = String(window.location.hostname || '').toLowerCase();

  // Teklifbul Rule v1.0 — Canlı marka domainleri (same-origin OAuth)
  if (host === 'nefisoft.com' || host === 'www.nefisoft.com') {
    return host;
  }
  if (host === 'nefisoft.com.tr' || host === 'www.nefisoft.com.tr') {
    return host;
  }

  // Native / Firebase Hosting
  if (host === 'teklifbul.web.app' || host === 'www.teklifbul.web.app') {
    return 'teklifbul.web.app';
  }
  if (host === 'teklifbul.firebaseapp.com') {
    return 'teklifbul.firebaseapp.com';
  }

  // localhost / bilinmeyen: production hosting
  return 'teklifbul.web.app';
};

function logBoot(level, msg, extra) {
  try {
    if (level === 'error') logger.error(msg, extra);
    else if (level === 'warn') logger.warn(msg, extra);
    else logger.debug(msg, extra);
  } catch {
    // shared-core döngüsünde logger TDZ olursa login'i düşürme
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: getAuthDomain(),
  projectId: "teklifbul",
  storageBucket: "teklifbul.firebasestorage.app",
  messagingSenderId: "636669818119", // FCM için gerekli
  appId: "1:636669818119:web:9085962e660831c36941a2"
};


// Teklifbul Rule v1.0 - Firebase duplicate app hatası önleme
// FCM için messagingSenderId zorunlu - her zaman doğru config ile app kullan
// Global app cache - modül birden fazla kez yüklenirse aynı app'i kullan
let app;

// Önce global cache'i kontrol et
// Teklifbul Rule v1.0 - window undefined kontrolü (SSR veya Node.js ortamında)
if (typeof window !== 'undefined' && window.__TEKLIFBUL_FIREBASE_APP) {
  app = window.__TEKLIFBUL_FIREBASE_APP;
  // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
} else {
  // Önce getApps() ile tüm app'leri kontrol et (daha güvenli)
  const apps = getApps();

  if (apps.length > 0) {
    // DEFAULT app'i bul veya ilk app'i kullan
    const defaultApp = apps.find(a => a.name === '[DEFAULT]') || apps[0];

    // Config kontrolü: messagingSenderId FCM için gerekli
    const existingConfig = defaultApp.options || {};
    const hasCorrectMessagingSenderId = existingConfig.messagingSenderId === firebaseConfig.messagingSenderId;

    if (hasCorrectMessagingSenderId) {
      // Mevcut app doğru config'e sahip, kullan
      app = defaultApp;
      // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
    } else {
      // Mevcut app'de messagingSenderId yok veya uyumsuz
      // DEFAULT app varsa onu kullan (FCM çalışmayabilir ama uygulama çalışır)
      if (defaultApp.name === '[DEFAULT]') {
        app = defaultApp;
        logger.warn("Mevcut DEFAULT app'de messagingSenderId eksik/uyumsuz, kullanılıyor (FCM çalışmayabilir!)", {
          mevcutMessagingSenderId: existingConfig.messagingSenderId || "YOK",
          gerekliMessagingSenderId: firebaseConfig.messagingSenderId
        });
      } else {
        // Farklı isimli app varsa, yeni DEFAULT app oluşturmayı dene
        try {
          app = initializeApp(firebaseConfig);
          // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
        } catch (dupError) {
          // Duplicate hatası alırsak, mevcut app'i kullan
          logger.error("Firebase app duplicate hatası, mevcut app kullanılıyor (FCM çalışmayabilir!)", dupError);
          app = defaultApp;
        }
      }
    }
  } else {
    // Hiç app yok, yeni oluştur
    try {
      app = initializeApp(firebaseConfig);
      // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
    } catch (initError) {
      // initializeApp hata verirse, tekrar getApps() kontrol et (race condition olabilir)
      const appsAfterError = getApps();
      if (appsAfterError.length > 0) {
        app = appsAfterError[0];
        logger.warn("Duplicate app hatası (race condition), mevcut app kullanılıyor", { appName: app.name });
      } else {
        logger.error("Firebase app initialize edilemedi", initError);
        throw initError;
      }
    }
  }

  // App'i global cache'e kaydet (sadece browser ortamında)
  if (typeof window !== 'undefined') {
    window.__TEKLIFBUL_FIREBASE_APP = app;
  }
}

// App Check (compat-modular karışık; sadece browser'da)
// Teklifbul Rule v1.0 - Production'da App Check açık. Yalnızca VITE_APP_CHECK_ENFORCE=0 acil skip (dev/acil).
const isBrowser = typeof window !== 'undefined';
const isLocalDevHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const isDevMode = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'development';

function isAppCheckEmergencyDisabled() {
  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_CHECK_ENFORCE) ||
    (typeof window !== 'undefined' && window.VITE_APP_CHECK_ENFORCE) ||
    '';
  return String(raw).trim() === '0';
}

let appCheckInstance = null;

function startAppCheckIfEligible() {
  try {
    const isProduction = !isLocalDevHost && !isDevMode;
    if (!isProduction) {
      logBoot('debug', 'Development environment: AppCheck optional');
      return;
    }
    if (isAppCheckEmergencyDisabled()) {
      logBoot('warn', 'AppCheck skipped: VITE_APP_CHECK_ENFORCE=0');
      return;
    }
    const siteKey =
      (typeof import.meta !== 'undefined' &&
        import.meta.env &&
        import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) ||
      (typeof window !== 'undefined' && window.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) ||
      null;
    if (!siteKey) {
      logBoot('warn', 'AppCheck skipped: VITE_RECAPTCHA_ENTERPRISE_SITE_KEY missing');
      return;
    }
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    logBoot('debug', 'AppCheck enabled for production');
  } catch (err) {
    logBoot('warn', 'AppCheck skipped after init failure', err);
  }
}

export async function getAppCheckToken() {
  if (!appCheckInstance) return null;
  try {
    const result = await getToken(appCheckInstance, false);
    return result?.token || null;
  } catch (error) {
    logBoot('warn', 'AppCheck token alınamadı', error);
    return null;
  }
}

if (isBrowser) {
  startAppCheckIfEligible();
}


export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);

// Teklifbul Rule v1.0 - Auth hydration: persistenceReady, redirectReady, authStateReady
// persistenceReady: setPersistence tamamlandığında resolve edilir
// Teklifbul Rule v1.0 - Local persistence: Tüm sekmelerde aynı oturum (middle click desteği için)
const persistenceReady = (async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    logger.debug("Auth persistence ready (local-based - all tabs share session)");
  } catch (e) {
    logger.warn("Firebase persistence error (using default)", e.message);
    // Continue without persistence - auth will still work with session storage
  }
})();

// redirectReady: getRedirectResult tamamlandığında resolve edilir (sadece browser'da)
// Teklifbul Rule v1.0 — Sonucu bir kez sakla; checkGoogleRedirect tekrar consume edemesin
let _redirectAuthUser = null;
const redirectReady = (typeof window !== 'undefined') ? (async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      _redirectAuthUser = result.user;
      logger.info('Auth redirect result recovered', { email: result.user.email });
    } else {
      logger.debug('Auth redirect ready (no pending result)');
    }
  } catch (e) {
    // Redirect result hatası beklenen bir durum olabilir (redirect yoksa)
    if (e.code !== 'auth/operation-not-allowed') {
      logger.warn('getRedirectResult error (non-critical)', e);
    }
  }
})() : Promise.resolve();

// authStateReady: onAuthStateChanged ilk state'i çözdüğünde resolve edilir (timeout'suz, guard'lı)
let _authStateReadyResolved = false;
const authStateReady = new Promise((resolve) => {
  // Guard: Eğer zaten resolve edildiyse tekrar resolve etme
  if (_authStateReadyResolved) {
    resolve(auth.currentUser || null);
    return;
  }

  // onAuthStateChanged ile ilk state'i bekle (timeout'suz)
  const unsub = onAuthStateChanged(auth, (user) => {
    if (!_authStateReadyResolved) {
      _authStateReadyResolved = true;
      unsub();
      resolve(user || null);
    }
  });
});

// Export promises for requireAuth
export { persistenceReady, redirectReady, authStateReady };

// Teklifbul Rule v1.0 - Initialize error tracker after Firebase is ready
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, () => {
    import('./src/shared/log/error-tracker.js')
      .then((mod) => mod.initializeErrorTracker())
      .catch((err) => {
        logBoot('warn', 'Error tracker başlatılamadı', err);
      });
  });
}

// Enable Firestore logging for debugging
// Uncomment the following line to enable detailed Firestore logging
// import { enableLogging } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// enableLogging(true);

// Teklifbul Rule v1.0 - Token refresh yönetimi
// Firebase Auth token'ları otomatik olarak yeniler, bu fonksiyonlar sadece yönetim için
let tokenRefreshInterval = null;

// Teklifbul Rule v1.0 - Tüm sekmeler kapandığında otomatik logout
const TAB_HEARTBEAT_KEY = 'teklifbul_tab_heartbeats';
const TAB_HEARTBEAT_INTERVAL = 5000;
const TAB_STALE_MS = 30000;
const NAV_TS_KEY = 'teklifbul_nav_ts'; // Navigasyon timestamp key
const tabId = (() => {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();

function readHeartbeats() {
  try {
    const raw = localStorage.getItem(TAB_HEARTBEAT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    logger.warn('Tab heartbeat read failed', e);
    return {};
  }
}

function writeHeartbeats(hb) {
  try {
    localStorage.setItem(TAB_HEARTBEAT_KEY, JSON.stringify(hb));
  } catch (e) {
    logger.warn('Tab heartbeat write failed', e);
  }
}

function pruneHeartbeats(hb) {
  const now = Date.now();
  const fresh = {};
  for (const [id, ts] of Object.entries(hb)) {
    if (typeof ts === 'number' && now - ts < TAB_STALE_MS) {
      fresh[id] = ts;
    }
  }
  return fresh;
}

function markTabAlive() {
  const hb = pruneHeartbeats(readHeartbeats());
  hb[tabId] = Date.now();
  writeHeartbeats(hb);
}

async function logoutIfNoActiveTabs() {
  // Teklifbul Rule v1.0 - Navigasyon kaynaklı false-positive'leri önle
  const navTs = Number(sessionStorage.getItem(NAV_TS_KEY) || 0);
  if (Date.now() - navTs < 5000) {
    logger.debug('Tab Tracker: Son 5 saniyede navigasyon var, logout atlanıyor');
    return;
  }

  // Teklifbul Rule v1.0 - Sayfa yeni yüklendiyse bekle (middle-click multi-tab race condition fix)
  const pageAge = performance.now();
  if (pageAge < 5000) {
    logger.debug('Tab Tracker: Sayfa henüz yeni yüklendi, logout atlanıyor', { pageAge });
    return;
  }

  const hb = pruneHeartbeats(readHeartbeats());
  if (Object.keys(hb).length === 0 && auth.currentUser) {
    logger.group('Tab Tracker');
    logger.info('All tabs closed, signing out user');
    try {
      await signOut(auth);
    } catch (e) {
      logger.error('Tab tracker signOut failed', e);
    } finally {
      logger.end();
    }
  }
}

function setupTabTracker() {
  if (typeof window === 'undefined') return;
  if (window.__teklifbulTabTrackerInitialized) return;

  // Teklifbul Rule v1.0 — Capacitor WebView'da tek "sekme" vardır; arka plana alınca
  // heartbeat kesilir ve yanlışlıkla signOut + çökme/oturum kaybı oluşabilir.
  if (isNativePlatform()) {
    logger.debug('Tab Tracker: native platformda devre dışı');
    return;
  }

  window.__teklifbulTabTrackerInitialized = true;

  // Teklifbul Rule v1.0 - Navigasyon timestamp'ini temizle (sayfa açıkken navigasyon yok)
  try {
    sessionStorage.removeItem(NAV_TS_KEY);
  } catch (_) {
    /* ignore */
  }

  markTabAlive();
  const intervalId = setInterval(markTabAlive, TAB_HEARTBEAT_INTERVAL);

  window.addEventListener('beforeunload', () => {
    try {
      // Teklifbul Rule v1.0 - Navigasyon timestamp'ini kaydet (navigasyon olduğunu işaretle)
      sessionStorage.setItem(NAV_TS_KEY, Date.now().toString());

      // Sadece heartbeat kaydını temizle, logoutIfNoActiveTabs çağırma (navigasyonda signOut yapılmayacak)
      const hb = readHeartbeats();
      delete hb[tabId];
      writeHeartbeats(hb);
    } catch (_) {
      /* ignore */
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === TAB_HEARTBEAT_KEY) {
      logoutIfNoActiveTabs();
    }
  });

  // Teklifbul Rule v1.0 - İlk çalıştırmada eski kayıtları temizle ve kontrol et
  // Teklifbul Rule v1.0 - Çoklu sekme açılışında race condition önleme
  // 3 saniye bekle ki tüm yeni sekmeler heartbeat kaydı yapabilsin
  markTabAlive();
  setTimeout(logoutIfNoActiveTabs, 3000);

  // Temizlik: sayfa görünürlüğü değiştiğinde kalp atışını güncelle
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      markTabAlive();
    }
  });

  // Interval sonlandırma için hook (testlerde)
  window.__teklifbulTabTrackerStop = () => clearInterval(intervalId);
}

function startTokenRefresh(user) {
  // Eğer zaten bir interval varsa, önce temizle
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
  }

  // Firebase Auth token'ları otomatik yeniler, burada sadece log yapıyoruz
  // Token'ı periyodik olarak yenilemek için (her 50 dakikada bir)
  tokenRefreshInterval = setInterval(async () => {
    try {
      if (auth.currentUser) {
        // Token'ı zorla yenile (force refresh)
        await auth.currentUser.getIdToken(true);
        // Teklifbul Rule v1.0 - Gereksiz log kaldırıldı
      } else {
        // Kullanıcı yok, interval'i durdur
        stopTokenRefresh();
      }
    } catch (error) {
      logger.warn("Token refresh hatası", error);
      stopTokenRefresh();
    }
  }, 50 * 60 * 1000); // 50 dakika (Firebase token'ları genellikle 1 saat geçerli)
}

function stopTokenRefresh() {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
}

// Teklifbul Rule v1.0 - AUTH STATE LOGGING: auth state değişikliklerini logla
// (persistenceReady ve redirectReady zaten yukarıda başlatıldı)
onAuthStateChanged(auth, (user) => {
  // Auth state değişikliklerini logla (sadece önemli durumlarda - yönlendirme yapma - auth-guard.js halleder)
  // Teklifbul Rule v1.0 - Log seviyesini azalt: Sadece ilk yüklemede veya önemli değişikliklerde log
  const isFirstLoad = !window.__authStateLogged;
  if (isFirstLoad) {
    window.__authStateLogged = true;
    if (!user) {
      logger.info("ℹ️ Firebase auth: Oturum yok", {
        path: location.pathname,
        referrer: document.referrer,
        timestamp: new Date().toISOString()
      });
      logger.end();
    } else {
      logger.info("ℹ️ Firebase auth: Oturum var", {
        path: location.pathname,
        user: { uid: user.uid, email: user.email },
        timestamp: new Date().toISOString()
      });
      logger.end();

      // Teklifbul Rule v1.0 - Otomatik token refresh başlat (kullanıcı aktifken token'ı yenile)
      startTokenRefresh(user);

      // Teklifbul Rule v1.0 - Kullanıcı varken tab tracker garanti başlasın (dashboard ilk açılışta heartbeat hemen başlasın)
      setupTabTracker();
    }
  } else if (user) {
    // Kullanıcı değişti veya yeniden giriş yaptı, token refresh'i başlat
    startTokenRefresh(user);
    setupTabTracker();
  } else {
    // Kullanıcı çıkış yaptı, token refresh'i durdur
    stopTokenRefresh();
  }
});

// ---- Auth yardımcıları ----
// Teklifbul Rule v1.0 - waitAuthReady: Geriye dönük uyumluluk için authStateReady'yi return et
export async function waitAuthReady() {
  return authStateReady;
}

export async function requireAuth() {
  // Prevent multiple concurrent calls (race condition prevention)
  if (requireAuth.currentPromise) {
    return requireAuth.currentPromise;
  }

  requireAuth.currentPromise = (async () => {
    try {
      logger.debug("requireAuth: Auth hydration başlatılıyor");

      // 1) Persistence hazır olmalı
      await persistenceReady;
      logger.debug("requireAuth: Persistence ready");

      // 2) Redirect result hazır olmalı (eğer varsa)
      await redirectReady;
      logger.debug("requireAuth: Redirect ready");

      // 3) Auth state hazır olmalı - Promise-based yaklaşım
      // Teklifbul Rule v1.0 - Race condition fix: user null gelince reject ETME, user gelene kadar dinlemeye devam et
      const user = await new Promise((resolve, reject) => {
        let resolved = false;
        let timeoutId = null;
        let unsubscribe = null;

        // Cleanup helper
        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        };

        // Timeout belirleme: referrer login.html ise veya pendingLoginTs varsa 8sn, değilse 3sn
        const isPendingLogin = (() => {
          if (typeof window === 'undefined') return false;
          try {
            const referrer = document.referrer || '';
            const pendingLoginTs = sessionStorage.getItem('pendingLoginTs');
            if (pendingLoginTs) {
              const ts = parseInt(pendingLoginTs, 10);
              const age = Date.now() - ts;
              // 15 saniye içindeyse pending login kabul et
              if (age < 15000) {
                return true;
              } else {
                // 15 saniyeden eskiyse temizle
                sessionStorage.removeItem('pendingLoginTs');
              }
            }
            return referrer.includes('login.html');
          } catch (e) {
            return false;
          }
        })();

        // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state yüklenmesi daha uzun sürebilir
        // Timeout'u artır: pending login ise 12sn, değilse 10sn
        const timeoutMs = isPendingLogin ? 12000 : 10000;
        logger.debug("requireAuth: Timeout belirlendi", { timeoutMs, isPendingLogin });

        // onAuthStateChanged listener - user null gelince reject ETME, user gelene kadar dinle
        unsubscribe = onAuthStateChanged(auth, (authUser) => {
          if (resolved) return;

          // User geldi, resolve et
          if (authUser) {
            resolved = true;
            cleanup();
            logger.debug("requireAuth: Auth state ready (user found)", { uid: authUser.uid });
            resolve(authUser);
            return;
          }

          // User null geldi - reject ETME, dinlemeye devam et
          logger.debug("requireAuth: Auth state callback - user null (waiting for user...)");
        }, (error) => {
          // Error callback - sadece gerçek hatalarda reject et
          if (resolved) return;
          resolved = true;
          cleanup();
          logger.error("requireAuth: Auth state error", error);
          reject(error);
        });

        // Timeout - sadece timeout sonrası AUTH_REQUIRED hatası fırlat
        timeoutId = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();

          // Timeout sonrası user yoksa AUTH_REQUIRED hatası fırlat
          const finalUser = auth.currentUser;
          if (!finalUser) {
            logger.warn("requireAuth: Timeout - kullanıcı bulunamadı, AUTH_REQUIRED hatası fırlatılıyor", {
              path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
              referrer: typeof window !== 'undefined' ? document.referrer : 'unknown',
              timeoutMs
            });
            reject(new Error("AUTH_REQUIRED"));
          } else {
            // Timeout oldu ama user var, resolve et
            logger.debug("requireAuth: Timeout - ama user bulundu", { uid: finalUser.uid });
            resolve(finalUser);
          }
        }, timeoutMs);

        // Hızlı kontrol: Eğer auth.currentUser zaten varsa hemen resolve et
        if (auth.currentUser) {
          resolved = true;
          cleanup();
          logger.debug("requireAuth: Auth currentUser zaten mevcut", { uid: auth.currentUser.uid });
          resolve(auth.currentUser);
        }
      });

      logger.debug("requireAuth: Auth state ready", { hasUser: !!user, uid: user?.uid });

      if (!user) {
        // Bu noktaya gelmemeli (timeout'ta reject edilmeli), ama güvenlik için kontrol
        logger.warn("requireAuth: Kullanıcı bulunamadı, AUTH_REQUIRED hatası fırlatılıyor", {
          path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
          referrer: typeof window !== 'undefined' ? document.referrer : 'unknown'
        });
        throw new Error("AUTH_REQUIRED");
      }

      logger.debug("requireAuth: Kullanıcı bulundu", { uid: user.uid });
      return user;

    } finally {
      // Reset promise for next call
      requireAuth.currentPromise = null;
    }
  })();

  return requireAuth.currentPromise;
}

export function getUser() { return auth.currentUser; }

// E-posta/şifre
export async function register(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  import('./assets/js/analytics.js').then(({ track, ANALYTICS_EVENTS }) => {
    track(ANALYTICS_EVENTS.SIGNUP, { method: 'password' });
  }).catch(() => {});
  return cred;
}
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  import('./assets/js/analytics.js').then(({ track, ANALYTICS_EVENTS }) => {
    track(ANALYTICS_EVENTS.LOGIN, { method: 'password' });
  }).catch(() => {});
  return cred;
}

// Teklifbul Rule v1.0 — sendEmailVerification aynı Auth/App Check örneğinden gitmeli.
// Ayrı firebase-auth kopyası (dynamic import) production'da sendOobCode 400 üretir.
export async function sendAuthEmailVerification(user, continueUrl) {
  const target =
    auth.currentUser && user?.uid && auth.currentUser.uid === user.uid
      ? auth.currentUser
      : (user || auth.currentUser);
  if (!target) throw new Error('Kullanıcı yok');

  const url = typeof continueUrl === 'string' && continueUrl.startsWith('https://')
    ? continueUrl
    : (typeof window !== 'undefined' ? `${window.location.origin}/login.html` : '');

  try {
    if (url) {
      await sendEmailVerification(target, { url, handleCodeInApp: false });
      return;
    }
    await sendEmailVerification(target);
  } catch (err) {
    const code = String(err?.code || '');
    if (url && (code.includes('invalid-continue-uri') || code.includes('unauthorized-continue-uri'))) {
      logger.warn('Continue URL reddedildi, varsayılan Firebase doğrulama gönderiliyor', { code });
      await sendEmailVerification(target);
      return;
    }
    throw err;
  }
}
export async function logout() {
  try {
    const { clearAuthLocalState } = await import('./assets/js/utils/clear-auth-local-state.js');
    clearAuthLocalState();
  } catch (err) {
    logger.warn('Logout local state temizliği atlandı', err);
  }
  return signOut(auth);
}

/** Teklifbul Rule v1.0 — Beni hatırla: local vs session persistence */
export async function applyLoginPersistence(rememberMe) {
  const native = isNativePlatform();
  const persistence = native || rememberMe ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, persistence);
  logger.debug('Auth persistence set', { rememberMe: !!rememberMe, native });
}

export { isNativePlatform };
export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }
export async function updateUserProfile(user, profile) { return updateProfile(user, profile); }

// Google
const googleProvider = new GoogleAuthProvider();
// Add scopes if needed (optional - for accessing user profile info)
googleProvider.addScope('profile');
googleProvider.addScope('email');
// Set custom parameters if needed
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Check for redirect result on page load (for signInWithRedirect fallback)
export async function checkGoogleRedirect() {
  try {
    await redirectReady;
    if (_redirectAuthUser) {
      const user = _redirectAuthUser;
      _redirectAuthUser = null;
      try { sessionStorage.removeItem('googleLoginPending'); } catch (_) { /* ignore */ }
      logger.info('Google redirect login successful (cached)', { email: user.email });
      return user;
    }
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      try { sessionStorage.removeItem('googleLoginPending'); } catch (_) { /* ignore */ }
      logger.info('Google redirect login successful', { email: result.user.email });
      return result.user;
    }

    // Teklifbul Rule v1.0 — Native WebView: redirect sonucu kaybolursa currentUser yedek
    let pending = false;
    try { pending = sessionStorage.getItem('googleLoginPending') === 'true'; } catch (_) { /* ignore */ }
    if (pending && auth.currentUser) {
      try { sessionStorage.removeItem('googleLoginPending'); } catch (_) { /* ignore */ }
      logger.info('Google login recovered via currentUser', { email: auth.currentUser.email });
      return auth.currentUser;
    }

    return null;
  } catch (error) {
    logger.warn('Redirect result check failed', error);
    return null;
  }
}

export async function loginWithGoogle() {
  const redirectInProgress = MESSAGES.GOOGLE_REDIRECT_IN_PROGRESS;
  try {
    // Teklifbul Rule v1.0 — Capacitor WebView'da popup güvenilir değil; native'de redirect
    if (isNativePlatform()) {
      const authDomain = auth?.app?.options?.authDomain || '(unknown)';
      logger.info('Google login: native platform — same-origin redirect', {
        authDomain,
        origin: window.location.origin,
        href: window.location.href,
      });
      try {
        sessionStorage.setItem('googleLoginPending', 'true');
        sessionStorage.setItem('pendingLoginTs', Date.now().toString());
        sessionStorage.setItem('googleAuthDomain', authDomain);
      } catch (_) { /* ignore */ }
      await signInWithRedirect(auth, googleProvider);
      throw new Error(redirectInProgress);
    }

    const r = await signInWithPopup(auth, googleProvider);
    logger.info("Google login successful (popup)");
    import('./assets/js/analytics.js').then(({ track, ANALYTICS_EVENTS }) => {
      track(ANALYTICS_EVENTS.LOGIN, { method: 'google' });
    }).catch(() => {});
    return r.user;
  } catch (error) {

    if (error?.message === redirectInProgress) {
      throw error;
    }

    logger.error("Google login error", error);
    logger.error("Error details", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });

    const msg = String(error?.message || '');
    if (
      error?.code === 'auth/unauthorized-domain' ||
      msg.includes('disallowed_useragent') ||
      (msg.includes('403') && msg.toLowerCase().includes('useragent'))
    ) {
      throw new Error(MESSAGES.ERROR_LOGIN_GOOGLE_WEBVIEW);
    }

    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Giriş penceresi kapatıldı. Lütfen tekrar deneyin.');
    } else if (error.code === 'auth/popup-blocked') {
      logger.info("Popup blocked, trying redirect method");
      try {
        await signInWithRedirect(auth, googleProvider);
        throw new Error(redirectInProgress);
      } catch (redirectError) {
        if (redirectError?.message === redirectInProgress) {
          throw redirectError;
        }
        logger.error("Redirect also failed", redirectError);
        throw new Error('Popup engellendi ve yönlendirme de başarısız. Lütfen tarayıcı ayarlarından popup\'lara izin verin.');
      }
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Giriş iptal edildi. Lütfen tekrar deneyin.');
    } else if (error.code === 'auth/multi-factor-auth-required') {
      throw error;
    } else if (error.code === 'auth/internal-error') {
      logger.info("Internal error detected, trying redirect method as fallback");
      try {
        await signInWithRedirect(auth, googleProvider);
        throw new Error(redirectInProgress);
      } catch (redirectError) {
        if (redirectError?.message === redirectInProgress) {
          throw redirectError;
        }
        logger.error("Redirect fallback also failed", redirectError);
        throw new Error(MESSAGES.ERROR_LOGIN_GOOGLE_WEBVIEW);
      }
    } else {
      throw new Error(error.message || MESSAGES.ERROR_LOGIN_GOOGLE);
    }
  }
}

// Global exports for console testing (sadece DEV ortamında)
// Teklifbul Rule v1.0 - Security: Production'da Firestore erişim nesneleri global'de OLMAMALI
if (typeof window !== 'undefined' && (import.meta.env.DEV || import.meta.env.MODE === 'development')) {
  window.__db = db;
  window.__auth = auth;
  window.__fs = {
    collection: (path) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.collection(db, path)),
    doc: (path, id) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.doc(db, path, id)),
    query: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.query(...args)),
    where: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.where(...args)),
    orderBy: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.orderBy(...args)),
    limit: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.limit(...args)),
    startAfter: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.startAfter(...args)),
    getDocs: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.getDocs(...args)),
    getDoc: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.getDoc(...args)),
    addDoc: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.addDoc(...args)),
    updateDoc: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.updateDoc(...args)),
    serverTimestamp: () => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.serverTimestamp())
  };
}