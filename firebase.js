// firebase.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from './src/shared/log/logger.js';
import { toast } from './src/shared/ui/toast.js';
// Teklifbul Rule v1.0 - Error Tracker
import { initializeErrorTracker } from './src/shared/log/error-tracker.js';

// Teklifbul Rule v1.0 - authDomain her zaman Firebase Hosting domain'i olmalı
// Firebase auth handler (_/auth/handler) Firebase Hosting'de çalışır, localhost'ta değil
// Bu yüzden authDomain'i her zaman teklifbul.firebaseapp.com olarak kullanmalıyız
// Firebase Console'da localhost authorized domains listesinde olmalı (Google Login için)
const getAuthDomain = () => {
  // Her zaman Firebase Hosting domain'ini kullan
  // Localhost'ta çalışırken bile Firebase'in production auth handler'ını kullan
  return "teklifbul.firebaseapp.com";
};

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
const isBrowser = typeof window !== 'undefined';
const isLocalDevHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const isDevMode = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'development';
if (isBrowser) {
  try {
    const isProduction = !isLocalDevHost && !isDevMode;

    if (isProduction) {
      // Production'da AppCheck ZORUNLU
      const siteKey =
        (typeof import.meta !== "undefined" &&
          import.meta.env &&
          import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) ||
        (typeof window !== "undefined" && window.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) ||
        null;

      if (!siteKey) {
        logger.error("CRITICAL: VITE_RECAPTCHA_ENTERPRISE_SITE_KEY required for production AppCheck");
        throw new Error("AppCheck configuration missing - cannot proceed in production");
      }

      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      logger.debug("AppCheck enabled for production");

    } else {
      // Development: Optional AppCheck (localhost'ta çalışmaz)
      logger.debug('Development environment: AppCheck optional');
    }

  } catch (err) {
    const isProduction = !isLocalDevHost && !isDevMode;
    if (isProduction) {
      logger.error("CRITICAL: AppCheck failed in production", err);
      // Production'da AppCheck hatası varsa uygulamayı başlatma
      throw new Error("AppCheck initialization failed - security violation");
    } else {
      logger.debug("AppCheck skipped in development", err);
    }
  }
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
const redirectReady = (typeof window !== 'undefined') ? (async () => {
  try {
    await getRedirectResult(auth);
    logger.debug("Auth redirect ready");
  } catch (e) {
    // Redirect result hatası beklenen bir durum olabilir (redirect yoksa)
    if (e.code !== 'auth/operation-not-allowed') {
      logger.warn("getRedirectResult error (non-critical)", e);
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
  // Auth state değiştiğinde error tracker'ı başlat (kullanıcı bilgileri için)
  onAuthStateChanged(auth, () => {
    initializeErrorTracker();
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
export async function register(email, password) { return createUserWithEmailAndPassword(auth, email, password); }
export async function login(email, password) { return signInWithEmailAndPassword(auth, email, password); }
export function logout() { return signOut(auth); }
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
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      logger.info("Google redirect login successful", { email: result.user.email });
      return result.user;
    }
    return null;
  } catch (error) {
    logger.warn("Redirect result check failed", error);
    return null;
  }
}

export async function loginWithGoogle() {
  try {
    const r = await signInWithPopup(auth, googleProvider);
    logger.info("Google login successful (popup)", { email: r?.user?.email });
    return r.user;
  } catch (error) {

    // Diğer hatalar için error logla
    logger.error("Google login error", error);
    logger.error("Error details", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });

    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Giriş penceresi kapatıldı. Lütfen tekrar deneyin.');
    } else if (error.code === 'auth/popup-blocked') {
      // If popup is blocked, try redirect method
      logger.info("Popup blocked, trying redirect method");
      try {
        await signInWithRedirect(auth, googleProvider);
        // Note: signInWithRedirect will redirect the page, so we won't reach here
        // The result will be handled by checkGoogleRedirect() on page load
        throw new Error('Tarayıcı yeni bir sayfaya yönlendiriliyor...');
      } catch (redirectError) {
        logger.error("Redirect also failed", redirectError);
        throw new Error('Popup engellendi ve yönlendirme de başarısız. Lütfen tarayıcı ayarlarından popup\'lara izin verin.');
      }
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Giriş iptal edildi. Lütfen tekrar deneyin.');
    } else if (error.code === 'auth/internal-error') {
      // Internal error usually means Firebase Console configuration issue
      // Try redirect as fallback
      logger.info("Internal error detected, trying redirect method as fallback");
      try {
        await signInWithRedirect(auth, googleProvider);
        throw new Error('Tarayıcı yeni bir sayfaya yönlendiriliyor...');
      } catch (redirectError) {
        logger.error("Redirect fallback also failed", redirectError);
        const detailedError = `
Firebase yapılandırma hatası (auth/internal-error).

Kontrol listesi:
1. Firebase Console → Authentication → Sign-in method → Google → ENABLED olmalı
2. Firebase Console → Authentication → Settings → Authorized domains → localhost eklenmeli
3. Google Cloud Console → OAuth 2.0 Client ID yapılandırması kontrol edilmeli
4. Tarayıcı konsolunda tam hata mesajını kontrol edin

Hata kodu: ${error.code}
Hata mesajı: ${error.message}
        `.trim();
        throw new Error(detailedError);
      }
    } else {
      throw new Error(error.message || 'Google ile giriş yapılamadı. Lütfen tekrar deneyin.');
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