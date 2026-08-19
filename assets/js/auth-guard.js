// Teklifbul Rule v1.0 - Auth Guard (Tek kaynaktan yönlendirme)
// Bu dosya tüm sayfalarda ortak olarak kullanılır
// Manuel redirect yapma - sadece guard yönlendirir

import { auth, db, waitAuthReady } from "../../firebase.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
// Teklifbul Rule v1.0 - Client Error Reporting v1
import { initErrorReporter } from './utils/errorReporter.js';

// Teklifbul Rule v1.0 — Absolute paths only (nested /pages/* WebView'da relative bozulur)
const LOGIN_PAGE = "/login.html";
const DASHBOARD_PAGE = "/dashboard.html";
const WAITING_PAGE = "/company-join-waiting.html";
const ONBOARD_PAGE = "/role-select.html";

// Teklifbul Rule v1.0 - Yönlendirme flag'i (aynı anda birden fazla yönlendirme yapılmasını önler)
let isRedirecting = false;

/**
 * Kullanıcının e-posta doğrulamasını güvenli şekilde kontrol eder.
 * - Email/password ile girişte user.emailVerified alanını kullanır.
 * - Google / diğer OAuth provider'larında emailVerified yoksa TRUE kabul edilir.
 */
function isEmailVerified(user) {
  try {
    if (!user) return false;
    if (typeof user.emailVerified === "boolean") return user.emailVerified;
    const providers = (user.providerData || []).map(p => p.providerId);
    if (providers.length > 0 && providers.some(p => p && p !== "password")) return true;
    return false;
  } catch (err) {
    logger.error("isEmailVerified error", err);
    return false;
  }
}

/**
 * Ana auth guard - login ve app sayfaları için
 * onAuthStateChanged ile auth değişikliklerini dinler
 */
