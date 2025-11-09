// firebase.js (FINAL)
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
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
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from './src/shared/log/logger.js';

const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: "teklifbul.firebaseapp.com",
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
  logger.info("Önbellekteki Firebase app kullanılıyor");
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
      logger.info("Mevcut Firebase app kullanılıyor", { messagingSenderId: existingConfig.messagingSenderId, name: defaultApp.name });
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
          logger.info("Yeni DEFAULT Firebase app oluşturuldu", { messagingSenderId: firebaseConfig.messagingSenderId });
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
      logger.info("Yeni Firebase app oluşturuldu", { messagingSenderId: firebaseConfig.messagingSenderId });
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

export { app };
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Enable Firestore logging for debugging
// Uncomment the following line to enable detailed Firestore logging
// import { enableLogging } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// enableLogging(true);

// Teklifbul Rule v1.0 - Session-only persistence (tarayıcı/sekme kapanınca oturum biter)
// Top-level await yerine async IIFE kullan
(async () => {
  try {
    // 1) KALICILIK: tarayıcı/sekme kapanınca oturum biter
    await setPersistence(auth, browserSessionPersistence);
    logger.info("Firebase persistence set to browserSessionPersistence");
    
    // 2) MIGRASYON: daha önce local persistence ile giriş yapılmışsa bir defalık temizle
    if (!localStorage.getItem("migratedToSession")) {
      try {
        await signOut(auth);
        logger.info("Eski local persistence oturumu temizlendi");
      } catch (signOutError) {
        // Oturum zaten kapalı olabilir, hata verme
        logger.info("Oturum zaten kapalı veya temizlenmiş");
      }
      localStorage.setItem("migratedToSession", "1");
    }
    
    // 3) ROUTE GUARD: login <-> dashboard yönlendirmesi
    onAuthStateChanged(auth, (user) => {
      const path = location.pathname;
      const isLogin = path.endsWith("/login.html") || path.endsWith("/index.html") || path.endsWith("/");
      
      if (!user) {
        // Oturum yok → login sayfası dışında bir yerdeyse login'e gönder
        if (!isLogin) {
          logger.info("Oturum yok, login sayfasına yönlendiriliyor");
          location.replace("/index.html");
        }
        return;
      }
      
      // Oturum var → login sayfasındaysa dashboard'a gönder
      if (isLogin) {
        logger.info("Oturum var, dashboard'a yönlendiriliyor");
        location.replace("/dashboard.html");
      }
    });
    
  } catch (e) {
    logger.warn("Firebase persistence error (using default)", e.message);
    logger.warn("Error details", { code: e.code, name: e.name, stack: e.stack });
    // Continue without persistence - auth will still work with session storage
  }
})();

// ---- Auth yardımcıları ----
// Teklifbul Rule v1.0 - Auth state tek kaynaktan yönetim
let _readyOnce;
export function authReady() {
  if (_readyOnce) return _readyOnce;
  _readyOnce = new Promise(resolve => {
    // Teklifbul Rule v1.0 - Auth state güvenilir yükleme
    // Eğer auth.currentUser zaten varsa direkt döndür
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    
    // Auth state değişikliğini bekle (max 5 saniye)
    let timeoutId;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (timeoutId) clearTimeout(timeoutId);
      unsub();
      resolve(user || null);
    });
    
    timeoutId = setTimeout(() => {
      unsub();
      resolve(auth.currentUser || null);
    }, 5000);
  });
  return _readyOnce;
}

/**
 * Firebase v10 authStateReady() kullanarak auth durumunun kesinleşmesini bekler
 * Tek kaynaktan yönetim için kullanılır
 */
export async function waitAuthReady() {
  // Firebase v10: authStateReady mevcutsa onu kullan
  // NOT: authStateReady Firebase Auth instance'ında değil, doğrudan kullanılmalı
  // Firebase v10'da authStateReady yok, onAuthStateChanged kullanılmalı
  // Fallback: Bir defalık bekleyen promise
  return new Promise(resolve => {
    // Eğer auth.currentUser zaten varsa direkt döndür
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    
    const off = onAuthStateChanged(auth, (u) => { 
      off(); 
      resolve(u || null); 
    });
  });
}

export async function requireAuth() {
  // Teklifbul Rule v1.0 - Redirect loop önleme ve auth state güvenilir kontrol
  // Önce auth.currentUser'ı kontrol et (daha hızlı)
  if (auth.currentUser) {
    return auth.currentUser;
  }
  
  // Auth state yüklenmesini bekle
  const user = await authReady();
  
  if (!user) { 
    // Redirect loop önleme: skipAutoRedirect parametresi ekle
    const urlParams = new URLSearchParams(window.location.search);
    const skipAutoRedirect = urlParams.get('skipAutoRedirect') === 'true';
    const currentPath = window.location.pathname;
    
    // Eğer zaten index.html'deysek ve skipAutoRedirect varsa, redirect yapma
    if (currentPath.includes('index.html') && skipAutoRedirect) {
      throw new Error("AUTH_REQUIRED");
    }
    
    if (!skipAutoRedirect) {
      logger.info("Auth required, redirecting to login");
      location.href = "./index.html?skipAutoRedirect=true";
    }
    throw new Error("AUTH_REQUIRED");
  }
  return user;
}

export function getUser() { return auth.currentUser; }

// E-posta/şifre
export async function register(email, password) { return createUserWithEmailAndPassword(auth, email, password); }
export async function login(email, password)    { return signInWithEmailAndPassword(auth, email, password); }
export function logout()                        { return signOut(auth); }
export function watchAuth(cb)                   { return onAuthStateChanged(auth, cb); }
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
    // First, try popup method
    const r = await signInWithPopup(auth, googleProvider);
    logger.info("Google login successful (popup)", { email: r.user.email });
    return r.user;
  } catch (error) {
    logger.error("Google login error", error);
    logger.error("Error details", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    // Handle specific error codes
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

// Global exports for console testing (sadece browser ortamında)
// Teklifbul Rule v1.0 - window undefined kontrolü
if (typeof window !== 'undefined') {
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

  logger.info("Global exports available", { exports: ['window.__db', 'window.__auth', 'window.__fs'] });
}