export async function initAuthGuard() {
  // Teklifbul Rule v1.0 - GUVENLIK: __SKIP_AUTH_GUARD__ bypass yalnizca development
  // ortaminda (localhost/127.0.0.1 + Vite portu) kabul edilir. Production'da
  // veya prod portlarinda flag yoksayilir.
  if (window.__SKIP_AUTH_GUARD__ === true) {
    const host = window.location.hostname;
    const isDevHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isDevPort = ['5173', '5174', '3000'].includes(window.location.port);
    const isHttp = window.location.protocol === 'http:';
    if (isDevHost && isDevPort && isHttp) {
      logger.warn('Auth guard: __SKIP_AUTH_GUARD__ flag (DEV ONLY) - guard devre disi');
      return;
    }
    logger.error('Auth guard: __SKIP_AUTH_GUARD__ production ortaminda yoksayildi', {
      host, port: window.location.port, protocol: window.location.protocol
    });
    try { delete window.__SKIP_AUTH_GUARD__; } catch (_) { /* noop */ }
  }

  // Teklifbul Rule v1.0 - Dev UX: Yanlışlıkla API portundan (5174) UI açıldıysa Vite portuna (5173) yönlendir
  // Not: Redirect logic sadece auth-guard içinde olmalı (header içinde değil).
  try {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isApiPort = window.location.port === "5174";
    if (isLocalhost && isApiPort) {
      const targetOrigin = `${window.location.protocol}//${window.location.hostname}:5173`;
      const targetUrl = `${targetOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      logger.warn("Auth guard: UI yanlış porttan açıldı, 5173'e yönlendiriliyor", {
        from: window.location.href,
        to: targetUrl
      });
      window.location.replace(targetUrl);
      return;
    }
  } catch (err) {
    logger.warn("Auth guard: dev port redirect kontrolü başarısız", err);
  }

  // Teklifbul Rule v1.0 - Auth state'in yüklenmesini bekle (race condition önleme)
  try {
    await waitAuthReady();
    logger.debug("Auth guard: Auth state ready");
  } catch (err) {
    logger.warn("Auth guard: waitAuthReady hatası, devam ediliyor", err);
  }

  // Teklifbul Rule v1.0 - İlk auth state kontrolü (auth state yüklendikten sonra)
  let initialUser = auth.currentUser;
  const path = window.location.pathname || "";
  const isLoginPage =
    path.endsWith("/login.html") ||
    path === "/login" ||
    path === "/" ||
    path === "" ||
    path.endsWith("/index.html");

  // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
  // Sayfa yeni açıldıysa (2 saniyeden az), onAuthStateChanged ile kullanıcı gelene kadar bekle
  if (!initialUser && !isLoginPage) {
    const pageLoadTime = performance.timing?.navigationStart || Date.now();
    const timeSinceLoad = Date.now() - pageLoadTime;

    if (timeSinceLoad < 2000) {
      logger.info("Auth guard: Sayfa yeni açıldı, auth state için ek bekleme (middle click)", { timeSinceLoad });

      // onAuthStateChanged ile kullanıcı gelene kadar bekle (max 2 saniye)
      const userFound = await new Promise((resolve) => {
        let resolved = false;
        let timeoutId = null;
        let unsubscribe = null;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (unsubscribe) unsubscribe();
        };

        // Timeout: 2 saniye sonra false döndür
        timeoutId = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve(false);
        }, 2000);

        // Auth state değişikliğini dinle
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (resolved) return;
          if (user) {
            resolved = true;
            cleanup();
            logger.info("Auth guard: Middle click - kullanıcı bulundu", { uid: user.uid });
            resolve(true);
          }
        });

        // Hızlı kontrol: Eğer auth.currentUser zaten varsa hemen resolve et
        if (auth.currentUser) {
          resolved = true;
          cleanup();
          resolve(true);
        }
      });

      if (userFound) {
        initialUser = auth.currentUser;
      }
    }
  }

  // İlk yüklemede kullanıcı yoksa ve login sayfası değilse kontrol et
  // Teklifbul Rule v1.0 - performRedirect içinde zaten middle click kontrolü var
  // Burada direkt performRedirect çağırmak yeterli, o zaten kontrol edecek
  if (!initialUser && !isLoginPage) {
    logger.info("Auth guard: İlk yüklemede kullanıcı yok, performRedirect çağrılıyor (middle click kontrolü içinde)");
    await performRedirect(null);
    return;
  }

  // İlk yüklemede kullanıcı varsa ve login sayfasındaysa kontrol et
  if (initialUser && isLoginPage) {
    // Teklifbul Rule v1.0 - İlk yüklemede eski sessionStorage değerlerini temizle
    // Eğer pendingLoginTs çok eski ise (10 saniyeden fazla), direkt yönlendirme yap
    const pendingLoginTs = sessionStorage.getItem('pendingLoginTs');
    if (pendingLoginTs) {
      const loginTime = parseInt(pendingLoginTs, 10);
      const elapsed = Date.now() - loginTime;
      if (elapsed > 10000) { // 10 saniye
        logger.info("Auth guard: İlk yüklemede eski pendingLoginTs temizleniyor", { elapsed });
        sessionStorage.removeItem('pendingLoginTs');
        sessionStorage.removeItem('googleLoginSuccess');
      }
    }
    await performRedirect(initialUser);
  }

  // Auth state değişikliklerini dinle
  onAuthStateChanged(auth, (user) => {
    logger.group('Auth Guard - onAuthStateChanged');
    logger.info('Auth state değişti', { userExists: !!user });
    logger.end();

    // Teklifbul Rule v1.0 - Google login sonrası auth state değişikliği için debounce
    // Popup kapanırken auth state değişikliği biraz gecikebilir, bu yüzden kısa bir delay ekle
    const path = window.location.pathname || "";
    const isLoginPage = path.endsWith("/login.html") || path === "/login" || path === "/" || path === "" || path.endsWith("/index.html");
    const isGoogleLogin = sessionStorage.getItem('googleLoginSuccess') === 'true';

    // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
    // DÜZELTME: Her durumda minimum grace period uygula (sayfa eski olsa bile tab switch, network issues vb. olabilir)
    if (!user && !isLoginPage) {
      const MIN_GRACE_PERIOD_MS = 1000; // Minimum 1 saniye bekle

      logger.info("Auth guard: onAuthStateChanged - Kullanıcı yok, minimum grace period uygulanıyor");

      // Minimum grace period: 1 saniye bekleyip tekrar kontrol et
      let checkCount = 0;
      const maxChecks = 5; // 5 kontrol (toplam ~1 saniye)
      let pollInterval = null;
      let timeoutId = null;

      const cleanup = () => {
        if (pollInterval) clearInterval(pollInterval);
        if (timeoutId) clearTimeout(timeoutId);
      };

      const checkAuthState = () => {
        checkCount++;
        const retryUser = auth.currentUser;
        if (retryUser) {
          logger.info("Auth guard: onAuthStateChanged - Grace period sonrası kullanıcı bulundu", { checkCount, uid: retryUser.uid });
          cleanup();
          // Kullanıcı bulundu, redirect yapma
          return true;
        }

        if (checkCount >= maxChecks) {
          // Hala kullanıcı yoksa, normal akışa devam et
          logger.info("Auth guard: onAuthStateChanged - Grace period sonrası kullanıcı yok, redirect yapılıyor", { checkCount });
          cleanup();
          performRedirect(null).catch(err => {
            logger.error("Auth guard redirect hatası", err);
          });
          return true;
        }

        return false; // Devam et
      };

      // İlk kontrol
      if (checkAuthState()) return;

      // Polling ile kontrol et (her 200ms)
      pollInterval = setInterval(() => {
        if (checkAuthState()) {
          // İşlem tamamlandı
        }
      }, 200);

      // Timeout: minimum grace period sonra durdur
      timeoutId = setTimeout(async () => {
        cleanup();
        const finalUser = auth.currentUser;
        if (!finalUser) {
          logger.info("Auth guard: onAuthStateChanged timeout - grace period sonrası kullanıcı yok, redirect yapılıyor");
          await performRedirect(null);
        }
      }, MIN_GRACE_PERIOD_MS);

      // Bu callback'ten çık, polling işleyecek
      return;
    }

    // Login sayfasında ve kullanıcı varsa, auth state'in stabilize olmasını bekle
    if (isLoginPage && user) {
      // Eğer login.html içerisinde özel bir işlem (örn. checkAndPromoteJoinRequest) yapılıyorsa yönlendirmeyi o dosyaya bırak
      if (sessionStorage.getItem('manualLoginInProgress') === 'true') {
        return;
      }

      // Google login sonrası daha uzun delay
      const delay = isGoogleLogin ? 1000 : 300;
      setTimeout(() => {
        // Auth state'in gerçekten stabilize olduğundan emin ol
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.uid === user.uid) {
          // Google login flag'ini temizle
          if (isGoogleLogin) {
            sessionStorage.removeItem('googleLoginSuccess');
          }
          performRedirect(user).catch(err => {
            logger.error("Auth guard redirect hatası", err);
          });
        } else {
          logger.warn("Auth state henüz stabilize olmadı, tekrar kontrol edilecek");
          // Tekrar kontrol et
          setTimeout(() => {
            const retryUser = auth.currentUser;
            if (retryUser) {
              if (isGoogleLogin) {
                sessionStorage.removeItem('googleLoginSuccess');
              }
              performRedirect(retryUser).catch(err => {
                logger.error("Auth guard redirect hatası (retry)", err);
              });
            }
          }, 500);
        }
      }, delay);
    } else {
      // Diğer durumlarda hemen redirect yap
      performRedirect(user).catch(err => {
        logger.error("Auth guard redirect hatası", err);
      });
    }
  });
}

async function performRedirect(user) {
  // Teklifbul Rule v1.0 - Yönlendirme flag kontrolü (aynı anda birden fazla yönlendirme yapılmasını önler)
  if (isRedirecting) {
    logger.debug("Auth guard: Yönlendirme zaten devam ediyor, atlanıyor");
    return;
  }

  logger.group('Auth Guard - performRedirect');
  logger.info('Yönlendirme kontrolü', {
    pathname: window.location.pathname,
    userExists: !!user,
  });
  logger.end();

  const path = window.location.pathname || "";
  const isLoginPage =
    path.endsWith("/login.html") ||
    path === "/login" ||
    path === "/" ||
    path === "" ||
    path.endsWith("/index.html");

  // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
  // Eğer kullanıcı yoksa ve sayfa yeni açıldıysa, biraz bekleyip tekrar kontrol et
  if (!user && !isLoginPage) {
    const pageLoadTime = performance.timing?.navigationStart || Date.now();
    const timeSinceLoad = Date.now() - pageLoadTime;

    // Sayfa yeni açıldıysa (4 saniyeden az), auth state'in yüklenmesini bekle
    if (timeSinceLoad < 4000) {
      logger.info("Auth guard: performRedirect - Sayfa yeni açıldı, auth state için ek bekleme (middle click)", { timeSinceLoad });

      // Promise ile polling yap ve sonucu bekle
      const userFound = await new Promise((resolve) => {
        let checkCount = 0;
        const maxChecks = 20; // 20 kontrol (toplam ~4 saniye)
        let pollInterval = null;
        let timeoutId = null;

        const cleanup = () => {
          if (pollInterval) clearInterval(pollInterval);
          if (timeoutId) clearTimeout(timeoutId);
        };

        const checkAuthState = () => {
          checkCount++;
          const retryUser = auth.currentUser;
          if (retryUser) {
            logger.info("Auth guard: performRedirect - Middle click - kullanıcı bulundu", { checkCount, uid: retryUser.uid });
            cleanup();
            resolve(true); // Kullanıcı bulundu
            return true;
          }

          if (checkCount >= maxChecks) {
            // Hala kullanıcı yoksa, normal akışa devam et
            logger.info("Auth guard: performRedirect - Auth state yüklenmedi, normal akışa devam", { checkCount });
            cleanup();
            resolve(false); // Normal akışa devam et
            return true;
          }

          return false; // Devam et
        };

        // İlk kontrol
        if (checkAuthState()) return;

        // Polling ile kontrol et (her 200ms)
        pollInterval = setInterval(() => {
          if (checkAuthState()) {
            // İşlem tamamlandı
          }
        }, 200);

        // Timeout: 4 saniye sonra durdur
        timeoutId = setTimeout(() => {
          cleanup();
          const finalUser = auth.currentUser;
          if (!finalUser) {
            logger.info("Auth guard: performRedirect timeout - auth state yüklenmedi, normal akışa devam");
          }
          resolve(false); // Normal akışa devam et
        }, 4000);
      });

      // Eğer kullanıcı bulunduysa, redirect yapma
      if (userFound && auth.currentUser) {
        logger.info("Auth guard: performRedirect - Kullanıcı bulundu, redirect iptal edildi");
        return;
      }
      // Normal akışa devam et (aşağıdaki kod çalışacak)
    }
  }

  // Kullanıcı VAR + login sayfasındaysa → email doğrulaması kontrolü yap, sonra dashboard'a gönder
  if (user && isLoginPage) {
    // Teklifbul Rule v1.0 - Email doğrulanmamışsa dashboard'a yönlendirme!
    if (!isEmailVerified(user)) {
      logger.warn("Auth guard: Login sayfasında email doğrulanmamış kullanıcı, yönlendirme yapılmıyor", { email: user.email });
      // Kullanıcıyı çıkış yaptır ve login sayfasında tut
      try {
        await signOut(auth);
      } catch (e) {
        logger.warn("Auth guard: signOut hatası", e);
      }
      // Login sayfasında uyarı mesajı göster
      showEmailVerificationWarning();
      return;
    }

    logger.info("Auth guard: Login sayfasında, kullanıcı var, dashboard'a yönlendirme");

    // Teklifbul Rule v1.0 - Google login sonrası auth state'in stabilize olmasını bekle
    // Popup kapanırken auth state değişikliği biraz gecikebilir
    const isGoogleLogin = sessionStorage.getItem('googleLoginSuccess') === 'true';
    const pendingLoginTs = sessionStorage.getItem('pendingLoginTs');

    // Eğer pendingLoginTs çok eski bir değerse (10 saniyeden fazla), direkt yönlendirme yap
    // Bu, sayfa yenilendiğinde eski sessionStorage değerlerinin yönlendirmeyi engellemesini önler
    const MAX_PENDING_LOGIN_AGE = 10000; // 10 saniye

    if (isGoogleLogin || pendingLoginTs) {
      const loginTime = pendingLoginTs ? parseInt(pendingLoginTs, 10) : Date.now();
      const elapsed = Date.now() - loginTime;

      // Eğer pendingLoginTs çok eski ise, direkt yönlendirme yap
      if (elapsed > MAX_PENDING_LOGIN_AGE) {
        logger.info("Auth guard: pendingLoginTs çok eski, direkt yönlendirme yapılıyor", { elapsed });
        sessionStorage.removeItem('pendingLoginTs');
        sessionStorage.removeItem('googleLoginSuccess');
        isRedirecting = true;
        window.location.replace("/dashboard.html");
        return;
      }

      // Google login sonrası daha uzun bekleme süresi
      const waitTime = isGoogleLogin ? 1200 : 500;

      // Eğer login'den yeterince zaman geçmediyse, bekle
      if (elapsed < waitTime) {
        const remainingWait = waitTime - elapsed;
        setTimeout(() => {
          // Auth state'in gerçekten stabilize olduğundan emin ol
          const currentUser = auth.currentUser;
          if (currentUser && currentUser.uid === user.uid) {
            isRedirecting = true;
            sessionStorage.removeItem('pendingLoginTs');
            sessionStorage.removeItem('googleLoginSuccess');
            window.location.replace("/dashboard.html");
          } else {
            logger.warn("Auth state henüz stabilize olmadı, tekrar kontrol edilecek");
            // Tekrar kontrol et
            setTimeout(() => {
              const retryUser = auth.currentUser;
              if (retryUser) {
                isRedirecting = true;
                sessionStorage.removeItem('pendingLoginTs');
                sessionStorage.removeItem('googleLoginSuccess');
                window.location.replace("/dashboard.html");
              }
            }, 500);
          }
        }, remainingWait);
        return;
      }

      // Zaman geçtiyse temizle ve devam et
      sessionStorage.removeItem('pendingLoginTs');
      sessionStorage.removeItem('googleLoginSuccess');
    }

    // Teklifbul Rule v1.0 - Kayıt sonrası role-select yönlendirmesi (email doğrulama sonrası)
    const pendingRedirect = sessionStorage.getItem('pendingRoleSelectRedirect');
    if (pendingRedirect) {
      sessionStorage.removeItem('pendingRoleSelectRedirect');
      isRedirecting = true;
      window.location.replace(pendingRedirect);
      return;
    }

    isRedirecting = true;
    window.location.replace("/dashboard.html");
    return;
  }

  // Kullanıcı YOK + login dışındaysa → login'e gönder
  if (!user && !isLoginPage) {
    // Teklifbul Rule v1.0 - Google login sonrası auth state henüz stabilize olmamış olabilir
    const isGoogleLogin = sessionStorage.getItem('googleLoginSuccess') === 'true';
    const pendingLoginTs = sessionStorage.getItem('pendingLoginTs');

    if (isGoogleLogin || pendingLoginTs) {
      const loginTime = pendingLoginTs ? parseInt(pendingLoginTs, 10) : Date.now();
      const elapsed = Date.now() - loginTime;

      // Google login sonrası 5 saniye içindeyse, auth state'in stabilize olmasını bekle
      if (elapsed < 5000) {
        logger.info("Google login sonrası auth state bekleniyor", { elapsed, remaining: 5000 - elapsed });

        // Daha agresif polling ile kontrol et
        let checkCount = 0;
        const maxChecks = 10; // 10 kontrol (toplam ~2 saniye)

        const checkAuthState = () => {
          checkCount++;
          const retryUser = auth.currentUser;
          if (retryUser) {
            logger.info("Auth state stabilize oldu, redirect iptal edildi", { checkCount });
            sessionStorage.removeItem('pendingLoginTs');
            sessionStorage.removeItem('googleLoginSuccess');
            // Redirect yapma, sayfa zaten yüklendi
            return true;
          }

          if (checkCount >= maxChecks) {
            // Hala kullanıcı yoksa login'e gönder
            logger.warn("Auth state stabilize olmadı, login'e yönlendiriliyor", { checkCount });
            sessionStorage.removeItem('pendingLoginTs');
            sessionStorage.removeItem('googleLoginSuccess');
            isRedirecting = true;
            window.location.replace("/login.html");
            return true;
          }

          return false;
        };

        // İlk kontrol
        if (checkAuthState()) return;

        // Polling ile kontrol et (her 200ms)
        const pollInterval = setInterval(() => {
          if (checkAuthState()) {
            clearInterval(pollInterval);
          }
        }, 200);

        // Timeout: 2 saniye sonra durdur
        setTimeout(() => {
          clearInterval(pollInterval);
          const finalUser = auth.currentUser;
          if (!finalUser) {
            logger.warn("Auth state timeout'ta hala hazır değil, login'e yönlendiriliyor");
            sessionStorage.removeItem('pendingLoginTs');
            sessionStorage.removeItem('googleLoginSuccess');
            isRedirecting = true;
            window.location.replace("/login.html");
          }
        }, 2000);

        return;
      }

      // Zaman geçtiyse temizle ve login'e gönder
      sessionStorage.removeItem('pendingLoginTs');
      sessionStorage.removeItem('googleLoginSuccess');
    }

    logger.info("Auth guard: Kullanıcı yok, login sayfasına yönlendirme");
    isRedirecting = true;
    window.location.replace("/login.html");
    return;
  }

  // Kullanıcı VAR + login sayfası değil → email doğrulama kontrolü
  if (user && !isLoginPage) {
    // role-select.html ve signup.html'de email doğrulanmamış kullanıcılara izin ver
    // Çünkü kullanıcı önce şirket bilgilerini kaydedip sonra email onayına yönlendirilecek
    const isOnboardingPage = path.includes('role-select.html') || path.includes('signup.html');
    
    if (!isEmailVerified(user) && !isOnboardingPage) {
      logger.warn("Auth guard: Doğrulanmamış email ile uygulama erişimi engellendi", { email: user.email });
      try {
        await signOut(auth);
      } catch (e) {
        logger.warn("Auth guard: signOut hatası", e);
      }
      isRedirecting = true;
      // Login sayfasına yönlendir - email doğrulama uyarısı ile
      sessionStorage.setItem('emailVerificationRequired', 'true');
      window.location.replace("/login.html");
      return;
    }
  }
}

/**
 * Login sayfasında email doğrulama uyarı mesajı gösterir
 * Kullanıcı giriş yapmışsa ama email doğrulanmamışsa çağrılır
 */
function showEmailVerificationWarning() {
  // Mevcut uyarı varsa tekrar oluşturma
  if (document.getElementById('emailVerificationBanner')) return;
  
  const banner = document.createElement('div');
  banner.id = 'emailVerificationBanner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #fff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    ">
      <span style="font-size: 24px;">📧</span>
      <div style="flex: 1; max-width: 600px;">
        <div style="font-weight: 700; font-size: 15px; margin-bottom: 2px;">E-posta Doğrulaması Gerekli</div>
        <div style="font-size: 13px; opacity: 0.95;">Hesabınıza giriş yapabilmek için e-posta adresinizi doğrulamanız gerekmektedir. Lütfen e-posta kutunuzu kontrol edin ve doğrulama linkine tıklayın.</div>
      </div>
      <button onclick="this.closest('#emailVerificationBanner').remove()" style="
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        color: #fff;
        border-radius: 6px;
        padding: 6px 14px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
      ">Tamam</button>
    </div>
  `;
  document.body.prepend(banner);
}

/**
 * Profil/rol zorunlu kontrolü - onboarding için
 * Kullanıcı var ama profil yoksa onboarding'e yönlendir
 */
export async function initProfileGuard() {
  // Auth guard'dan user'ı al
  const user = auth.currentUser;
  if (!user) {
    // Auth state yüklenmesini bekle
    await new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub();
        resolve();
      });
      setTimeout(() => {
        try { unsub(); } catch { }
        resolve();
      }, 3000);
    });
  }

  const finalUser = auth.currentUser;
  if (!finalUser) return; // Login guard halleder

  try {
    const prof = await getDoc(doc(db, "users", finalUser.uid));
    if (!prof.exists()) {
      // Profil yok → onboarding'e yönlendir (login'e değil!)
      const currentPath = window.location.pathname;
      if (!currentPath.includes("role-select.html") && !currentPath.includes("signup.html")) {
        logger.info("Profile guard: Profil yok, onboarding'e yönlendiriliyor...");
        location.replace(ONBOARD_PAGE);
      }
    }
  } catch (e) {
    logger.warn("Profile guard check failed", e);
  }
}

/**
 * Şirket kodlu kayıt durumu kontrolü
 */
export async function initCompanyJoinGuard() {
  // Auth guard'dan user'ı al
  const user = auth.currentUser;
  if (!user) {
    // Auth state yüklenmesini bekle
    await new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub();
        resolve();
      });
      setTimeout(() => {
        try { unsub(); } catch { }
        resolve();
      }, 3000);
    });
  }

  const finalUser = auth.currentUser;
  if (!finalUser) return;

  try {
    const userDoc = await getDoc(doc(db, 'users', finalUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const currentPath = window.location.pathname;

      // Bekleme durumundaysa ve bekleme sayfasında değilse yönlendir
      if ((userData.companyJoinStatus === 'pending' || userData.companyJoinStatus === 'rejected')
        && !currentPath.includes("company-join-waiting.html")) {
        logger.info("Company join guard: Bekleme durumunda, yönlendiriliyor...");
        location.replace(WAITING_PAGE);
        return;
      }
      
      // Teklifbul Rule v1.x - Bekleme durumunda ama patron izinlerini tam ayarlamamış
      if (userData.companyJoinStatus === 'approved_pending_permissions') {
        const roleKey = userData.companyRoleKey || (userData.roles ? userData.roles[0] : null);
        const companyId = userData.companyId || userData.activeCompanyId;
        
        if (roleKey && companyId) {
          try {
            const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
            const roleDoc = await getDoc(doc(db, 'companies', companyId, 'rolePermissions', roleKey));
            
            // Eğer rol tamamen doğrulanmışsa kullanıcının zincirini kır ve accepted'a geçir
            if (roleDoc.exists() && roleDoc.data().isFullyVerified === true) {
               await updateDoc(doc(db, 'users', finalUser.uid), { companyJoinStatus: 'accepted' });
               userData.companyJoinStatus = 'accepted';
            } else {
               // Henüz doğrulanmadıysa bekleme sayfasında tut
               if (!currentPath.includes("company-join-waiting.html")) {
                 logger.info("Company join guard: Yetkiler bekleniyor, bekleme sayfasına atılıyor...");
                 location.replace(WAITING_PAGE);
               }
               return; // İleri gitmesin
            }
          } catch(e) {
            logger.error("Role permissions doğrulama kontrolü hatası", e);
          }
        }
      }

      // Onaylanmışsa (accepted) ve bekleme sayfasındaysa dashboard'a yönlendir
      if (userData.companyJoinStatus === 'accepted' && currentPath.includes("company-join-waiting.html")) {
        logger.info("Company join guard: Onaylandı, dashboard'a yönlendiriliyor...");
        location.replace(DASHBOARD_PAGE);
        return;
      }
    }
  } catch (e) {
    logger.warn("Company join guard check failed", e);
  }
}

/**
 * Tüm guard'ları başlat (sayfa yüklendiğinde)
 */

/**
 * API çağrıları için Authorization header değeri döndürür
 * @returns {Promise<string|null>}
 */
export async function getAuthStr() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    return `Bearer ${token}`;
  } catch (e) {
    logger.error("Error getting auth token", e);
    return null;
  }
}

export async function initAllGuards() {
  await initAuthGuard();
  await initProfileGuard();
  await initCompanyJoinGuard();
}
